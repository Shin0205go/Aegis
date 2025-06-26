import { MCPHttpPolicyProxy } from '../mcp/http-proxy';
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { PolicyDecision, AEGISConfig } from '../types';
import { Logger } from '../utils/logger';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

// 依存モジュールをモック
jest.mock('../ai/judgment-engine');
jest.mock('../context/collector');
jest.mock('../utils/logger');
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('express');

// fetch のモック
global.fetch = jest.fn();

describe('MCPHttpPolicyProxy - 機能テスト', () => {
  let proxy: MCPHttpPolicyProxy;
  let mockJudgmentEngine: jest.Mocked<AIJudgmentEngine>;
  let mockLogger: jest.Mocked<Logger>;
  let mockServer: jest.Mocked<Server>;
  let mockApp: jest.Mocked<express.Application>;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let globalHandlerIndex: number;

  const testConfig: AEGISConfig = {
    nodeEnv: 'test',
    port: 3456,
    logLevel: 'info',
    llm: {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3
    },
    cache: {
      ttl: 3600,
      maxSize: 1000
    },
    mcpProxy: {
      port: 3456,
      upstreamServers: {
        'test-server': 'http://upstream-server:8080'
      }
    },
    monitoring: {
      enabled: false
    },
    defaultPolicyStrictness: 'medium',
    policyValidationEnabled: true,
    secretKey: 'test-secret'
  } as AEGISConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    globalHandlerIndex = 0;  // グローバルインデックスをリセット

    // モックの初期化
    mockJudgmentEngine = {
      makeDecision: jest.fn(),
      clearCache: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      decision: jest.fn()
    } as any;

    const handlers = new Map<string, Function>();
    mockServer = {
      setRequestHandler: jest.fn((schema: any, handler: Function) => {
        // setRequestHandlerが呼ばれた順番でハンドラーを保存
        // MCPHttpPolicyProxyの実装順序に基づいてキーを設定
        const keys = ['ReadResourceRequest', 'ListResourcesRequest', 'CallToolRequest', 'ListToolsRequest'];
        const key = keys[globalHandlerIndex] || 'unknown';
        globalHandlerIndex++;
        
        handlers.set(key, handler);
      }),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      _handlers: handlers
    } as any;

    mockApp = {
      use: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      listen: jest.fn((port, callback) => {
        // 非同期でコールバックを呼ぶ
        if (callback) {
          process.nextTick(callback);
        }
        const mockHttpServer = { 
          close: jest.fn((cb) => cb?.()),
          on: jest.fn()
        };
        return mockHttpServer;
      })
    } as any;

    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

    // コンストラクタのモック実装
    (AIJudgmentEngine as jest.MockedClass<typeof AIJudgmentEngine>).mockImplementation(
      () => mockJudgmentEngine
    );
    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () => mockLogger
    );
    (Server as jest.MockedClass<typeof Server>).mockImplementation(
      () => mockServer
    );
    (express as unknown as jest.Mock).mockReturnValue(mockApp);

    proxy = new MCPHttpPolicyProxy(testConfig, mockLogger, mockJudgmentEngine);
  });

  describe('初期化とセットアップ', () => {
    it('ExpressアプリとMCPサーバーが正しく設定される', () => {
      expect(express).toHaveBeenCalled();
      expect(Server).toHaveBeenCalledWith(
        {
          name: 'aegis-policy-proxy-http',
          version: '1.0.0'
        },
        {
          capabilities: {
            resources: {},
            tools: {}
          }
        }
      );

      // CORSミドルウェアが設定されることを確認
      expect(mockApp.use).toHaveBeenCalled();
    });

    it('上流サーバーが登録される', async () => {
      await proxy.start();

      expect(proxy['upstreamServers'].has('test-server')).toBe(true);
      expect(proxy['upstreamServers'].get('test-server')).toEqual({
        name: 'test-server',
        url: 'http://upstream-server:8080'
      });
    });
  });

  describe('HTTPリクエストハンドリング', () => {
    it('resources/read リクエストでポリシー判定を実行する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'HTTPアクセス許可',
        confidence: 0.96
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);

      // 上流サーバーのレスポンスをモック
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contents: [{ uri: 'test://resource', text: 'Resource content via HTTP' }]
        })
      } as Response);

      // ReadResourceRequestのハンドラーを取得
      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');
      
      expect(readResourceHandler).toBeDefined();

      const request = {
        params: { uri: 'test://resource' }
      };

      const result = await readResourceHandler(request);

      expect(mockJudgmentEngine.makeDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'read',
          resource: 'test://resource'
        }),
        expect.any(Object)
      );

      expect(result).toMatchObject({
        contents: expect.any(Array)
      });
    });

    it('tools/call リクエストで制約を適用する', async () => {
      const permitWithConstraints: PolicyDecision = {
        decision: 'PERMIT',
        reason: '条件付きツール実行許可',
        confidence: 0.92,
        constraints: ['実行時間制限: 10秒'],
        obligations: ['実行ログ記録']
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitWithConstraints);

      // 上流サーバーのレスポンスをモック（実行時間超過）
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            output: 'Tool execution result',
            executionTime: 15000,
            memoryUsed: '256MB'
          }
        })
      } as Response);

      await proxy.start();
      const callToolHandler = mockServer._handlers.get('CallToolRequest');

      const request = {
        params: {
          name: 'compute-intensive-tool',
          arguments: { input: 'large-dataset' }
        }
      };

      const result = await callToolHandler(request);

      // 実行時間制限により結果が加工されることを期待
      expect(result.result).toMatchObject({
        executionTime: 10000,
        warning: expect.stringContaining('実行時間制限')
      });
    });

    it('DENYの判定時にエラーを返す', async () => {
      const denyDecision: PolicyDecision = {
        decision: 'DENY',
        reason: 'HTTPアクセスポリシー違反: 認証されていないクライアント',
        confidence: 0.99
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(denyDecision);

      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');

      const request = {
        params: { uri: 'confidential://secret-data' }
      };

      await expect(readResourceHandler(request)).rejects.toThrow(
        'Access denied'
      );
    });
  });

  describe('ヘルスチェック', () => {
    it('ヘルスチェックエンドポイントが設定される', async () => {
      await proxy.start();

      // /health エンドポイントが設定されることを確認
      const healthHandler = mockApp.get.mock.calls.find(
        call => call[0] === '/health'
      );

      expect(healthHandler).toBeDefined();

      // ヘルスチェックハンドラーをテスト
      const mockReq = {};
      const mockRes = {
        json: jest.fn()
      };

      healthHandler[1](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'healthy',
        uptime: expect.any(Number),
        version: '1.0.0',
        upstream: expect.any(Object)
      });
    });
  });

  describe('上流サーバー通信', () => {
    it('上流サーバーにリクエストを転送する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);

      // 上流サーバーの設定
      proxy.addUpstreamServer('test-server', 'http://upstream-server:8080');

      // 上流サーバーのレスポンスをモック
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            tools: [
              { name: 'tool1', description: 'Tool 1' },
              { name: 'tool2', description: 'Tool 2' }
            ]
          }
        })
      } as Response);

      await proxy.start();
      const listToolsHandler = mockServer._handlers.get('ListToolsRequest');

      const result = await listToolsHandler({});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://upstream-server:8080'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('tools/list')
        })
      );

      expect(result.tools).toHaveLength(2);
    });

    it('上流サーバーエラーを適切に処理する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      proxy.addUpstreamServer('test-server', 'http://upstream-server:8080');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');

      await expect(
        readResourceHandler({
          params: { uri: 'broken://resource' }
        })
      ).rejects.toThrow('Upstream server error');
    });

    it('ネットワークエラーを処理する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      proxy.addUpstreamServer('test-server', 'http://upstream-server:8080');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');

      await expect(
        readResourceHandler({
          params: { uri: 'test://resource' }
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('ポリシー管理', () => {
    it('ポリシーを追加・更新できる', () => {
      proxy.addPolicy('http-policy', 'HTTPアクセスポリシー');
      
      expect(proxy['policies'].has('http-policy')).toBe(true);
      expect(proxy['policies'].get('http-policy')).toBe('HTTPアクセスポリシー');

      proxy.updatePolicy('http-policy', '更新されたHTTPポリシー');
      expect(proxy['policies'].get('http-policy')).toBe('更新されたHTTPポリシー');
    });
  });

  describe('エラーハンドリング', () => {
    it('ポリシー判定エラーを適切に処理する', async () => {
      mockJudgmentEngine.makeDecision.mockRejectedValueOnce(
        new Error('AI service unavailable')
      );

      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');

      const request = {
        params: { uri: 'test://resource' }
      };

      await expect(readResourceHandler(request)).rejects.toThrow(
        'AI service unavailable'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resource read error',
        expect.any(Error)
      );
    });

    it('不正なリクエストを処理する', async () => {
      await proxy.start();
      const callToolHandler = mockServer._handlers.get('CallToolRequest');

      const invalidRequest = {
        params: {
          // name が欠落
          arguments: {}
        }
      };

      await expect(callToolHandler(invalidRequest)).rejects.toThrow();
    });
  });

  describe('パフォーマンスとスケーラビリティ', () => {
    it('複数の同時リクエストを処理できる', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValue(permitDecision);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          contents: [{ uri: 'test://resource', text: 'Content' }]
        })
      } as Response);

      await proxy.start();
      const readResourceHandler = mockServer._handlers.get('ReadResourceRequest');

      // 20個の同時リクエスト
      const promises = Array.from({ length: 20 }, (_, i) => 
        readResourceHandler({
          params: { uri: `test://resource/${i}` }
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(20);
      expect(mockJudgmentEngine.makeDecision).toHaveBeenCalledTimes(20);
    });
  });

  describe('ライフサイクル管理', () => {
    it('サーバーを起動・停止できる', async () => {
      await proxy.start();

      expect(mockApp.listen).toHaveBeenCalledWith(
        3456,
        expect.any(Function)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('AEGIS MCP Proxy (HTTP) started')
      );

      await proxy.stop();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🛑 AEGIS MCP Proxy (HTTP) stopped'
      );
    });
  });
});