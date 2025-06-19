/**
 * Direct test of MCP client with AEGIS proxy
 */

import { SimpleMCPClient } from '../utils/mcp-client';
import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

async function startAEGISProxy(): Promise<any> {
  console.log('🚀 Starting AEGIS Proxy Server...');
  
  const aegisProcess = spawn('npm', ['run', 'start:mcp:http'], {
    cwd: '/Users/shingo/Develop/aegis-policy-engine',
    env: {
      ...process.env,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      LLM_PROVIDER: 'anthropic',
      LLM_MODEL: 'claude-3-5-sonnet-20241022',
      AEGIS_MCP_CONFIG: '/Users/shingo/Develop/aegis-policy-engine/aegis-mcp-config.json',
    },
    shell: true
  });

  let serverReady = false;
  aegisProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Press Ctrl+C to stop')) {
      serverReady = true;
    }
    if (output.includes('[aegis]')) {
      console.log(`[AEGIS] ${output.trim()}`);
    }
  });

  aegisProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('ExperimentalWarning')) {
      console.error(`[AEGIS ERROR] ${output}`);
    }
  });

  // Wait for server to be ready
  console.log('⏳ Waiting for AEGIS to be ready...');
  let waited = 0;
  while (!serverReady && waited < 15000) {
    await sleep(100);
    waited += 100;
  }

  if (!serverReady) {
    throw new Error('AEGIS server did not start in time');
  }

  return aegisProcess;
}

async function testWithMCPClient() {
  console.log('\n🧪 Testing with SimpleMCPClient...\n');

  const client = new SimpleMCPClient({
    baseUrl: 'http://localhost:8080',
    headers: {
      'X-Agent-ID': 'test-agent',
      'X-Agent-Type': 'test',
      'X-Agent-Metadata': JSON.stringify({
        department: 'testing',
        clearanceLevel: 'high',
        permissions: ['read', 'write', 'execute']
      })
    }
  });

  try {
    // 1. Initialize
    console.log('1️⃣ Initializing MCP client...');
    await client.initialize();
    console.log('✅ Initialized successfully\n');

    // 2. List tools (with timing)
    console.log('2️⃣ Listing tools...');
    const startTime = Date.now();
    
    try {
      const tools = await client.listTools();
      const elapsedTime = Date.now() - startTime;
      
      console.log(`✅ Tools list retrieved in ${elapsedTime}ms`);
      console.log(`\n📋 Found ${tools.tools?.length || 0} tools:`);
      
      if (tools.tools) {
        tools.tools.forEach((tool: any, index: number) => {
          console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
        });
      }
    } catch (error: any) {
      const elapsedTime = Date.now() - startTime;
      console.log(`❌ Failed after ${elapsedTime}ms`);
      console.error('Error:', error.message);
      
      // Additional debug info
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }

    // 3. Try to call a tool
    console.log('\n3️⃣ Testing tool call...');
    try {
      const result = await client.callTool('filesystem__list_directory', {
        path: '/Users/shingo/Develop/aegis-policy-engine'
      });
      console.log('✅ Tool call successful');
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error('❌ Tool call failed:', error.message);
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function runTest() {
  let aegisProcess: any;

  try {
    // Start AEGIS proxy
    aegisProcess = await startAEGISProxy();
    console.log('✅ AEGIS Proxy is ready\n');

    // Run the test
    await testWithMCPClient();

  } finally {
    // Cleanup
    console.log('\n🛑 Cleaning up...');
    if (aegisProcess) {
      aegisProcess.kill();
      console.log('AEGIS Proxy stopped');
    }
  }
}

// Run the test
runTest().catch(console.error);