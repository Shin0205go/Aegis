/**
 * Test tool listing through AEGIS proxy (with server startup)
 */

import axios from 'axios';
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

  // Capture output
  aegisProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output && output.includes('[aegis]')) {
      console.log(`[AEGIS] ${output}`);
    }
  });

  aegisProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('ExperimentalWarning')) {
      console.error(`[AEGIS ERROR] ${output}`);
    }
  });

  // Wait for server to start
  console.log('⏳ Waiting for AEGIS to initialize...');
  await sleep(10000);

  return aegisProcess;
}

async function testToolsList() {
  console.log('\n🧪 Testing tools/list through AEGIS proxy...\n');

  try {
    // 1. Initialize session
    console.log('1️⃣ Initializing MCP session...');
    const initResponse = await axios.post(
      'http://localhost:8080/mcp/messages',
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        responseType: 'text'
      }
    );

    console.log('Init response status:', initResponse.status);
    console.log('Session ID:', initResponse.headers['mcp-session-id']);
    
    const sessionId = initResponse.headers['mcp-session-id'];

    // 2. List tools (with timing)
    console.log('\n2️⃣ Listing tools...');
    const startTime = Date.now();
    
    try {
      const toolsResponse = await axios.post(
        'http://localhost:8080/mcp/messages',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 2
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'mcp-session-id': sessionId
          },
          responseType: 'text',
          timeout: 30000 // 30 seconds timeout
        }
      );

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ Tools list response time: ${elapsedTime}ms`);

      // Parse SSE response
      const lines = toolsResponse.data.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = line.substring(6);
          try {
            const parsed = JSON.parse(jsonData);
            if (parsed.result && parsed.result.tools) {
              console.log(`\n📋 Found ${parsed.result.tools.length} tools:`);
              parsed.result.tools.forEach((tool: any, index: number) => {
                console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
              });
              return; // Success
            }
            if (parsed.error) {
              console.error(`\n❌ Error from server: ${parsed.error.message}`);
              return;
            }
          } catch (e) {
            // Continue to next line
          }
        }
      }
    } catch (error: any) {
      const elapsedTime = Date.now() - startTime;
      console.log(`❌ Failed after ${elapsedTime}ms`);
      
      if (error.code === 'ECONNABORTED') {
        console.error('Request timed out!');
      } else {
        console.error('Error:', error.message);
      }
      
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }

  } catch (error: any) {
    console.error('❌ Error in test:', error.message);
  }
}

async function runTest() {
  let aegisProcess: any;

  try {
    // Start AEGIS proxy
    aegisProcess = await startAEGISProxy();
    console.log('✅ AEGIS Proxy started\n');

    // Run the test
    await testToolsList();

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