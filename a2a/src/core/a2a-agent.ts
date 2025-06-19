/**
 * Base A2A Agent implementation
 */

import express, { Express, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import winston from 'winston';
import axios from 'axios';
import {
  AgentCard,
  Task,
  TaskState,
  SendTaskParams,
  SendTaskResponse,
  JSONRPCRequest,
  JSONRPCResponse,
  TaskUpdate
} from '../types/a2a-protocol';

export interface A2AAgentConfig {
  name: string;
  description: string;
  port: number;
  organization: string;
  organizationUrl: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
    maxConcurrentTasks?: number;
    supportedTaskTypes?: string[];
  };
  metadata?: Record<string, any>;
}

export class A2AAgent extends EventEmitter {
  private app: Express;
  private server: any;
  private tasks: Map<string, Task> = new Map();
  private taskHistory: Map<string, TaskUpdate[]> = new Map();
  protected logger: winston.Logger;
  private agentCard: AgentCard;

  constructor(protected config: A2AAgentConfig) {
    super();
    
    this.app = express();
    this.app.use(express.json());
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Safely stringify metadata, avoiding circular references
          let metaStr = '';
          if (Object.keys(meta).length) {
            try {
              // Filter out circular references and large objects
              const safeMeta = Object.entries(meta).reduce((acc, [key, value]) => {
                if (value && typeof value === 'object' && 
                    ((value as any).config || (value as any).request || (value as any).response)) {
                  // Skip axios error objects
                  return acc;
                }
                acc[key] = value;
                return acc;
              }, {} as any);
              
              metaStr = Object.keys(safeMeta).length ? JSON.stringify(safeMeta) : '';
            } catch (error) {
              metaStr = '';
            }
          }
          return `[${timestamp}] ${level.toUpperCase()} [${this.config.name}]: ${message} ${metaStr}`;
        })
      ),
      transports: [new winston.transports.Console()]
    });

    this.agentCard = {
      name: config.name,
      description: config.description,
      url: `http://localhost:${config.port}`,
      provider: {
        organization: config.organization,
        url: config.organizationUrl
      },
      capabilities: {
        streaming: config.capabilities?.streaming ?? true,
        pushNotifications: config.capabilities?.pushNotifications ?? false,
        stateTransitionHistory: config.capabilities?.stateTransitionHistory ?? true,
        maxConcurrentTasks: config.capabilities?.maxConcurrentTasks,
        supportedTaskTypes: config.capabilities?.supportedTaskTypes
      },
      metadata: config.metadata
    };

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // JSON-RPC endpoint
    this.app.post('/rpc', async (req: Request, res: Response) => {
      try {
        const request = req.body as JSONRPCRequest;
        const response = await this.handleRPCRequest(request);
        res.json(response);
      } catch (error) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error'
          },
          id: req.body.id || null
        });
      }
    });

    // SSE endpoint for task updates
    this.app.get('/tasks/subscribe', (req: Request, res: Response) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const taskId = req.query.taskId as string;
      const sendUpdate = (update: TaskUpdate) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      if (taskId) {
        // Send history if requested
        if (req.query.includeHistory === 'true') {
          const history = this.taskHistory.get(taskId) || [];
          history.forEach(sendUpdate);
        }

        // Listen for updates
        const listener = (update: TaskUpdate) => {
          if (update.taskId === taskId) {
            sendUpdate(update);
          }
        };
        this.on('taskUpdate', listener);

        // Clean up on disconnect
        req.on('close', () => {
          this.off('taskUpdate', listener);
        });
      }
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', agent: this.config.name });
    });

    // Agent card
    this.app.get('/agent/card', (req: Request, res: Response) => {
      res.json(this.agentCard);
    });
  }

  private async handleRPCRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    this.logger.info(`RPC Request: ${request.method}`, { params: request.params });

    try {
      let result: any;

      switch (request.method) {
        case 'tasks/send':
          result = await this.handleSendTask(request.params);
          break;
        case 'tasks/get':
          result = await this.handleGetTask(request.params);
          break;
        case 'tasks/cancel':
          result = await this.handleCancelTask(request.params);
          break;
        case 'agent/card':
          result = this.agentCard;
          break;
        case 'health/check':
          result = { status: 'ok' };
          break;
        default:
          throw new Error(`Method not found: ${request.method}`);
      }

      return {
        jsonrpc: '2.0',
        result,
        id: request.id || null
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        id: request.id || null
      };
    }
  }

  protected async handleSendTask(params: SendTaskParams): Promise<SendTaskResponse> {
    const taskId = uuidv4();
    const now = new Date().toISOString();

    const task: Task = {
      id: taskId,
      parentTaskId: params.parentTaskId,
      agentId: this.config.name,
      state: TaskState.SUBMITTED,
      prompt: params.prompt,
      context: params.context,
      createdAt: now,
      updatedAt: now,
      metadata: {
        priority: params.priority || 'normal',
        timeout: params.timeout,
        policyContext: params.policyContext
      }
    };

    this.tasks.set(taskId, task);
    this.emitTaskUpdate(taskId, TaskState.SUBMITTED);

    // Start processing the task asynchronously
    this.processTask(task);

    return {
      taskId,
      state: TaskState.SUBMITTED,
      acceptedAt: now,
      estimatedDuration: this.estimateTaskDuration(params)
    };
  }

  protected async handleGetTask(params: { taskId: string }): Promise<Task | null> {
    return this.tasks.get(params.taskId) || null;
  }

  protected async handleCancelTask(params: { taskId: string; reason?: string }): Promise<void> {
    const task = this.tasks.get(params.taskId);
    if (!task) {
      throw new Error(`Task not found: ${params.taskId}`);
    }

    if (task.state === TaskState.COMPLETED || task.state === TaskState.FAILED) {
      throw new Error(`Cannot cancel task in state: ${task.state}`);
    }

    task.state = TaskState.CANCELLED;
    task.updatedAt = new Date().toISOString();
    task.metadata = { ...task.metadata, cancelReason: params.reason };

    this.emitTaskUpdate(params.taskId, TaskState.CANCELLED, { reason: params.reason });
  }

  protected async processTask(task: Task): Promise<void> {
    // Override this method in subclasses to implement actual task processing
    this.logger.info(`Processing task: ${task.id}`, { prompt: task.prompt });

    // Simulate work with slight delay to ensure submitted state can be observed
    setTimeout(() => {
      this.updateTaskState(task.id, TaskState.WORKING);
      
      setTimeout(() => {
        // Simulate completion
        this.updateTaskState(task.id, TaskState.COMPLETED, {
          result: `Processed: ${task.prompt}`
        });
      }, 1500);
    }, 500);
  }

  protected updateTaskState(
    taskId: string,
    state: TaskState,
    update?: { result?: any; error?: any; progress?: any }
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.state = state;
    task.updatedAt = new Date().toISOString();

    if (state === TaskState.COMPLETED || state === TaskState.FAILED) {
      task.completedAt = new Date().toISOString();
    }

    if (update?.result) {
      task.result = update.result;
    }

    if (update?.error) {
      task.error = update.error;
    }

    this.emitTaskUpdate(taskId, state, update);
  }

  protected emitTaskUpdate(taskId: string, state: TaskState, data?: any): void {
    const update: TaskUpdate = {
      taskId,
      state,
      timestamp: new Date().toISOString(),
      data
    };

    // Store in history
    if (!this.taskHistory.has(taskId)) {
      this.taskHistory.set(taskId, []);
    }
    this.taskHistory.get(taskId)!.push(update);

    // Emit for SSE subscribers
    this.emit('taskUpdate', update);

    this.logger.info(`Task update: ${taskId} -> ${state}`, data);
  }

  protected estimateTaskDuration(params: SendTaskParams): number {
    // Override in subclasses for better estimates
    return 5000; // 5 seconds default
  }

  // Delegate task to another agent
  protected async delegateTask(
    targetAgentUrl: string,
    params: SendTaskParams
  ): Promise<SendTaskResponse> {
    try {
      const response = await axios.post(`${targetAgentUrl}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          ...params,
          parentTaskId: params.parentTaskId || params.context?.taskId,
          policyContext: {
            ...params.policyContext,
            delegationChain: [
              ...(params.policyContext?.delegationChain || []),
              this.config.name
            ]
          }
        },
        id: uuidv4()
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(`Failed to delegate task to ${targetAgentUrl}`, error);
      throw error;
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        this.logger.info(`A2A Agent "${this.config.name}" started on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info(`A2A Agent "${this.config.name}" stopped`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}