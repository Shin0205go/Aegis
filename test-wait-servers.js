const { spawn } = require('child_process');

// AEGISを起動して初期化ログを観察
const aegis = spawn('/Users/shingo/.nvm/versions/node/v20.12.2/bin/node', [
  'dist/src/mcp-server.js'
], {
  env: {
    ...process.env,
    LOG_LEVEL: 'info',
    AEGIS_LOG_LEVEL: 'info'
  }
});

// stderrを出力
aegis.stderr.on('data', (data) => {
  const msg = data.toString();
  process.stderr.write(msg);
  
  // 重要なメッセージを検出
  if (msg.includes('Successfully started upstream server')) {
    console.log('✅ Server started:', msg.trim());
  }
  if (msg.includes('Upstream servers ready with')) {
    console.log('🎉 READY:', msg.trim());
  }
  if (msg.includes('AEGIS MCP Proxy (stdio) started')) {
    console.log('🛡️ AEGIS STARTED');
    
    // 5秒後に停止
    setTimeout(() => {
      console.log('Stopping...');
      aegis.kill();
    }, 5000);
  }
});

// タイムアウト
setTimeout(() => {
  console.log('Timeout - stopping');
  aegis.kill();
  process.exit(1);
}, 30000);