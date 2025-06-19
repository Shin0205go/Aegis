/**
 * Coordinator Agent - Orchestrates tasks between multiple agents
 */

import { A2AAgent } from '../core/a2a-agent';
// Removed AEGISPolicyEnforcer import - coordinator doesn't need policy enforcement
import { Task, TaskState, SendTaskParams, SendTaskResponse } from '../types/a2a-protocol';
import axios from 'axios';

interface AgentRegistry {
  name: string;
  url: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'unknown';
}

export class CoordinatorAgent extends A2AAgent {
  private agents: Map<string, AgentRegistry> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(port: number) {
    super({
      name: 'coordinator-agent',
      description: 'Coordinator agent that orchestrates tasks between multiple agents',
      port,
      organization: 'AEGIS Demo',
      organizationUrl: 'https://aegis-demo.example.com',
      capabilities: {
        supportedTaskTypes: ['orchestrate', 'coordinate', 'workflow'],
        maxConcurrentTasks: 10
      },
      metadata: {
        role: 'orchestrator',
        version: '1.0.0'
      }
    });

    this.registerKnownAgents();
    this.startHealthChecks();
  }

  private registerKnownAgents(): void {
    // Register known agents
    this.agents.set('research-agent', {
      name: 'research-agent',
      url: 'http://localhost:8101',
      capabilities: ['research', 'summarize', 'fact-check'],
      status: 'unknown'
    });

    this.agents.set('writing-agent', {
      name: 'writing-agent',
      url: 'http://localhost:8102',
      capabilities: ['write', 'edit', 'translate', 'proofread'],
      status: 'unknown'
    });
  }

  private startHealthChecks(): void {
    // Initial health check
    this.checkAllAgents();

    // Periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.checkAllAgents();
    }, 30000); // Every 30 seconds
  }

  private async checkAllAgents(): Promise<void> {
    for (const [name, agent] of this.agents.entries()) {
      try {
        const response = await axios.get(`${agent.url}/health`, { timeout: 5000 });
        if (response.status === 200) {
          agent.status = 'online';
          this.logger.debug(`Agent ${name} is online`);
        } else {
          agent.status = 'offline';
        }
      } catch (error) {
        agent.status = 'offline';
        this.logger.debug(`Agent ${name} is offline`);
      }
    }
  }

  protected async processTask(task: Task): Promise<void> {
    try {
      this.logger.info(`Processing coordination task: ${task.id}`, { prompt: task.prompt });
      this.updateTaskState(task.id, TaskState.WORKING);

      // Analyze the task and create a workflow
      const workflow = this.analyzeTask(task.prompt);
      const results: any[] = [];

      // Execute workflow steps
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        this.updateTaskState(task.id, TaskState.WORKING, {
          progress: {
            current: i + 1,
            total: workflow.steps.length,
            message: `Executing step: ${step.agent}`
          }
        });

        const stepResult = await this.executeWorkflowStep(task, step);
        results.push(stepResult);

        // Use previous results as context for next steps
        if (i < workflow.steps.length - 1) {
          workflow.steps[i + 1].context = {
            ...workflow.steps[i + 1].context,
            previousResults: results
          };
        }
      }

      // Compile final results
      const finalResult = {
        workflow: workflow.name,
        steps: workflow.steps.map((s: any, i: number) => ({
          agent: s.agent,
          task: s.task,
          result: results[i]
        })),
        summary: this.summarizeResults(results as any[]),
        completedAt: new Date().toISOString()
      };

      this.updateTaskState(task.id, TaskState.COMPLETED, {
        result: finalResult
      });

    } catch (error) {
      this.logger.error(`Task processing failed: ${task.id}`, error);
      this.updateTaskState(task.id, TaskState.FAILED, {
        error: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  private analyzeTask(prompt: string): any {
    const lower = prompt.toLowerCase();

    // Research and write workflow
    if (lower.includes('research') && lower.includes('write')) {
      return {
        name: 'research-and-write',
        steps: [
          {
            agent: 'research-agent',
            task: `Research: ${prompt}`,
            context: {}
          },
          {
            agent: 'writing-agent',
            task: `Write based on research: ${prompt}`,
            context: {}
          }
        ]
      };
    }

    // Translation workflow
    if (lower.includes('translate')) {
      return {
        name: 'translation',
        steps: [
          {
            agent: 'writing-agent',
            task: prompt,
            context: { taskType: 'translation' }
          }
        ]
      };
    }

    // Default: try to find the best agent
    const bestAgent = this.findBestAgent(prompt);
    return {
      name: 'single-agent',
      steps: [
        {
          agent: bestAgent,
          task: prompt,
          context: {}
        }
      ]
    };
  }

  private findBestAgent(prompt: string): string {
    const lower = prompt.toLowerCase();
    
    // Check for research keywords
    if (['research', 'find', 'facts', 'information'].some(kw => lower.includes(kw))) {
      return 'research-agent';
    }

    // Check for writing keywords
    if (['write', 'create', 'draft', 'compose'].some(kw => lower.includes(kw))) {
      return 'writing-agent';
    }

    // Default to research agent
    return 'research-agent';
  }

  private async executeWorkflowStep(task: Task, step: any): Promise<any> {
    const agent = this.agents.get(step.agent);
    if (!agent) {
      throw new Error(`Unknown agent: ${step.agent}`);
    }

    if (agent.status !== 'online') {
      throw new Error(`Agent ${step.agent} is not available`);
    }

    // No policy check needed for coordinator

    try {
      // Delegate the task
      const response = await this.delegateTask(agent.url, {
        prompt: step.task,
        context: {
          ...step.context,
          workflowId: task.id,
          coordinatedBy: this.config.name
        },
        parentTaskId: task.id,
        priority: task.metadata?.priority,
        policyContext: {
          requesterAgent: this.config.name,
          delegationChain: [
            ...(task.metadata?.policyContext?.delegationChain || []),
            this.config.name
          ]
        }
      });

      this.logger.info(`Delegated to ${step.agent}: ${response.taskId}`);

      // In a real implementation, we would monitor the task
      // For demo, simulate waiting for completion
      await new Promise(resolve => setTimeout(resolve, response.estimatedDuration || 5000));

      return {
        agent: step.agent,
        taskId: response.taskId,
        status: 'completed',
        result: `Result from ${step.agent}`
      };

    } catch (error) {
      this.logger.error(`Failed to execute step with ${step.agent}`, error);
      throw error;
    }
  }

  private summarizeResults(results: any[]): string {
    return `Coordinated ${results.length} tasks successfully. ` +
      results.map((r, i) => `Step ${i + 1}: ${r.status}`).join(', ');
  }

  // No special handleSendTask override needed - use parent implementation

  protected estimateTaskDuration(params: SendTaskParams): number {
    // Estimate based on workflow complexity
    const workflow = this.analyzeTask(params.prompt);
    const stepTime = 5000; // 5 seconds per step
    const coordinationOverhead = 2000; // 2 seconds overhead
    
    return (workflow.steps.length * stepTime) + coordinationOverhead;
  }

  async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    await super.stop();
  }

  getCapabilities(): any {
    return {
      name: this.config.name,
      description: this.config.description,
      supportedTasks: ['orchestrate', 'coordinate', 'workflow'],
      mcpEnabled: false,
      knownAgents: Array.from(this.agents.keys()),
      metadata: this.config.metadata
    };
  }
}