/**
 * A2A-MCP Integration Tests
 */

import { MCPResearchAgent } from '../../agents/mcp-research-agent';
import { WritingAgent } from '../../agents/writing-agent';
import { CoordinatorAgent } from '../../agents/coordinator-agent';
import { MockAEGISServer, createMockAEGISServer } from '../mocks/mock-aegis-server';
import axios from 'axios';

describe('A2A-MCP Integration', () => {
  let mockAEGIS: MockAEGISServer;
  let researchAgent: MCPResearchAgent;
  let writingAgent: WritingAgent;
  let coordinatorAgent: CoordinatorAgent;

  const MOCK_AEGIS_PORT = 8090;
  const RESEARCH_PORT = 8191;
  const WRITING_PORT = 8192;
  const COORDINATOR_PORT = 8190;

  beforeAll(async () => {
    // Start mock AEGIS server
    mockAEGIS = await createMockAEGISServer(MOCK_AEGIS_PORT);
    
    // Create agents
    researchAgent = new MCPResearchAgent(RESEARCH_PORT, `http://localhost:${MOCK_AEGIS_PORT}`);
    writingAgent = new WritingAgent(WRITING_PORT);
    coordinatorAgent = new CoordinatorAgent(COORDINATOR_PORT);
    
    // Start agents
    await researchAgent.start();
    await writingAgent.start();
    await coordinatorAgent.start();
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Stop agents
    if (researchAgent) await researchAgent.stop();
    if (writingAgent) await writingAgent.stop();
    if (coordinatorAgent) await coordinatorAgent.stop();
    
    // Stop mock server
    if (mockAEGIS) await mockAEGIS.stop();
  });

  describe('Research Agent MCP Integration', () => {
    it('should successfully initialize MCP client', async () => {
      const capabilities = (researchAgent as any).getCapabilities();
      expect(capabilities.mcpEnabled).toBe(true);
    });

    it('should handle research tasks with MCP tools', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Research AI technologies using filesystem tools',
          priority: 'normal',
          policyContext: {
            requesterAgent: 'test-client',
            delegationChain: [],
            permissions: ['research', 'filesystem']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toBeDefined();
      expect(response.data.result.taskId).toBeDefined();

      // Wait for task processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get task result
      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      expect(taskResult.data.result.state).toBe('completed');
      expect(taskResult.data.result.result).toBeDefined();
    });
  });

  describe('A2A Agent Delegation', () => {
    it('should allow Writing Agent to delegate to Research Agent', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Research information for writing article',
          priority: 'normal',
          policyContext: {
            requesterAgent: 'writing-agent',
            delegationChain: [],
            permissions: ['research', 'read-docs']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result.taskId).toBeDefined();
    });

    it('should allow Coordinator to orchestrate complex workflows', async () => {
      const response = await axios.post(`http://localhost:${COORDINATOR_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Research AI and write an article about it',
          priority: 'high',
          policyContext: {
            requesterAgent: 'user',
            delegationChain: [],
            permissions: ['coordinate', 'delegate']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result.taskId).toBeDefined();
    });
  });

  describe('Inter-Agent Communication', () => {
    it('should maintain proper delegation chains', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Delegated research task',
          priority: 'normal',
          policyContext: {
            requesterAgent: 'coordinator-agent',
            delegationChain: ['user', 'coordinator-agent'],
            permissions: ['research']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      
      // Verify task was accepted with proper delegation chain
      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      expect(taskResult.data.result.metadata?.policyContext?.delegationChain).toContain('coordinator-agent');
    });
  });

  describe('Agent Capabilities', () => {
    it('should report correct capabilities for each agent type', async () => {
      const researchCaps = (researchAgent as any).getCapabilities();
      const writingCaps = (writingAgent as any).getCapabilities();
      const coordinatorCaps = (coordinatorAgent as any).getCapabilities();

      // Research Agent
      expect(researchCaps.mcpEnabled).toBe(true);
      expect(researchCaps.name).toBe('mcp-research-agent');

      // Writing Agent
      expect(writingCaps.mcpEnabled).toBe(false);
      expect(writingCaps.supportedTasks).toContain('write');

      // Coordinator Agent
      expect(coordinatorCaps.mcpEnabled).toBe(false);
      expect(coordinatorCaps.knownAgents).toContain('research-agent');
      expect(coordinatorCaps.knownAgents).toContain('writing-agent');
    });
  });
});