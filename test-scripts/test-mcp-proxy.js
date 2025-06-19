#!/usr/bin/env node

// MCPプロキシの動作確認テスト
const { spawn } = require('child_process');
const path = require('path');

async function testMCPProxy() {
  console.log('🚀 MCPプロキシの起動テスト...\n');

  // MCPサーバーを起動
  const mcpServer = spawn('node', [
    path.join(__dirname, 'dist/src/mcp-server.js')
  ], {
    env: { ...process.env, LOG_LEVEL: 'debug' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverReady = false;
  const timeout = setTimeout(() => {
    if (!serverReady) {
      console.log('❌ サーバーが起動しませんでした');
      mcpServer.kill();
      process.exit(1);
    }
  }, 10000);

  // サーバーログを監視
  mcpServer.stderr.on('data', (data) => {
    const log = data.toString();
    process.stderr.write(log);
    
    if (log.includes('AEGIS MCP Proxy (stdio) started and accepting connections') || 
        log.includes('AEGIS MCP Proxy Server is running')) {
      serverReady = true;
      clearTimeout(timeout);
      console.log('\n✅ サーバーが正常に起動しました\n');
      
      // ポリシーが読み込まれたか確認
      if (log.includes('tool-control-policy')) {
        console.log('✅ ツール制御ポリシーが読み込まれました\n');
      }
      
      // テスト用のMCPメッセージを送信
      testMCPMessages(mcpServer);
    }
  });

  mcpServer.on('error', (error) => {
    console.error('❌ サーバーエラー:', error);
    process.exit(1);
  });
}

function testMCPMessages(mcpServer) {
  console.log('📝 MCPメッセージのテスト...\n');

  // 初期化メッセージ
  const initMessage = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {}
    }
  }) + '\n';

  console.log('→ 初期化メッセージを送信');
  mcpServer.stdin.write(initMessage);

  // ツール一覧取得
  setTimeout(() => {
    const listToolsMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }) + '\n';
    
    console.log('→ ツール一覧取得メッセージを送信');
    mcpServer.stdin.write(listToolsMessage);
  }, 500);

  // レスポンスを処理
  let buffer = '';
  mcpServer.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    lines.forEach(line => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('\n← レスポンス受信:');
          console.log(JSON.stringify(response, null, 2).substring(0, 500) + '...');
          
          if (response.id === 2 && response.result?.tools) {
            console.log(`\n✅ ${response.result.tools.length}個のツールが利用可能`);
            
            // テストツール実行をシミュレート
            setTimeout(() => {
              testToolExecution(mcpServer);
            }, 500);
          }
        } catch (e) {
          // JSONパースエラーは無視
        }
      }
    });
  });

  // 5秒後に終了
  setTimeout(() => {
    console.log('\n🏁 テスト完了');
    mcpServer.kill();
    process.exit(0);
  }, 5000);
}

function testToolExecution(mcpServer) {
  console.log('\n🔧 ツール実行テスト...\n');

  // 読み取りツールのテスト（許可されるはず）
  const readToolMessage = JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'filesystem__read_file',
      arguments: {
        path: '/tmp/test.txt'
      }
    }
  }) + '\n';

  console.log('→ ファイル読み取りツールを実行（許可されるはず）');
  mcpServer.stdin.write(readToolMessage);

  // 書き込みツールのテスト（拒否されるはず）
  setTimeout(() => {
    const writeToolMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'filesystem__write_file',
        arguments: {
          path: '/tmp/test.txt',
          content: 'test content'
        }
      }
    }) + '\n';

    console.log('→ ファイル書き込みツールを実行（拒否されるはず）');
    mcpServer.stdin.write(writeToolMessage);
  }, 500);
}

// 実行
testMCPProxy().catch(console.error);