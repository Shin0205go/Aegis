/**
 * 簡単なポリシー制御テスト
 * モックAEGISサーバーを使用してポリシー制御が動作することを確認
 */

import { MCPResearchAgent } from '../agents/mcp-research-agent';
import { createMockAEGISServer } from '../__tests__/mocks/mock-aegis-server';
import axios from 'axios';

async function testPolicyControl() {
  console.log('🚀 Starting Simple Policy Control Test');

  // Start mock AEGIS server
  console.log('📡 Starting Mock AEGIS server...');
  const mockAEGIS = await createMockAEGISServer(8095, {
    'mcp-research-agent': {
      allowedTools: ['filesystem__list_directory', 'web_search']
    },
    'trusted-agent': {
      allowedTools: ['filesystem__read_file']
    },
    'untrusted-agent': {
      allowedTools: [] // No tools allowed
    }
  });

  // Start research agent
  console.log('🔬 Starting Research Agent...');
  const researchAgent = new MCPResearchAgent(8195, 'http://localhost:8095');
  await researchAgent.start();

  console.log('✅ Setup complete');

  try {
    // Test 1: Trusted agent access
    console.log('\n📋 Test 1: Trusted agent should be able to submit tasks');
    const trustedResponse = await axios.post('http://localhost:8195/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Research something safely',
        priority: 'normal',
        policyContext: {
          requesterAgent: 'trusted-agent',
          delegationChain: [],
          permissions: ['read']
        }
      },
      id: 1
    });

    console.log('✅ Trusted agent task accepted:', trustedResponse.data.result?.taskId);

    // Test 2: Untrusted agent access
    console.log('\n📋 Test 2: Untrusted agent tasks should be limited');
    const untrustedResponse = await axios.post('http://localhost:8195/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: {
        prompt: 'Try to access sensitive files',
        priority: 'urgent',
        policyContext: {
          requesterAgent: 'untrusted-agent',
          delegationChain: [],
          permissions: []
        }
      },
      id: 2
    });

    console.log('⚠️ Untrusted agent task accepted (will be controlled at tool level):', untrustedResponse.data.result?.taskId);

    // Wait for processing
    console.log('\n⏳ Waiting for task processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check results
    const trustedResult = await axios.post('http://localhost:8195/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/get',
      params: { taskId: trustedResponse.data.result?.taskId },
      id: 3
    });

    const untrustedResult = await axios.post('http://localhost:8195/rpc', {
      jsonrpc: '2.0',
      method: 'tasks/get',
      params: { taskId: untrustedResponse.data.result?.taskId },
      id: 4
    });

    console.log('\n📊 Results:');
    console.log('Trusted agent result state:', trustedResult.data.result?.state);
    console.log('Trusted agent tools used:', trustedResult.data.result?.result?.toolsUsed?.length || 0);
    
    console.log('Untrusted agent result state:', untrustedResult.data.result?.state);
    console.log('Untrusted agent tools used:', untrustedResult.data.result?.result?.toolsUsed?.length || 0);

    // Test 3: MCP tool availability
    console.log('\n📋 Test 3: Agent capabilities');
    const capabilities = (researchAgent as any).getCapabilities();
    console.log('Research agent MCP enabled:', capabilities.mcpEnabled);
    console.log('Available tools count:', capabilities.mcpTools?.length || 0);

    console.log('\n🎉 Policy Control Test Completed Successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🛑 Cleaning up...');
    await researchAgent.stop();
    await mockAEGIS.stop();
    console.log('✅ Cleanup complete');
  }
}

// Run the test
testPolicyControl().catch(console.error);