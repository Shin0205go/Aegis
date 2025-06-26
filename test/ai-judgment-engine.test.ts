import { AIJudgmentEngine } from '../src/ai/judgment-engine';
import { DecisionContext, PolicyDecision } from '../src/types';
import { OpenAILLM } from '../src/ai/openai-llm';

// OpenAILLMをモック
jest.mock('../src/ai/openai-llm');

describe('AIJudgmentEngine - 機能テスト', () => {
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
        agent: 'support-agent-123',
        agentType: 'internal',
        action: 'read',
        resource: 'customer-data',
        purpose: 'customer-support',
        time: new Date('2024-01-01T10:00:00'),
        clearanceLevel: 3,
        environment: {}
      };

      // モックレスポンスを設定
      mockLLM.complete.mockResolvedValueOnce({
        decision: 'PERMIT',
        reason: '内部サポートエージェントによる営業時間内の顧客サポート目的のアクセス',
        confidence: 0.95,
        constraints: ['個人情報の匿名化', '外部共有禁止'],
        obligations: ['アクセスログ記録', '30日後削除スケジュール設定']
      });

      const decision = await engine.judge(context, policy);

      expect(decision.decision).toBe('PERMIT');
      expect(decision.confidence).toBe(0.95);
      expect(decision.constraints).toContain('個人情報の匿名化');
      expect(decision.obligations).toContain('アクセスログ記録');
    });

    it('営業時間外のアクセスは拒否される', async () => {
      const context: DecisionContext = {
        agent: 'support-agent-123',
        agentType: 'internal',
        action: 'read',
        resource: 'customer-data',
        time: new Date('2024-01-01T22:00:00'), // 22時
        environment: {}
      };

      mockLLM.complete.mockResolvedValueOnce({
        decision: 'DENY',
        reason: '営業時間外のアクセス',
        confidence: 0.9,
        constraints: [],
        obligations: []
      });

      const decision = await engine.judge(context);
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('営業時間外');
    });
  });

  describe('コンテキストベースの判定', () => {
    it('緊急時は営業時間外でもアクセスを許可', async () => {
      const context: DecisionContext = {
        agent: 'support-agent-123',
        agentType: 'internal',
        action: 'read',
        resource: 'customer-data',
        time: new Date('2024-01-01T22:00:00'),
        emergency: true,
        environment: {}
      };

      mockLLM.complete.mockResolvedValueOnce({
        decision: 'PERMIT',
        reason: '緊急時の特別アクセス許可',
        confidence: 0.85,
        constraints: ['アクセス範囲を必要最小限に限定'],
        obligations: ['緊急アクセスログ記録', '上長への通知']
      });

      const decision = await engine.judge(context);
      expect(decision.decision).toBe('PERMIT');
      expect(decision.obligations).toContain('上長への通知');
    });

    it('外部エージェントのアクセスは拒否', async () => {
      const context: DecisionContext = {
        agent: 'external-agent-456',
        agentType: 'external',
        action: 'read',
        resource: 'customer-data',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      };

      mockLLM.complete.mockResolvedValueOnce({
        decision: 'DENY',
        reason: '外部エージェントのアクセスは禁止されています',
        confidence: 0.98,
        constraints: [],
        obligations: []
      });

      const decision = await engine.judge(context);
      expect(decision.decision).toBe('DENY');
      expect(decision.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('バッチ処理', () => {
    it('複数のリクエストを効率的に処理できる', async () => {
      const contexts: DecisionContext[] = [
        {
          agent: 'agent-1',
          action: 'read',
          resource: 'resource-1',
          time: new Date(),
          environment: {}
        },
        {
          agent: 'agent-2',
          action: 'write',
          resource: 'resource-2',
          time: new Date(),
          environment: {}
        }
      ];

      mockLLM.batchComplete.mockResolvedValueOnce([
        {
          decision: 'PERMIT',
          reason: 'アクセス許可',
          confidence: 0.9,
          constraints: [],
          obligations: []
        },
        {
          decision: 'DENY',
          reason: '書き込み権限なし',
          confidence: 0.85,
          constraints: [],
          obligations: []
        }
      ]);

      const decisions = await engine.judgeBatch(contexts);
      
      expect(decisions).toHaveLength(2);
      expect(decisions[0].decision).toBe('PERMIT');
      expect(decisions[1].decision).toBe('DENY');
      expect(mockLLM.batchComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('エラーハンドリング', () => {
    it('LLMエラー時は安全側（DENY）に倒す', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      mockLLM.complete.mockRejectedValueOnce(new Error('LLM service unavailable'));

      const decision = await engine.judge(context);
      
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('エラー');
      expect(decision.confidence).toBe(0);
    });

    it('不正なレスポンス形式でも処理を継続', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      // 不正な形式のレスポンス
      mockLLM.complete.mockResolvedValueOnce({
        invalid: 'response'
      } as any);

      const decision = await engine.judge(context);
      
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('形式エラー');
    });
  });

  describe('判定信頼度の処理', () => {
    it('低信頼度の判定は理由に含める', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'ambiguous-resource',
        time: new Date(),
        environment: {}
      };

      mockLLM.complete.mockResolvedValueOnce({
        decision: 'PERMIT',
        reason: '判定が困難なケース',
        confidence: 0.4,
        constraints: [],
        obligations: []
      });

      const decision = await engine.judge(context);
      
      expect(decision.confidence).toBe(0.4);
      expect(decision.reason).toContain('信頼度: 40%');
    });
  });
});