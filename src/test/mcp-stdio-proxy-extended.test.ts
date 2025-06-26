import { MCPStdioPolicyProxy } from '../mcp/stdio-proxy';
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { PolicyDecision, AEGISConfig } from '../types';
import { Logger } from '../utils/logger';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioRouter } from '../mcp/stdio-router';
import { PolicyLoader } from '../policies/policy-loader';
import { RealTimeAnomalyDetector } from '../audit/real-time-anomaly-detector';
import { IntelligentCacheSystem } from '../performance/intelligent-cache-system';
import { BatchJudgmentSystem } from '../performance/batch-judgment-system';
import { CIRCUIT_BREAKER, CACHE, BATCH, TIMEOUTS, MONITORING } from '../constants';

// 依存モジュールをモック
jest.mock('../ai/judgment-engine');
jest.mock('../utils/logger');
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('../mcp/stdio-router');
jest.mock('../policies/policy-loader');
jest.mock('../audit/real-time-anomaly-detector');
jest.mock('../performance/intelligent-cache-system');
jest.mock('../performance/batch-judgment-system');
jest.mock('../context/index.js', () => ({
  ContextCollector: jest.fn().mockImplementation(() => ({
    registerEnricher: jest.fn(),
    enrichContext: jest.fn((context) => Promise.resolve({
      ...context,
      environment: {
        ...context.environment,
        enrichments: {
          'time-based': { isBusinessHours: true },
          'agent-info': { agentType: 'mcp-client' },
          'resource-classifier': { dataType: 'test-data' },
          'security-info': { threatLevel: 'low' }
        }
      }
    }))
  })),
  TimeBasedEnricher: jest.fn(),
  AgentInfoEnricher: jest.fn(),
  ResourceClassifierEnricher: jest.fn(),
  SecurityInfoEnricher: jest.fn()
}));

describe('MCPStdioPolicyProxy - 拡張機能テスト', () => {
  let proxy: MCPStdioPolicyProxy;
  let mockJudgmentEngine: jest.Mocked<AIJudgmentEngine>;
  let mockLogger: jest.Mocked<Logger>;
  let mockServer: jest.Mocked<Server>;
  let mockStdioRouter: jest.Mocked<StdioRouter>;
  let mockPolicyLoader: jest.Mocked<PolicyLoader>;
  let mockAnomalyDetector: jest.Mocked<RealTimeAnomalyDetector>;
  let mockCacheSystem: jest.Mocked<IntelligentCacheSystem>;
  let mockBatchSystem: jest.Mocked<BatchJudgmentSystem>;

  const testConfig: AEGISConfig = {
    llm: {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3
    },
    mcp: {
      upstreamServers: [
        {
          name: 'test-server',
          command: 'test-mcp-server',
          args: ['--test']
        }
      ]
    }
  };

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
      connect: jest.fn(),
      close: jest.fn()
    } as any;

    mockStdioRouter = {
      registerUpstreamServer: jest.fn(),
      routeRequest: jest.fn(),
      startAllServers: jest.fn(),
      stopAllServers: jest.fn(),
      stopServers: jest.fn(),
      listAllTools: jest.fn(),
      listAllResources: jest.fn(),
      getAvailableServers: jest.fn().mockReturnValue([]),
      addServerFromConfig: jest.fn(),
      loadServersFromDesktopConfig: jest.fn(),
      startServers: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockPolicyLoader = {
      loadPolicies: jest.fn().mockResolvedValue(undefined),
      getActivePolicies: jest.fn().mockReturnValue([]),
      formatPolicyForAI: jest.fn()
    } as any;

    mockAnomalyDetector = {
      onAnomalyAlert: jest.fn(),
      detectRealTimeAnomalies: jest.fn().mockResolvedValue([]),
      getAnomalyStats: jest.fn().mockReturnValue({})
    } as any;

    mockCacheSystem = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
      invalidateByPattern: jest.fn().mockReturnValue(0),
      getStats: jest.fn().mockReturnValue({
        hitRate: 0.75,
        hitCount: 100,
        missCount: 33,
        totalEntries: 50,
        evictionCount: 10
      })
    } as any;

    mockBatchSystem = {
      getStats: jest.fn().mockReturnValue({
        totalRequests: 1000,
        successfulRequests: 950,
        avgProcessingTime: 150
      }),
      getQueueStatus: jest.fn().mockReturnValue({
        waitingRequests: 5,
        processingRequests: 2,
        isProcessing: true,
        priorityDistribution: { high: 1, medium: 3, low: 1 }
      }),
      forceProcessPendingRequests: jest.fn().mockResolvedValue(undefined)
    } as any;

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
    (StdioRouter as jest.MockedClass<typeof StdioRouter>).mockImplementation(
      () => mockStdioRouter
    );
    (PolicyLoader as jest.MockedClass<typeof PolicyLoader>).mockImplementation(
      () => mockPolicyLoader
    );
    (RealTimeAnomalyDetector as jest.MockedClass<typeof RealTimeAnomalyDetector>).mockImplementation(
      () => mockAnomalyDetector
    );
    (IntelligentCacheSystem as jest.MockedClass<typeof IntelligentCacheSystem>).mockImplementation(
      () => mockCacheSystem
    );
    (BatchJudgmentSystem as jest.MockedClass<typeof BatchJudgmentSystem>).mockImplementation(
      () => mockBatchSystem
    );

    proxy = new MCPStdioPolicyProxy(testConfig, mockLogger, mockJudgmentEngine);
  });

  describe('ポリシーローダー機能', () => {
    it('初期化時にポリシーローダーを設定する', () => {
      expect(PolicyLoader).toHaveBeenCalled();
      expect(mockPolicyLoader.loadPolicies).toHaveBeenCalled();
    });

    it('ポリシーローダーの初期化エラーを処理する', async () => {
      mockPolicyLoader.loadPolicies.mockRejectedValueOnce(new Error('Policy load error'));
      
      // 新しいインスタンスを作成
      const newProxy = new MCPStdioPolicyProxy(testConfig, mockLogger, mockJudgmentEngine);
      
      // エラーログが出力されることを確認
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize policy loader:',
        expect.any(Error)
      );
    });

    it('アクティブポリシーを優先的に使用する', async () => {
      const activePolicy = {
        name: 'test-active-policy',
        policy: 'Active policy content',
        metadata: { priority: 100 }
      };
      
      mockPolicyLoader.getActivePolicies.mockReturnValue([activePolicy]);
      mockPolicyLoader.formatPolicyForAI.mockReturnValue('Formatted active policy');
      
      // enforcePolicy メソッドをテストするため、リクエストハンドラーを模擬
      await proxy.start();
      
      expect(mockPolicyLoader.getActivePolicies).toHaveBeenCalled();
    });
  });

  describe('リアルタイム異常検知', () => {
    it('異常検知アラートハンドラーを設定する', () => {
      expect(mockAnomalyDetector.onAnomalyAlert).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('異常アラートを適切に処理する', () => {
      // アラートハンドラーを取得
      const alertHandler = mockAnomalyDetector.onAnomalyAlert.mock.calls[0][0];
      
      const testAlert = {
        alertId: 'test-alert-123',
        severity: 'HIGH',
        pattern: { name: 'suspicious-access' },
        triggeringContext: { agent: 'test-agent' }
      };
      
      // アラートハンドラーを実行
      alertHandler(testAlert);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Real-time anomaly alert',
        expect.objectContaining({
          alertId: 'test-alert-123',
          severity: 'HIGH',
          pattern: 'suspicious-access',
          agent: 'test-agent'
        })
      );
    });

    it('ポリシー判定後に異常検知を実行する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '許可',
        confidence: 0.95
      };

      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      mockAnomalyDetector.detectRealTimeAnomalies.mockResolvedValueOnce([
        {
          alertId: 'anomaly-1',
          severity: 'MEDIUM',
          pattern: { name: 'unusual-pattern' }
        }
      ]);
      
      // プライベートメソッドをテストするため、リフレクションを使用
      const enforcePolicy = proxy['enforcePolicy'].bind(proxy);
      await enforcePolicy('read', 'test://resource', {});
      
      expect(mockAnomalyDetector.detectRealTimeAnomalies).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Detected 1 real-time anomalies'),
        expect.any(Object)
      );
    });
  });

  describe('インテリジェントキャッシュシステム', () => {
    it('適切な設定でキャッシュシステムを初期化する', () => {
      expect(IntelligentCacheSystem).toHaveBeenCalledWith(
        expect.objectContaining({
          maxEntries: CACHE.INTELLIGENT_CACHE.MAX_ENTRIES,
          defaultTtl: CACHE.INTELLIGENT_CACHE.DEFAULT_TTL,
          confidenceThreshold: CACHE.INTELLIGENT_CACHE.CONFIDENCE_THRESHOLD,
          enableLRUEviction: true,
          enableIntelligentTtl: true,
          contextSensitivity: 0.7,
          compressionEnabled: true
        }),
        expect.objectContaining({
          adaptiveTtl: true,
          contextualGrouping: true,
          predictivePreloading: false,
          patternRecognition: true
        })
      );
    });

    it('キャッシュヒット時に判定結果を返す', async () => {
      const cachedDecision = {
        decision: 'PERMIT',
        reason: 'Cached permission',
        confidence: 0.95,
        processingTime: 10
      };
      
      mockCacheSystem.get.mockResolvedValueOnce(cachedDecision);
      
      const enforcePolicy = proxy['enforcePolicy'].bind(proxy);
      const result = await enforcePolicy('read', 'test://resource', {});
      
      expect(result.decision).toBe('PERMIT');
      expect(result.policyUsed).toBe('cached-result');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Using cached decision result',
        expect.any(Object)
      );
    });

    it('新しい判定結果をキャッシュに保存する', async () => {
      const permitDecision: PolicyDecision = {
        decision: 'PERMIT',
        reason: '新規判定',
        confidence: 0.95
      };
      
      mockJudgmentEngine.makeDecision.mockResolvedValueOnce(permitDecision);
      
      const enforcePolicy = proxy['enforcePolicy'].bind(proxy);
      await enforcePolicy('read', 'test://resource', {});
      
      expect(mockCacheSystem.set).toHaveBeenCalled();
    });

    it('キャッシュ統計情報を取得する', () => {
      const stats = proxy.getCacheStats();
      
      expect(stats).toMatchObject({
        hitRate: 0.75,
        totalHits: 100,
        totalMisses: 33,
        size: 50,
        maxSize: CACHE.INTELLIGENT_CACHE.MAX_ENTRIES
      });
    });

    it('キャッシュをクリアする', async () => {
      await proxy.clearCache();
      
      expect(mockCacheSystem.clear).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Cache cleared manually');
    });

    it('パターンによるキャッシュ無効化を実行する', async () => {
      mockCacheSystem.invalidateByPattern.mockReturnValue(5);
      
      const count = await proxy.invalidateCacheByPattern('test.*');
      
      expect(count).toBe(5);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache invalidated by pattern',
        { pattern: 'test.*', count: 5 }
      );
    });
  });

  describe('バッチ判定システム', () => {
    it('適切な設定でバッチシステムを初期化する', () => {
      expect(BatchJudgmentSystem).toHaveBeenCalledWith(
        mockJudgmentEngine,
        expect.objectContaining({
          maxBatchSize: BATCH.MAX_SIZE.STDIO,
          batchTimeout: BATCH.TIMEOUT,
          enableParallelProcessing: true,
          priorityQueuing: true
        })
      );
    });

    it('バッチ判定統計情報を取得する', () => {
      const stats = proxy.getBatchJudgmentStats();
      
      expect(stats).toMatchObject({
        totalRequests: 1000,
        batchedRequests: 950,
        averageResponseTime: 150
      });
    });

    it('バッチキューの状態を取得する', () => {
      const status = proxy.getBatchQueueStatus();
      
      expect(status).toMatchObject({
        pending: 5,
        processing: 2,
        waitingRequests: 5,
        processingRequests: 2,
        isProcessing: true
      });
    });

    it('バッチキューの強制処理を実行する', async () => {
      await proxy.forceProcessBatchQueue();
      
      expect(mockBatchSystem.forceProcessPendingRequests).toHaveBeenCalled();
    });
  });

  describe('サーキットブレーカー機能', () => {
    it('閾値を超えた失敗でサーキットブレーカーを開く', async () => {
      mockStdioRouter.routeRequest.mockRejectedValue(new Error('Upstream error'));
      
      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);
      
      // 閾値まで失敗を記録
      for (let i = 0; i < CIRCUIT_BREAKER.FAILURE_THRESHOLD; i++) {
        try {
          await forwardToUpstream('test-method', {});
        } catch (e) {
          // エラーは予期される
        }
      }
      
      // サーキットブレーカーが開いていることを確認
      await expect(forwardToUpstream('test-method', {})).rejects.toThrow(
        'Circuit breaker is open for test-method'
      );
    });

    it('成功時にサーキットブレーカーをリセットする', async () => {
      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);
      
      // 成功レスポンスを設定
      mockStdioRouter.routeRequest.mockResolvedValueOnce({
        result: { data: 'success' }
      });
      
      await forwardToUpstream('test-method', {});
      
      const stats = proxy.getCircuitBreakerStats();
      expect(stats['test-method']?.failures).toBe(0);
    });

    it('クールダウン期間後にサーキットブレーカーをリセットする', async () => {
      // タイムアウトをモック
      jest.useFakeTimers();
      
      const forwardToUpstream = proxy['forwardToUpstream'].bind(proxy);
      
      // サーキットブレーカーを開く
      mockStdioRouter.routeRequest.mockRejectedValue(new Error('Upstream error'));
      for (let i = 0; i < CIRCUIT_BREAKER.FAILURE_THRESHOLD; i++) {
        try {
          await forwardToUpstream('test-method', {});
        } catch (e) {
          // Expected
        }
      }
      
      // クールダウン期間を経過させる
      jest.advanceTimersByTime(CIRCUIT_BREAKER.COOLDOWN_MS + 1000);
      
      // 成功レスポンスを設定
      mockStdioRouter.routeRequest.mockResolvedValueOnce({
        result: { data: 'success' }
      });
      
      // サーキットブレーカーがリセットされていることを確認
      await expect(forwardToUpstream('test-method', {})).resolves.toBeDefined();
      
      jest.useRealTimers();
    });

    it('サーキットブレーカーの統計情報を取得する', () => {
      const stats = proxy.getCircuitBreakerStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('コンプライアンスレポート機能', () => {
    it('コンプライアンスレポートを生成する', async () => {
      const mockReport = {
        totalRequests: 1000,
        permitRate: 0.85,
        denyRate: 0.15
      };
      
      // advancedAuditSystemのモック
      proxy['advancedAuditSystem'] = {
        generateComplianceReport: jest.fn().mockResolvedValue(mockReport)
      } as any;
      
      const report = await proxy.generateComplianceReport(24);
      
      expect(report).toEqual(mockReport);
      expect(proxy['advancedAuditSystem'].generateComplianceReport).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date)
        })
      );
    });

    it('異常アクセスを検出する', async () => {
      const mockAnomalies = [
        { agent: 'suspicious-agent', score: 0.95 }
      ];
      
      proxy['advancedAuditSystem'] = {
        detectAnomalousAccess: jest.fn().mockResolvedValue(mockAnomalies)
      } as any;
      
      const alerts = await proxy.detectAnomalousAccess(0.1);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        alertId: expect.any(String),
        severity: 'MEDIUM',
        pattern: {
          name: 'anomalous-access'
        }
      });
    });

    it('アクセスパターン分析を作成する', async () => {
      const mockAnalysis = {
        patterns: [],
        anomalies: []
      };
      
      proxy['advancedAuditSystem'] = {
        createAccessPatternAnalysis: jest.fn().mockResolvedValue(mockAnalysis)
      } as any;
      
      const analysis = await proxy.createAccessPatternAnalysis(7);
      
      expect(analysis).toMatchObject({
        patterns: expect.any(Array),
        anomalies: expect.any(Array),
        timeRange: expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date)
        })
      });
    });

    it('監査ログをエクスポートする', async () => {
      const mockBuffer = Buffer.from('audit log data');
      
      proxy['advancedAuditSystem'] = {
        exportAuditLogs: jest.fn().mockResolvedValue(mockBuffer)
      } as any;
      
      const result = await proxy.exportAuditLogs('JSON', 24);
      
      expect(result).toEqual(mockBuffer);
      expect(proxy['advancedAuditSystem'].exportAuditLogs).toHaveBeenCalledWith(
        'JSON',
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date)
        })
      );
    });
  });

  describe('デスクトップ設定機能', () => {
    it('Claude Desktop設定をロードする', () => {
      const desktopConfig = {
        mcpServers: {
          'test-server': {
            command: 'test-command',
            args: ['--test']
          }
        }
      };
      
      proxy.loadDesktopConfig(desktopConfig);
      
      expect(mockStdioRouter.loadServersFromDesktopConfig).toHaveBeenCalledWith(desktopConfig);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting upstream servers...');
    });

    it('MCP設定形式でサーバーを追加する', () => {
      const serverConfig = {
        command: 'new-server',
        args: ['--config']
      };
      
      proxy.addServerFromMCPConfig('new-server', serverConfig);
      
      expect(mockStdioRouter.addServerFromConfig).toHaveBeenCalledWith(
        'new-server',
        serverConfig
      );
    });

    it('上流サーバーのツールを事前読み込みする', async () => {
      mockStdioRouter.routeRequest.mockResolvedValueOnce({
        result: {
          tools: [
            { name: 'tool1', description: 'Test tool 1' },
            { name: 'tool2', description: 'Test tool 2' }
          ]
        }
      });
      
      await proxy.preloadUpstreamTools();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Preloaded 2 tools from upstream servers'
      );
    });

    it('ツール事前読み込みのエラーを処理する', async () => {
      mockStdioRouter.routeRequest.mockRejectedValueOnce(new Error('Preload error'));
      
      await proxy.preloadUpstreamTools();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to preload upstream tools:',
        expect.any(Error)
      );
    });
  });

  describe('システムヘルスモニタリング', () => {
    it('起動時にヘルスモニタリングを開始する', async () => {
      jest.useFakeTimers();
      
      // HTTPプロキシのモックを設定
      const mockHttpProxy = {
        addPolicy: jest.fn(),
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined)
      };
      
      jest.doMock('./http-proxy.js', () => ({
        MCPHttpPolicyProxy: jest.fn().mockImplementation(() => mockHttpProxy)
      }));
      
      await proxy.start();
      
      // タイマーが設定されていることを確認
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      
      jest.useRealTimers();
    });

    it('システムパフォーマンス統計を取得する', () => {
      const stats = proxy.getSystemPerformanceStats();
      
      expect(stats).toMatchObject({
        audit: expect.any(Object),
        cache: expect.any(Object),
        batchJudgment: expect.any(Object),
        queueStatus: expect.any(Object),
        anomalyStats: expect.any(Object),
        circuitBreaker: expect.any(Object),
        systemHealth: expect.objectContaining({
          upstreamServices: expect.any(Number),
          openCircuits: expect.any(Number),
          overallStatus: expect.stringMatching(/HEALTHY|DEGRADED|CRITICAL/)
        })
      });
    });

    it('監査システムの統計情報を取得する', () => {
      proxy['advancedAuditSystem'] = {
        getSystemStats: jest.fn().mockReturnValue({
          totalEntries: 1000,
          oldestEntry: new Date('2024-01-01'),
          newestEntry: new Date()
        })
      } as any;
      
      const stats = proxy.getAuditSystemStats();
      
      expect(stats).toMatchObject({
        totalEntries: 1000,
        recentEntries: 0,
        storageSize: 0,
        oldestEntry: expect.any(Date),
        newestEntry: expect.any(Date)
      });
    });

    it('ダッシュボードメトリクスを取得する', async () => {
      proxy['auditDashboardProvider'] = {
        getDashboardMetrics: jest.fn().mockResolvedValue({
          totalRequests: 5000,
          permitRate: 0.9
        })
      } as any;
      
      const metrics = await proxy.getDashboardMetrics();
      
      expect(metrics).toMatchObject({
        totalRequests: 5000,
        permitRate: 0.9,
        denyRate: expect.any(Number),
        activeAlerts: expect.any(Number),
        recentActivity: expect.any(Array),
        systemHealth: expect.objectContaining({
          status: expect.stringMatching(/HEALTHY|DEGRADED|CRITICAL/),
          components: expect.any(Object)
        })
      });
    });
  });

  describe('制約と義務の処理', () => {
    it('重要な制約の失敗時にアクセスを拒否する', async () => {
      const applyDataConstraints = proxy['applyDataConstraints'].bind(proxy);
      
      // EnforcementSystemのモック
      proxy['enforcementSystem'] = {
        applyConstraints: jest.fn().mockRejectedValue(
          new Error('CRITICAL_CONSTRAINT_FAILURE: Cannot apply constraint')
        )
      } as any;
      
      await expect(
        applyDataConstraints({ data: 'test' }, ['critical-constraint'])
      ).rejects.toThrow('Critical constraint failure');
    });

    it('軽微な制約の失敗時に警告と共に通す', async () => {
      const applyDataConstraints = proxy['applyDataConstraints'].bind(proxy);
      
      proxy['enforcementSystem'] = {
        applyConstraints: jest.fn().mockRejectedValue(
          new Error('SOFT_CONSTRAINT_FAILURE: Minor issue')
        )
      } as any;
      
      const result = await applyDataConstraints({ data: 'test' }, ['soft-constraint']);
      
      expect(result).toEqual({ data: 'test' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Soft constraint failure, allowing access with warning',
        expect.any(Error)
      );
    });

    it('重要な義務の失敗時にアラートを送信する', async () => {
      const executeRequestObligations = proxy['executeRequestObligations'].bind(proxy);
      
      proxy['enforcementSystem'] = {
        executeObligations: jest.fn()
          .mockRejectedValueOnce(new Error('CRITICAL_OBLIGATION_FAILURE: Audit failed'))
          .mockResolvedValueOnce(undefined)
      } as any;
      
      await executeRequestObligations(['critical-audit'], { params: {} });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Critical obligation execution failed',
        expect.any(Object)
      );
    });

    it('監査記録失敗時に緊急アラートを送信する', async () => {
      const sendAlert = proxy['sendCriticalObligationFailureAlert'].bind(proxy);
      
      proxy['enforcementSystem'] = {
        executeObligations: jest.fn().mockResolvedValue(undefined)
      } as any;
      
      await sendAlert(['failed-obligation'], new Error('Test error'));
      
      expect(proxy['enforcementSystem'].executeObligations).toHaveBeenCalledWith(
        expect.arrayContaining([
          'Send emergency system alert',
          'Immediate notification to system administrators'
        ]),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('停止処理', () => {
    it('システムを適切に停止する', async () => {
      // HTTPプロキシのモック
      const mockHttpProxy = {
        stop: jest.fn().mockResolvedValue(undefined)
      };
      proxy['httpProxy'] = mockHttpProxy as any;
      
      await proxy.stop();
      
      expect(mockHttpProxy.stop).toHaveBeenCalled();
      expect(mockStdioRouter.stopServers).toHaveBeenCalled();
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockCacheSystem.clear).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🛑 AEGIS MCP Proxy (stdio) stopped cleanly'
      );
    });

    it('停止時のエラーを処理する', async () => {
      mockServer.close.mockRejectedValueOnce(new Error('Close error'));
      
      await expect(proxy.stop()).rejects.toThrow('Close error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during system shutdown',
        expect.any(Error)
      );
    });
  });
});