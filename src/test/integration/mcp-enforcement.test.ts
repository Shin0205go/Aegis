// ============================================================================
// MCP + EnforcementSystem 統合テスト
// MCPプロキシが新しい制約・義務システムを正しく使用することを検証
// ============================================================================

import { MCPStdioPolicyProxy } from '../../mcp/stdio-proxy';
import { MCPHttpPolicyProxy } from '../../mcp/http-proxy';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { Logger } from '../../utils/logger';
import { EnforcementSystem } from '../../core/enforcement';
import type { AEGISConfig } from '../../types';
import type { 
  TestableMCPStdioPolicyProxy, 
  TestableMCPHttpPolicyProxy,
  MockExpressListen
} from '../types/test-helpers';

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
    let stdioProxy: TestableMCPStdioPolicyProxy;

    beforeEach(async () => {
      stdioProxy = new MCPStdioPolicyProxy(config, logger, judgmentEngine) as TestableMCPStdioPolicyProxy;
      // EnforcementSystemを初期化
      await stdioProxy.enforcementSystem.initialize();
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
      const result = await stdioProxy.applyConstraints(
        testData,
        ['個人情報を匿名化']
      ) as typeof testData;

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
      jest.spyOn(stdioProxy.enforcementSystem, 'executeObligations')
        .mockImplementation(async (obligations: string[]) => {
          executedObligations.push(...obligations);
        });

      // 義務実行のテスト
      await stdioProxy.executeObligations(
        ['アクセスログ記録', '30日後削除スケジュール設定'],
        { params: { name: 'test-tool' } }
      );

      // 義務が実行されたことを確認
      expect(executedObligations).toContain('アクセスログ記録');
      expect(executedObligations).toContain('30日後削除スケジュール設定');
    });

    it('should handle constraint errors gracefully', async () => {
      // エラーを発生させる
      jest.spyOn(stdioProxy.enforcementSystem, 'applyConstraints')
        .mockRejectedValue(new Error('Constraint error'));

      const testData = { test: 'data' };
      
      // エラーが発生してもデータがそのまま返されることを確認
      const result = await stdioProxy.applyConstraints(
        testData,
        ['エラーを起こす制約']
      );

      expect(result).toEqual(testData);
    });
  });

  describe('HTTP Proxy Integration', () => {
    let httpProxy: TestableMCPHttpPolicyProxy;

    beforeEach(async () => {
      httpProxy = new MCPHttpPolicyProxy(config, logger, judgmentEngine) as TestableMCPHttpPolicyProxy;
      // EnforcementSystemを初期化
      await httpProxy.enforcementSystem.initialize();
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
      const result = await httpProxy.applyConstraints(
        testData,
        ['個人情報を匿名化']
      ) as typeof testData;

      // 匿名化が適用されていることを確認
      const parsedContent = JSON.parse(result.contents[0].text);
      expect(parsedContent.name).toBe('[REDACTED]');
      expect(parsedContent.email).toMatch(/\*\*\*\*@example\.com/);
      expect(parsedContent.ssn).toBe('[REDACTED]');
    });

    it('should use EnforcementSystem for obligations', async () => {
      const executedObligations: string[] = [];
      
      // EnforcementSystemのモック
      jest.spyOn(httpProxy.enforcementSystem, 'executeObligations')
        .mockImplementation(async (obligations: string[]) => {
          executedObligations.push(...obligations);
        });

      // 義務実行のテスト
      await httpProxy.executeObligations(
        ['監査ログ記録', 'アクセス通知送信'],
        { params: { name: 'sensitive-tool' } }
      );

      // 義務が実行されたことを確認
      expect(executedObligations).toContain('監査ログ記録');
      expect(executedObligations).toContain('アクセス通知送信');
    });

    it('should initialize EnforcementSystem on start', async () => {
      const initSpy = jest.spyOn(httpProxy.enforcementSystem, 'initialize')
        .mockResolvedValue(undefined);

      // Express serverのモック
      const mockListen: MockExpressListen = (port: number, callback: () => void) => {
        callback();
        return { on: jest.fn() };
      };
      jest.spyOn(httpProxy.app, 'listen').mockImplementation(mockListen as any);

      // MCPサーバーのconnectをモック
      jest.spyOn(httpProxy.server, 'connect').mockResolvedValue(undefined);
      jest.spyOn(httpProxy.server, 'close').mockResolvedValue(undefined);

      await httpProxy.start();

      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('Legacy to New System Migration', () => {
    it('should not have legacy anonymization code in stdio proxy', async () => {
      const stdioProxy = new MCPStdioPolicyProxy(config, logger, judgmentEngine) as TestableMCPStdioPolicyProxy;
      await stdioProxy.enforcementSystem.initialize();
      
      // レガシーメソッドが存在しないことを確認
      expect(stdioProxy.anonymizeData).toBeUndefined();
      expect(stdioProxy.sendNotification).toBeUndefined();
      expect(stdioProxy.scheduleDataDeletion).toBeUndefined();
      expect(stdioProxy.generateAccessReport).toBeUndefined();
    });

    it('should not have legacy anonymization code in http proxy', async () => {
      const httpProxy = new MCPHttpPolicyProxy(config, logger, judgmentEngine) as TestableMCPHttpPolicyProxy;
      await httpProxy.enforcementSystem.initialize();
      
      // レガシーメソッドが存在しないことを確認
      expect(httpProxy.anonymizeData).toBeUndefined();
      expect(httpProxy.sendNotification).toBeUndefined();
      expect(httpProxy.scheduleDataDeletion).toBeUndefined();
      expect(httpProxy.generateAccessReport).toBeUndefined();
    });
  });
});