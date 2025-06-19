/**
 * Test tool listing through AEGIS proxy
 */

import axios from 'axios';

async function testToolsList() {
  console.log('🧪 Testing tools/list through AEGIS proxy...\n');

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
          'Accept': 'text/event-stream',
          'X-Agent-ID': 'test-agent',
          'X-Agent-Type': 'test',
          'X-Agent-Metadata': JSON.stringify({
            department: 'testing',
            clearanceLevel: 'high',
            permissions: ['read', 'write', 'execute']
          })
        },
        responseType: 'text'
      }
    );

    console.log('Init response status:', initResponse.status);
    console.log('Session ID:', initResponse.headers['mcp-session-id']);
    
    const sessionId = initResponse.headers['mcp-session-id'];

    // 2. List tools
    console.log('\n2️⃣ Listing tools...');
    const startTime = Date.now();
    
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
          'mcp-session-id': sessionId,
          'X-Agent-ID': 'test-agent',
          'X-Agent-Type': 'test',
          'X-Agent-Metadata': JSON.stringify({
            department: 'testing',
            clearanceLevel: 'high',
            permissions: ['read', 'write', 'execute']
          })
        },
        responseType: 'text',
        timeout: 30000 // 30 seconds timeout
      }
    );

    const elapsedTime = Date.now() - startTime;
    console.log(`Tools list response time: ${elapsedTime}ms`);

    // Parse SSE response
    const lines = toolsResponse.data.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonData = line.substring(6);
        try {
          const parsed = JSON.parse(jsonData);
          if (parsed.result && parsed.result.tools) {
            console.log(`\n✅ Found ${parsed.result.tools.length} tools:`);
            parsed.result.tools.forEach((tool: any) => {
              console.log(`  - ${tool.name}: ${tool.description}`);
            });
          }
        } catch (e) {
          // Continue to next line
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testToolsList().catch(console.error);