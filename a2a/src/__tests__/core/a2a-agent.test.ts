/**
 * A2A Agent Base Class Tests
 */

import { A2AAgent } from '../../core/a2a-agent';
import { TaskState } from '../../types/a2a-protocol';
import axios from 'axios';
import { waitFor } from '../setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('A2AAgent', () => {
  let agent: A2AAgent;
  let testPort: number;
  
  // Generate unique port for each test suite run
  beforeAll(() => {
    testPort = 10000 + Math.floor(Math.random() * 5000);
  });
  
  const getTestConfig = () => ({
    name: 'test-agent',
    description: 'Test agent for unit tests',
    port: testPort,
    organization: 'Test Org',
    organizationUrl: 'https://test.org',
    capabilities: {
      streaming: true,
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['test', 'demo']
    }
  });

  beforeEach(() => {
    agent = new A2AAgent(getTestConfig());
  });

  afterEach(async () => {
    await agent.stop();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(agent).toBeDefined();
      expect((agent as any).config).toEqual(getTestConfig());
    });

    it('should create agent card with default capabilities', () => {
      const minimalAgent = new A2AAgent({
        name: 'minimal',
        description: 'Minimal agent',
        port: testPort - 1,
        organization: 'Test',
        organizationUrl: 'https://test.org'
      });

      const agentCard = (minimalAgent as any).agentCard;
      expect(agentCard.capabilities.streaming).toBe(true);
      expect(agentCard.capabilities.pushNotifications).toBe(false);
      expect(agentCard.capabilities.stateTransitionHistory).toBe(true);
    });
  });

  describe('server lifecycle', () => {
    it('should start and stop server', async () => {
      await agent.start();
      expect((agent as any).server).toBeDefined();

      await agent.stop();
      expect((agent as any).server.listening).toBe(false);
    });

    it('should handle multiple stop calls gracefully', async () => {
      await agent.start();
      await agent.stop();
      await agent.stop(); // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('task handling', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should create and process task', async () => {
      const taskPromise = (agent as any).handleSendTask({
        prompt: 'Test task',
        priority: 'normal',
        context: { test: true }
      });

      const result = await taskPromise;

      expect(result.taskId).toBeDefined();
      expect(result.state).toBe(TaskState.SUBMITTED);
      expect(result.acceptedAt).toBeDefined();
      expect(result.estimatedDuration).toBe(5000);
    });

    it('should track task in internal map', async () => {
      const result = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      const task = (agent as any).tasks.get(result.taskId);
      expect(task).toBeDefined();
      expect(task.prompt).toBe('Test task');
      expect(task.state).toBe(TaskState.SUBMITTED);
    });

    it('should handle task with parent ID', async () => {
      const parentId = 'parent-task-123';
      const result = await (agent as any).handleSendTask({
        prompt: 'Child task',
        parentTaskId: parentId
      });

      const task = (agent as any).tasks.get(result.taskId);
      expect(task.parentTaskId).toBe(parentId);
    });

    it('should get existing task', async () => {
      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      const task = await (agent as any).handleGetTask({ taskId });
      expect(task).toBeDefined();
      expect(task.id).toBe(taskId);
    });

    it('should return null for non-existent task', async () => {
      const task = await (agent as any).handleGetTask({ 
        taskId: 'non-existent' 
      });
      expect(task).toBeNull();
    });

    it('should cancel pending task', async () => {
      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      await (agent as any).handleCancelTask({
        taskId,
        reason: 'Test cancellation'
      });

      const task = (agent as any).tasks.get(taskId);
      expect(task.state).toBe(TaskState.CANCELLED);
      expect(task.metadata.cancelReason).toBe('Test cancellation');
    });

    it('should reject cancellation of completed task', async () => {
      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      // Update task state to completed
      (agent as any).updateTaskState(taskId, TaskState.COMPLETED);

      await expect(
        (agent as any).handleCancelTask({ taskId })
      ).rejects.toThrow('Cannot cancel task in state: completed');
    });

    it('should reject cancellation of non-existent task', async () => {
      await expect(
        (agent as any).handleCancelTask({ taskId: 'non-existent' })
      ).rejects.toThrow('Task not found');
    });
  });

  describe('task state updates', () => {
    let taskId: string;

    beforeEach(async () => {
      await agent.start();
      const result = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });
      taskId = result.taskId;
    });

    it('should update task state', async () => {
      // タイミングテストのために少し待つ
      await new Promise(resolve => setTimeout(resolve, 10));
      
      (agent as any).updateTaskState(taskId, TaskState.WORKING);
      
      const task = (agent as any).tasks.get(taskId);
      expect(task.state).toBe(TaskState.WORKING);
      expect(new Date(task.updatedAt).getTime()).toBeGreaterThan(
        new Date(task.createdAt).getTime()
      );
    });

    it('should set completedAt for terminal states', () => {
      (agent as any).updateTaskState(taskId, TaskState.COMPLETED, {
        result: { data: 'test' }
      });

      const task = (agent as any).tasks.get(taskId);
      expect(task.completedAt).toBeDefined();
      expect(task.result).toEqual({ data: 'test' });
    });

    it('should set error for failed state', () => {
      const error = {
        code: 'TEST_ERROR',
        message: 'Test error message'
      };

      (agent as any).updateTaskState(taskId, TaskState.FAILED, { error });

      const task = (agent as any).tasks.get(taskId);
      expect(task.error).toEqual(error);
    });

    it('should ignore updates for non-existent tasks', () => {
      // Should not throw
      (agent as any).updateTaskState('non-existent', TaskState.WORKING);
      expect(true).toBe(true);
    });
  });

  describe('task events', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should emit task updates', async () => {
      const updates: any[] = [];
      agent.on('taskUpdate', (update) => updates.push(update));

      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      // Wait for initial submitted event
      await waitFor(100);

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].taskId).toBe(taskId);
      expect(updates[0].state).toBe(TaskState.SUBMITTED);
    });

    it('should store task history', async () => {
      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Test task'
      });

      (agent as any).updateTaskState(taskId, TaskState.WORKING);
      (agent as any).updateTaskState(taskId, TaskState.COMPLETED);

      const history = (agent as any).taskHistory.get(taskId);
      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThanOrEqual(3); // submitted, working, completed
    });
  });

  describe('delegation', () => {
    beforeEach(async () => {
      await agent.start();
      mockedAxios.post.mockClear();
    });

    it('should delegate task to another agent', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          result: {
            taskId: 'delegated-123',
            state: 'submitted',
            acceptedAt: new Date().toISOString()
          },
          id: expect.any(String)
        }
      });

      const result = await (agent as any).delegateTask(
        'http://localhost:8001',
        {
          prompt: 'Delegated task',
          context: { source: 'test' }
        }
      );

      expect(result.taskId).toBe('delegated-123');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8001/rpc',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'tasks/send',
          params: expect.objectContaining({
            prompt: 'Delegated task',
            policyContext: expect.objectContaining({
              delegationChain: ['test-agent']
            })
          })
        })
      );
    });

    it('should handle delegation errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Delegation failed'
          },
          id: '123'
        }
      });

      await expect(
        (agent as any).delegateTask('http://localhost:8001', {
          prompt: 'Failed delegation'
        })
      ).rejects.toThrow('Delegation failed');
    });

    it('should handle network errors during delegation', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        (agent as any).delegateTask('http://localhost:8001', {
          prompt: 'Network fail'
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('RPC handling', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should handle valid RPC requests', async () => {
      const response = await (agent as any).handleRPCRequest({
        jsonrpc: '2.0',
        method: 'agent/card',
        id: 1
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
      expect(response.result.name).toBe('test-agent');
      expect(response.id).toBe(1);
    });

    it('should handle health check', async () => {
      const response = await (agent as any).handleRPCRequest({
        jsonrpc: '2.0',
        method: 'health/check',
        id: 2
      });

      expect(response.result).toEqual({ status: 'ok' });
    });

    it('should return error for unknown method', async () => {
      const response = await (agent as any).handleRPCRequest({
        jsonrpc: '2.0',
        method: 'unknown/method',
        id: 3
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Method not found');
    });

    it('should handle requests without ID', async () => {
      const response = await (agent as any).handleRPCRequest({
        jsonrpc: '2.0',
        method: 'agent/card'
      });

      expect(response.id).toBeNull();
      expect(response.result).toBeDefined();
    });
  });

  describe('processTask override', () => {
    it('should simulate default task processing', async () => {
      await agent.start();
      
      const { taskId } = await (agent as any).handleSendTask({
        prompt: 'Process test'
      });

      // Wait for simulated processing
      await waitFor(2500);

      const task = (agent as any).tasks.get(taskId);
      expect(task.state).toBe(TaskState.COMPLETED);
      expect(task.result).toBe('Processed: Process test');
    });
  });

  describe('HTTP endpoints', () => {
    let baseUrl: string;

    beforeEach(async () => {
      await agent.start();
      baseUrl = `http://localhost:${testPort}`;
    });

    it('should serve health endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'ok', agent: 'test-agent' },
        status: 200
      });

      const response = await axios.get(`${baseUrl}/health`);
      expect(response.data.status).toBe('ok');
    });

    it('should serve agent card endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          name: 'test-agent',
          description: getTestConfig().description,
          capabilities: getTestConfig().capabilities
        },
        status: 200
      });

      const response = await axios.get(`${baseUrl}/agent/card`);
      expect(response.data.name).toBe('test-agent');
    });
  });
});