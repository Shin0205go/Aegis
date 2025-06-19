/**
 * Writing Agent Unit Tests
 */

import { WritingAgent } from '../../../agents/writing-agent';
import axios from 'axios';

describe('WritingAgent', () => {
  let agent: WritingAgent;
  const TEST_PORT = 9001;

  beforeEach(() => {
    agent = new WritingAgent(TEST_PORT);
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      const capabilities = (agent as any).getCapabilities();
      
      expect(capabilities.name).toBe('writing-agent');
      expect(capabilities.description).toBe('Agent specialized in content writing and editing');
      expect(capabilities.mcpEnabled).toBe(false);
      expect(capabilities.supportedTasks).toContain('write');
      expect(capabilities.supportedTasks).toContain('edit');
    });

    it('should start and stop correctly', async () => {
      await agent.start();
      expect(agent).toBeDefined();
      await agent.stop();
    });
  });

  describe('task processing', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should accept writing tasks', async () => {
      const taskParams = {
        prompt: 'Write an article about AI',
        priority: 'normal' as const,
        policyContext: {
          requesterAgent: 'test-agent',
          delegationChain: [],
          permissions: ['write']
        }
      };

      // Use HTTP API instead of protected method
      const response = await axios.post(`http://localhost:${TEST_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: taskParams,
        id: 1
      });
      
      expect(response.data.result.taskId).toBeDefined();
      expect(response.data.result.state).toBe('submitted');
      expect(response.data.result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should generate content for writing tasks', async () => {
      // Wait a moment for server to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const taskParams = {
        prompt: 'Write about A2A agent benefits',
        priority: 'normal' as const,
        policyContext: {
          requesterAgent: 'test-agent',
          delegationChain: [],
          permissions: ['write']
        }
      };

      const response = await axios.post(`http://localhost:${TEST_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: taskParams,
        id: 2
      });
      
      const taskId = response.data.result.taskId;
      
      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const taskResponse = await axios.post(`http://localhost:${TEST_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId },
        id: 3
      });
      
      expect(taskResponse.data.result.state).toBe('completed');
      expect(taskResponse.data.result.result).toBeDefined();
      expect(taskResponse.data.result.result.content).toContain('A2A agent');
      expect(taskResponse.data.result.result.wordCount).toBeGreaterThan(0);
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      const capabilities = (agent as any).getCapabilities();
      
      expect(capabilities.mcpEnabled).toBe(false);
      expect(capabilities.supportedTasks).toEqual(['write', 'edit', 'proofread', 'translate']);
      expect(capabilities.metadata.specialties).toContain('technical-writing');
    });
  });
});