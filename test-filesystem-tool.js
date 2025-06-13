const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testFilesystemTool() {
  try {
    // Suppress debug logs
    process.env.AEGIS_LOG_LEVEL = 'error';
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['./dist/src/mcp-server.js'],
      env: { ...process.env, AEGIS_LOG_LEVEL: 'error' }
    });
    
    const client = new Client({
      name: 'filesystem-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('🔗 Connecting to AEGIS proxy...');
    await client.connect(transport);
    console.log('✅ Connected\n');
    
    // Test 1: List directory
    console.log('📁 Test 1: Listing directory contents');
    console.log('Directory: /Users/shingo/Develop/aegis-policy-engine\n');
    
    try {
      const listResult = await client.callTool({
        name: 'filesystem__list_directory',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine'
        }
      });
      
      const files = JSON.parse(listResult.content[0].text);
      console.log(`Found ${files.length} items:`);
      files.slice(0, 10).forEach(file => {
        console.log(`  - ${file.name}${file.isDirectory ? '/' : ''}`);
      });
      if (files.length > 10) console.log(`  ... and ${files.length - 10} more`);
      
    } catch (error) {
      console.error('❌ List directory failed:', error.message);
    }
    
    // Test 2: Read file
    console.log('\n📄 Test 2: Reading file contents');
    console.log('File: package.json\n');
    
    try {
      const readResult = await client.callTool({
        name: 'filesystem__read_file',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine/package.json'
        }
      });
      
      const content = readResult.content[0].text;
      const packageJson = JSON.parse(content);
      console.log('Package info:');
      console.log(`  Name: ${packageJson.name}`);
      console.log(`  Version: ${packageJson.version}`);
      console.log(`  Description: ${packageJson.description}`);
      console.log(`  Dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
      
    } catch (error) {
      console.error('❌ Read file failed:', error.message);
    }
    
    // Test 3: Write file
    console.log('\n✍️  Test 3: Writing test file');
    const testContent = `# Test File
Created by AEGIS filesystem test
Timestamp: ${new Date().toISOString()}`;
    
    try {
      await client.callTool({
        name: 'filesystem__write_file',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine/test-output.txt',
          content: testContent
        }
      });
      
      console.log('✅ Successfully wrote test-output.txt');
      
    } catch (error) {
      console.error('❌ Write file failed:', error.message);
    }
    
    await client.close();
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFilesystemTool();