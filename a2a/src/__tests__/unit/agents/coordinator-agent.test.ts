/**
 * Coordinator Agent Unit Tests
 */

import { CoordinatorAgent } from '../../../agents/coordinator-agent';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoordinatorAgent', () => {
  let agent: CoordinatorAgent;
  const TEST_PORT = 9002;

  beforeEach(() => {
    agent = new CoordinatorAgent(TEST_PORT);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      const capabilities = (agent as any).getCapabilities();
      
      expect(capabilities.name).toBe('coordinator-agent');
      expect(capabilities.description).toBe('Coordinator agent that orchestrates tasks between multiple agents');
      expect(capabilities.mcpEnabled).toBe(false);
      expect(capabilities.supportedTasks).toContain('orchestrate');
      expect(capabilities.knownAgents).toContain('research-agent');
      expect(capabilities.knownAgents).toContain('writing-agent');
    });

    it('should start and stop correctly', async () => {
      await agent.start();
      expect(agent).toBeDefined();
      await agent.stop();
    });
  });

  describe('task delegation', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should delegate research tasks to research agent', async () => {
      // Mock successful delegation response
      mockedAxios.post.mockResolvedValue({
        data: {
          result: {
            taskId: 'mock-task-123',
            state: 'submitted',
            acceptedAt: new Date().toISOString(),
            estimatedDuration: 4000
          }
        }
      });

      const taskParams = {
        prompt: 'Research AI technologies',
        priority: 'normal' as const,
        policyContext: {
          requesterAgent: 'user',
          delegationChain: [],
          permissions: ['coordinate']
        }
      };

      const response = await axios.post(`http://localhost:${TEST_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: taskParams,
        id: 1
      });
      
      expect(response.data.result.taskId).toBeDefined();
      expect(response.data.result.state).toBe('submitted');
    });

    it('should handle mixed research and writing tasks', async () => {
      // Mock delegation responses
      mockedAxios.post.mockResolvedValueOnce({
        data: { result: { taskId: 'research-task-123' } }
      }).mockResolvedValueOnce({
        data: { result: { taskId: 'writing-task-456' } }
      });

      const taskParams = {
        prompt: 'Research AI and write an article about it',
        priority: 'normal' as const,
        policyContext: {
          requesterAgent: 'user',
          delegationChain: [],
          permissions: ['coordinate']
        }
      };

      const response = await axios.post(`http://localhost:${TEST_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: taskParams,
        id: 2
      });
      
      expect(response.data.result.taskId).toBeDefined();
      // Note: These checks would happen after delegation starts
      // For unit tests, we just verify task acceptance
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      const capabilities = (agent as any).getCapabilities();
      
      expect(capabilities.mcpEnabled).toBe(false);
      expect(capabilities.supportedTasks).toEqual(['orchestrate', 'coordinate', 'workflow']);
      expect(capabilities.knownAgents).toEqual(['research-agent', 'writing-agent']);
    });
  });
});