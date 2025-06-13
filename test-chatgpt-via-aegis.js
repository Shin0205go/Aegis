#!/usr/bin/env node

// AEGIS経由でmcp-chatgpt-serverをテストするスクリプト

const { spawn } = require('child_process');
const readline = require('readline');

async function testChatGPTViaAEGIS() {
  console.log('Starting test of mcp-chatgpt-server via AEGIS proxy...\n');

  // AEGISプロキシを起動（stdio mode）
  const aegis = spawn('node', ['dist/src/mcp-server.js'], {
    env: {
      ...process.env,
      LOG_LEVEL: 'debug',
      CLAUDE_DESKTOP_CONFIG: '/Users/shingo/Develop/aegis-policy-engine/aegis-mcp-config.json'
    }
  });

  // AEGISのログを表示
  aegis.stderr.on('data', (data) => {
    console.error('[AEGIS]', data.toString());
  });

  // stdin/stdoutインターフェースを作成
  const rl = readline.createInterface({
    input: aegis.stdout,
    output: process.stdout
  });

  // MCPリクエストを送信する関数
  const sendRequest = (method, params = {}) => {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };
    console.log('\n→ Sending:', JSON.stringify(request, null, 2));
    aegis.stdin.write(JSON.stringify(request) + '\n');
  };

  // レスポンスを受信
  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      console.log('\n← Response:', JSON.stringify(response, null, 2));
    } catch (e) {
      console.log('← Raw output:', line);
    }
  });

  // AEGISが起動するまで少し待機
  await new Promise(resolve => setTimeout(resolve, 3000));

  // テスト実行
  console.log('\n=== Test 1: List available tools ===');
  sendRequest('tools/list');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n=== Test 2: Call ChatGPT with "Hello, World!" ===');
  sendRequest('tools/call', {
    name: 'chat',
    arguments: {
      prompt: 'Say "Hello, World!" back to me'
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n=== Test 3: Call ChatGPT for Fibonacci function ===');
  sendRequest('tools/call', {
    name: 'chat',
    arguments: {
      prompt: 'Write a Python function to calculate Fibonacci numbers'
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n=== Test 4: Call ChatGPT to explain recursion ===');
  sendRequest('tools/call', {
    name: 'chat',
    arguments: {
      prompt: 'Explain recursion in simple terms'
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n=== Test complete ===');
  
  // プロセスを終了
  aegis.kill();
  process.exit(0);
}

// エラーハンドリング
process.on('unhandledRejection', (err) => {
  console.error('Error:', err);
  process.exit(1);
});

// 実行
testChatGPTViaAEGIS();