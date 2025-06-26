// ============================================================================
// MCP + EnforcementSystem 統合テスト
// MCPプロキシが新しい制約・義務システムを正しく使用することを検証
// ============================================================================

import { MCPStdioPolicyProxy } from '../../src/mcp/stdio-proxy';
import { MCPHttpPolicyProxy } from '../../src/mcp/http-proxy';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { Logger } from '../../src/utils/logger';
import { EnforcementSystem } from '../../src/core/enforcement';
import type { AEGISConfig } from '../../src/types';

describe('MCP + EnforcementSystem Integration', () => {
  let logger: Logger;
  let judgmentEngine: AIJudgmentEngine;
  let config: AEGISConfig;

  beforeEach(() => {
    logger = new Logger();
    
    config = {
      mcpProxy: {
        port: 8080,
        upstreamServers: {}
      },
      mcp: {
        upstreamServers: []
      },
      ai: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 1000
      },
      policies: {
        defaultPolicy: 'test-policy'
      }
    };

    judgmentEngine = new AIJudgmentEngine(config, logger);
  });

  describe('Stdio Proxy Integration', () => {
    let stdioProxy: MCPStdioPolicyProxy;

    beforeEach(async () => {
      stdioProxy = new MCPStdioPolicyProxy(config, logger, judgmentEngine);
      // EnforcementSystemを初期化
      await (stdioProxy as any).enforcementSystem.initialize();
    });

    it('should use EnforcementSystem for constraints', async () => {
      // ポリシー追加
      stdioProxy.addPolicy('test-policy', `
        テストポリシー：
        - データアクセスは許可
        - 個人情報は匿名化必須
      `);

      // モックデータ
      const testData = {
        contents: [{
          text: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com',
            phone: '123-456-7890',
            data: 'Some public data'
          })
        }]
      };

      // 制約適用のテスト
      const result = await (stdioProxy as any).applyConstraints(
        testData,
        ['個人情報を匿名化']
      );

      // 匿名化が適用されていることを確認
      const parsedContent = JSON.parse(result.contents[0].text);
      expect(parsedContent.name).toBe('[REDACTED]');
      expect(parsedContent.email).toMatch(/\*\*\*\*@example\.com/);
      expect(parsedContent.phone).toBe('[REDACTED]');
      expect(parsedContent.data).toBe('Some public data'); // 公開データはそのまま
    });

    it('should use EnforcementSystem for obligations', async () => {
      const executedObligations: string[] = [];
      
      // EnforcementSystemのモック
      jest.spyOn((stdioProxy as any).enforcementSystem, 'executeObligations')
        .mockImplementation(async (obligations: string[]) => {
          executedObligations.push(...obligations);
        });

      // 義務実行のテスト
      await (stdioProxy as any).executeObligations(
        ['アクセスログ記録', '30日後削除スケジュール設定'],
        { params: { name: 'test-tool' } }
      );

      // 義務が実行されたことを確認
      expect(executedObligations).toContain('アクセスログ記録');
      expect(executedObligations).toContain('30日後削除スケジュール設定');
    });

    it('should handle constraint errors gracefully', async () => {
      // エラーを発生させる
      jest.spyOn((stdioProxy as any).enforcementSystem, 'applyConstraints')
        .mockRejectedValue(new Error('Constraint error'));

      const testData = { test: 'data' };
      
      // エラーが発生してもデータがそのまま返されることを確認
      const result = await (stdioProxy as any).applyConstraints(
        testData,
        ['エラーを起こす制約']
      );

      expect(result).toEqual(testData);
    });
  });

  describe('HTTP Proxy Integration', () => {
    let httpProxy: MCPHttpPolicyProxy;

    beforeEach(async () => {
      httpProxy = new MCPHttpPolicyProxy(config, logger, judgmentEngine);
      // EnforcementSystemを初期化
      await (httpProxy as any).enforcementSystem.initialize();
    });

    it('should use EnforcementSystem for constraints', async () => {
      // モックデータ
      const testData = {
        contents: [{
          text: JSON.stringify({
            name: 'Jane Smith',
            email: 'jane@example.com',
            ssn: '123-45-6789'
          })
        }]
      };

      // 制約適用のテスト
      const result = await (httpProxy as any).applyConstraints(
        testData,
        ['個人情報を匿名化']
      );

      // 匿名化が適用されていることを確認
      const parsedContent = JSON.parse(result.contents[0].text);
      expect(parsedContent.name).toBe('[REDACTED]');
      expect(parsedContent.email).toMatch(/\*\*\*\*@example\.com/);
      expect(parsedContent.ssn).toBe('[REDACTED]');
    });

    it('should use EnforcementSystem for obligations', async () => {
      const executedObligations: string[] = [];
      
      // EnforcementSystemのモック
      jest.spyOn((httpProxy as any).enforcementSystem, 'executeObligations')
        .mockImplementation(async (obligations: string[]) => {
          executedObligations.push(...obligations);
        });

      // 義務実行のテスト
      await (httpProxy as any).executeObligations(
        ['監査ログ記録', 'アクセス通知送信'],
        { params: { name: 'sensitive-tool' } }
      );

      // 義務が実行されたことを確認
      expect(executedObligations).toContain('監査ログ記録');
      expect(executedObligations).toContain('アクセス通知送信');
    });

    it('should initialize EnforcementSystem on start', async () => {
      const initSpy = jest.spyOn((httpProxy as any).enforcementSystem, 'initialize')
        .mockResolvedValue(undefined);

      // Express serverのモック
      jest.spyOn((httpProxy as any).app, 'listen').mockImplementation((port: number, callback: () => void) => {
        callback();
        return { on: jest.fn() } as any;
      });

      // MCPサーバーのconnectをモック
      jest.spyOn((httpProxy as any).server, 'connect').mockResolvedValue(undefined);
      jest.spyOn((httpProxy as any).server, 'close').mockResolvedValue(undefined);

      await httpProxy.start();

      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('Legacy to New System Migration', () => {
    it('should not have any legacy anonymization code in stdio proxy', async () => {
      const stdioProxy = new MCPStdioPolicyProxy(config, logger, judgmentEngine);
      await (stdioProxy as any).enforcementSystem.initialize();
      
      // レガシーメソッドが存在しないことを確認
      expect((stdioProxy as any).anonymizeData).toBeUndefined();
      expect((stdioProxy as any).sendNotification).toBeUndefined();
      expect((stdioProxy as any).scheduleDataDeletion).toBeUndefined();
      expect((stdioProxy as any).generateAccessReport).toBeUndefined();
    });

    it('should not have any legacy anonymization code in http proxy', async () => {
      const httpProxy = new MCPHttpPolicyProxy(config, logger, judgmentEngine);
      await (httpProxy as any).enforcementSystem.initialize();
      
      // レガシーメソッドが存在しないことを確認
      expect((httpProxy as any).anonymizeData).toBeUndefined();
      expect((httpProxy as any).sendNotification).toBeUndefined();
      expect((httpProxy as any).scheduleDataDeletion).toBeUndefined();
      expect((httpProxy as any).generateAccessReport).toBeUndefined();
    });
  });
});