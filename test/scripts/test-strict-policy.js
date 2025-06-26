// 厳格セキュリティポリシーのテストケース

const testCases = [
  {
    name: "ファイル読み取り（通常ファイル）",
    request: {
      agent: "mcp-client",
      action: "read",
      resource: "/workspace/README.md",
      purpose: "file-access",
      time: new Date(),
      environment: {}
    },
    expectedResult: "PERMIT with read-only"
  },
  {
    name: "ファイル書き込み（禁止）",
    request: {
      agent: "mcp-client", 
      action: "write",
      resource: "/workspace/test.txt",
      purpose: "file-write",
      time: new Date(),
      environment: {}
    },
    expectedResult: "DENY"
  },
  {
    name: "機密ファイルアクセス（.env）",
    request: {
      agent: "mcp-client",
      action: "read", 
      resource: "/workspace/.env",
      purpose: "config-access",
      time: new Date(),
      environment: {}
    },
    expectedResult: "DENY"
  },
  {
    name: "削除操作（禁止）",
    request: {
      agent: "mcp-client",
      action: "delete",
      resource: "/workspace/old-file.txt",
      purpose: "file-delete",
      time: new Date(),
      environment: {}
    },
    expectedResult: "DENY"
  }
];

// APIを使ってテスト実行
async function runTests() {
  console.log("🔒 厳格セキュリティポリシーのテスト開始\n");
  
  for (const testCase of testCases) {
    console.log(`📋 テスト: ${testCase.name}`);
    console.log(`   期待結果: ${testCase.expectedResult}`);
    
    try {
      const response = await fetch('http://localhost:3000/api/policies/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: 'strict-security-policy',
          testRequest: testCase.request
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`   実際の判定: ${result.data.decision}`);
        console.log(`   理由: ${result.data.reason}`);
        console.log(`   信頼度: ${result.data.confidence}`);
        
        // 制約・義務がある場合は表示
        if (result.data.constraints?.length > 0) {
          console.log(`   制約: ${result.data.constraints.join(', ')}`);
        }
        if (result.data.obligations?.length > 0) {
          console.log(`   義務: ${result.data.obligations.join(', ')}`);
        }
        
        // 結果の評価
        const isExpected = testCase.expectedResult.includes(result.data.decision);
        console.log(`   結果: ${isExpected ? '✅ 期待通り' : '❌ 期待と異なる'}`);
      } else {
        console.log(`   ❌ エラー: ${result.error}`);
      }
    } catch (error) {
      console.log(`   ❌ テスト実行エラー: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log("テスト完了 🏁");
}

// テスト実行
if (typeof fetch === 'undefined') {
  // Node.js環境でのfetch実装
  global.fetch = require('node-fetch');
}

runTests().catch(console.error);