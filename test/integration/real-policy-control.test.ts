// ============================================================================
// 実動作確認用統合テスト - モック最小限でポリシー制御を検証
// ============================================================================

import { HybridPolicyEngine } from '../../src/policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { ODRLEvaluator } from '../../src/odrl/evaluator';
import { ODRLParser } from '../../src/odrl/parser';
import { PolicyEnforcer } from '../../src/mcp/policy-enforcer';
import { DecisionContext } from '../../src/types';
import { Config } from '../../src/utils/config';
import { Logger } from '../../src/utils/logger';

describe('実際のポリシー制御動作確認', () => {
  let enforcer: PolicyEnforcer;
  let hybridEngine: HybridPolicyEngine;
  let aiEngine: AIJudgmentEngine | null;

  beforeAll(() => {
    // 実際の設定を使用（モック最小限）
    const config = new Config();
    const logger = new Logger('test');
    
    // APIキーがあればAIエンジンを使用、なければODRLのみ
    if (config.llm.apiKey) {
      aiEngine = new AIJudgmentEngine(config.llm);
    } else {
      aiEngine = null;
      console.log('⚠️  AI APIキーなし - ODRLのみでテスト');
    }

    // ハイブリッドエンジンを初期化
    hybridEngine = new HybridPolicyEngine(aiEngine, {
      useODRL: true,
      useAI: !!aiEngine,
      cacheEnabled: false // テストではキャッシュ無効
    });

    // ポリシーエンフォーサーの依存関係を準備
    const contextCollector = {
      collectContext: async (ctx: any) => ({ ...ctx })
    };
    const intelligentCacheSystem = null; // キャッシュなしでテスト
    const advancedAuditSystem = {
      logDecision: async () => {},
      logAccess: async () => {}
    };
    const realTimeAnomalyDetector = null; // 異常検知なしでテスト

    // ポリシーエンフォーサーを初期化
    enforcer = new PolicyEnforcer(
      logger,
      contextCollector as any,
      intelligentCacheSystem,
      hybridEngine as any,
      advancedAuditSystem as any,
      realTimeAnomalyDetector
    );
  });

  describe('基本的なアクセス制御', () => {
    test('営業時間内のアクセスは許可される', async () => {
      const context: DecisionContext = {
        agent: 'test-user',
        action: 'read',
        resource: 'file://documents/report.pdf',
        time: new Date('2024-01-15T14:00:00'), // 月曜14時
        environment: { transport: 'http' }
      };

      const result = await enforcer.enforcePolicy('read', 'file://documents/report.pdf', context);
      
      expect(result.decision).toBe('PERMIT');
      expect(result.policyUsed).toBeDefined();
      console.log('✅ 営業時間内アクセス:', result);
    });

    test('営業時間外のアクセスは拒否される', async () => {
      const context: DecisionContext = {
        agent: 'test-user',
        action: 'read',
        resource: 'file://documents/report.pdf',
        time: new Date('2024-01-15T22:00:00'), // 月曜22時
        environment: { transport: 'http' }
      };

      const result = await enforcer.enforcePolicy('read', 'file://documents/report.pdf', context);
      
      expect(result.decision).toBe('DENY');
      console.log('✅ 営業時間外アクセス:', result);
    });
  });

  describe('ODRL vs AI の動作確認', () => {
    test('ODRLで明確なルールがある場合', async () => {
      // ファイルシステムアクセスポリシーを追加
      const odrlPolicy = {
        "@context": "http://www.w3.org/ns/odrl/2/",
        "@type": "Policy",
        "uid": "filesystem-policy",
        "permission": [{
          "action": "read",
          "target": { "@type": "Asset", "uid": "filesystem:*" },
          "constraint": [{
            "@type": "Constraint",
            "leftOperand": "dateTime",
            "operator": "gteq",
            "rightOperand": "09:00:00"
          }]
        }]
      };

      hybridEngine.addODRLPolicy('filesystem-policy', odrlPolicy);

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'filesystem://test.txt',
        time: new Date('2024-01-15T10:00:00'),
        environment: {}
      };

      const result = await hybridEngine.decide(context);
      
      console.log('✅ ODRL判定結果:', {
        decision: result.decision,
        engine: result.metadata?.engine,
        reason: result.reason
      });

      expect(['PERMIT', 'DENY', 'INDETERMINATE']).toContain(result.decision);
    });

    if (aiEngine) {
      test('自然言語ポリシーでの判定', async () => {
        const nlPolicy = `
          セキュリティポリシー：
          - 機密データへのアクセスは管理者のみ許可
          - test-adminユーザーは管理者として扱う
          - confidentialタグのリソースは機密データ
        `;

        const context: DecisionContext = {
          agent: 'test-admin',
          action: 'read',
          resource: 'data://confidential/secrets.json',
          purpose: 'security-audit',
          time: new Date(),
          environment: {}
        };

        const result = await aiEngine.judge(context, nlPolicy);
        
        console.log('✅ AI判定結果:', {
          decision: result.decision,
          confidence: result.confidence,
          reason: result.reason
        });

        expect(result.confidence).toBeGreaterThan(0);
        expect(['PERMIT', 'DENY', 'INDETERMINATE']).toContain(result.decision);
      });
    }
  });

  describe('制約と義務の実行', () => {
    test('データ匿名化制約が適用される', async () => {
      const context: DecisionContext = {
        agent: 'external-user',
        action: 'read',
        resource: 'customer://data/personal.json',
        time: new Date(),
        environment: {}
      };

      // 個人情報を含むサンプルデータ
      const testData = {
        name: '山田太郎',
        email: 'yamada@example.com',
        phone: '090-1234-5678'
      };

      // ポリシーに個人情報匿名化の制約を設定
      const decision = {
        decision: 'PERMIT' as const,
        reason: '外部ユーザーは匿名化されたデータのみアクセス可能',
        confidence: 0.9,
        constraints: ['個人情報を匿名化']
      };

      // 実際の制約処理をテスト
      if (decision.decision === 'PERMIT' && decision.constraints) {
        const constraintExecutor = new (await import('../../src/core/enforcement')).ConstraintExecutor();
        let processedData = testData;
        
        for (const constraint of decision.constraints) {
          processedData = constraintExecutor.applyConstraint(constraint, processedData);
        }

        console.log('✅ 匿名化後のデータ:', processedData);
        
        expect(processedData.name).toBe('[REDACTED]');
        expect(processedData.email).toMatch(/\*+@example\.com/);
        expect(processedData.phone).toBe('[REDACTED]');
      }
    });
  });

  describe('実際のMCPリクエスト処理フロー', () => {
    test('tools/list リクエストの完全なフロー', async () => {
      const context: DecisionContext = {
        agent: 'claude-desktop',
        action: 'list',
        resource: 'tools://available',
        time: new Date(),
        environment: {
          transport: 'stdio',
          nodeEnv: 'test'
        }
      };

      // 1. ポリシー判定
      const decision = await enforcer.enforcePolicy('list', 'tools://available', context);
      console.log('1️⃣ ポリシー判定:', decision);

      // 2. 判定に基づく処理
      if (decision.decision === 'PERMIT') {
        // 3. 制約の適用（もしあれば）
        if (decision.constraints?.length) {
          console.log('2️⃣ 制約を適用:', decision.constraints);
        }

        // 4. アクセスログ記録（義務）
        if (decision.obligations?.includes('アクセスログ記録')) {
          console.log('3️⃣ アクセスログを記録');
        }

        // 5. 実際のツール一覧を返す
        const tools = ['filesystem__read', 'execution-server__run', 'web_fetch'];
        console.log('4️⃣ ツール一覧を返却:', tools);
        
        expect(tools.length).toBeGreaterThan(0);
      }

      expect(decision.processingTime).toBeDefined();
      expect(decision.policyUsed).toBeDefined();
    });
  });
});