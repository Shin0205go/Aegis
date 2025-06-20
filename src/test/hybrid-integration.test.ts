/**
 * ODRL + 自然言語ハイブリッドポリシーエンジン統合テスト
 */

import { HybridPolicyEngine } from '../policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { DecisionContext, PolicyDecision } from '../types';
import { defaultPolicySet } from '../odrl/sample-policies';

// AIエンジンをモック化
jest.mock('../ai/judgment-engine');

describe('ODRL + 自然言語ハイブリッド統合テスト', () => {
  let hybridEngine: HybridPolicyEngine;
  let mockAIEngine: jest.Mocked<AIJudgmentEngine>;

  beforeEach(() => {
    mockAIEngine = {
      judge: jest.fn(),
      clearCache: jest.fn()
    } as any;

    (AIJudgmentEngine as jest.MockedClass<typeof AIJudgmentEngine>).mockImplementation(
      () => mockAIEngine
    );

    hybridEngine = new HybridPolicyEngine(mockAIEngine, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.8,
      cacheEnabled: true
    });
  });

  describe('ODRLポリシー優先判定', () => {
    it('営業時間内のアクセスをODRLで許可する', async () => {
      const context: DecisionContext = {
        agent: 'office-agent',
        action: 'resource:access',
        resource: 'file:data.json',
        time: new Date('2024-01-01T10:00:00Z'), // 営業時間内
        environment: {
          agentType: 'internal',
          timeOfDay: '10:00:00'
        }
      };

      const decision = await hybridEngine.decide(context);

      // ODRLの営業時間ポリシーで許可されるはず
      expect(decision.decision).toBe('PERMIT');
      expect(decision.metadata?.engine).toBe('ODRL');
      // AI判定は呼ばれないはず
      expect(mockAIEngine.judge).not.toHaveBeenCalled();
    });

    it('営業時間外のアクセスをODRLで拒否する', async () => {
      const context: DecisionContext = {
        agent: 'night-agent',
        action: 'resource:access',
        resource: 'file:data.json',
        time: new Date('2024-01-01T22:00:00Z'), // 営業時間外
        environment: {
          agentType: 'internal',
          timeOfDay: '22:00:00'
        }
      };

      const decision = await hybridEngine.decide(context);

      // ODRLの営業時間ポリシーで拒否されるはず
      expect(decision.decision).toBe('DENY');
      expect(decision.metadata?.engine).toBe('ODRL');
      // AI判定は呼ばれないはず
      expect(mockAIEngine.judge).not.toHaveBeenCalled();
    });
  });

  describe('AI判定フォールバック', () => {
    it('ODRLで判定できない複雑なケースでAI判定を使用する', async () => {
      const context: DecisionContext = {
        agent: 'emergency-responder',
        action: 'emergency:access',
        resource: 'critical:system-data',
        purpose: 'disaster-recovery',
        time: new Date(),
        environment: {
          agentType: 'emergency',
          emergency: true,
          location: 'disaster-site'
        }
      };

      // AI判定結果をモック
      const aiDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Emergency access during disaster recovery',
        confidence: 0.95,
        constraints: ['Limited time window'],
        obligations: ['Enhanced monitoring']
      };

      mockAIEngine.judge.mockResolvedValueOnce(aiDecision);

      const decision = await hybridEngine.decide(context, 
        '緊急時には適切な権限を持つ職員のシステムアクセスを許可する');

      // ODRLで処理できないためAI判定にフォールバック
      expect(mockAIEngine.judge).toHaveBeenCalledWith(
        context, 
        '緊急時には適切な権限を持つ職員のシステムアクセスを許可する'
      );
      expect(decision.decision).toBe('PERMIT');
      expect(decision.reason).toBe('Emergency access during disaster recovery');
      expect(decision.confidence).toBe(0.95);
    });

    it('AI判定の信頼度が低い場合は保守的に判定する', async () => {
      const context: DecisionContext = {
        agent: 'unknown-agent',
        action: 'suspicious:access',
        resource: 'sensitive:data',
        time: new Date(),
        environment: {
          agentType: 'external'
        }
      };

      // 低信頼度のAI判定結果をモック
      const lowConfidenceDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Uncertain permission',
        confidence: 0.6 // 閾値0.8より低い
      };

      mockAIEngine.judge.mockResolvedValueOnce(lowConfidenceDecision);

      const decision = await hybridEngine.decide(context, 
        'セキュリティポリシー');

      // 低信頼度のため、結合判定が実行される
      expect(decision.metadata?.engine).toBe('Hybrid');
    });
  });

  describe('ポリシー管理', () => {
    it('ODRLポリシーを動的に追加できる', () => {
      const newPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/'],
        '@type': 'Policy',
        'uid': 'test-policy',
        'permission': [{
          '@type': 'Permission',
          'action': { 'value': 'test:action' },
          'constraint': []
        }]
      };

      expect(() => {
        hybridEngine.addPolicy(newPolicy);
      }).not.toThrow();

      const policies = hybridEngine.getPolicies();
      expect(policies.some(p => p.uid === 'test-policy')).toBe(true);
    });

    it('ODRLポリシーを削除できる', () => {
      // デフォルトポリシーセットから1つ削除
      const firstPolicy = hybridEngine.getPolicies()[0];
      
      const removed = hybridEngine.removePolicy(firstPolicy.uid);
      expect(removed).toBe(true);

      const remainingPolicies = hybridEngine.getPolicies();
      expect(remainingPolicies.some(p => p.uid === firstPolicy.uid)).toBe(false);
    });
  });

  describe('パフォーマンス', () => {
    it('キャッシュが正常に動作する', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'resource:access',
        resource: 'file:cached-test.json',
        time: new Date('2024-01-01T10:00:00Z'),
        environment: {
          agentType: 'internal',
          timeOfDay: '10:00:00'
        }
      };

      // 同じコンテキストで2回判定
      const decision1 = await hybridEngine.decide(context);
      const decision2 = await hybridEngine.decide(context);

      // 結果は同じはず
      expect(decision1.decision).toBe(decision2.decision);
      expect(decision1.reason).toBe(decision2.reason);
      
      // 2回目はキャッシュから返されるため、処理時間が短いはず
      expect(decision2.metadata?.evaluationTime).toBeLessThanOrEqual(
        decision1.metadata?.evaluationTime || Infinity
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('AI判定エラー時は安全側に倒す', async () => {
      const context: DecisionContext = {
        agent: 'error-test-agent',
        action: 'complex:operation',
        resource: 'unknown:resource',
        time: new Date(),
        environment: {}
      };

      // AI判定でエラーが発生する設定
      mockAIEngine.judge.mockRejectedValueOnce(new Error('AI service unavailable'));

      const decision = await hybridEngine.decide(context, 'テストポリシー');

      // エラー時は安全側（DENY）に倒すはず
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toBe('Policy evaluation failed');
      expect(decision.metadata?.error).toBe('AI service unavailable');
    });
  });
});