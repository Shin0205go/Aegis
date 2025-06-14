import { AIJudgmentEngine } from '../ai/judgment-engine';
import { DecisionContext, PolicyDecision } from '../types';
import { OpenAILLM } from '../ai/openai-llm';

// OpenAILLMをモック
jest.mock('../ai/openai-llm');

describe('AIJudgmentEngine - Phase2機能テスト', () => {
  let engine: AIJudgmentEngine;
  let mockLLM: jest.Mocked<OpenAILLM>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // LLMのモックを設定
    mockLLM = {
      complete: jest.fn(),
      batchComplete: jest.fn()
    } as any;
    
    (OpenAILLM as jest.MockedClass<typeof OpenAILLM>).mockImplementation(() => mockLLM);
    
    engine = new AIJudgmentEngine({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    });
  });

  describe('自然言語ポリシー → AI判定変換', () => {
    it('顧客データアクセスポリシーを正しく判定できる', async () => {
      const policy = `
        顧客データアクセスポリシー：
        【基本原則】
        - 顧客データは顧客サポート目的でのみアクセス可能
        - アクセスは営業時間内を基本とする
        - 適切なクリアランスレベルが必要
        
        【制限事項】  
        - 外部エージェントのアクセス禁止
        - データの外部共有は一切禁止
        - 個人情報の長期保存禁止
        
        【義務】
        - 全アクセスのログ記録必須
        - データ処理後の結果通知
        - 30日後の自動削除スケジュール設定
      `;

      const context: DecisionContext = {
        agent: 'customer-support-agent',
        action: 'read',
        resource: 'customer-database',
        purpose: 'customer-support',
        time: new Date('2024-01-15T10:00:00Z'), // 営業時間内
        environment: {
          agentType: 'internal',
          clearanceLevel: 'high',
          businessHours: true
        }
      };

      const expectedDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '営業時間内の顧客サポートエージェントによる正当なアクセス',
        confidence: 0.95,
        constraints: ['個人情報の匿名化', '外部共有禁止'],
        obligations: ['アクセスログ記録', '30日後削除スケジュール設定', '処理結果通知']
      };

      mockLLM.complete.mockResolvedValueOnce(JSON.stringify(expectedDecision));

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('PERMIT');
      expect(result.constraints).toContain('個人情報の匿名化');
      expect(result.obligations).toContain('アクセスログ記録');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('営業時間外のアクセスを拒否できる', async () => {
      const policy = `
        時間制限ポリシー：
        - 営業時間（9:00-18:00）以外のアクセスは原則禁止
        - 緊急時は管理者権限で許可
      `;

      const context: DecisionContext = {
        agent: 'regular-agent',
        action: 'write',
        resource: 'sensitive-data',
        time: new Date('2024-01-15T22:00:00Z'), // 営業時間外
        environment: {
          businessHours: false,
          isEmergency: false
        }
      };

      const expectedDecision: PolicyDecision = {
        decision: 'DENY',
        reason: '営業時間外のアクセスは禁止されています',
        confidence: 0.98
      };

      mockLLM.complete.mockResolvedValueOnce(JSON.stringify(expectedDecision));

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('DENY');
      expect(result.reason).toContain('営業時間外');
    });

    it('緊急時の例外処理を正しく判定できる', async () => {
      const policy = `
        緊急時対応ポリシー：
        システム障害発生時は、通常の時間制限を解除し、
        運用チームのみデータセンター内からのアクセスを許可。
        ただし、個人情報を含む場合は役職者の事前承認必要。
      `;

      const context: DecisionContext = {
        agent: 'ops-team-member',
        action: 'emergency-access',
        resource: 'critical-system-data',
        purpose: 'disaster-recovery',
        time: new Date('2024-01-15T03:00:00Z'), // 深夜
        environment: {
          isEmergency: true,
          systemStatus: 'critical',
          accessLocation: 'datacenter',
          teamMembership: ['operations'],
          hasPersonalData: false
        }
      };

      const expectedDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'システム障害対応のための緊急アクセスを許可',
        confidence: 0.92,
        constraints: ['アクセス範囲を必要最小限に制限'],
        obligations: ['緊急対応ログの記録', '事後レポート提出']
      };

      mockLLM.complete.mockResolvedValueOnce(JSON.stringify(expectedDecision));

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('PERMIT');
      expect(result.obligations).toContain('緊急対応ログの記録');
    });
  });

  describe('バッチ処理機能', () => {
    it('複数リクエストを効率的に一括判定できる', async () => {
      const policy = 'Standard access policy';
      const contexts: DecisionContext[] = [
        {
          agent: 'agent1',
          action: 'read',
          resource: 'resource1',
          time: new Date(),
          environment: {}
        },
        {
          agent: 'agent2',
          action: 'write',
          resource: 'resource2',
          time: new Date(),
          environment: {}
        },
        {
          agent: 'agent3',
          action: 'delete',
          resource: 'resource3',
          time: new Date(),
          environment: {}
        }
      ];

      const expectedDecisions: PolicyDecision[] = [
        { decision: 'PERMIT', reason: 'Allowed', confidence: 0.95 },
        { decision: 'DENY', reason: 'Write not allowed', confidence: 0.97 },
        { decision: 'DENY', reason: 'Delete not allowed', confidence: 0.99 }
      ];

      // バッチ処理の結果をモック（実装は配列を期待）
      mockLLM.complete.mockResolvedValueOnce('```json\n' + 
        JSON.stringify(expectedDecisions) + 
        '\n```');

      const results = await engine.makeDecisionBatch(policy, contexts);

      expect(results).toHaveLength(3);
      expect(results[0].decision).toBe('PERMIT');
      expect(results[1].decision).toBe('DENY');
      expect(results[2].decision).toBe('DENY');
    });
  });

  describe('キャッシュ機能', () => {
    it('同一判定をキャッシュして高速化できる', async () => {
      const policy = 'Cache test policy';
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      const expectedDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Cached decision',
        confidence: 0.95
      };

      mockLLM.complete.mockResolvedValueOnce(JSON.stringify(expectedDecision));

      // 1回目の呼び出し
      const result1 = await engine.makeDecision(policy, context);
      expect(mockLLM.complete).toHaveBeenCalledTimes(1);

      // 2回目の呼び出し（キャッシュから取得）
      const result2 = await engine.makeDecision(policy, context);
      expect(mockLLM.complete).toHaveBeenCalledTimes(1); // 呼び出し回数は増えない

      expect(result1).toEqual(result2);
    });

    it('キャッシュクリアが正しく動作する', async () => {
      const policy = 'Clear cache test';
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      mockLLM.complete.mockResolvedValue(JSON.stringify({
        decision: 'PERMIT',
        reason: 'Test',
        confidence: 0.9
      }));

      // 1回目
      await engine.makeDecision(policy, context);
      expect(mockLLM.complete).toHaveBeenCalledTimes(1);

      // キャッシュクリア
      engine.clearCache();

      // 2回目（キャッシュクリア後なので再度LLM呼び出し）
      await engine.makeDecision(policy, context);
      expect(mockLLM.complete).toHaveBeenCalledTimes(2);
    });
  });

  describe('エラーハンドリング', () => {
    it('LLMエラー時にINDETERMINATEを返す', async () => {
      const policy = 'Error test policy';
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      mockLLM.complete.mockRejectedValueOnce(new Error('LLM API Error'));

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reason).toContain('AI判定エラー');
    });

    it('不正なJSON応答を適切に処理する', async () => {
      const policy = 'Invalid response test';
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      mockLLM.complete.mockResolvedValueOnce('Invalid JSON response');

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reason).toContain('判定処理エラー');
    });
  });

  describe('複雑なポリシー処理', () => {
    it('多層的な条件を持つポリシーを正しく処理できる', async () => {
      const policy = `
        複合アクセスポリシー：
        
        1. 基本ルール：
           - 内部エージェントのみアクセス可能
           - 営業時間内のみ
        
        2. 例外条件：
           - 管理者は24時間アクセス可能
           - 緊急時は運用チームも時間外アクセス可能
           - ただし個人情報を含む場合は役員承認必要
        
        3. 地理的制限：
           - 日本国内からのアクセスのみ許可
           - VPN経由の場合は追加認証必要
      `;

      const context: DecisionContext = {
        agent: 'admin-user',
        action: 'read',
        resource: 'sensitive-customer-data',
        time: new Date('2024-01-15T23:00:00Z'), // 深夜
        environment: {
          role: 'administrator',
          location: 'Japan',
          vpnConnected: false,
          hasPersonalData: true
        }
      };

      const expectedDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '管理者権限による24時間アクセス許可',
        confidence: 0.93,
        constraints: ['個人情報アクセスログの詳細記録'],
        obligations: ['アクセスレポートの自動生成', '上長への通知']
      };

      mockLLM.complete.mockResolvedValueOnce(JSON.stringify(expectedDecision));

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('PERMIT');
      expect(result.constraints).toContain('個人情報アクセスログの詳細記録');
      expect(result.obligations).toContain('上長への通知');
    });
  });
});