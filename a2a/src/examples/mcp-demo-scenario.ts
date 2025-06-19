/**
 * MCP統合デモシナリオ
 * A2AエージェントがAEGIS MCPプロキシ経由でツールを使用
 */

import { MCPResearchAgent } from '../agents/mcp-research-agent';
import { MCPWritingAgent } from '../agents/mcp-writing-agent';
import { CoordinatorAgent } from '../agents/coordinator-agent';
import { AEGISPolicyEnforcer } from '../core/mock-policy-enforcer';
import axios from 'axios';
import winston from 'winston';
// Helper function
const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

// AEGIS MCPプロキシのURL（実際のAEGISが動作していることを前提）
const AEGIS_PROXY_URL = process.env.AEGIS_URL || 'http://localhost:8080';

async function checkAEGISAvailability(): Promise<boolean> {
  try {
    const response = await axios.get(`${AEGIS_PROXY_URL}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function startAgents() {
  logger.info('🚀 Starting MCP-enabled A2A agents...');

  // Create agents that use AEGIS MCP proxy
  const researchAgent = new MCPResearchAgent(8101, AEGIS_PROXY_URL);
  const writingAgent = new MCPWritingAgent(8102, AEGIS_PROXY_URL);
  
  // Coordinator still uses legacy policy enforcer for now
  const policyEnforcer = new AEGISPolicyEnforcer({
    policyEngineUrl: `${AEGIS_PROXY_URL}/api/policy`,
    cacheEnabled: true,
    cacheTTL: 300000,
    strictMode: false
  });
  const coordinatorAgent = new CoordinatorAgent(8100, policyEnforcer);

  // Start agents
  await Promise.all([
    researchAgent.start(),
    writingAgent.start(),
    coordinatorAgent.start()
  ]);

  logger.info('✅ All MCP-enabled agents started successfully');

  // Wait for agents to initialize
  await waitFor(2000);

  return { researchAgent, writingAgent, coordinatorAgent };
}

async function sendTask(agentUrl: string, prompt: string, requesterAgent = 'mcp-demo-client') {
  try {
    const response = await axios.post(`${agentUrl}/rpc`, {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt,
        priority: 'normal',
        policyContext: {
          requesterAgent,
          delegationChain: [],
          permissions: ['basic-access', 'mcp-tools']
        }
      },
      id: Date.now()
    });

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    return response.data.result;
  } catch (error) {
    logger.error('Failed to send task', error);
    throw error;
  }
}

async function monitorTask(agentUrl: string, taskId: string, timeout = 30000) {
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

      await waitFor(1000);
    } catch (error) {
      logger.error('Failed to monitor task', error);
      throw error;
    }
  }

  throw new Error('Task monitoring timeout');
}

async function runMCPDemoScenarios() {
  logger.info('\n📚 MCP Demo Scenario 1: Research with Filesystem Access');
  logger.info('-----------------------------------------------');
  
  // Scenario 1: Research agent uses filesystem tools via AEGIS
  const researchTask = await sendTask(
    'http://localhost:8101',
    'Research AEGIS policy system from documentation files'
  );
  logger.info(`📝 Research task created: ${researchTask.taskId}`);
  
  const researchResult = await monitorTask('http://localhost:8101', researchTask.taskId);
  logger.info(`✅ Research completed:`);
  logger.info(`   Tools used: ${researchResult.result?.toolsUsed?.join(', ') || 'none'}`);
  logger.info(`   Sources: ${researchResult.result?.sources?.join(', ') || 'none'}`);
  logger.info(`   Findings: ${researchResult.result?.findings?.length || 0} items`);

  await waitFor(2000);

  logger.info('\n📚 MCP Demo Scenario 2: Writing with Multiple Tools');
  logger.info('------------------------------------------------');
  
  // Scenario 2: Writing agent uses multiple MCP tools
  const writingTask = await sendTask(
    'http://localhost:8102',
    'Write an article about AEGIS MCP integration benefits'
  );
  logger.info(`📝 Writing task created: ${writingTask.taskId}`);
  
  const writingResult = await monitorTask('http://localhost:8102', writingTask.taskId);
  logger.info(`✅ Writing completed:`);
  logger.info(`   Tools used: ${writingResult.result?.toolsUsed?.join(', ') || 'none'}`);
  logger.info(`   Word count: ${writingResult.result?.wordCount || 0}`);
  logger.info(`   Saved to: ${writingResult.result?.savedTo || 'not saved'}`);

  await waitFor(2000);

  logger.info('\n📚 MCP Demo Scenario 3: Policy Denial for Sensitive Tools');
  logger.info('-------------------------------------------------------');
  
  // Scenario 3: Attempt to use restricted tools
  try {
    const restrictedTask = await sendTask(
      'http://localhost:8101',
      'Execute system commands to check server status',
      'untrusted-mcp-agent'
    );
    logger.info(`📝 Restricted task created: ${restrictedTask.taskId}`);
    
    const restrictedResult = await monitorTask('http://localhost:8101', restrictedTask.taskId);
    
    if (restrictedResult.state === 'failed' && 
        restrictedResult.error?.code === 'POLICY_DENIED') {
      logger.warn(`❌ Task correctly denied by policy: ${restrictedResult.error.message}`);
    } else {
      logger.info(`⚠️ Task completed unexpectedly`);
    }
  } catch (error) {
    logger.warn(`❌ Task rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  await waitFor(2000);

  logger.info('\n📚 MCP Demo Scenario 4: Tool Availability Check');
  logger.info('---------------------------------------------');
  
  // Check what tools are available to each agent
  for (const [agentName, port] of [['research', 8101], ['writing', 8102]]) {
    try {
      const response = await axios.get(`http://localhost:${port}/agent/card`);
      const capabilities = response.data.capabilities;
      
      logger.info(`\n${agentName} agent capabilities:`);
      logger.info(`   MCP tools: ${capabilities.mcpTools?.length || 0} available`);
      
      if (capabilities.mcpTools) {
        logger.info(`   Tools: ${capabilities.mcpTools.slice(0, 5).join(', ')}${
          capabilities.mcpTools.length > 5 ? '...' : ''
        }`);
      }
    } catch (error) {
      logger.error(`Failed to get ${agentName} agent capabilities`);
    }
  }
}

async function main() {
  try {
    // Check if AEGIS is running
    logger.info('🔍 Checking AEGIS MCP proxy availability...');
    const aegisAvailable = await checkAEGISAvailability();
    
    if (!aegisAvailable) {
      logger.error('❌ AEGIS MCP proxy is not available at ' + AEGIS_PROXY_URL);
      logger.info('💡 Please ensure AEGIS is running:');
      logger.info('   cd .. && npm run start:aegis');
      process.exit(1);
    }
    
    logger.info('✅ AEGIS MCP proxy is available');

    // Start all agents
    const agents = await startAgents();

    // Run MCP-specific demo scenarios
    await runMCPDemoScenarios();

    logger.info('\n🎉 MCP Demo completed successfully!');
    logger.info('\n📊 Summary:');
    logger.info('- Demonstrated A2A agents using MCP tools via AEGIS');
    logger.info('- Showed policy control over tool access');
    logger.info('- Verified tool availability through AEGIS proxy');
    logger.info('- Tested both permitted and denied tool usage');

    // Stop agents
    logger.info('\n🛑 Stopping agents...');
    await Promise.all([
      agents.researchAgent.stop(),
      agents.writingAgent.stop(),
      agents.coordinatorAgent.stop()
    ]);

    logger.info('✅ All agents stopped');
    process.exit(0);

  } catch (error) {
    logger.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main();
}