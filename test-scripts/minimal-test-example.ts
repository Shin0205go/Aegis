/**
 * 最小限のテスト実行例
 * RegressionTestClientの使い方を示すシンプルな例
 */

import { HybridPolicyEngine } from '../src/odrl/hybrid-engine';
import { Logger } from '../src/utils/logger';

async function runMinimalTest() {
  console.log('🧪 最小限の回帰テスト例\n');

  const logger = new Logger();
  const config = {
    llm: {
      provider: 'openai' as const,
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3
    }
  };

  try {
    // 1. HybridPolicyEngineの基本動作確認
    console.log('1️⃣ HybridPolicyEngineの初期化テスト...');
    const hybridEngine = new HybridPolicyEngine(config as any, logger);
    console.log('✅ 初期化成功\n');

    // 2. ODRLポリシーの追加テスト
    console.log('2️⃣ ODRLポリシー追加テスト...');
    await hybridEngine.addODRLPolicy('test-policy', {
      "@context": "http://www.w3.org/ns/odrl/2/",
      "@type": "Policy",
      "uid": "simple-test",
      "permission": [{
        "action": "read",
        "target": "test-resource"
      }]
    });
    console.log('✅ ODRLポリシー追加成功\n');

    // 3. 自然言語ポリシーの追加テスト
    console.log('3️⃣ 自然言語ポリシー追加テスト...');
    hybridEngine.addPolicy('nl-policy', 'テストリソースへの読み取りアクセスを許可');
    console.log('✅ 自然言語ポリシー追加成功\n');

    // 4. 判定テスト（モック）
    console.log('4️⃣ ポリシー判定テスト（シミュレーション）...');
    // 実際のAI呼び出しを避けるため、ここではシミュレーション
    const testContext = {
      action: 'read',
      resource: 'test-resource',
      agent: 'test-agent',
      purpose: 'testing'
    };
    console.log('テストコンテキスト:', JSON.stringify(testContext, null, 2));
    console.log('✅ 判定ロジックの準備完了\n');

    console.log('🎉 すべてのテストが成功しました！');
    console.log('\n💡 完全な回帰テストを実行するには:');
    console.log('   npx tsx test-scripts/run-regression-tests.ts');

  } catch (error) {
    console.error('❌ テスト失敗:', error);
    process.exit(1);
  }
}

// 実行
if (require.main === module) {
  runMinimalTest().catch(console.error);
}