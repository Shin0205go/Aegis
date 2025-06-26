import { AEGISController } from '../src/core/controller';
import { AIJudgmentEngine } from '../src/ai/judgment-engine';
import { ContextCollector } from '../src/context/collector';
import { PolicyAdministrator } from '../src/policies/administrator';
import { DecisionContext, PolicyDecision, AEGISConfig } from '../src/types';
import { Logger } from '../src/utils/logger';

// 依存モジュールをモック
jest.mock('../ai/judgment-engine');
jest.mock('../context/collector');
jest.mock('../policies/administrator');
jest.mock('../utils/logger');
jest.mock('../context/enrichers/time-based');
jest.mock('../context/enrichers/agent-info');
jest.mock('../context/enrichers/resource-classifier');
jest.mock('../context/enrichers/security-info');

describe('AEGISController - 統合テスト', () => {
  let controller: AEGISController;
  let mockJudgmentEngine: jest.Mocked<AIJudgmentEngine>;
  let mockContextCollector: jest.Mocked<ContextCollector>;
  let mockPolicyAdministrator: jest.Mocked<PolicyAdministrator>;
  let mockLogger: jest.Mocked<Logger>;

  const testConfig: AEGISConfig = {
    llm: {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    },
    contextEnrichers: {
      timeBasedEnricher: {
        businessHours: {
          start: 9,
          end: 18,
          timezone: 'Asia/Tokyo'
        }
      }
    },
    policies: {
      maxCacheSize: 100,
      cacheExpirationHours: 24
    },
    monitoring: {
      decisionHistoryLimit: 1000
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // モックの初期化
    mockJudgmentEngine = {
      makeDecision: jest.fn(),
      clearCache: jest.fn()
    } as any;

    mockContextCollector = {
      enrichContext: jest.fn(),
      registerEnricher: jest.fn()
    } as any;

    mockPolicyAdministrator = {
      createPolicy: jest.fn(),
      updatePolicy: jest.fn(),
      deletePolicy: jest.fn(),
      getPolicy: jest.fn(),
      listPolicies: jest.fn(),
      getPolicyHistory: jest.fn(),
      exportPolicy: jest.fn(),
      importPolicy: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      decision: jest.fn()
    } as any;

    // コンストラクタのモック実装
    (AIJudgmentEngine as jest.MockedClass<typeof AIJudgmentEngine>).mockImplementation(
      () => mockJudgmentEngine
    );
    (ContextCollector as jest.MockedClass<typeof ContextCollector>).mockImplementation(
      () => mockContextCollector
    );
    (PolicyAdministrator as jest.MockedClass<typeof PolicyAdministrator>).mockImplementation(
      () => mockPolicyAdministrator
    );
    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () => mockLogger
    );

    controller = new AEGISController(testConfig, mockLogger);
  });

  describe('初期化とセットアップ', () => {
    it('正しく初期化される', () => {
      expect(AIJudgmentEngine).toHaveBeenCalledWith(testConfig.llm);
      expect(ContextCollector).toHaveBeenCalled();
      expect(mockContextCollector.registerEnricher).toHaveBeenCalledTimes(4); // 4つのエンリッチャー
      expect(mockLogger.info).toHaveBeenCalledWith('Context enrichers registered successfully');
    });

    it('デフォルトポリシーが設定される', () => {
      // setupDefaultPoliciesが呼ばれることを確認
      expect(controller['policies'].size).toBeGreaterThan(0);
    });
  });

  describe('アクセス制御フロー', () => {
    it('完全な判定フローを実行できる', async () => {
      // コンテキスト拡張の結果
      const enrichedContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'customer://data/123',
        time: new Date(),
        environment: {
          clientIP: '192.168.1.1',
          agentType: 'internal',
          businessHours: true,
          resourceSensitivity: 'high'
        }
      };

      mockContextCollector.enrichContext.mockResolvedValueOnce(enrichedContext);

      // AI判定結果
      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Internal agent during business hours',
        confidence: 0.95,
        riskLevel: 'LOW',
        constraints: ['データ匿名化'],
        obligations: ['アクセスログ記録']
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(decision);

      // アクセス制御を実行
      const result = await controller.controlAccess(
        'test-agent',
        'read',
        'customer://data/123',
        'customer-support',
        { clientIP: '192.168.1.1' }
      );

      // 期待される処理フローを確認
      expect(mockContextCollector.enrichContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'test-agent',
          action: 'read',
          resource: 'customer://data/123',
          purpose: 'customer-support'
        })
      );

      expect(mockJudgmentEngine.makeDecision).toHaveBeenCalledWith(
        expect.any(String), // ポリシー文字列
        enrichedContext,
        enrichedContext.environment
      );

      expect(result).toMatchObject({
        decision: 'PERMIT',
        reason: 'Internal agent during business hours',
        confidence: 0.95,
        riskLevel: 'LOW',
        constraints: ['データ匿名化'],
        obligations: ['アクセスログ記録'],
        processingTime: expect.any(Number),
        policyUsed: 'customer-data-policy'
      });

      expect(mockLogger.decision).toHaveBeenCalledWith(
        'test-agent',
        'PERMIT',
        'customer://data/123',
        'Internal agent during business hours'
      );
    });

    it('DENYの判定を正しく処理する', async () => {
      const enrichedContext = {
        agent: 'external-agent',
        action: 'delete',
        resource: 'customer://all-data',
        time: new Date(),
        environment: {
          agentType: 'external',
          businessHours: false
        }
      };

      mockContextCollector.enrichContext.mockResolvedValueOnce(enrichedContext);

      const denyDecision: PolicyDecision = {
        decision: 'DENY',
        reason: 'External agents cannot delete customer data',
        confidence: 0.99,
        riskLevel: 'CRITICAL'
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(denyDecision);

      const result = await controller.controlAccess(
        'external-agent',
        'delete',
        'customer://all-data'
      );

      expect(result.decision).toBe('DENY');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(mockLogger.decision).toHaveBeenCalledWith(
        'external-agent',
        'DENY',
        'customer://all-data',
        'External agents cannot delete customer data'
      );
    });
  });

  describe('ポリシー管理', () => {
    it('新しいポリシーを追加できる', async () => {
      const policyId = await controller.addPolicy(
        'test-policy',
        'テストポリシー: 全てのアクセスを許可',
        {
          description: 'Test policy for unit tests',
          tags: ['test'],
          createdBy: 'test-user'
        }
      );

      expect(policyId).toMatch(/^policy-\d+$/);
      expect(controller['policies'].has('test-policy')).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Policy added: test-policy');
    });

    it('適切なポリシーを選択する', () => {
      // customer関連リソース
      const customerPolicy = controller['selectApplicablePolicy']('customer://profile/123');
      expect(customerPolicy.name).toBe('customer-data-policy');

      // email関連リソース
      const emailPolicy = controller['selectApplicablePolicy']('gmail://inbox');
      expect(emailPolicy.name).toBe('email-access-policy');

      // file関連リソース
      const filePolicy = controller['selectApplicablePolicy']('file:///documents/report.pdf');
      expect(filePolicy.name).toBe('file-system-policy');

      // 削除操作
      const deletePolicy = controller['selectApplicablePolicy']('database://delete/all');
      expect(deletePolicy.name).toBe('critical-operations-policy');
    });
  });

  describe('エラーハンドリング', () => {
    it('コンテキスト拡張エラー時も安全に処理する', async () => {
      mockContextCollector.enrichContext.mockRejectedValueOnce(
        new Error('Context enrichment failed')
      );

      const result = await controller.controlAccess(
        'test-agent',
        'read',
        'test-resource'
      );

      expect(result.decision).toBe('DENY');
      expect(result.reason).toContain('システムエラー');
      expect(result.confidence).toBe(0.0);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.error).toBeDefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Access control error',
        expect.objectContaining({
          agentId: 'test-agent',
          error: 'Context enrichment failed'
        })
      );
    });

    it('AI判定エラー時に安全側に倒す', async () => {
      mockContextCollector.enrichContext.mockResolvedValueOnce({
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      });

      mockJudgmentEngine.makeDecision.mockRejectedValueOnce(
        new Error('AI service unavailable')
      );

      const result = await controller.controlAccess(
        'test-agent',
        'read',
        'test-resource'
      );

      expect(result.decision).toBe('DENY');
      expect(result.constraints).toContain('システム管理者による確認が必要');
      expect(result.obligations).toContain('エラー詳細の報告');
    });
  });

  describe('決定履歴管理', () => {
    it('決定履歴を記録する', async () => {
      const enrichedContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      mockContextCollector.enrichContext.mockResolvedValueOnce(enrichedContext);

      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Test permit',
        confidence: 0.9
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(decision);

      await controller.controlAccess('test-agent', 'read', 'test-resource');

      // 履歴が記録されていることを確認
      expect(controller['decisionHistory']).toHaveLength(1);
      expect(controller['decisionHistory'][0]).toMatchObject({
        timestamp: expect.any(Date),
        context: enrichedContext,
        decision: decision,
        policyUsed: expect.any(String)
      });
    });

    it('履歴の上限を守る', async () => {
      // 履歴上限を低く設定したコントローラーを作成
      const limitedConfig = {
        ...testConfig,
        monitoring: { decisionHistoryLimit: 3 }
      };
      
      const limitedController = new AEGISController(limitedConfig, mockLogger);

      // 各呼び出しで異なるagentを保持するようにモック
      mockContextCollector.enrichContext.mockImplementation(async (context) => ({
        ...context,
        environment: {
          ...context.environment,
          enrichments: {
            'time-based': { isBusinessHours: true }
          }
        }
      }));

      mockJudgmentEngine.makeDecision.mockResolvedValue({
        decision: 'PERMIT',
        reason: 'Test',
        confidence: 0.9
      });

      // 4回アクセス制御を実行
      for (let i = 0; i < 4; i++) {
        await limitedController.controlAccess(
          `agent-${i}`,
          'read',
          'test-resource'
        );
      }

      // 履歴が3件に制限されていることを確認
      expect(limitedController['decisionHistory']).toHaveLength(3);
      // 最新の3件が保持されていることを確認
      expect(limitedController['decisionHistory'][0].context.agent).toBe('agent-1');
      expect(limitedController['decisionHistory'][2].context.agent).toBe('agent-3');
    });
  });

  describe('統計情報', () => {
    it('統計情報を収集する', async () => {
      mockContextCollector.enrichContext.mockResolvedValue({
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      });

      // 複数の判定を実行
      const decisions = [
        { decision: 'PERMIT' as const, reason: 'OK', confidence: 0.95 },
        { decision: 'DENY' as const, reason: 'Forbidden', confidence: 0.98 },
        { decision: 'PERMIT' as const, reason: 'OK', confidence: 0.92 },
        { decision: 'INDETERMINATE' as const, reason: 'Unknown', confidence: 0.5 }
      ];

      for (const decision of decisions) {
        mockJudgmentEngine.makeDecision.mockResolvedValueOnce(decision);
        await controller.controlAccess('test-agent', 'read', 'test-resource');
      }

      const stats = controller.getStatistics();

      expect(stats).toMatchObject({
        totalDecisions: 4,
        permitCount: 2,
        denyCount: 1,
        indeterminateCount: 1,
        averageConfidence: expect.closeTo(0.8375, 2),
        averageProcessingTime: expect.any(Number)
      });
    });
  });

  describe('動的設定変更', () => {
    it('実行中にポリシーを追加・更新できる', async () => {
      // 初期状態のポリシー数を確認
      const initialPolicyCount = controller['policies'].size;

      // 新しいポリシーを追加
      await controller.addPolicy(
        'dynamic-policy',
        '動的ポリシー: 特定の条件下でアクセスを制御',
        { tags: ['dynamic', 'runtime'] }
      );

      expect(controller['policies'].size).toBe(initialPolicyCount + 1);

      // ポリシーを更新
      await controller.updatePolicy(
        'dynamic-policy',
        '更新された動的ポリシー: より厳格な制御'
      );

      const updatedPolicy = controller['policies'].get('dynamic-policy');
      expect(updatedPolicy?.policy).toContain('更新された動的ポリシー');
    });

    it('カスタムエンリッチャーを追加できる', () => {
      const customEnricher = {
        name: 'custom-enricher',
        enrich: async (context: DecisionContext) => ({
          customField: 'custom-value'
        })
      };

      controller.addContextEnricher(customEnricher);

      expect(mockContextCollector.registerEnricher).toHaveBeenCalledWith(
        customEnricher
      );
    });
  });

  describe('パフォーマンスとメモリ管理', () => {
    it('決定キャッシュをクリアできる', () => {
      controller.clearCache();
      
      expect(mockJudgmentEngine.clearCache).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Decision cache cleared');
    });

    it('処理時間を正確に測定する', async () => {
      mockContextCollector.enrichContext.mockImplementation(async (ctx) => {
        // 50ms の遅延をシミュレート
        await new Promise(resolve => setTimeout(resolve, 50));
        return ctx;
      });

      mockJudgmentEngine.makeDecision.mockImplementation(async () => {
        // 100ms の遅延をシミュレート
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          decision: 'PERMIT',
          reason: 'Test',
          confidence: 0.9
        };
      });

      const result = await controller.controlAccess(
        'test-agent',
        'read',
        'test-resource'
      );

      // 処理時間が適切に記録されていることを確認（余裕を持たせて150ms以上）
      expect(result.processingTime).toBeGreaterThan(150);
    });
  });
});