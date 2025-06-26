#!/usr/bin/env node

// 実際のポリシー判定と監査記録をテストするスクリプト
const http = require('http');

async function makeJsonRequest(path, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: body
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function simulateMCPRequests() {
  console.log('🧪 実際のポリシー判定テストを開始...\n');

  // 様々なシナリオをテスト
  const testScenarios = [
    {
      name: 'ファイル読み取り（許可されるべき）',
      request: {
        jsonrpc: '2.0',
        method: 'resources/read',
        params: {
          uri: 'file:///Users/test/documents/readme.txt'
        },
        id: 1
      }
    },
    {
      name: '顧客データアクセス（時間内なら許可）',
      request: {
        jsonrpc: '2.0',
        method: 'resources/read',
        params: {
          uri: 'customer://database/customers/12345',
          purpose: 'customer-support'
        },
        id: 2
      }
    },
    {
      name: '高リスクツール実行（拒否されるべき）',
      request: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'bash',
          arguments: {
            command: 'rm -rf /important/data'
          }
        },
        id: 3
      }
    },
    {
      name: 'ファイル削除操作（高リスク）',
      request: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'filesystem__delete_file',
          arguments: {
            path: '/Users/test/important.doc'
          }
        },
        id: 4
      }
    },
    {
      name: 'メールアクセス（条件付き許可）',
      request: {
        jsonrpc: '2.0',
        method: 'resources/read',
        params: {
          uri: 'gmail://inbox/message/abc123'
        },
        id: 5
      }
    },
    {
      name: 'TodoRead（常に許可）',
      request: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'TodoRead'
        },
        id: 6
      }
    }
  ];

  // 各シナリオを実行
  for (const scenario of testScenarios) {
    console.log(`📝 テスト: ${scenario.name}`);
    
    try {
      // MCP形式のリクエストを送信
      const response = await makeJsonRequest('/mcp/messages', 'POST', scenario.request);
      
      console.log(`   ステータス: ${response.statusCode}`);
      
      if (response.body) {
        // レスポンスの内容を確認
        if (response.body.error) {
          console.log(`   結果: ❌ エラー - ${response.body.error.message || response.body.error}`);
        } else if (response.body.result) {
          console.log(`   結果: ✅ 成功`);
        } else {
          console.log(`   結果: ❓ 不明なレスポンス`);
        }
      }
    } catch (error) {
      console.log(`   結果: ❌ リクエストエラー - ${error.message}`);
    }
    
    console.log('');
    
    // 少し待機（レート制限を避けるため）
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 監査ログが記録されたか確認
  console.log('\n📊 監査統計を確認中...');
  
  const statsResponse = await makeJsonRequest('/audit/stats', 'GET');
  console.log('監査エントリ数:', statsResponse.body.totalEntries);
  
  // ダッシュボードメトリクスを確認
  console.log('\n📈 ダッシュボードメトリクスを確認中...');
  
  const dashboardResponse = await makeJsonRequest('/audit/dashboard', 'GET');
  const metrics = dashboardResponse.body;
  
  if (metrics && metrics.realtime) {
    console.log('リアルタイムメトリクス:');
    console.log(`  - リクエスト/分: ${metrics.realtime.requestsPerMinute}`);
    console.log(`  - アクティブエージェント: ${metrics.realtime.activeAgents}`);
    console.log(`  - リスクレベル: ${metrics.realtime.currentRiskLevel}`);
  }
  
  if (metrics && metrics.topMetrics) {
    console.log('\nトップアクセスリソース:');
    metrics.topMetrics.mostAccessedResources.slice(0, 3).forEach(resource => {
      console.log(`  - ${resource.resource}: ${resource.count}回`);
    });
    
    console.log('\n拒否理由トップ:');
    metrics.topMetrics.topDenialReasons.slice(0, 3).forEach(reason => {
      console.log(`  - ${reason.reason}: ${reason.count}回`);
    });
  }
  
  // コンプライアンスレポートも確認
  console.log('\n📋 コンプライアンスレポートを確認中...');
  
  const complianceResponse = await makeJsonRequest('/audit/reports/compliance?hours=1', 'GET');
  const report = complianceResponse.body;
  
  if (report && report.summary) {
    console.log('コンプライアンスサマリー:');
    console.log(`  - 総リクエスト: ${report.summary.totalRequests}`);
    console.log(`  - 許可: ${report.summary.allowedRequests}`);
    console.log(`  - 拒否: ${report.summary.deniedRequests}`);
    console.log(`  - エラー: ${report.summary.errorRequests}`);
    console.log(`  - コンプライアンス率: ${report.summary.complianceRate.toFixed(1)}%`);
  }
  
  console.log('\n✅ テスト完了！');
  console.log('📍 ダッシュボードで結果を確認: http://localhost:8080/public/audit-dashboard.html');
}

// 実行
simulateMCPRequests().catch(console.error);