#!/usr/bin/env node

// MCPツール制御ポリシーのテスト
const { AIJudgmentEngine } = require('../../../dist/src/ai/judgment-engine.js');
const { TOOL_CONTROL_POLICY } = require('../../../dist/policies/tool-control-policy.js');

async function testToolControl() {
  console.log('🧪 MCPツール制御ポリシーのテスト開始...\n');

  // AI判定エンジンの初期化（モック設定）
  const judgmentEngine = new AIJudgmentEngine({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    apiKey: process.env.OPENAI_API_KEY || 'test-key'
  });

  // テストケース
  const testCases = [
    {
      name: 'Bash実行（高リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:bash',
        time: new Date(),
        environment: {}
      },
      expected: 'DENY or strict control'
    },
    {
      name: 'ファイル読み取り（低リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:filesystem__read_file',
        time: new Date(),
        environment: {}
      },
      expected: 'PERMIT with minimal control'
    },
    {
      name: 'ファイル書き込み（中リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:filesystem__write_file',
        time: new Date(),
        environment: {}
      },
      expected: 'PERMIT with standard control'
    },
    {
      name: 'Todo読み取り（例外）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:TodoRead',
        time: new Date(),
        environment: {}
      },
      expected: 'PERMIT (exception)'
    },
    {
      name: 'Agent実行（高リスク）',
      context: {
        agent: 'mcp-client',
        action: 'execute',
        resource: 'tool:Agent',
        time: new Date(),
        environment: {}
      },
      expected: 'DENY or strict control'
    }
  ];

  // ポリシーの内容を確認
  console.log('📋 適用ポリシー:');
  console.log(TOOL_CONTROL_POLICY.policy.substring(0, 200) + '...\n');

  // 各テストケースを実行
  for (const testCase of testCases) {
    console.log(`\n🔍 テスト: ${testCase.name}`);
    console.log(`   リソース: ${testCase.context.resource}`);
    console.log(`   期待結果: ${testCase.expected}`);
    
    try {
      // 実際のAI判定をシミュレート（APIキーがない場合はスキップ）
      if (process.env.OPENAI_API_KEY) {
        const decision = await judgmentEngine.makeDecision(
          TOOL_CONTROL_POLICY.policy,
          testCase.context
        );
        
        console.log(`   判定結果: ${decision.decision}`);
        console.log(`   理由: ${decision.reason.substring(0, 100)}...`);
        console.log(`   信頼度: ${decision.confidence}`);
        
        if (decision.constraints && decision.constraints.length > 0) {
          console.log(`   制約: ${decision.constraints.join(', ')}`);
        }
        if (decision.obligations && decision.obligations.length > 0) {
          console.log(`   義務: ${decision.obligations.join(', ')}`);
        }
      } else {
        console.log('   ⚠️  APIキーが設定されていないため、シミュレーション判定');
        
        // 簡易的なパターンマッチング判定
        const toolName = testCase.context.resource.toLowerCase();
        if (toolName.includes('bash') || toolName.includes('agent')) {
          console.log('   判定結果: DENY (高リスクツール)');
        } else if (toolName.includes('todo')) {
          console.log('   判定結果: PERMIT (例外ツール)');
        } else if (toolName.includes('read')) {
          console.log('   判定結果: PERMIT (低リスクツール)');
        } else if (toolName.includes('write')) {
          console.log('   判定結果: PERMIT with constraints (中リスクツール)');
        } else {
          console.log('   判定結果: PERMIT (デフォルト)');
        }
      }
    } catch (error) {
      console.log(`   ❌ エラー: ${error.message}`);
    }
  }

  console.log('\n\n✅ テスト完了');
}

// 実行
testToolControl().catch(console.error);