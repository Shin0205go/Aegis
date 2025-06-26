#!/usr/bin/env node

/**
 * README.mdアクセスを監査ログに記録するテスト
 */

async function testReadmeAccess() {
  try {
    // HTTPプロキシ経由でポリシー判定をテスト
    const response = await fetch('http://localhost:8080/mcp/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'test-readme-' + Date.now(),
        method: 'tools/call',
        params: {
          name: 'filesystem__read_file',
          arguments: {
            path: '/Users/shingo/Develop/aegis-policy-engine/README.md'
          }
        }
      })
    });

    const result = await response.json();
    console.log('MCPレスポンス:', JSON.stringify(result, null, 2));

    // 監査ダッシュボードを確認
    const dashboardResponse = await fetch('http://localhost:8080/audit/dashboard');
    const dashboard = await dashboardResponse.json();
    
    console.log('\n最新のアクセスリソース:');
    dashboard.topMetrics.mostAccessedResources.forEach(resource => {
      console.log(`- ${resource.resource} (${resource.count}回, 成功率: ${resource.successRate}%)`);
    });

  } catch (error) {
    console.error('エラー:', error.message);
  }
}

// 実行
testReadmeAccess();