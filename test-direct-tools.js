// 直接MCPサーバーのツールを確認するテスト
const { spawn } = require('child_process');

async function testDirectServer(name, command, args) {
  return new Promise((resolve) => {
    console.log(`\nTesting ${name}...`);
    
    const proc = spawn(command, args, {
      stdio: 'pipe',
      env: process.env
    });
    
    let buffer = '';
    let initialized = false;
    
    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      
      if (!initialized && buffer.includes('Content-Length')) {
        initialized = true;
        
        // Send tools/list request
        const request = JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        });
        
        const message = `Content-Length: ${Buffer.byteLength(request)}\r\n\r\n${request}`;
        proc.stdin.write(message);
      }
      
      // Look for response
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.includes('"result"') && line.includes('"tools"')) {
          try {
            const match = line.match(/\{.*\}/);
            if (match) {
              const response = JSON.parse(match[0]);
              if (response.result && response.result.tools) {
                console.log(`✅ ${name}: ${response.result.tools.length} tools`);
                const toolNames = response.result.tools.slice(0, 3).map(t => t.name);
                console.log(`   Tools: ${toolNames.join(', ')}${response.result.tools.length > 3 ? '...' : ''}`);
                proc.kill();
                resolve();
                return;
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }
    });
    
    proc.on('error', (error) => {
      console.log(`❌ ${name}: ${error.message}`);
      resolve();
    });
    
    setTimeout(() => {
      proc.kill();
      console.log(`⏱️  ${name}: Timeout`);
      resolve();
    }, 5000);
  });
}

async function testAll() {
  console.log('Testing direct access to MCP servers (bypassing AEGIS):\n');
  
  // Test filesystem directly
  await testDirectServer(
    'filesystem',
    '/Users/shingo/.nvm/versions/node/v20.12.2/bin/node',
    ['/Users/shingo/.nvm/versions/node/v20.12.2/lib/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', '/Users/shingo']
  );
  
  // Test github directly
  await testDirectServer(
    'github',
    '/Users/shingo/.nvm/versions/node/v20.12.2/bin/node',
    ['/Users/shingo/.nvm/versions/node/v20.12.2/lib/node_modules/@modelcontextprotocol/server-github/dist/index.js']
  );
  
  console.log('\n\nNow testing through AEGIS proxy:\n');
  
  await testDirectServer(
    'AEGIS proxy',
    'node',
    ['./dist/src/mcp-server.js']
  );
  
  console.log('\nDone!');
}

testAll();