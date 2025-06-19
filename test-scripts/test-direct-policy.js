#!/usr/bin/env node

// 直接ポリシーエンジンを呼び出してテストデータを生成
import { AIJudgmentEngine } from '../../../dist/src/ai/judgment-engine.js';
import { AdvancedAuditSystem } from '../../../dist/src/audit/advanced-audit-system.js';
import { Config } from '../../../dist/src/utils/config.js';
import { Logger } from '../../../dist/src/utils/logger.js';
import { SAMPLE_POLICIES } from '../../../dist/policies/sample-policies.js';

async function testDirectPolicyEngine() {
  console.log('🧪 直接ポリシーエンジンテスト...\n');

  // 設定とロガー初期化
  const config = new Config();
  const logger = new Logger('test');
  
  // AIエンジンと監査システム初期化
  const judgmentEngine = new AIJudgmentEngine(config.llm);
  const auditSystem = new AdvancedAuditSystem();

  // テストシナリオ
  const testScenarios = [
    {
      name: 'ファイル読み取り（低リスク）',
      context: {
        agent: 'test-agent',
        action: 'read',
        resource: 'file:///Users/test/readme.txt',
        purpose: 'documentation',
        time: new Date(),
        environment: { transport: 'test' }
      },
      policy: 'file-system-policy'
    },
    {
      name: '顧客データアクセス（営業時間内）',
      context: {
        agent: 'support-agent',
        action: 'read',
        resource: 'customer://database/customers/12345',
        purpose: 'customer-support',
        time: new Date(),
        environment: { transport: 'test' }
      },
      policy: 'customer-data-policy'
    },
    {
      name: 'Bashツール実行（高リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:bash',
        purpose: 'system-operation',
        time: new Date(),
        environment: { transport: 'test' }
      },
      policy: 'tool-control-policy'
    },
    {
      name: 'ファイル削除（高リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:filesystem__delete_file',
        purpose: 'file-management',
        time: new Date(),
        environment: { transport: 'test' }
      },
      policy: 'claude-desktop-policy'
    },
    {
      name: 'TodoRead（例外・常に許可）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:TodoRead',
        purpose: 'task-management',
        time: new Date(),
        environment: { transport: 'test' }
      },
      policy: 'tool-control-policy'
    },
    {
      name: '営業時間外のアクセス',
      context: {
        agent: 'test-agent',
        action: 'read',
        resource: 'customer://sensitive/financial',
        purpose: 'analysis',
        time: new Date('2025-06-18T02:00:00'), // 深夜2時
        environment: { transport: 'test' }
      },
      policy: 'after-hours-policy'
    }
  ];

  // 各シナリオを実行
  for (const scenario of testScenarios) {
    console.log(`📝 テスト: ${scenario.name}`);
    console.log(`   リソース: ${scenario.context.resource}`);
    console.log(`   ポリシー: ${scenario.policy}`);
    
    try {
      const startTime = Date.now();
      
      // ポリシーを取得
      const policyData = SAMPLE_POLICIES[scenario.policy];
      if (!policyData) {
        console.log(`   ❌ ポリシーが見つかりません: ${scenario.policy}`);
        continue;
      }
      
      // AI判定実行
      const decision = await judgmentEngine.makeDecision(
        policyData.policy,
        scenario.context,
        scenario.context.environment
      );
      
      const processingTime = Date.now() - startTime;
      
      console.log(`   判定: ${decision.decision}`);
      console.log(`   理由: ${decision.reason}`);
      console.log(`   信頼度: ${decision.confidence}`);
      console.log(`   処理時間: ${processingTime}ms`);
      
      // 監査ログに記録
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await auditSystem.recordAuditEntry(
        scenario.context,
        decision,
        scenario.policy,
        processingTime,
        outcome,
        { testScenario: scenario.name }
      );
      
    } catch (error) {
      console.log(`   ❌ エラー: ${error.message}`);
    }
    
    console.log('');
    
    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 結果を確認
  console.log('\n📊 監査統計:');
  const stats = auditSystem.getSystemStats();
  console.log(`総エントリ数: ${stats.totalEntries}`);
  
  // コンプライアンスレポート生成
  console.log('\n📋 コンプライアンスレポート生成中...');
  const report = await auditSystem.generateComplianceReport({
    start: new Date(Date.now() - 60 * 60 * 1000),
    end: new Date()
  });
  
  console.log(`\nサマリー:`);
  console.log(`  - 総リクエスト: ${report.summary.totalRequests}`);
  console.log(`  - 許可: ${report.summary.allowedRequests}`);
  console.log(`  - 拒否: ${report.summary.deniedRequests}`);
  console.log(`  - コンプライアンス率: ${report.summary.complianceRate.toFixed(1)}%`);
  
  if (report.policyBreakdowns.length > 0) {
    console.log(`\nポリシー別統計:`);
    report.policyBreakdowns.forEach(pb => {
      console.log(`  ${pb.policyName}:`);
      console.log(`    - リクエスト数: ${pb.requestCount}`);
      console.log(`    - 許可率: ${pb.allowRate.toFixed(1)}%`);
      console.log(`    - 平均処理時間: ${pb.avgProcessingTime.toFixed(0)}ms`);
    });
  }
  
  console.log('\n✅ テスト完了！');
  console.log('📍 監査ログファイルは logs/audit/ に保存されました');
  console.log('📍 ダッシュボードを更新して結果を確認してください');
}

// 実行
testDirectPolicyEngine().catch(console.error);