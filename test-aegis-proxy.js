const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

async function testAegisProxy() {
  console.log('🚀 Testing AEGIS Proxy MCP Server\n');
  
  try {
    // Connect to AEGIS proxy server
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['./dist/src/mcp-server.js'],
      env: process.env
    });
    
    const client = new Client({
      name: 'test-aegis-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('📡 Connecting to AEGIS proxy...');
    await client.connect(transport);
    console.log('✅ Connected to AEGIS proxy\n');
    
    // List available tools from all upstream servers
    console.log('🔧 Listing tools via AEGIS proxy:');
    const toolsResponse = await client.listTools();
    console.log(`Total tools available: ${toolsResponse.tools.length}\n`);
    
    // Group tools by server
    const toolsByServer = {};
    toolsResponse.tools.forEach(tool => {
      const serverName = tool.name.split('__')[0] || 'unknown';
      if (!toolsByServer[serverName]) {
        toolsByServer[serverName] = [];
      }
      toolsByServer[serverName].push(tool.name);
    });
    
    // Display tools by server
    Object.entries(toolsByServer).forEach(([server, tools]) => {
      console.log(`📦 ${server}: ${tools.length} tools`);
      console.log(`   ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}\n`);
    });
    
    // Test a simple tool call through AEGIS
    console.log('🧪 Testing tool call through AEGIS:');
    console.log('Calling filesystem__read_file for README.md...\n');
    
    try {
      const result = await client.callTool({
        name: 'filesystem__read_file',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine/README.md'
        }
      });
      
      console.log('✅ Tool call successful!');
      console.log(`Response type: ${result.content[0].type}`);
      console.log(`Content preview: ${result.content[0].text.substring(0, 100)}...`);
      
    } catch (error) {
      console.error('❌ Tool call failed:', error.message);
    }
    
    // Test another tool from a different server
    console.log('\n🧪 Testing execution-server tool:');
    console.log('Calling execution-server__get_server_info...\n');
    
    try {
      const result = await client.callTool({
        name: 'execution-server__get_server_info',
        arguments: {}
      });
      
      console.log('✅ Tool call successful!');
      console.log('Server info:', JSON.stringify(result.content[0], null, 2));
      
    } catch (error) {
      console.error('❌ Tool call failed:', error.message);
    }
    
    await client.close();
    console.log('\n✅ AEGIS proxy test completed!');
    
  } catch (error) {
    console.error('❌ Failed to test AEGIS proxy:', error.message);
  }
}

// Run the test
testAegisProxy().catch(console.error);