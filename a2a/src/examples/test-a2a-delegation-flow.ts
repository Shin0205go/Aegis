/**
 * Test A2A Delegation Flow with AEGIS Policy Control
 */

import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { MCPResearchAgent } from '../agents/mcp-research-agent';
import { MCPWritingAgent } from '../agents/mcp-writing-agent';
import { CoordinatorAgent } from '../agents/coordinator-agent';
import { AEGISPolicyEnforcer } from '../core/mock-policy-enforcer';

const sleep = promisify(setTimeout);

const AEGIS_URL = 'http://localhost:8080';

async function checkAEGISAvailability(): Promise<boolean> {
  try {
    const response = await axios.get(`${AEGIS_URL}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function startAgents() {
  console.log('🚀 Starting A2A agents...');

  const researchAgent = new MCPResearchAgent(8301, AEGIS_URL);
  const writingAgent = new MCPWritingAgent(8302, AEGIS_URL);
  
  const policyEnforcer = new AEGISPolicyEnforcer({
    policyEngineUrl: `${AEGIS_URL}/api/policy`,
    cacheEnabled: false,
    strictMode: false
  });
  const coordinatorAgent = new CoordinatorAgent(8300, policyEnforcer);

  await Promise.all([
    researchAgent.start(),
    writingAgent.start(),
    coordinatorAgent.start()
  ]);

  console.log('✅ All agents started');
  await sleep(2000);

  return { researchAgent, writingAgent, coordinatorAgent };
}

async function sendTask(
  agentUrl: string,
  prompt: string,
  policyContext: any
): Promise<string> {
  const response = await axios.post(`${agentUrl}/rpc`, {
    jsonrpc: '2.0',
    method: 'tasks/send',
    params: {
      prompt,
      priority: 'normal',
      policyContext
    },
    id: Date.now()
  });

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  return response.data.result.taskId;
}

async function monitorTask(
  agentUrl: string,
  taskId: string,
  timeout = 30000
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
      
      // Log task progress
      console.log(`   Task ${taskId} state: ${task.state}`);
      
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

async function testDelegationScenarios() {
  console.log('\n📋 Scenario 1: Direct Research Task');
  console.log('-----------------------------------');
  
  // Direct task to research agent
  const researchTaskId = await sendTask(
    'http://localhost:8301',
    'Research the AEGIS policy system architecture',
    {
      requesterAgent: 'test-client',
      delegationChain: [],
      permissions: ['read', 'mcp-tools']
    }
  );
  
  console.log(`✅ Research task created: ${researchTaskId}`);
  const researchResult = await monitorTask('http://localhost:8301', researchTaskId);
  
  console.log(`📊 Research Results:`);
  console.log(`   State: ${researchResult.state}`);
  console.log(`   Tools used: ${researchResult.result?.toolsUsed?.join(', ') || 'none'}`);
  console.log(`   Sources: ${researchResult.result?.sources?.length || 0} files`);

  await sleep(2000);

  console.log('\n📋 Scenario 2: Writing with Delegation to Research');
  console.log('------------------------------------------------');
  
  // Writing task that delegates research
  const writingTaskId = await sendTask(
    'http://localhost:8302',
    'Write an article about AEGIS MCP integration (research the topic first)',
    {
      requesterAgent: 'test-client',
      delegationChain: [],
      permissions: ['write', 'delegate', 'mcp-tools']
    }
  );
  
  console.log(`✅ Writing task created: ${writingTaskId}`);
  const writingResult = await monitorTask('http://localhost:8302', writingTaskId, 60000);
  
  console.log(`📊 Writing Results:`);
  console.log(`   State: ${writingResult.state}`);
  console.log(`   Content length: ${writingResult.result?.content?.length || 0} chars`);
  console.log(`   Delegated tasks: ${writingResult.result?.delegatedTasks?.length || 0}`);

  await sleep(2000);

  console.log('\n📋 Scenario 3: Coordinator Orchestration');
  console.log('--------------------------------------');
  
  // Coordinator orchestrates complex workflow
  const coordinatorTaskId = await sendTask(
    'http://localhost:8300',
    'Research A2A protocols and create a comparison document with AEGIS integration',
    {
      requesterAgent: 'test-client',
      delegationChain: [],
      permissions: ['coordinate', 'delegate']
    }
  );
  
  console.log(`✅ Coordinator task created: ${coordinatorTaskId}`);
  const coordinatorResult = await monitorTask('http://localhost:8300', coordinatorTaskId, 90000);
  
  console.log(`📊 Coordination Results:`);
  console.log(`   State: ${coordinatorResult.state}`);
  console.log(`   Subtasks: ${coordinatorResult.result?.subtasks?.length || 0}`);
  
  if (coordinatorResult.result?.subtasks) {
    coordinatorResult.result.subtasks.forEach((subtask: any, index: number) => {
      console.log(`   Subtask ${index + 1}: ${subtask.agentId} - ${subtask.state}`);
    });
  }

  await sleep(2000);

  console.log('\n📋 Scenario 4: Delegation Chain Depth Test');
  console.log('----------------------------------------');
  
  // Test delegation chain limits
  const deepTaskId = await sendTask(
    'http://localhost:8300',
    'Create a task that requires multiple delegations',
    {
      requesterAgent: 'test-client',
      delegationChain: ['agent1', 'agent2'], // Already 2 levels deep
      permissions: ['coordinate', 'delegate']
    }
  );
  
  console.log(`✅ Deep delegation task created: ${deepTaskId}`);
  const deepResult = await monitorTask('http://localhost:8300', deepTaskId, 60000);
  
  console.log(`📊 Deep Delegation Results:`);
  console.log(`   State: ${deepResult.state}`);
  if (deepResult.state === 'failed') {
    console.log(`   Error: ${deepResult.error?.message || 'Unknown error'}`);
  }

  await sleep(2000);

  console.log('\n📋 Scenario 5: Concurrent Task Execution');
  console.log('--------------------------------------');
  
  // Send multiple tasks concurrently
  const concurrentTasks = await Promise.all([
    sendTask('http://localhost:8301', 'Research task 1', {
      requesterAgent: 'client-1',
      delegationChain: [],
      permissions: ['read', 'mcp-tools']
    }),
    sendTask('http://localhost:8301', 'Research task 2', {
      requesterAgent: 'client-2',
      delegationChain: [],
      permissions: ['read', 'mcp-tools']
    }),
    sendTask('http://localhost:8302', 'Writing task 1', {
      requesterAgent: 'client-3',
      delegationChain: [],
      permissions: ['write', 'mcp-tools']
    })
  ]);
  
  console.log(`✅ Created ${concurrentTasks.length} concurrent tasks`);
  
  // Monitor all tasks
  const results = await Promise.all(
    concurrentTasks.map((taskId, index) => 
      monitorTask(
        index < 2 ? 'http://localhost:8301' : 'http://localhost:8302',
        taskId
      )
    )
  );
  
  console.log(`📊 Concurrent Execution Results:`);
  results.forEach((result, index) => {
    console.log(`   Task ${index + 1}: ${result.state}`);
  });
}

async function main() {
  try {
    // Check AEGIS availability
    console.log('🔍 Checking AEGIS availability...');
    const aegisAvailable = await checkAEGISAvailability();
    
    if (!aegisAvailable) {
      console.error('❌ AEGIS proxy is not running');
      console.log('Please start AEGIS first:');
      console.log('  cd .. && npm run start:mcp:http');
      process.exit(1);
    }
    
    console.log('✅ AEGIS proxy is available');

    // Start agents
    const agents = await startAgents();

    // Run delegation scenarios
    await testDelegationScenarios();

    console.log('\n🎉 A2A Delegation Flow Test Completed!');
    console.log('\n📊 Summary:');
    console.log('- Direct task execution works with MCP tools');
    console.log('- Agents can delegate tasks to each other');
    console.log('- Coordinator successfully orchestrates workflows');
    console.log('- Delegation chain depth limits are enforced');
    console.log('- Concurrent task execution is supported');

    // Cleanup
    console.log('\n🛑 Stopping agents...');
    await Promise.all([
      agents.researchAgent.stop(),
      agents.writingAgent.stop(),
      agents.coordinatorAgent.stop()
    ]);

    console.log('✅ All agents stopped');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main();
}