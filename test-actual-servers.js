const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');

// Load actual MCP configuration
const config = JSON.parse(fs.readFileSync('./aegis-mcp-config.json', 'utf8'));

async function testServer(name, serverConfig) {
  console.log(`\n=== Testing ${name} ===`);
  
  try {
    // Check if the server executable exists
    if (!fs.existsSync(serverConfig.command)) {
      console.log(`❌ Command not found: ${serverConfig.command}`);
      return;
    }
    
    if (serverConfig.args && serverConfig.args.length > 0 && !fs.existsSync(serverConfig.args[0])) {
      console.log(`❌ Script not found: ${serverConfig.args[0]}`);
      return;
    }
    
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: { ...process.env, ...serverConfig.env }
    });
    
    const client = new Client({
      name: `test-client-${name}`,
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log(`✅ Connected to ${name}`);
    
    // Server info is available after connection
    if (client.serverInfo) {
      console.log(`📋 Server info: ${client.serverInfo.name} v${client.serverInfo.version}`);
    }
    
    // List tools
    try {
      const toolsResponse = await client.listTools();
      console.log(`🔧 Available tools: ${toolsResponse.tools.length}`);
      if (toolsResponse.tools.length > 0) {
        const toolNames = toolsResponse.tools.slice(0, 5).map(t => t.name);
        console.log(`   Tools: ${toolNames.join(', ')}${toolsResponse.tools.length > 5 ? '...' : ''}`);
      }
    } catch (e) {
      console.log(`🔧 Tools error: ${e.message}`);
    }
    
    // List resources
    try {
      const resourcesResponse = await client.listResources();
      console.log(`📁 Available resources: ${resourcesResponse.resources.length}`);
      if (resourcesResponse.resources.length > 0) {
        const resourceNames = resourcesResponse.resources.slice(0, 3).map(r => r.name);
        console.log(`   Resources: ${resourceNames.join(', ')}${resourcesResponse.resources.length > 3 ? '...' : ''}`);
      }
    } catch (e) {
      console.log(`📁 Resources not supported`);
    }
    
    await client.close();
    console.log(`✅ ${name} test completed`);
    
  } catch (error) {
    console.error(`❌ Failed to test ${name}: ${error.message}`);
  }
}

async function testAllServers() {
  console.log('🚀 Testing MCP Servers from aegis-mcp-config.json\n');
  
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    await testServer(name, serverConfig);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✨ All tests completed!');
}

// Run tests
testAllServers().catch(console.error);