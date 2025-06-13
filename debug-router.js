// stdioルーターのデバッグ
const { Logger } = require('./dist/src/utils/logger.js');
const { StdioRouter } = require('./dist/src/mcp/stdio-router.js');

async function debugRouter() {
  const logger = new Logger('debug');
  const router = new StdioRouter(logger);
  
  // filesystemサーバーだけを追加
  router.addServerFromConfig('filesystem', {
    command: '/Users/shingo/.nvm/versions/node/v20.12.2/bin/node',
    args: [
      '/Users/shingo/.nvm/versions/node/v20.12.2/lib/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
      '/Users/shingo/Develop'
    ]
  });
  
  console.log('Starting servers...');
  await router.startServers();
  
  console.log('Waiting for initialization...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Available servers:', router.getAvailableServers());
  
  console.log('\nRouting tools/list request...');
  try {
    const result = await router.routeRequest({
      method: 'tools/list',
      params: {},
      id: 1,
      jsonrpc: '2.0'
    });
    
    console.log('\nResult:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  
  await router.stopServers();
}

debugRouter();