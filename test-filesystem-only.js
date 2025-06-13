const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testFilesystemOnly() {
  try {
    // 直接filesystemサーバーに接続
    console.log('Testing filesystem server directly...');
    
    const transport = new StdioClientTransport({
      command: '/Users/shingo/.nvm/versions/node/v20.12.2/bin/node',
      args: [
        '/Users/shingo/.nvm/versions/node/v20.12.2/lib/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
        '/Users/shingo/Develop'
      ]
    });
    
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log('✅ Connected to filesystem server');
    
    const tools = await client.listTools();
    console.log(`\nFound ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFilesystemOnly();