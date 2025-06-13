const { spawn } = require('child_process');

// AEGISプロキシを起動してテスト
const aegis = spawn('/Users/shingo/.nvm/versions/node/v20.12.2/bin/node', [
  'dist/src/mcp-server.js'
], {
  env: {
    ...process.env,
    CLAUDE_DESKTOP_CONFIG: '/Users/shingo/Develop/aegis-policy-engine/aegis-mcp-config.json',
    MCP_TRANSPORT: 'stdio',
    LOG_LEVEL: 'debug',
    AEGIS_LOG_LEVEL: 'debug'
  }
});

// stderrをログ出力
aegis.stderr.on('data', (data) => {
  console.error('[STDERR]', data.toString());
});

// stdoutを処理（MCPプロトコル用）
let buffer = '';
let contentLength = null;

aegis.stdout.on('data', (data) => {
  buffer += data.toString();
  
  while (buffer.length > 0) {
    // Content-Lengthヘッダーを探す
    if (contentLength === null) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      
      const header = buffer.substring(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (match) {
        contentLength = parseInt(match[1]);
        buffer = buffer.substring(headerEnd + 4);
      } else {
        break;
      }
    }
    
    // メッセージ本体を読む
    if (contentLength !== null && buffer.length >= contentLength) {
      const message = buffer.substring(0, contentLength);
      buffer = buffer.substring(contentLength);
      contentLength = null;
      
      try {
        const parsed = JSON.parse(message);
        console.log('[STDOUT]', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('[STDOUT ERROR]', e.message, message);
      }
    } else {
      break;
    }
  }
});

// 初期化リクエストを送信
setTimeout(() => {
  const initRequest = {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  const message = JSON.stringify(initRequest);
  const fullMessage = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
  
  console.log('Sending initialize...');
  aegis.stdin.write(fullMessage);
}, 1000);

// initializeレスポンスを待ってからinitializedを送信
let initialized = false;
aegis.stdout.on('data', function checkInit(data) {
  if (!initialized && data.toString().includes('"method":"initialize"')) {
    initialized = true;
    setTimeout(() => {
      const initializedNotif = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };
      
      const message = JSON.stringify(initializedNotif);
      const fullMessage = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
      
      console.log('Sending initialized notification...');
      aegis.stdin.write(fullMessage);
    }, 100);
  }
});

// tools/listリクエストを送信
setTimeout(() => {
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };
  
  const message = JSON.stringify(toolsRequest);
  const fullMessage = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`;
  
  console.log('Sending tools/list...');
  aegis.stdin.write(fullMessage);
}, 6000);

// 20秒後に終了
setTimeout(() => {
  console.log('Stopping test...');
  aegis.kill();
  process.exit(0);
}, 20000);