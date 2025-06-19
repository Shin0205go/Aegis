/**
 * Test StreamableHTTPServerTransport functionality
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

interface SSEEvent {
  type: string;
  data: any;
}

function parseSSE(data: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = data.split('\n');
  
  let currentEvent: Partial<SSEEvent> = {};
  
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent.type = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      const dataStr = line.substring(6);
      try {
        currentEvent.data = JSON.parse(dataStr);
      } catch {
        currentEvent.data = dataStr;
      }
    } else if (line.trim() === '' && currentEvent.data) {
      events.push(currentEvent as SSEEvent);
      currentEvent = {};
    }
  }
  
  return events;
}

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

async function testStreamableHTTP() {
  console.log('\n🧪 Testing StreamableHTTPServerTransport functionality...\n');

  try {
    // 1. Test SSE initialization
    console.log('1️⃣ Testing SSE initialization...');
    
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
          'X-Agent-ID': 'sse-test-agent',
          'X-Agent-Type': 'test'
        },
        responseType: 'stream',
        decompress: false
      }
    );

    console.log('✅ SSE stream received');
    console.log('Response headers:', initResponse.headers);
    console.log('Session ID:', initResponse.headers['mcp-session-id']);
    
    // Read stream data
    let sseData = '';
    for await (const chunk of initResponse.data) {
      sseData += chunk.toString();
    }
    
    // Parse SSE events
    const initEvents = parseSSE(sseData);
    console.log(`Parsed ${initEvents.length} SSE events`);
    
    const sessionId = initResponse.headers['mcp-session-id'];

    // 2. Test multiple requests in same session
    console.log('\n2️⃣ Testing multiple requests in session...');
    
    const requests = [
      { method: 'tools/list', params: {} },
      { method: 'resources/list', params: {} }
    ];
    
    for (const [index, req] of requests.entries()) {
      console.log(`\n  Request ${index + 1}: ${req.method}`);
      const startTime = Date.now();
      
      try {
        const response = await axios.post(
          'http://localhost:8080/mcp/messages',
          {
            jsonrpc: '2.0',
            method: req.method,
            params: req.params,
            id: index + 2
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': sessionId,
              'X-Agent-ID': 'sse-test-agent'
            },
            responseType: 'stream',
            decompress: false
          }
        );
        
        // Read stream
        let streamData = '';
        for await (const chunk of response.data) {
          streamData += chunk.toString();
        }
        
        const elapsedTime = Date.now() - startTime;
        const events = parseSSE(streamData);
        
        console.log(`  ✅ Response in ${elapsedTime}ms`);
        console.log(`  Events: ${events.length}`);
        
        // Find result event
        const resultEvent = events.find(e => e.data?.result !== undefined);
        if (resultEvent) {
          const itemCount = resultEvent.data.result.tools?.length || 
                           resultEvent.data.result.resources?.length || 0;
          console.log(`  Items found: ${itemCount}`);
        }
      } catch (error: any) {
        console.error(`  ❌ Request failed: ${error.message}`);
      }
    }

    // 3. Test error handling
    console.log('\n3️⃣ Testing error handling...');
    
    try {
      const errorResponse = await axios.post(
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
          },
          responseType: 'stream',
          decompress: false
        }
      );
      
      // Read stream
      let errorData = '';
      for await (const chunk of errorResponse.data) {
        errorData += chunk.toString();
      }
      
      const events = parseSSE(errorData);
      const errorEvent = events.find(e => e.data?.error !== undefined);
      
      if (errorEvent) {
        console.log('  ✅ Error handled correctly');
        console.log(`  Error: ${errorEvent.data.error.message}`);
      }
    } catch (error: any) {
      console.log('  ✅ Server rejected invalid method');
    }

    // 4. Test session termination
    console.log('\n4️⃣ Testing session termination...');
    
    try {
      await axios.delete(
        'http://localhost:8080/mcp/messages',
        {
          headers: {
            'mcp-session-id': sessionId
          }
        }
      );
      console.log('  ✅ Session terminated');
    } catch (error: any) {
      console.error('  ❌ Failed to terminate session:', error.message);
    }

    // 5. Test concurrent requests
    console.log('\n5️⃣ Testing concurrent requests...');
    
    // Create new session for concurrent test
    const concurrentInit = await axios.post(
      'http://localhost:8080/mcp/messages',
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {}
        },
        id: 100
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        decompress: false
      }
    );
    
    // Read init stream
    let initData = '';
    for await (const chunk of concurrentInit.data) {
      initData += chunk.toString();
    }
    
    const concurrentSessionId = concurrentInit.headers['mcp-session-id'];
    
    const concurrentPromises = [
      axios.post('http://localhost:8080/mcp/messages', {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 101
      }, {
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': concurrentSessionId
        },
        responseType: 'stream',
        decompress: false
      }),
      axios.post('http://localhost:8080/mcp/messages', {
        jsonrpc: '2.0',
        method: 'resources/list',
        params: {},
        id: 102
      }, {
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': concurrentSessionId
        },
        responseType: 'stream',
        decompress: false
      })
    ];
    
    const startTime = Date.now();
    const results = await Promise.allSettled(concurrentPromises);
    const elapsedTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`  ✅ ${successCount}/${results.length} concurrent requests succeeded`);
    console.log(`  Total time: ${elapsedTime}ms`);

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
    await testStreamableHTTP();

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