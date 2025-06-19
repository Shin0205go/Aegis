/**
 * A2A Integration Test with Real AEGIS Proxy
 */

import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { MCPResearchAgent } from '../../agents/mcp-research-agent';
import { MCPWritingAgent } from '../../agents/mcp-writing-agent';
import { CoordinatorAgent } from '../../agents/coordinator-agent';
import { AEGISPolicyEnforcer } from '../../core/mock-policy-enforcer';

const sleep = promisify(setTimeout);

describe('A2A Integration with AEGIS MCP Proxy', () => {
  let aegisProcess: ChildProcess;
  let researchAgent: MCPResearchAgent;
  let writingAgent: MCPWritingAgent;
  let coordinatorAgent: CoordinatorAgent;
  
  const AEGIS_URL = 'http://localhost:8080';
  const RESEARCH_PORT = 8201;
  const WRITING_PORT = 8202;
  const COORDINATOR_PORT = 8200;

  beforeAll(async () => {
    // Start AEGIS proxy
    console.log('Starting AEGIS proxy...');
    aegisProcess = spawn('npm', ['run', 'start:mcp:http'], {
      cwd: '/Users/shingo/Develop/aegis-policy-engine',
      env: {
        ...process.env,
        PORT: '8080',
        LOG_LEVEL: 'info',
        LLM_PROVIDER: 'anthropic',
        LLM_MODEL: 'claude-3-5-sonnet-20241022',
        AEGIS_MCP_CONFIG: '/Users/shingo/Develop/aegis-policy-engine/aegis-mcp-config.json',
      },
      shell: true
    });

    // Wait for AEGIS to be ready
    await waitForServer(AEGIS_URL, 30000);
    console.log('AEGIS proxy is ready');

    // Start A2A agents
    researchAgent = new MCPResearchAgent(RESEARCH_PORT, AEGIS_URL);
    writingAgent = new MCPWritingAgent(WRITING_PORT, AEGIS_URL);
    
    const policyEnforcer = new AEGISPolicyEnforcer({
      policyEngineUrl: `${AEGIS_URL}/api/policy`,
      cacheEnabled: false,
      strictMode: false
    });
    coordinatorAgent = new CoordinatorAgent(COORDINATOR_PORT, policyEnforcer);

    await Promise.all([
      researchAgent.start(),
      writingAgent.start(),
      coordinatorAgent.start()
    ]);

    // Wait for agents to initialize
    await sleep(2000);
  }, 60000);

  afterAll(async () => {
    // Stop agents
    await Promise.all([
      researchAgent?.stop(),
      writingAgent?.stop(),
      coordinatorAgent?.stop()
    ].filter(Boolean));

    // Stop AEGIS
    if (aegisProcess) {
      aegisProcess.kill();
      await sleep(1000);
    }
  });

  test('Research agent can list MCP tools through AEGIS', async () => {
    const response = await axios.get(`http://localhost:${RESEARCH_PORT}/agent/card`);
    
    expect(response.status).toBe(200);
    expect(response.data.capabilities).toBeDefined();
    expect(response.data.capabilities.mcpTools).toBeDefined();
    expect(Array.isArray(response.data.capabilities.mcpTools)).toBe(true);
    expect(response.data.capabilities.mcpTools.length).toBeGreaterThan(0);
    
    // Should have filesystem tools
    const hasFilesystemTools = response.data.capabilities.mcpTools.some(
      (tool: string) => tool.startsWith('filesystem__')
    );
    expect(hasFilesystemTools).toBe(true);
  });

  test('Research agent can execute research task with MCP tools', async () => {
    const taskResponse = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'List files in the AEGIS project directory',
        policyContext: {
          requesterAgent: 'test-client',
          permissions: ['read', 'mcp-tools']
        }
      },
      id: 1
    });

    expect(taskResponse.data.result).toBeDefined();
    expect(taskResponse.data.result.taskId).toBeDefined();

    const taskId = taskResponse.data.result.taskId;

    // Monitor task
    const result = await monitorTask(
      `http://localhost:${RESEARCH_PORT}`,
      taskId,
      30000
    );

    expect(result.state).toBe('completed');
    expect(result.result).toBeDefined();
    expect(result.result.toolsUsed).toBeDefined();
    expect(result.result.toolsUsed.length).toBeGreaterThan(0);
  });

  test('Writing agent can create content using MCP tools', async () => {
    const taskResponse = await axios.post(`http://localhost:${WRITING_PORT}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Write a short test file about AEGIS integration',
        policyContext: {
          requesterAgent: 'test-client',
          permissions: ['write', 'mcp-tools']
        }
      },
      id: 2
    });

    expect(taskResponse.data.result).toBeDefined();
    expect(taskResponse.data.result.taskId).toBeDefined();

    const taskId = taskResponse.data.result.taskId;

    // Monitor task
    const result = await monitorTask(
      `http://localhost:${WRITING_PORT}`,
      taskId,
      30000
    );

    expect(result.state).toBe('completed');
    expect(result.result).toBeDefined();
    expect(result.result.content).toBeDefined();
    expect(result.result.toolsUsed).toBeDefined();
  });

  test('Coordinator can orchestrate multi-agent workflow', async () => {
    const taskResponse = await axios.post(`http://localhost:${COORDINATOR_PORT}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Research AEGIS features and write a summary',
        policyContext: {
          requesterAgent: 'test-client',
          delegationChain: [],
          permissions: ['delegate', 'coordinate']
        }
      },
      id: 3
    });

    expect(taskResponse.data.result).toBeDefined();
    expect(taskResponse.data.result.taskId).toBeDefined();

    const taskId = taskResponse.data.result.taskId;

    // Monitor task
    const result = await monitorTask(
      `http://localhost:${COORDINATOR_PORT}`,
      taskId,
      60000
    );

    expect(result.state).toBe('completed');
    expect(result.result).toBeDefined();
    expect(result.result.subtasks).toBeDefined();
    expect(result.result.subtasks.length).toBeGreaterThan(0);
  });

  test('Policy denial for unauthorized tool access', async () => {
    const taskResponse = await axios.post(`http://localhost:${RESEARCH_PORT}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Execute system commands to check server status',
        policyContext: {
          requesterAgent: 'untrusted-agent',
          permissions: []  // No permissions
        }
      },
      id: 4
    });

    const taskId = taskResponse.data.result.taskId;

    // Monitor task
    const result = await monitorTask(
      `http://localhost:${RESEARCH_PORT}`,
      taskId,
      30000
    );

    // Task should fail due to policy denial
    expect(result.state).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('POLICY_DENIED');
  });

  test('Delegation chain depth limit enforcement', async () => {
    // Create a deep delegation chain
    const taskResponse = await axios.post(`http://localhost:${COORDINATOR_PORT}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Delegate this task multiple times',
        policyContext: {
          requesterAgent: 'test-client',
          delegationChain: ['agent1', 'agent2', 'agent3'], // Already at max depth
          permissions: ['delegate']
        }
      },
      id: 5
    });

    const taskId = taskResponse.data.result.taskId;

    // Monitor task
    const result = await monitorTask(
      `http://localhost:${COORDINATOR_PORT}`,
      taskId,
      30000
    );

    // Should fail due to delegation depth limit
    expect(result.state).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('delegation');
  });
});

// Helper functions
async function waitForServer(url: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.get(`${url}/health`);
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    await sleep(1000);
  }
  
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

async function monitorTask(
  agentUrl: string,
  taskId: string,
  timeout: number
): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.post(`${agentUrl}/rpc`, {
        jsonrpc: '2.0',
        method: 'tasks/get',
        params: { taskId },
        id: Date.now()
      });

      const task = response.data.result;
      if (task.state === 'completed' || task.state === 'failed') {
        return task;
      }

      await sleep(1000);
    } catch (error) {
      console.error('Failed to monitor task:', error);
      throw error;
    }
  }

  throw new Error('Task monitoring timeout');
}