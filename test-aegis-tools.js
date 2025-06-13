const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testAegisTools() {
  try {
    console.log('Testing AEGIS proxy...');
    
    const transport = new StdioClientTransport({
      command: '/Users/shingo/.nvm/versions/node/v20.12.2/bin/node',
      args: ['dist/src/mcp-server.js'],
      env: {
        ...process.env,
        CLAUDE_DESKTOP_CONFIG: '/Users/shingo/Develop/aegis-policy-engine/aegis-mcp-config.json',
        LOG_LEVEL: 'debug',
        AEGIS_LOG_LEVEL: 'debug'
      }
    });
    
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('Connecting...');
    await client.connect(transport);
    console.log('✅ Connected to AEGIS');
    
    console.log('\nWaiting for servers to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\nListing tools...');
    const tools = await client.listTools();
    console.log(`\nFound ${tools.tools.length} tools:`);
    
    // Group by server
    const byServer = {};
    tools.tools.forEach(tool => {
      const prefix = tool.name.split('__')[0] || 'unknown';
      if (!byServer[prefix]) byServer[prefix] = [];
      byServer[prefix].push(tool.name);
    });
    
    Object.entries(byServer).forEach(([server, serverTools]) => {
      console.log(`\n${server}: ${serverTools.length} tools`);
      serverTools.forEach(t => console.log(`  - ${t}`));
    });
    
    await client.close();
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testAegisTools();