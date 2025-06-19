/**
 * A2A-MCP統合デモ
 * 
 * シナリオ:
 * 1. Research Agent (MCPツール持ち) - AEGIS経由でツールアクセス
 * 2. Writing Agent (通常のA2A) - Research Agentに依頼
 * 3. Coordinator Agent (通常のA2A) - タスクを調整
 * 
 * ポリシー制御の確認:
 * - 信頼できるエージェントからのアクセス → 許可
 * - 信頼できないエージェントからのアクセス → 拒否
 */

import { MCPResearchAgent } from '../agents/mcp-research-agent';
import { WritingAgent } from '../agents/writing-agent';
import { CoordinatorAgent } from '../agents/coordinator-agent';
import axios from 'axios';
import winston from 'winston';

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

// AEGIS MCPプロキシのURL
const AEGIS_PROXY_URL = process.env.AEGIS_URL || 'http://localhost:8080';

// Helper function
const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkAEGISAvailability(): Promise<boolean> {
  try {
    const response = await axios.get(`${AEGIS_PROXY_URL}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function runDemo() {
  logger.info('🚀 Starting A2A-MCP Integration Demo');
  
  // Check AEGIS availability
  logger.info('🔍 Checking AEGIS MCP proxy availability...');
  const aegisAvailable = await checkAEGISAvailability();
  
  if (!aegisAvailable) {
    logger.error('❌ AEGIS MCP proxy is not available. Please start it first.');
    logger.info('Run: npm run start:mcp:http');
    return;
  }
  
  logger.info('✅ AEGIS MCP proxy is available');

  // Start agents
  logger.info('\n📡 Starting A2A agents...');
  
  // Only Research Agent has MCP access
  const researchAgent = new MCPResearchAgent(8101, AEGIS_PROXY_URL);
  const writingAgent = new WritingAgent(8102);
  const coordinatorAgent = new CoordinatorAgent(8100);
  
  await researchAgent.start();
  await writingAgent.start();
  await coordinatorAgent.start();
  
  logger.info('✅ All agents started successfully');
  logger.info(`  - Research Agent (MCP-enabled): http://localhost:8101`);
  logger.info(`  - Writing Agent (regular A2A): http://localhost:8102`);
  logger.info(`  - Coordinator Agent (regular A2A): http://localhost:8100`);
  
  await waitFor(2000);

  // Scenario 1: Writing Agent asks Research Agent for help
  logger.info('\n📚 Scenario 1: Writing Agent → Research Agent');
  logger.info('-----------------------------------------------');
  
  try {
    const response1 = await axios.post('http://localhost:8101/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Research information about AEGIS policy system',
        priority: 'normal',
        policyContext: {
          requesterAgent: 'writing-agent',
          delegationChain: [],
          permissions: ['research', 'read-docs']
        }
      },
      id: Date.now()
    });
    
    logger.info('✅ Writing Agent successfully delegated research task');
    const taskId1 = response1.data.result?.taskId;
    
    // Wait for completion
    await waitFor(3000);
    
    // Get result
    const result1 = await axios.post('http://localhost:8101/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/get',
      params: { taskId: taskId1 },
      id: Date.now()
    });
    
    logger.info('📝 Research completed:', result1.data.result?.state);
    
  } catch (error) {
    logger.error('❌ Scenario 1 failed:', error);
  }

  await waitFor(2000);

  // Scenario 2: Coordinator orchestrates a complex task
  logger.info('\n📚 Scenario 2: Coordinator → Research + Writing');
  logger.info('------------------------------------------------');
  
  try {
    const response2 = await axios.post('http://localhost:8100/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Research AEGIS features and write a summary article',
        priority: 'high',
        policyContext: {
          requesterAgent: 'user',
          delegationChain: [],
          permissions: ['coordinate', 'delegate']
        }
      },
      id: Date.now()
    });
    
    logger.info('✅ Coordinator accepted complex task');
    const taskId2 = response2.data.result?.taskId;
    
    // Wait for orchestration
    await waitFor(5000);
    
    // Get result
    const result2 = await axios.post('http://localhost:8100/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/get',
      params: { taskId: taskId2 },
      id: Date.now()
    });
    
    logger.info('📝 Orchestration completed:', result2.data.result?.state);
    
  } catch (error) {
    logger.error('❌ Scenario 2 failed:', error);
  }

  await waitFor(2000);

  // Scenario 3: Untrusted agent tries to access Research Agent
  logger.info('\n📚 Scenario 3: Untrusted Agent → Research Agent');
  logger.info('-----------------------------------------------');
  
  try {
    const response3 = await axios.post('http://localhost:8101/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Execute system commands and access sensitive files',
        priority: 'urgent',
        policyContext: {
          requesterAgent: 'unknown-malicious-agent',
          delegationChain: [],
          permissions: []
        }
      },
      id: Date.now()
    });
    
    // This should be blocked by AEGIS policy
    logger.warn('⚠️ Untrusted agent request was accepted (unexpected)');
    
  } catch (error) {
    logger.info('✅ Untrusted agent request was properly blocked');
  }

  await waitFor(2000);

  // Check agent capabilities
  logger.info('\n📊 Agent Capabilities Check');
  logger.info('---------------------------');
  
  const researchCaps = researchAgent.getCapabilities();
  const writingCaps = writingAgent.getCapabilities();
  const coordinatorCaps = coordinatorAgent.getCapabilities();
  
  logger.info('\nResearch Agent:');
  logger.info(`  - MCP Enabled: ${researchCaps.mcpEnabled}`);
  logger.info(`  - Available Tools: ${researchCaps.availableTools || 0}`);
  
  logger.info('\nWriting Agent:');
  logger.info(`  - MCP Enabled: ${writingCaps.mcpEnabled}`);
  logger.info(`  - Supported Tasks: ${writingCaps.supportedTasks.join(', ')}`);
  
  logger.info('\nCoordinator Agent:');
  logger.info(`  - MCP Enabled: ${coordinatorCaps.mcpEnabled}`);
  logger.info(`  - Known Agents: ${coordinatorCaps.knownAgents.join(', ')}`);

  // Cleanup
  logger.info('\n🛑 Stopping agents...');
  await researchAgent.stop();
  await writingAgent.stop();
  await coordinatorAgent.stop();
  
  logger.info('✅ Demo completed successfully!');
  
  logger.info('\n📋 Summary:');
  logger.info('- Only Research Agent has MCP tool access through AEGIS');
  logger.info('- Other agents delegate to Research Agent when tools are needed');
  logger.info('- AEGIS controls which agents can access which tools');
  logger.info('- Policy enforcement happens transparently at the MCP layer');
}

// Run the demo
runDemo().catch(error => {
  logger.error('Demo failed:', error);
  process.exit(1);
});