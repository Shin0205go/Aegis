#!/usr/bin/env node

// 現在時刻でポリシーテストを実行
import { AIJudgmentEngine } from '../../../dist/src/ai/judgment-engine.js';
import { AdvancedAuditSystem } from '../../../dist/src/audit/advanced-audit-system.js';
import { Config } from '../../../dist/src/utils/config.js';
import { Logger } from '../../../dist/src/utils/logger.js';
import { SAMPLE_POLICIES } from '../../../dist/policies/sample-policies.js';

async function testCurrentTimePolicy() {
  console.log('🧪 現在時刻でポリシーテスト...\n');

  const config = new Config();
  const logger = new Logger('test');
  const judgmentEngine = new AIJudgmentEngine(config.llm);
  const auditSystem = new AdvancedAuditSystem();

  // 現在時刻でテストシナリオを作成
  const now = new Date();
  const testScenarios = [
    {
      name: 'ファイル読み取り（許可）',
      context: {
        agent: 'test-agent',
        action: 'read',
        resource: 'file:///public/readme.txt',
        purpose: 'documentation',
        time: now,
        environment: { transport: 'test', isPublicFile: true }
      },
      policy: 'file-system-policy'
    },
    {
      name: 'ファイル削除（拒否）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:filesystem__delete_file',
        purpose: 'file-management',
        time: now,
        environment: { transport: 'test' }
      },
      policy: 'claude-desktop-policy'
    },
    {
      name: 'Bashツール（拒否）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:bash',
        purpose: 'command-execution',
        time: now,
        environment: { transport: 'test' }
      },
      policy: 'claude-desktop-policy'
    },
    {
      name: 'TodoRead（許可）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:TodoRead',
        purpose: 'task-management',
        time: now,
        environment: { transport: 'test' }
      },
      policy: 'tool-control-policy'
    },
    {
      name: '顧客データアクセス（条件付き）',
      context: {
        agent: 'support-agent',
        action: 'read',
        resource: 'customer://database/customers/54321',
        purpose: 'customer-support',
        time: now,
        environment: { 
          transport: 'test',
          agent_type: 'internal',
          agent_department: 'customer_support',
          clearance_level: 3
        }
      },
      policy: 'customer-data-policy'
    }
  ];

  // 各シナリオを実行
  for (const scenario of testScenarios) {
    console.log(`📝 テスト: ${scenario.name}`);
    console.log(`   時刻: ${scenario.context.time.toLocaleTimeString('ja-JP')}`);
    
    try {
      const startTime = Date.now();
      const policyData = SAMPLE_POLICIES[scenario.policy];
      
      if (!policyData) {
        console.log(`   ❌ ポリシーが見つかりません: ${scenario.policy}`);
        continue;
      }
      
      const decision = await judgmentEngine.makeDecision(
        policyData.policy,
        scenario.context,
        scenario.context.environment
      );
      
      const processingTime = Date.now() - startTime;
      
      console.log(`   判定: ${decision.decision}`);
      console.log(`   理由: ${decision.reason.substring(0, 100)}...`);
      
      // 監査ログに記録
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await auditSystem.recordAuditEntry(
        scenario.context,
        decision,
        scenario.policy,
        processingTime,
        outcome,
        { testScenario: scenario.name, timestamp: now.toISOString() }
      );
      
    } catch (error) {
      console.log(`   ❌ エラー: ${error.message}`);
    }
    
    console.log('');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 統計を確認
  const stats = auditSystem.getSystemStats();
  console.log(`\n📊 新規エントリ数: ${testScenarios.length}`);
  console.log(`📊 総エントリ数: ${stats.totalEntries}`);
  console.log('\n✅ テスト完了！');
  console.log('📍 ダッシュボードを更新して、グラフに拒否・エラーが表示されることを確認してください');
}

// 実行
testCurrentTimePolicy().catch(console.error);