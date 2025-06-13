const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function quickTest() {
  try {
    // Disable debug logs
    process.env.DEBUG = '';
    process.env.AEGIS_LOG_LEVEL = 'error';
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['./dist/src/mcp-server.js'],
      env: { ...process.env, DEBUG: '', AEGIS_LOG_LEVEL: 'error' }
    });
    
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('Connecting to AEGIS...');
    await client.connect(transport);
    console.log('✅ Connected');
    
    // Quick list tools
    console.log('\nListing tools...');
    const tools = await client.listTools();
    console.log(`✅ Found ${tools.tools.length} tools`);
    
    // Show first few tools
    const toolNames = tools.tools.slice(0, 10).map(t => t.name);
    console.log('\nFirst 10 tools:');
    toolNames.forEach(name => console.log(`  - ${name}`));
    
    // Test a simple tool call
    console.log('\nTesting filesystem__read_file...');
    try {
      const result = await client.callTool({
        name: 'filesystem__read_file',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine/package.json'
        }
      });
      console.log('✅ Tool call successful');
      console.log(`Read ${result.content[0].text.length} characters`);
    } catch (error) {
      console.log('❌ Tool call failed:', error.message);
    }
    
    await client.close();
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickTest();