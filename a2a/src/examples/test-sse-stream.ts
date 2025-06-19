/**
 * Test SSE (Server-Sent Events) streaming functionality
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { EventSource } from 'eventsource';

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

async function testSSEStream() {
  console.log('\n🧪 Testing SSE streaming functionality...\n');

  try {
    // 1. First establish SSE stream connection
    console.log('1️⃣ Establishing SSE stream connection...');
    
    const eventSource = new EventSource('http://localhost:8080/mcp/messages', {
      headers: {
        'X-Agent-ID': 'sse-test-agent',
        'X-Agent-Type': 'test'
      }
    });
    
    let sessionId: string | null = null;
    
    // Set up event listeners
    eventSource.addEventListener('open', () => {
      console.log('✅ SSE connection established');
    });
    
    eventSource.addEventListener('session', (event: any) => {
      const data = JSON.parse(event.data);
      sessionId = data.sessionId;
      console.log(`Session ID: ${sessionId}`);
    });
    
    eventSource.addEventListener('message', (event: any) => {
      console.log('Message event:', event.data);
    });
    
    eventSource.addEventListener('error', (event: any) => {
      console.error('SSE error:', event);
    });
    
    // Wait for session to be established
    await sleep(1000);
    
    if (!sessionId) {
      throw new Error('Failed to get session ID');
    }
    
    // 2. Send initialize request
    console.log('\n2️⃣ Sending initialize request...');
    
    const initResponse = await axios.post(
      'http://localhost:8080/mcp/messages',
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'sse-test-client',
            version: '1.0.0'
          }
        },
        id: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': sessionId,
          'X-Agent-ID': 'sse-test-agent'
        }
      }
    );
    
    console.log('Initialize response status:', initResponse.status);
    
    // 3. List tools
    console.log('\n3️⃣ Listing tools...');
    
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
          'mcp-session-id': sessionId,
          'X-Agent-ID': 'sse-test-agent'
        }
      }
    );
    
    console.log('Tools response status:', toolsResponse.status);
    
    // 4. Test error handling
    console.log('\n4️⃣ Testing error handling...');
    
    try {
      await axios.post(
        'http://localhost:8080/mcp/messages',
        {
          jsonrpc: '2.0',
          method: 'invalid/method',
          params: {},
          id: 99
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': sessionId
          }
        }
      );
    } catch (error: any) {
      console.log('✅ Error handled correctly:', error.response?.status || error.message);
    }
    
    // 5. Close SSE connection
    console.log('\n5️⃣ Closing SSE connection...');
    eventSource.close();
    
    // 6. Clean up session
    try {
      await axios.delete('http://localhost:8080/mcp/messages', {
        headers: {
          'mcp-session-id': sessionId
        }
      });
      console.log('✅ Session terminated');
    } catch (error) {
      console.log('Session cleanup error (expected if already closed)');
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
    await testSSEStream();

    console.log('\n✅ All tests completed!');

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