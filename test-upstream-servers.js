const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

async function testUpstreamServer(serverName, command, args) {
  console.log(`\n=== Testing ${serverName} ===`);
  
  try {
    const transport = new StdioClientTransport({
      command,
      args: args || [],
      env: process.env
    });
    
    const client = new Client({
      name: `test-client-${serverName}`,
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log(`✅ Connected to ${serverName}`);
    
    // List available tools
    const toolsResponse = await client.listTools();
    console.log(`📦 Available tools: ${toolsResponse.tools.length}`);
    if (toolsResponse.tools.length > 0) {
      console.log(`   First few tools: ${toolsResponse.tools.slice(0, 3).map(t => t.name).join(', ')}`);
    }
    
    // List available resources if supported
    try {
      const resourcesResponse = await client.listResources();
      console.log(`📁 Available resources: ${resourcesResponse.resources.length}`);
      if (resourcesResponse.resources.length > 0) {
        console.log(`   First few resources: ${resourcesResponse.resources.slice(0, 3).map(r => r.name).join(', ')}`);
      }
    } catch (e) {
      console.log(`📁 Resources not supported or error: ${e.message}`);
    }
    
    await client.close();
    console.log(`✅ ${serverName} test completed successfully`);
    
  } catch (error) {
    console.error(`❌ Failed to test ${serverName}: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🚀 Starting upstream MCP server tests...\n');
  
  // Test each configured upstream server
  const servers = [
    {
      name: 'mcp-chatgpt-server',
      command: 'npx',
      args: ['-y', '@kagi/mcp-chatgpt-server']
    },
    {
      name: 'gemini-mcp-server',
      command: 'npx',
      args: ['-y', '@kagi/mcp-gemini-server']
    },
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/shingo']
    },
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github']
    },
    {
      name: 'execution-server',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-script-execution']
    },
    {
      name: 'claude-code',
      command: 'npx',
      args: ['-y', '@anthropics/claude-code-server']
    }
  ];
  
  for (const server of servers) {
    await testUpstreamServer(server.name, server.command, server.args);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✨ All tests completed!');
}

// Run the tests
runAllTests().catch(console.error);