/**
 * Google A2A Protocol Types
 * Based on the A2A Protocol specification
 */

import { z } from 'zod';

// Agent Card - How agents advertise their capabilities
export const AgentCardSchema = z.object({
  name: z.string().describe('Human-readable name of the agent'),
  description: z.string().describe('Brief description of what the agent does'),
  url: z.string().url().describe('Base URL for the agent\'s A2A endpoint'),
  provider: z.object({
    organization: z.string(),
    url: z.string().url()
  }),
  capabilities: z.object({
    streaming: z.boolean().default(true),
    pushNotifications: z.boolean().default(false),
    stateTransitionHistory: z.boolean().default(true),
    maxConcurrentTasks: z.number().optional(),
    supportedTaskTypes: z.array(z.string()).optional()
  }),
  metadata: z.record(z.any()).optional()
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

// Task states
export enum TaskState {
  SUBMITTED = 'submitted',
  WORKING = 'working',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Task object
export const TaskSchema = z.object({
  id: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  agentId: z.string(),
  state: z.nativeEnum(TaskState),
  prompt: z.string(),
  context: z.record(z.any()).optional(),
  result: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional()
});

export type Task = z.infer<typeof TaskSchema>;

// JSON-RPC 2.0 Request
export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.any().optional(),
  id: z.union([z.string(), z.number()]).optional()
});

export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;

// JSON-RPC 2.0 Response
export const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()])
});

export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;

// A2A Protocol Methods
export interface A2AProtocolMethods {
  // Send a task to an agent
  'tasks/send': (params: SendTaskParams) => Promise<SendTaskResponse>;
  
  // Subscribe to task updates (SSE)
  'tasks/subscribe': (params: SubscribeParams) => AsyncIterable<TaskUpdate>;
  
  // Get task details
  'tasks/get': (params: GetTaskParams) => Promise<Task>;
  
  // Cancel a task
  'tasks/cancel': (params: CancelTaskParams) => Promise<void>;
  
  // List agent capabilities
  'agent/card': () => Promise<AgentCard>;
  
  // Health check
  'health/check': () => Promise<{ status: 'ok' | 'degraded' | 'down' }>;
}

// Method parameters
export interface SendTaskParams {
  prompt: string;
  context?: Record<string, any>;
  parentTaskId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  timeout?: number;
  delegateToAgent?: string;
  policyContext?: {
    requesterAgent: string;
    delegationChain: string[];
    permissions?: string[];
    constraints?: string[];
  };
}

export interface SendTaskResponse {
  taskId: string;
  state: TaskState;
  estimatedDuration?: number;
  acceptedAt: string;
}

export interface SubscribeParams {
  taskId?: string;
  agentId?: string;
  includeHistory?: boolean;
}

export interface TaskUpdate {
  taskId: string;
  state: TaskState;
  timestamp: string;
  data?: any;
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

export interface GetTaskParams {
  taskId: string;
  includeHistory?: boolean;
}

export interface CancelTaskParams {
  taskId: string;
  reason?: string;
}

// AEGIS Integration Types
export interface AEGISPolicyContext {
  agent: {
    id: string;
    name: string;
    type: string;
    trustScore?: number;
    permissions?: string[];
  };
  action: string;
  resource: string;
  context: {
    delegationChain?: string[];
    taskId?: string;
    parentTaskId?: string;
    priority?: string;
    requestTime: Date;
    taskOwner?: string;
  };
}

export interface AEGISDecision {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;
  constraints?: string[];
  obligations?: string[];
  metadata?: Record<string, any>;
}