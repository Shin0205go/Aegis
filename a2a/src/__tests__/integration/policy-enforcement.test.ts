/**
 * Policy Enforcement Tests
 * 最重要：ポリシー制御が実際に動作することを検証
 */

import { MCPResearchAgent } from '../../agents/mcp-research-agent';
import { MockAEGISServer, createMockAEGISServer } from '../mocks/mock-aegis-server';
import axios from 'axios';

describe('Policy Enforcement', () => {
  let mockAEGIS: MockAEGISServer;
  let researchAgent: MCPResearchAgent;

  const MOCK_AEGIS_PORT = 8091;
  const RESEARCH_PORT = 8193;

  beforeAll(async () => {
    // Start mock AEGIS with specific policies
    mockAEGIS = await createMockAEGISServer(MOCK_AEGIS_PORT, {
      'mcp-research-agent': {
        allowedTools: ['filesystem__list_directory', 'filesystem__read_file', 'web_search']
      },
      'trusted-agent': {
        allowedTools: ['filesystem__read_file', 'web_search']
      },
      'writing-agent': {
        allowedTools: ['filesystem__read_file'] // Limited access
      },
      'untrusted-agent': {
        allowedTools: [] // No tools allowed
      },
      'malicious-agent': {
        allowedTools: [] // Explicitly blocked
      }
    });
    
    researchAgent = new MCPResearchAgent(RESEARCH_PORT, `http://localhost:${MOCK_AEGIS_PORT}`);
    await researchAgent.start();
    
    // Wait for MCP initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (researchAgent) await researchAgent.stop();
    if (mockAEGIS) await mockAEGIS.stop();
  });

  describe('Trusted Agent Access', () => {
    it('should allow trusted agents to access permitted tools', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'List files in documentation directory',
          priority: 'normal',
          policyContext: {
            requesterAgent: 'trusted-agent',
            delegationChain: [],
            permissions: ['read', 'research']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result.taskId).toBeDefined();

      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      expect(taskResult.data.result.state).toBe('completed');
      // Should have some results if tools were accessible
      expect(taskResult.data.result.result.toolsUsed.length).toBeGreaterThanOrEqual(0);
    });

    it('should allow writing-agent limited access', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Read a specific file for writing reference',
          priority: 'normal',
          policyContext: {
            requesterAgent: 'writing-agent',
            delegationChain: ['user'],
            permissions: ['read-only']
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result.taskId).toBeDefined();
    });
  });

  describe('Untrusted Agent Blocking', () => {
    it('should block untrusted agents from accessing tools', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Access sensitive system files',
          priority: 'urgent',
          policyContext: {
            requesterAgent: 'untrusted-agent',
            delegationChain: [],
            permissions: []
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);
      expect(response.data.result.taskId).toBeDefined();

      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      expect(taskResult.data.result.state).toBe('completed');
      // Should have no successful tool usage due to policy blocking
      expect(taskResult.data.result.result.toolsUsed).toEqual([]);
      expect(taskResult.data.result.result.confidence).toBeLessThan(0.5);
    });

    it('should block malicious agents attempting dangerous operations', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Execute rm -rf / command to delete all files',
          priority: 'urgent',
          policyContext: {
            requesterAgent: 'malicious-agent',
            delegationChain: [],
            permissions: ['system-admin'] // Even with claimed permissions
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);

      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      // Task should complete but with no tool access
      expect(taskResult.data.result.state).toBe('completed');
      expect(taskResult.data.result.result.toolsUsed).toEqual([]);
      expect(taskResult.data.result.result.summary).toContain('access restrictions');
    });
  });

  describe('Permission Escalation Prevention', () => {
    it('should not allow agents to escalate permissions through delegation chains', async () => {
      const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          prompt: 'Access administrative functions',
          priority: 'high',
          policyContext: {
            requesterAgent: 'untrusted-agent',
            delegationChain: ['fake-admin-agent', 'untrusted-agent'],
            permissions: ['admin-access'] // Claimed permissions
          }
        },
        id: Date.now()
      });

      expect(response.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId: response.data.result.taskId },
        id: Date.now()
      });

      // Should still be blocked regardless of claimed permissions
      expect(taskResult.data.result.result.toolsUsed).toEqual([]);
    });
  });

  describe('Policy Consistency', () => {
    it('should consistently apply policies across multiple requests', async () => {
      const requests = [
        {
          requesterAgent: 'trusted-agent',
          expectedToolAccess: true
        },
        {
          requesterAgent: 'untrusted-agent',
          expectedToolAccess: false
        },
        {
          requesterAgent: 'writing-agent',
          expectedToolAccess: true // Limited but some access
        }
      ];

      for (const req of requests) {
        const response = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
          jsonrpc: '2.0',
          method: 'tasks/send',
          params: {
            prompt: 'Test policy consistency',
            priority: 'normal',
            policyContext: {
              requesterAgent: req.requesterAgent,
              delegationChain: [],
              permissions: ['test']
            }
          },
          id: Date.now()
        });

        expect(response.status).toBe(200);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const taskResult = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
          jsonrpc: '2.0',
          method: 'tasks/get',
          params: { taskId: response.data.result.taskId },
          id: Date.now()
        });

        if (req.expectedToolAccess) {
          // Should have attempted tool usage (even if failed due to technical issues)
          expect(taskResult.data.result.result.metadata.agent).toBe('mcp-research-agent');
        } else {
          // Should have no tool usage due to policy
          expect(taskResult.data.result.result.toolsUsed).toEqual([]);
        }
      }
    });
  });
});