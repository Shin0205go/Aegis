/**
 * Test MCP SSE protocol implementation
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

function parseSSEData(data: string): any[] {
  const events = [];
  const lines = data.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.substring(6);
      try {
        events.push(JSON.parse(jsonStr));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  return events;
}

async function testMCPSSEProtocol() {
  console.log('\n🧪 Testing MCP SSE protocol...\n');

  try {
    // 1. Test traditional JSON-RPC request/response
    console.log('1️⃣ Testing traditional JSON-RPC flow...');
    
    // Initialize with POST (should return SSE stream)
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
          'X-Agent-ID': 'test-agent',
          'X-Agent-Type': 'test'
        },
        responseType: 'text',
        validateStatus: () => true // Accept any status
      }
    );
    
    console.log('Response status:', initResponse.status);
    console.log('Response headers:');
    console.log('  Content-Type:', initResponse.headers['content-type']);
    console.log('  Session ID:', initResponse.headers['mcp-session-id']);
    
    if (initResponse.headers['content-type']?.includes('text/event-stream')) {
      console.log('✅ Received SSE stream response');
      
      const events = parseSSEData(initResponse.data);
      console.log(`Parsed ${events.length} events`);
      
      for (const event of events) {
        if (event.result) {
          console.log('  Result:', JSON.stringify(event.result, null, 2));
        }
        if (event.error) {
          console.log('  Error:', event.error);
        }
      }
    } else {
      console.log('❌ Expected SSE stream, got:', initResponse.headers['content-type']);
    }
    
    const sessionId = initResponse.headers['mcp-session-id'];
    
    if (sessionId) {
      // 2. Test subsequent requests with session
      console.log('\n2️⃣ Testing subsequent requests with session...');
      
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
            'X-Agent-ID': 'test-agent'
          },
          responseType: 'text',
          validateStatus: () => true
        }
      );
      
      console.log('Tools response status:', toolsResponse.status);
      
      if (toolsResponse.headers['content-type']?.includes('text/event-stream')) {
        const events = parseSSEData(toolsResponse.data);
        console.log(`Found ${events.length} events`);
        
        const result = events.find(e => e.result?.tools);
        if (result) {
          console.log(`✅ Found ${result.result.tools.length} tools`);
          console.log('First few tools:');
          result.result.tools.slice(0, 3).forEach((tool: any) => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
        }
      }
      
      // 3. Test session cleanup
      console.log('\n3️⃣ Testing session cleanup...');
      
      const deleteResponse = await axios.delete(
        'http://localhost:8080/mcp/messages',
        {
          headers: {
            'mcp-session-id': sessionId
          },
          validateStatus: () => true
        }
      );
      
      console.log('Delete response status:', deleteResponse.status);
      if (deleteResponse.status === 200 || deleteResponse.status === 204) {
        console.log('✅ Session cleaned up successfully');
      }
    }
    
    // 4. Test error cases
    console.log('\n4️⃣ Testing error cases...');
    
    const errorResponse = await axios.post(
      'http://localhost:8080/mcp/messages',
      {
        jsonrpc: '2.0',
        method: 'unknown/method',
        params: {},
        id: 99
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'text',
        validateStatus: () => true
      }
    );
    
    console.log('Error test response status:', errorResponse.status);
    if (errorResponse.headers['content-type']?.includes('text/event-stream')) {
      const events = parseSSEData(errorResponse.data);
      const errorEvent = events.find(e => e.error);
      if (errorEvent) {
        console.log('✅ Error handled correctly:', errorEvent.error.message);
      }
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
    await testMCPSSEProtocol();

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