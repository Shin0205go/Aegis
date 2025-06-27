// ============================================================================
// 実際のAI APIコールテスト - モックなしで動作確認
// ============================================================================

// @ts-nocheck - テスト用のため型チェックを無効化

import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { DecisionContext } from '../../src/types';
import { Config } from '../../src/utils/config';

describe('AI判定エンジン - 実APIテスト', () => {
  let aiEngine: AIJudgmentEngine | null = null;
  const config = new Config();

  beforeAll(() => {
    // 環境変数からAPIキーを確認
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    
    console.log('=== AI API 設定状況 ===');
    console.log(`OpenAI API Key: ${hasOpenAIKey ? '✅ 設定済み' : '❌ 未設定'}`);
    console.log(`Anthropic API Key: ${hasAnthropicKey ? '✅ 設定済み' : '❌ 未設定'}`);
    console.log(`LLM Provider: ${config.llm.provider}`);
    console.log(`LLM Model: ${config.llm.model}`);
    console.log('=====================');

    if (!config.llm.apiKey) {
      console.warn('⚠️  APIキーが設定されていません。実APIテストをスキップします。');
      console.warn('実APIテストを実行するには、以下のいずれかを設定してください:');
      console.warn('- export OPENAI_API_KEY="your-api-key"');
      console.warn('- export ANTHROPIC_API_KEY="your-api-key"');
      return;
    }

    // 実際のAIエンジンを初期化（モックなし）
    aiEngine = new AIJudgmentEngine(config.llm);
  });

  describe('実際のAPIコール確認', () => {
    test('シンプルなポリシー判定 - 実際にAPIを呼び出す', async () => {
      if (!aiEngine) {
        console.log('APIキーなし - テストスキップ');
        return;
      }

      const policy = `
        テストポリシー：
        - adminユーザーは全てのリソースにアクセス可能
        - それ以外のユーザーは読み取りのみ許可
      `;

      const context: DecisionContext = {
        agent: 'admin',
        action: 'write',
        resource: 'data://important.json',
        time: new Date(),
        environment: {}
      };

      console.log('\n🚀 実際のAI APIを呼び出します...');
      const startTime = Date.now();

      try {
        // これが実際のAPIコール
        const decision = await aiEngine.makeDecision(policy, context);
        const elapsed = Date.now() - startTime;

        console.log('\n✅ API応答を受信しました:');
        console.log('- 判定結果:', decision.decision);
        console.log('- 理由:', decision.reason);
        console.log('- 信頼度:', decision.confidence);
        console.log('- 応答時間:', `${elapsed}ms`);
        console.log('- 制約:', decision.constraints || 'なし');
        console.log('- 義務:', decision.obligations || 'なし');

        // 基本的なアサーション
        expect(decision.decision).toMatch(/PERMIT|DENY|INDETERMINATE/);
        expect(decision.confidence).toBeGreaterThan(0);
        expect(decision.reason).toBeTruthy();
        expect(elapsed).toBeLessThan(10000); // 10秒以内

        // adminユーザーのwriteアクセスはおそらくPERMIT
        if (decision.decision === 'PERMIT') {
          console.log('\n✅ 期待通り: adminユーザーのwriteアクセスが許可されました');
        }

      } catch (error) {
        console.error('\n❌ APIエラー:', error);
        throw error;
      }
    });

    test('キャッシュの動作確認', async () => {
      if (!aiEngine) {
        console.log('APIキーなし - テストスキップ');
        return;
      }

      const policy = 'キャッシュテスト: 全てのアクセスを許可';
      const context: DecisionContext = {
        agent: 'cache-test',
        action: 'read',
        resource: 'cache://test',
        time: new Date(),
        environment: {}
      };

      console.log('\n🔄 キャッシュテスト開始...');

      // 1回目のAPIコール
      const start1 = Date.now();
      const decision1 = await aiEngine.makeDecision(policy, context);
      const time1 = Date.now() - start1;
      console.log(`1回目のAPIコール: ${time1}ms`);

      // 2回目の呼び出し（キャッシュから）
      const start2 = Date.now();
      const decision2 = await aiEngine.makeDecision(policy, context);
      const time2 = Date.now() - start2;
      console.log(`2回目の呼び出し（キャッシュ）: ${time2}ms`);

      // キャッシュからの取得は高速であるべき
      expect(time2).toBeLessThan(time1 * 0.1); // 10%未満の時間
      expect(decision2).toEqual(decision1); // 同じ結果

      console.log(`\n✅ キャッシュが正常に動作: ${Math.round((1 - time2/time1) * 100)}% 高速化`);
    });

    test('複雑なポリシーでの判定', async () => {
      if (!aiEngine) {
        console.log('APIキーなし - テストスキップ');
        return;
      }

      const complexPolicy = `
        高度なセキュリティポリシー：
        
        1. データ分類に基づくアクセス制御
           - 機密データ: セキュリティチームのみアクセス可能
           - 内部データ: 社員のみアクセス可能
           - 公開データ: 全員アクセス可能
        
        2. 時間ベース制限
           - 機密データは営業時間内のみアクセス可能
           - 週末は読み取りのみ許可
        
        3. 追加制約
           - 機密データアクセス時は監査ログ記録が必須
           - 外部からのアクセスは二要素認証が必要
      `;

      const context: DecisionContext = {
        agent: 'security-team-member',
        action: 'read',
        resource: 'data://confidential/report.pdf',
        purpose: 'security-audit',
        time: new Date('2024-01-15T14:00:00'), // 月曜14時
        environment: {
          ipAddress: '192.168.1.100',
          authenticated: true
        }
      };

      console.log('\n🧩 複雑なポリシーでAI判定を実行...');
      const decision = await aiEngine.makeDecision(complexPolicy, context);

      console.log('\n📋 判定結果:');
      console.log(JSON.stringify(decision, null, 2));

      // より詳細な分析
      expect(decision.decision).toBeDefined();
      expect(decision.reason).toContain('セキュリティ');
      
      if (decision.obligations?.length) {
        console.log('\n📌 AIが推奨する義務:', decision.obligations);
      }
      
      if (decision.constraints?.length) {
        console.log('🔒 AIが推奨する制約:', decision.constraints);
      }
    });
  });

  describe('APIプロバイダー別テスト', () => {
    test('現在のプロバイダー情報', () => {
      console.log('\n=== 使用中のLLMプロバイダー ===');
      console.log('Provider:', config.llm.provider);
      console.log('Model:', config.llm.model);
      console.log('Temperature:', config.llm.temperature);
      console.log('Max Tokens:', config.llm.maxTokens);
      console.log('Base URL:', config.llm.baseURL || 'デフォルト');
      console.log('================================');
    });
  });
});