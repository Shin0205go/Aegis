#!/usr/bin/env node

// AEGIS統合テスト - MCPプロキシ経由でのアクセス制御をテスト

const { exec } = require('child_process');
const path = require('path');

console.log('🧪 AEGIS統合テスト開始...\n');

// テスト1: tools/list リクエスト（許可されるべき）
console.log('📍 Test 1: tools/list リクエスト');
const test1 = {
  jsonrpc: '2.0',
  method: 'tools/list',
  params: {},
  id: 1
};

// テスト2: resources/list リクエスト（許可されるべき）
console.log('📍 Test 2: resources/list リクエスト');
const test2 = {
  jsonrpc: '2.0',
  method: 'resources/list',
  params: {},
  id: 2
};

// テスト3: tools/call リクエスト - ファイルシステムアクセス（制限あり）
console.log('📍 Test 3: tools/call - ファイルシステムアクセス');
const test3 = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'list_files',
    arguments: {
      path: '/Users/shingo/Develop/aegis-policy-engine'
    }
  },
  id: 3
};

// テスト4: 危険な操作（拒否されるべき）
console.log('📍 Test 4: 危険な操作 - システムファイルアクセス');
const test4 = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'read_file',
    arguments: {
      path: '/etc/passwd'
    }
  },
  id: 4
};

// 各テストを実行
async function runTest(testCase, description) {
  return new Promise((resolve) => {
    const input = JSON.stringify(testCase) + '\n';
    const cmd = `echo '${input}' | node dist/src/mcp-server.js --stdio`;
    
    exec(cmd, { cwd: path.resolve(__dirname) }, (error, stdout, stderr) => {
      console.log(`\n${description}:`);
      
      if (error) {
        console.log('❌ エラー:', error.message);
      } else {
        try {
          // stdoutからJSON応答を探す
          const lines = stdout.split('\n');
          let response = null;
          
          for (const line of lines) {
            if (line.trim().startsWith('{') && line.includes('jsonrpc')) {
              response = JSON.parse(line);
              break;
            }
          }
          
          if (response) {
            if (response.error) {
              console.log('⚠️  エラー応答:', response.error.message);
            } else if (response.result) {
              console.log('✅ 成功:', JSON.stringify(response.result).substring(0, 100) + '...');
            }
          } else {
            console.log('❓ 応答なし');
          }
        } catch (e) {
          console.log('❌ パースエラー:', e.message);
          console.log('stdout:', stdout);
        }
      }
      
      if (stderr) {
        console.log('ログ:', stderr.split('\n').filter(l => l.includes('[AI Judgment]')).join('\n'));
      }
      
      resolve();
    });
  });
}

// 全テストを実行
async function runAllTests() {
  await runTest(test1, 'Tools リスト取得');
  await runTest(test2, 'Resources リスト取得');
  await runTest(test3, 'ファイルアクセス（許可）');
  await runTest(test4, 'システムファイルアクセス（拒否）');
  
  console.log('\n🎉 統合テスト完了！');
}

runAllTests().catch(console.error);