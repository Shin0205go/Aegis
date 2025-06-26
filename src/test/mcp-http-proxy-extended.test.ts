import { MCPHttpPolicyProxy } from '../mcp/http-proxy';
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { PolicyDecision, AEGISConfig } from '../types';
import { Logger } from '../utils/logger';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';
import { StdioRouter } from '../mcp/stdio-router';
import { v4 as uuidv4 } from 'uuid';

// 依存モジュールをモック
jest.mock('../ai/judgment-engine');
jest.mock('../utils/logger');
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    connect: jest.fn()
  }))
}));
jest.mock('express');
jest.mock('../mcp/stdio-router');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123')
}));

// fetch のモック
global.fetch = jest.fn();

describe('MCPHttpPolicyProxy - 拡張機能テスト', () => {
  let proxy: MCPHttpPolicyProxy;
  let mockJudgmentEngine: jest.Mocked<AIJudgmentEngine>;
  let mockLogger: jest.Mocked<Logger>;
  let mockServer: jest.Mocked<Server>;
  let mockApp: jest.Mocked<express.Application>;
  let mockStdioRouter: jest.Mocked<StdioRouter>;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockHttpServer: any;

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
      enabled: true
    },
    defaultPolicyStrictness: 'medium',
    policyValidationEnabled: true,
    secretKey: 'test-secret'
  } as AEGISConfig;

  beforeEach(() => {
    jest.clearAllMocks();

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

    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockHttpServer = {
      close: jest.fn((cb) => cb?.()),
      on: jest.fn()
    };

    mockApp = {
      use: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      listen: jest.fn((port, callback) => {
        if (callback) {
          process.nextTick(callback);
        }
        return mockHttpServer;
      })
    } as any;

    mockStdioRouter = {
      registerUpstreamServer: jest.fn(),
      routeRequest: jest.fn(),
      startServers: jest.fn().mockResolvedValue(undefined),
      stopServers: jest.fn().mockResolvedValue(undefined),
      listAllTools: jest.fn().mockResolvedValue([]),
      listAllResources: jest.fn().mockResolvedValue([]),
      getAvailableServers: jest.fn().mockReturnValue([])
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
    (StdioRouter as jest.MockedClass<typeof StdioRouter>).mockImplementation(
      () => mockStdioRouter
    );

    proxy = new MCPHttpPolicyProxy(testConfig, mockLogger, mockJudgmentEngine);
  });

  describe('ミドルウェア設定', () => {
    it('CORS設定を正しく行う', () => {
      // useの呼び出しを確認
      expect(mockApp.use).toHaveBeenCalledWith(express.json());
      expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function));
      
      // CORSミドルウェアを取得してテスト
      const corsMiddleware = mockApp.use.mock.calls.find(
        call => typeof call[0] === 'function'
      )?.[0];
      
      const mockReq = { headers: {} };
      const mockRes = {
        header: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();
      
      corsMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.header).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      expect(mockRes.header).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        expect.stringContaining('X-Agent-ID')
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('リクエストコンテキストを保存する', () => {
      const corsMiddleware = mockApp.use.mock.calls.find(
        call => typeof call[0] === 'function'
      )?.[0];
      
      const mockReq = {
        headers: {
          'mcp-session-id': 'session-123',
          'x-agent-id': 'agent-456'
        }
      };
      const mockRes = {
        header: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();
      
      corsMiddleware(mockReq, mockRes, mockNext);
      
      // リクエストコンテキストが保存されることを確認
      const context = proxy['requestContext'].get('session-123');
      expect(context).toBeDefined();
      expect(context?.headers).toEqual(mockReq.headers);
      expect(context?.sessionId).toBe('session-123');
    });

    it('セッションIDがない場合はUUIDを生成する', () => {
      const corsMiddleware = mockApp.use.mock.calls.find(
        call => typeof call[0] === 'function'
      )?.[0];
      
      const mockReq = { headers: {} };
      const mockRes = {
        header: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();
      
      corsMiddleware(mockReq, mockRes, mockNext);
      
      // UUIDが生成されることを確認
      const context = proxy['requestContext'].get('test-uuid-123');
      expect(context).toBeDefined();
    });

    it('レスポンス送信後に古いコンテキストをクリーンアップする', () => {
      const corsMiddleware = mockApp.use.mock.calls.find(
        call => typeof call[0] === 'function'
      )?.[0];
      
      // 古いコンテキストを手動で追加
      const oldTimestamp = Date.now() - 3700000; // 1時間以上前
      proxy['requestContext'].set('old-session', {
        headers: {},
        sessionId: 'old-session',
        timestamp: oldTimestamp
      });
      
      const mockReq = { headers: {} };
      const mockRes = {
        header: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();
      
      corsMiddleware(mockReq, mockRes, mockNext);
      
      // finishイベントハンドラーを取得して実行
      const finishHandler = mockRes.on.mock.calls.find(
        call => call[0] === 'finish'
      )?.[1];
      
      finishHandler();
      
      // 古いコンテキストが削除されることを確認
      expect(proxy['requestContext'].has('old-session')).toBe(false);
    });
  });

  describe('ブリッジモード機能', () => {
    beforeEach(() => {
      // ブリッジモードを有効化
      proxy.enableBridgeMode();
    });

    it('ブリッジモードでstdioルーターを初期化する', () => {
      expect(StdioRouter).toHaveBeenCalledWith(mockLogger);
      expect(proxy['bridgeMode']).toBe(true);
    });

    it('ブリッジモードでリソース読み取り結果を正しく処理する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      mockStdioRouter.routeRequest.mockResolvedValueOnce({
        result: {
          contents: [{ uri: 'test://resource', text: 'Bridge mode content' }]
        }
      });

      await proxy.start();
      const handler = mockServer.setRequestHandler.mock.calls.find(
        call => call[0].toString().includes('ReadResource')
      )?.[1];

      const result = await handler(
        { params: { uri: 'test://resource' } },
        { sessionId: 'test-session' }
      );

      expect(result).toMatchObject({
        contents: expect.arrayContaining([
          expect.objectContaining({ text: 'Bridge mode content' })
        ])
      });
    });

    it('ブリッジモードでツール名のプレフィックスを除去する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      mockStdioRouter.routeRequest.mockResolvedValueOnce({
        result: { output: 'Tool result' }
      });

      await proxy.start();
      const handler = mockServer.setRequestHandler.mock.calls.find(
        call => call[0].toString().includes('CallTool')
      )?.[1];

      await handler(
        { params: { name: 'filesystem__read_file', arguments: {} } },
        { sessionId: 'test-session' }
      );

      // プレフィックスが除去されることを確認
      expect(mockStdioRouter.routeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            name: 'read_file'
          })
        })
      );
    });

    it('ブリッジモードでstdioサーバーを追加する', () => {
      const serverConfig = {
        command: 'test-server',
        args: ['--config']
      };

      proxy.addStdioUpstreamServer('test-server', serverConfig);

      expect(mockStdioRouter.registerUpstreamServer).toHaveBeenCalledWith({
        name: 'test-server',
        ...serverConfig
      });
    });
  });

  describe('コンテキストエンリッチャー', () => {
    it('HTTPリクエストヘッダーからエージェント情報を抽出する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ contents: [] })
      } as Response);

      await proxy.start();
      const handler = mockServer.setRequestHandler.mock.calls.find(
        call => call[0].toString().includes('ReadResource')
      )?.[1];

      // コンテキストにヘッダー情報を設定
      proxy['requestContext'].set('test-session', {
        headers: {
          'x-agent-id': 'test-agent-123',
          'x-agent-type': 'automated-bot',
          'x-agent-metadata': JSON.stringify({ version: '1.0' })
        },
        sessionId: 'test-session',
        timestamp: Date.now()
      });

      await handler(
        { params: { uri: 'test://resource' } },
        { sessionId: 'test-session' }
      );

      // エージェント情報が判定エンジンに渡されることを確認
      expect(mockJudgmentEngine.makeDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent: 'test-agent-123',
          environment: expect.objectContaining({
            agentType: 'automated-bot',
            agentMetadata: JSON.stringify({ version: '1.0' })
          })
        }),
        expect.any(Object)
      );
    });

    it('ヘッダーが大文字の場合も処理する', async () => {
      const enforcePolicy = proxy['enforcePolicy'].bind(proxy);

      const context = {
        headers: {
          'X-Agent-ID': 'TEST-AGENT',
          'X-Agent-Type': 'BROWSER'
        },
        clientId: 'client-123'
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce({
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      });

      await enforcePolicy('read', 'test://resource', context);

      expect(mockJudgmentEngine.makeDecision).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          agent: 'TEST-AGENT'
        }),
        expect.any(Object)
      );
    });
  });

  describe('ヘルスチェックエンドポイント', () => {
    it('包括的なヘルス情報を返す', async () => {
      await proxy.start();

      const healthHandler = mockApp.get.mock.calls.find(
        call => call[0] === '/health'
      )?.[1];

      const mockReq = {};
      const mockRes = {
        json: jest.fn()
      };

      healthHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          uptime: expect.any(Number),
          version: expect.any(String),
          upstream: expect.objectContaining({
            servers: expect.any(Number),
            healthy: expect.any(Number)
          }),
          system: expect.objectContaining({
            memory: expect.objectContaining({
              used: expect.any(Number),
              total: expect.any(Number),
              percentage: expect.any(Number)
            }),
            process: expect.objectContaining({
              pid: expect.any(Number),
              uptime: expect.any(Number)
            })
          })
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('上流サーバーのタイムアウトを処理する', async () => {
      // タイムアウトをシミュレート
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 1000);
        }) as any
      );

      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);

      await expect(
        forwardToUpstream('test-server', 'resources/read', {})
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Upstream request failed'),
        expect.any(Error)
      );
    });

    it('JSON-RPCエラーレスポンスを処理する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32603,
            message: 'Internal error'
          }
        })
      } as Response);

      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);

      await expect(
        forwardToUpstream('test-server', 'resources/read', {})
      ).rejects.toThrow('Internal error');
    });

    it('不正なレスポンス形式を処理する', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);

      await expect(
        forwardToUpstream('test-server', 'resources/read', {})
      ).rejects.toThrow('Request failed with status 500');
    });
  });

  describe('API管理エンドポイント', () => {
    it('ポリシー管理エンドポイントを設定する', async () => {
      await proxy.start();

      // ポリシー一覧エンドポイント
      const getPoliciesHandler = mockApp.get.mock.calls.find(
        call => call[0] === '/policies'
      )?.[1];

      expect(getPoliciesHandler).toBeDefined();

      const mockReq = {};
      const mockRes = {
        json: jest.fn()
      };

      getPoliciesHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.any(String),
            content: expect.any(String)
          })
        ])
      );
    });

    it('ポリシー作成エンドポイントを処理する', async () => {
      await proxy.start();

      const postPolicyHandler = mockApp.post.mock.calls.find(
        call => call[0] === '/policies'
      )?.[1];

      const mockReq = {
        body: {
          name: 'new-policy',
          content: 'New policy content'
        }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      postPolicyHandler(mockReq, mockRes);

      expect(proxy['policies'].has('new-policy')).toBe(true);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Policy created successfully',
        name: 'new-policy'
      });
    });

    it('無効なポリシー作成リクエストを処理する', async () => {
      await proxy.start();

      const postPolicyHandler = mockApp.post.mock.calls.find(
        call => call[0] === '/policies'
      )?.[1];

      const mockReq = {
        body: {
          // nameとcontentが不足
        }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      postPolicyHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing name or content'
      });
    });
  });

  describe('MCP管理エンドポイント', () => {
    it('MCPメッセージを処理する', async () => {
      await proxy.start();

      const mcpHandler = mockApp.post.mock.calls.find(
        call => call[0] === '/mcp/messages'
      )?.[1];

      const mockReq = {
        body: {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        }
      };
      const mockRes = {
        json: jest.fn()
      };

      // MCPトランスポートのモック
      const mockTransport = {
        handleRequest: jest.fn().mockResolvedValue({
          jsonrpc: '2.0',
          result: { tools: [] },
          id: 1
        })
      };
      proxy['transport'] = mockTransport as any;

      await mcpHandler(mockReq, mockRes);

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockReq.body);
      expect(mockRes.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        result: { tools: [] },
        id: 1
      });
    });

    it('MCP処理エラーを処理する', async () => {
      await proxy.start();

      const mcpHandler = mockApp.post.mock.calls.find(
        call => call[0] === '/mcp/messages'
      )?.[1];

      const mockReq = {
        body: {
          jsonrpc: '2.0',
          method: 'invalid/method',
          params: {},
          id: 1
        }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const mockTransport = {
        handleRequest: jest.fn().mockRejectedValue(new Error('Invalid method'))
      };
      proxy['transport'] = mockTransport as any;

      await mcpHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'MCP request failed',
        details: 'Invalid method'
      });
    });
  });

  describe('停止処理', () => {
    it('HTTPサーバーを適切に停止する', async () => {
      await proxy.start();
      await proxy.stop();

      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🛑 AEGIS HTTP MCP Proxy stopped'
      );
    });

    it('ブリッジモードで上流サーバーも停止する', async () => {
      proxy.enableBridgeMode();
      await proxy.start();
      await proxy.stop();

      expect(mockStdioRouter.stopServers).toHaveBeenCalled();
    });

    it('停止時のエラーを処理する', async () => {
      await proxy.start();
      
      mockHttpServer.close.mockImplementation((cb) => {
        cb(new Error('Close error'));
      });

      await expect(proxy.stop()).rejects.toThrow('Close error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error stopping HTTP server',
        expect.any(Error)
      );
    });
  });

  describe('ポリシー管理', () => {
    it('デフォルトポリシーを適用する', async () => {
      proxy.addPolicy('default-policy', 'Default policy content');
      
      const selectPolicy = proxy['selectPolicy'].bind(proxy);
      const policy = selectPolicy('unknown-action', 'unknown-resource');
      
      expect(policy).toBe('Default policy content');
    });

    it('リソースタイプに基づいてポリシーを選択する', async () => {
      proxy.addPolicy('customer-data-policy', 'Customer data policy');
      proxy.addPolicy('email-access-policy', 'Email access policy');
      proxy.addPolicy('file-system-policy', 'File system policy');
      
      const selectPolicy = proxy['selectPolicy'].bind(proxy);
      
      expect(selectPolicy('read', 'customer://data')).toBe('Customer data policy');
      expect(selectPolicy('read', 'email://inbox')).toBe('Email access policy');
      expect(selectPolicy('read', 'file://document')).toBe('File system policy');
    });

    it('エージェントベースのポリシー選択を行う', async () => {
      proxy.addPolicy('claude-desktop-policy', 'Claude Desktop policy');
      
      const selectPolicy = proxy['selectPolicy'].bind(proxy);
      const policy = selectPolicy('read', 'test://resource', 'claude-desktop');
      
      expect(policy).toBe('Claude Desktop policy');
    });
  });
});