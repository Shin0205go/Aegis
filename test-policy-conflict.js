// 複数ポリシー競合解決のテスト

if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// 競合するポリシーを作成
async function createConflictingPolicies() {
  const policies = [
    {
      name: "開発環境緩和ポリシー",
      policy: `
【開発環境アクセスポリシー】

基本原則：
- 開発環境では作業効率を優先し、アクセス制限は最小限とする
- 開発者の生産性を最大化することを重視

アクセス許可：
- すべての読み取り操作を許可
- 開発ディレクトリ内の書き込み操作を許可
- テストファイルの作成・削除を許可

制限事項：
- 本番環境へのアクセスは禁止
- 機密情報を含むファイルへの書き込みは警告

義務事項：
- 基本的なアクセスログの記録
`,
      metadata: {
        tags: ['development', 'permissive'],
        priority: 50, // 中優先度
        status: 'active'
      }
    },
    {
      name: "セキュリティ強化ポリシー",
      policy: `
【セキュリティ強化ポリシー】

基本原則：
- セキュリティを最優先とし、すべてのアクセスを厳格に制御
- 最小権限の原則を徹底

アクセス許可：
- 事前承認されたリソースへの読み取りのみ許可
- 営業時間内のアクセスのみ許可

制限事項：
- 書き込み・削除操作は原則禁止
- 機密ファイルへのアクセスは完全禁止
- 外部エージェントのアクセスは禁止

義務事項：
- すべてのアクセスの詳細ログ記録
- セキュリティチームへの即時通知
- 異常検知時のアラート発報
`,
      metadata: {
        tags: ['security', 'strict'],
        priority: 100, // 高優先度
        status: 'active'
      }
    },
    {
      name: "業務時間制限ポリシー",
      policy: `
【業務時間アクセスポリシー】

基本原則：
- 業務時間内（平日9-18時）のみアクセスを許可
- 時間外アクセスは緊急時のみ

アクセス許可：
- 業務時間内：通常のアクセスを許可
- 時間外：読み取りのみ、要承認

制限事項：
- 深夜（0-6時）のアクセスは原則禁止
- 週末の書き込み操作は禁止

義務事項：
- 時間外アクセスの理由記録
- 月次アクセスレポートの生成
`,
      metadata: {
        tags: ['time-based', 'business-hours'],
        priority: 75, // 中高優先度
        status: 'active'
      }
    }
  ];

  // ポリシーを作成
  for (const policy of policies) {
    try {
      const response = await fetch('http://localhost:3000/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy)
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✅ ポリシー作成成功: ${policy.name} (ID: ${result.data.id})`);
      } else {
        console.log(`❌ ポリシー作成失敗: ${policy.name}`);
      }
    } catch (error) {
      console.log(`❌ エラー: ${error.message}`);
    }
  }
}

// 競合解決のテストケース
const conflictTestCases = [
  {
    name: "読み取り操作の競合",
    request: {
      agent: "dev-agent",
      action: "read",
      resource: "/workspace/src/config.js",
      purpose: "development",
      time: new Date('2024-01-15T10:00:00'), // 月曜日10時
      environment: {
        agentType: "internal",
        clearanceLevel: "developer"
      }
    },
    expectedStrategy: "permissive",
    expectedResult: "複数のPERMIT判定があるはず"
  },
  {
    name: "書き込み操作の競合",
    request: {
      agent: "dev-agent", 
      action: "write",
      resource: "/workspace/src/test.js",
      purpose: "development",
      time: new Date('2024-01-15T10:00:00'), // 月曜日10時
      environment: {
        agentType: "internal",
        clearanceLevel: "developer"
      }
    },
    expectedStrategy: "strict",
    expectedResult: "セキュリティポリシーによるDENY"
  },
  {
    name: "時間外アクセスの競合",
    request: {
      agent: "dev-agent",
      action: "read", 
      resource: "/workspace/README.md",
      purpose: "emergency-fix",
      time: new Date('2024-01-15T22:00:00'), // 月曜日22時
      environment: {
        agentType: "internal",
        clearanceLevel: "developer"
      }
    },
    expectedStrategy: "priority",
    expectedResult: "時間制限と開発ポリシーの競合"
  },
  {
    name: "機密ファイルアクセスの競合",
    request: {
      agent: "dev-agent",
      action: "read",
      resource: "/workspace/.env",
      purpose: "configuration-check",
      time: new Date('2024-01-15T10:00:00'), // 月曜日10時
      environment: {
        agentType: "internal",
        clearanceLevel: "developer"
      }
    },
    expectedStrategy: "strict",
    expectedResult: "セキュリティポリシーによる完全禁止"
  }
];

// テスト実行
async function runConflictTests() {
  console.log("\n🔄 複数ポリシー競合解決テスト開始\n");
  
  // まず競合するポリシーを作成
  console.log("📝 競合するポリシーを作成中...\n");
  await createConflictingPolicies();
  
  console.log("\n⚔️ 競合解決テスト実行中...\n");
  
  for (const testCase of conflictTestCases) {
    console.log(`📋 テスト: ${testCase.name}`);
    console.log(`   期待される戦略: ${testCase.expectedStrategy}`);
    console.log(`   期待される結果: ${testCase.expectedResult}`);
    
    try {
      // 複数のポリシーIDでテスト実行
      const response = await fetch('http://localhost:3000/api/policies/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 注: 実際のAPIが複数ポリシーのテストをサポートしていない場合は、
          // コントローラー経由でテストする必要があります
          policyId: 'all-active', // 特別な値で全アクティブポリシーをテスト
          testRequest: testCase.request
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`   判定: ${result.data.decision}`);
        console.log(`   理由: ${result.data.reason}`);
        
        // 競合解決の詳細があれば表示
        if (result.data.conflictResolution) {
          console.log(`   競合解決:`);
          console.log(`     - 方法: ${result.data.conflictResolution.resolutionMethod}`);
          console.log(`     - 競合ポリシー: ${result.data.conflictResolution.conflictingPolicies.join(', ')}`);
        }
        
        console.log(`   適用ポリシー: ${result.data.policyUsed}`);
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

// 解決戦略のデモ
async function demonstrateResolutionStrategies() {
  console.log("\n📊 解決戦略のデモンストレーション\n");
  
  const strategies = ['priority', 'strict', 'permissive', 'consensus'];
  const testRequest = {
    agent: "test-agent",
    action: "read",
    resource: "/workspace/data.json",
    purpose: "analysis",
    time: new Date('2024-01-15T14:00:00'),
    environment: {
      agentType: "internal"
    }
  };
  
  for (const strategy of strategies) {
    console.log(`🎯 戦略: ${strategy}`);
    // 実際のAPIコールまたはシミュレーション
    console.log(`   （${strategy}戦略での判定結果をシミュレート）`);
    console.log('');
  }
}

// メイン実行
async function main() {
  await runConflictTests();
  await demonstrateResolutionStrategies();
}

main().catch(console.error);