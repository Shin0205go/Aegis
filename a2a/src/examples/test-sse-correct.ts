/**
 * Test SSE with correct headers based on MCP specification
 */

import axios from 'axios';
import { EventSource } from 'eventsource';
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

async function testSSEConnection() {
  console.log('\n🧪 Testing SSE connection with correct headers...\n');

  try {
    // 1. Test SSE endpoint with GET request
    console.log('1️⃣ Testing SSE endpoint with GET...');
    
    const sseResponse = await axios.get('http://localhost:8080/mcp/messages', {
      headers: {
        'Accept': 'text/event-stream',
        'X-Agent-ID': 'sse-test-agent',
        'X-Agent-Type': 'test'
      },
      responseType: 'stream',
      validateStatus: () => true
    });
    
    console.log('SSE response status:', sseResponse.status);
    console.log('Content-Type:', sseResponse.headers['content-type']);
    console.log('Session ID:', sseResponse.headers['mcp-session-id']);
    
    if (sseResponse.status === 200) {
      console.log('✅ SSE connection established successfully');
      
      // Read a bit of the stream
      let data = '';
      const stream = sseResponse.data;
      
      await new Promise((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          if (data.includes('event:')) {
            stream.destroy();
            resolve(null);
          }
        });
        
        setTimeout(() => {
          stream.destroy();
          resolve(null);
        }, 2000);
      });
      
      console.log('First part of SSE stream:', data.substring(0, 200));
    }
    
    // 2. Test JSON-RPC with POST
    console.log('\n2️⃣ Testing JSON-RPC with POST...');
    
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
          'Accept': 'application/json, text/event-stream',
          'X-Agent-ID': 'test-agent',
          'X-Agent-Type': 'test'
        },
        responseType: 'text',
        validateStatus: () => true
      }
    );
    
    console.log('Init response status:', initResponse.status);
    console.log('Content-Type:', initResponse.headers['content-type']);
    console.log('Session ID:', initResponse.headers['mcp-session-id']);
    
    if (initResponse.status === 200 && initResponse.headers['content-type']?.includes('text/event-stream')) {
      console.log('✅ Received SSE response for JSON-RPC request');
      
      // Parse SSE data
      const lines = initResponse.data.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.result) {
              console.log('Initialize result:', JSON.stringify(data.result, null, 2));
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    
    // 3. Test with EventSource
    console.log('\n3️⃣ Testing with EventSource...');
    
    const eventSource = new EventSource('http://localhost:8080/mcp/messages', {
      headers: {
        'Accept': 'text/event-stream',
        'X-Agent-ID': 'eventsource-test'
      }
    });
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventSource.close();
        reject(new Error('EventSource timeout'));
      }, 5000);
      
      eventSource.onopen = () => {
        console.log('✅ EventSource connected');
        clearTimeout(timeout);
        setTimeout(() => {
          eventSource.close();
          resolve();
        }, 1000);
      };
      
      eventSource.onerror = (error) => {
        console.error('❌ EventSource error:', error);
        clearTimeout(timeout);
        eventSource.close();
        reject(error);
      };
      
      eventSource.onmessage = (event) => {
        console.log('EventSource message:', event.data);
      };
    });

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

async function runTest() {
  let aegisProcess: any;

  try {
    // Start AEGIS proxy
    aegisProcess = await startAEGISProxy();
    console.log('✅ AEGIS Proxy is ready\n');

    // Run the test
    await testSSEConnection();

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