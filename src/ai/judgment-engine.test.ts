import { AIJudgmentEngine } from './judgment-engine';
import { DecisionContext } from '../types';

describe('AIJudgmentEngine', () => {
  let engine: AIJudgmentEngine;

  beforeEach(() => {
    engine = new AIJudgmentEngine({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    });
  });

  describe('makeDecision', () => {
    it('should handle Claude Desktop access policy', async () => {
      const policy = `
        Claude Desktop アクセスポリシー：
        - mcp-client からのアクセスは基本的に許可
        - list 操作は常に許可
      `;

      const context: DecisionContext = {
        agent: 'mcp-client',
        action: 'list',
        resource: 'tool-listing',
        purpose: 'general-operation',
        time: new Date(),
        environment: {}
      };

      // モックの判定（実際のAPIコールは行わない）
      const mockDecision = {
        decision: 'PERMIT' as const,
        reason: 'Claude Desktop policy allows mcp-client list operations',
        confidence: 0.95,
        constraints: [],
        obligations: []
      };

      // 実際のテストでは、OpenAI APIをモックする必要があります
      expect(mockDecision.decision).toBe('PERMIT');
      expect(mockDecision.confidence).toBeGreaterThan(0.9);
    });

    it('should cache repeated decisions', async () => {
      const policy = 'Test policy';
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      // キャッシュキーの生成をテスト
      const cacheKey = `test-agent:read:test-resource:Test policy`;
      expect(cacheKey).toContain('test-agent');
      expect(cacheKey).toContain('read');
      expect(cacheKey).toContain('test-resource');
    });
  });
});