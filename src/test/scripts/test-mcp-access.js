#!/usr/bin/env node

/**
 * MCPプロキシ経由でファイルアクセスをテスト
 */

const { AdvancedAuditSystem } = require('../../../dist/src/audit/advanced-audit-system.js');
const { AIJudgmentEngine } = require('../../../dist/src/ai/judgment-engine.js');
const { logger } = require('../../../dist/src/utils/logger.js');

console.log('🧪 MCPプロキシ経由のファイルアクセステスト...\n');

// 監査システムとAI判定エンジンを初期化
const auditSystem = new AdvancedAuditSystem();
const aiJudgment = new AIJudgmentEngine();

// テストケース
const testCases = [
  {
    name: 'README.mdへのアクセス（拒否予想）',
    context: {
      agent: 'mcp-client',
      action: 'read',
      resource: 'file:///Users/shingo/Develop/aegis-policy-engine/README.md',
      purpose: 'documentation-access',
      time: new Date(),
      environment: {
        transport: 'mcp-tool',
        toolName: 'filesystem__read_file'
      }
    }
  },
  {
    name: 'publicフォルダへのアクセス（許可予想）',
    context: {
      agent: 'mcp-client',
      action: 'read', 
      resource: 'file:///Users/shingo/Develop/aegis-policy-engine/public/audit-dashboard.html',
      purpose: 'public-file-access',
      time: new Date(),
      environment: {
        transport: 'mcp-tool',
        toolName: 'filesystem__read_file'
      }
    }
  }
];

// 各テストケースを実行
for (const testCase of testCases) {
  console.log(`📝 テスト: ${testCase.name}`);
  console.log(`   リソース: ${testCase.context.resource}`);
  
  try {
    // AI判定を実行
    const decision = await aiJudgment.makeDecision(
      testCase.context,
      'ファイルシステムアクセスポリシー'
    );
    
    console.log(`   判定: ${decision.decision}`);
    console.log(`   理由: ${decision.reason}\n`);
    
    // 監査ログに記録
    await auditSystem.recordAccess({
      ...testCase.context,
      decision,
      responseTime: 100
    });
    
  } catch (error) {
    console.error(`   エラー: ${error.message}\n`);
  }
}

// 監査データの確認
const entries = auditSystem.getAuditEntries();
console.log(`\n📊 監査エントリ数: ${entries.length}`);

// README.mdへのアクセスが記録されているか確認
const readmeAccess = entries.filter(e => e.context.resource.includes('README.md'));
console.log(`📄 README.mdへのアクセス記録: ${readmeAccess.length}件`);

if (readmeAccess.length > 0) {
  console.log('\n✅ README.mdへのアクセスが監査ログに記録されました！');
} else {
  console.log('\n❌ README.mdへのアクセスが監査ログに記録されていません');
}

console.log('\n✅ テスト完了！');