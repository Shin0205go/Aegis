// ============================================================================
// AEGIS - MCP Policy Enforcement Point (stdio トランスポート版)
// MCP公式仕様に準拠したstdioベースの実装
// ============================================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema, 
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import type { 
  DecisionContext, 
  AccessControlResult,
  AEGISConfig 
} from '../types/index.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { Logger } from '../utils/logger.js';
import { 
  ContextCollector,
  TimeBasedEnricher,
  AgentInfoEnricher,
  ResourceClassifierEnricher,
  SecurityInfoEnricher
} from '../context/index.js';
import { StdioRouter, MCPServerConfig } from './stdio-router.js';
import { EnforcementSystem } from '../core/enforcement.js';
import { PolicyLoader } from '../policies/policy-loader.js';
import { AdvancedAuditSystem } from '../audit/advanced-audit-system.js';
import { AuditDashboardDataProvider } from '../audit/audit-dashboard-data.js';
import { RealTimeAnomalyDetector } from '../audit/real-time-anomaly-detector.js';
import { IntelligentCacheSystem } from '../performance/intelligent-cache-system.js';
import { BatchJudgmentSystem } from '../performance/batch-judgment-system.js';

export class MCPStdioPolicyProxy {
  private server: Server;
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  private contextCollector: ContextCollector;
  private enforcementSystem: EnforcementSystem;
  
  // stdioルーター
  private stdioRouter: StdioRouter;
  
  // ポリシー管理
  private policies = new Map<string, string>();
  private policyLoader: PolicyLoader;
  
  // Phase 3: 高度な監査システム
  private advancedAuditSystem: AdvancedAuditSystem;
  private auditDashboardProvider: AuditDashboardDataProvider;
  private realTimeAnomalyDetector: RealTimeAnomalyDetector;
  
  // Phase 3: パフォーマンス最適化
  private intelligentCacheSystem: IntelligentCacheSystem;
  private batchJudgmentSystem: BatchJudgmentSystem;
  
  private upstreamStartPromise: Promise<void> | null = null;
  
  // Phase 3: サーキットブレーカー状態管理
  private circuitBreakerState: Map<string, { failures: number, lastFailure: Date, isOpen: boolean }> = new Map();
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // 5回連続失敗でオープン
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1分間クールダウン

  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    this.policyLoader = new PolicyLoader();
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // ポリシーローダー初期化
    this.initializePolicyLoader();
    
    // 制約・義務実施システム初期化
    this.enforcementSystem = new EnforcementSystem();
    
    // Phase 3: 高度な監査システム初期化
    this.advancedAuditSystem = new AdvancedAuditSystem();
    this.auditDashboardProvider = new AuditDashboardDataProvider(this.advancedAuditSystem);
    this.realTimeAnomalyDetector = new RealTimeAnomalyDetector(this.advancedAuditSystem);
    
    // 異常検知アラートのハンドリング設定
    this.realTimeAnomalyDetector.onAnomalyAlert((alert) => {
      this.logger.warn('Real-time anomaly alert', {
        alertId: alert.alertId,
        severity: alert.severity,
        pattern: alert.pattern.name,
        agent: alert.triggeringContext.agent
      });
      
      // ダッシュボードにアラートを追加
      this.auditDashboardProvider.createAlert(
        alert.severity,
        'ANOMALY_DETECTED',
        `異常なアクセスパターンを検知: ${alert.pattern.name}`
      );
    });

    // Phase 3: インテリジェントキャッシュシステム初期化
    this.intelligentCacheSystem = new IntelligentCacheSystem({
      maxEntries: 500, // 適度なサイズ
      defaultTtl: 300, // 5分
      confidenceThreshold: 0.8, // 高信頼度のみキャッシュ
      enableLRUEviction: true,
      enableIntelligentTtl: true,
      contextSensitivity: 0.7,
      compressionEnabled: true
    }, {
      adaptiveTtl: true,
      contextualGrouping: true,
      predictivePreloading: false,
      patternRecognition: true
    });

    // Phase 3: バッチ判定システム初期化
    this.batchJudgmentSystem = new BatchJudgmentSystem(this.judgmentEngine, {
      maxBatchSize: 5, // stdioでは小さなバッチサイズ
      batchTimeout: 2000, // 2秒
      enableParallelProcessing: true,
      priorityQueuing: true
    });
    
    // MCPサーバー作成
    this.server = new Server(
      {
        name: 'aegis-policy-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );
    
    this.setupHandlers();
    
    // stdioルーター初期化
    this.stdioRouter = new StdioRouter(this.logger);
  }

  private async initializePolicyLoader(): Promise<void> {
    try {
      await this.policyLoader.loadPolicies();
      this.logger.info('Policy loader initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize policy loader:', error);
    }
  }

  private setupContextEnrichers(): void {
    // 時間ベース情報エンリッチャー
    this.contextCollector.registerEnricher(new TimeBasedEnricher({
      start: 9,
      end: 18,
      timezone: 'Asia/Tokyo'
    }));

    // エージェント情報エンリッチャー
    this.contextCollector.registerEnricher(new AgentInfoEnricher());

    // リソース分類エンリッチャー
    this.contextCollector.registerEnricher(new ResourceClassifierEnricher());

    // セキュリティ情報エンリッチャー
    this.contextCollector.registerEnricher(new SecurityInfoEnricher());
    
    this.logger.info('Context enrichers registered successfully');
  }

  private setupHandlers(): void {
    // リソース読み取りハンドラー
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      this.logger.info('Resource read request', { uri: request.params.uri });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('read', request.params.uri, { request });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // Phase 3: INDETERMINATEも拒否として扱う
        if (decision.decision === 'INDETERMINATE') {
          throw new Error(`Access denied (indeterminate): ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/read', request.params);
        
        // 制約適用
        const constrainedResult = await this.applyConstraints(result, decision.constraints || []);
        
        return constrainedResult;
      } catch (error) {
        this.logger.error('Resource read error', error);
        throw error;
      }
    });

    // リソース一覧ハンドラー
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request: any) => {
      this.logger.info('List resources request');
      
      try {
        // リソース一覧取得はポリシー判定をスキップ（リソースアクセス時に判定）
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/list', {});
        
        // MCPプロトコルに準拠した形式で返す
        if (result && result.result) {
          return result.result;
        }
        
        // フォールバック（空の配列を返す）
        return { resources: [] };
      } catch (error) {
        this.logger.error('List resources error', error);
        throw error;
      }
    });

    // ツール実行ハンドラー
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      this.logger.info('Tool call request', { name: request.params.name });
      
      try {
        // ポリシー判定実行
        // ファイルシステムツールの場合、パスも含めたリソース文字列を生成
        let resourceString = `tool:${request.params.name}`;
        if (request.params.name === 'filesystem__read_file' && request.params.arguments?.path) {
          resourceString = `file:${request.params.arguments.path}`;
        }
        const decision = await this.enforcePolicy('execute', resourceString, { request });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // Phase 3: INDETERMINATEも拒否として扱う
        if (decision.decision === 'INDETERMINATE') {
          throw new Error(`Access denied (indeterminate): ${decision.reason}`);
        }
        
        // サーバープレフィックスを除去してから転送
        const toolName = request.params.name;
        const strippedParams = { ...request.params };
        
        // filesystem__read_file -> read_file のように変換
        const prefixMatch = toolName.match(/^[^_]+__(.+)$/);
        if (prefixMatch) {
          strippedParams.name = prefixMatch[1];
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('tools/call', strippedParams);
        
        // 義務実行
        if (decision.obligations) {
          await this.executeObligations(decision.obligations, request);
        }
        
        // result.resultを返す
        return result.result;
      } catch (error) {
        this.logger.error('Tool call error', error);
        throw error;
      }
    });

    // ツール一覧ハンドラー
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: any) => {
      this.logger.info('List tools request received');
      
      try {
        // 上流サーバーの起動を待つ
        if (this.upstreamStartPromise) {
          this.logger.info('Waiting for upstream servers to be ready...');
          await this.upstreamStartPromise;
        }
        
        // 上流サーバーの状態を確認
        const availableServers = this.stdioRouter.getAvailableServers();
        this.logger.info(`Available upstream servers: ${availableServers.length}`);
        
        // ツール一覧取得はポリシー判定をスキップ（ツール実行時に判定）
        // 上流サーバーに転送
        this.logger.debug('Forwarding tools/list to upstream...');
        const result = await this.forwardToUpstream('tools/list', {});
        
        this.logger.debug('Upstream response received:', JSON.stringify(result).substring(0, 200));
        
        // MCPプロトコルに準拠した形式で返す
        if (result && result.result) {
          this.logger.info(`Returning ${result.result.tools?.length || 0} tools to client`);
          return result.result;
        } else if (result && result.tools) {
          // 直接toolsが含まれている場合
          this.logger.info(`Returning ${result.tools?.length || 0} tools to client (direct format)`);
          return { tools: result.tools };
        }
        
        // フォールバック（空の配列を返す）
        this.logger.warn('No valid result from upstream, returning empty tools array');
        this.logger.debug('Full result object:', JSON.stringify(result));
        return { tools: [] };
      } catch (error) {
        this.logger.error('List tools error', error);
        throw error;
      }
    });
  }

  private async enforcePolicy(action: string, resource: string, context: any): Promise<AccessControlResult> {
    const startTime = Date.now();
    
    // 基本コンテキスト構築
    const baseContext: DecisionContext = {
      agent: 'mcp-client', // stdioでは識別子が限定的
      action,
      resource,
      purpose: context.request?.params?.purpose || 'general-operation',
      time: new Date(),
      environment: {
        transport: 'stdio',
        ...context
      }
    };
    
    // コンテキスト拡張
    const enrichedContext = await this.contextCollector.enrichContext(baseContext);

    // 適用ポリシー選択（設定ファイルから）
    const activePolicies = this.policyLoader.getActivePolicies();
    let policy: string | null = null;
    
    if (activePolicies.length > 0) {
      // 優先度順（priority降順）で最初のアクティブポリシーを使用
      const selectedPolicy = activePolicies[0];
      policy = this.policyLoader.formatPolicyForAI(selectedPolicy);
      this.logger.info(`Using policy: ${selectedPolicy.name} (priority: ${selectedPolicy.metadata.priority})`);
    }

    // Phase 3: キャッシュから判定結果を確認
    const cachedResult = await this.intelligentCacheSystem.get(enrichedContext, policy || '', enrichedContext.environment);
    if (cachedResult) {
      this.logger.debug('Using cached decision result', {
        action,
        resource,
        decision: cachedResult.decision,
        confidence: cachedResult.confidence
      });
      
      // キャッシュヒット時も監査記録
      try {
        const outcome = cachedResult.decision === 'PERMIT' ? 'SUCCESS' : 
                       cachedResult.decision === 'DENY' ? 'FAILURE' : 'ERROR';
        
        await this.advancedAuditSystem.recordAuditEntry(
          enrichedContext,
          cachedResult,
          'cached-result',
          cachedResult.processingTime || 0,
          outcome,
          {
            requestType: action,
            resourcePath: resource,
            transport: 'stdio',
            cacheHit: true
          }
        );
      } catch (auditError) {
        this.logger.warn('Failed to record cached result audit entry', auditError);
      }

      return {
        ...cachedResult,
        processingTime: Date.now() - startTime,
        policyUsed: 'cached-result',
        context: enrichedContext
      };
    }
    
    if (!policy) {
      // フォールバック: 従来のポリシーマップから選択
      const policyName = this.selectApplicablePolicy(resource, baseContext.agent);
      policy = this.policies.get(policyName) || null;
    }
    
    if (!policy) {
      this.logger.warn(`No policy found for resource: ${resource}`);
      // Phase 3: ポリシーがない場合はセキュアなデフォルトでINDETERMINATEを返す
      return {
        decision: 'INDETERMINATE',
        reason: 'No applicable policy found - manual review required',
        confidence: 0.0,
        processingTime: Date.now() - startTime,
        policyUsed: 'no-policy-found',
        constraints: ['手動承認が必要'],
        obligations: ['ポリシー管理者に通知']
      };
    }
    
    // Phase 3: AI判定実行にタイムアウトを設定
    const decision = await Promise.race([
      this.judgmentEngine.makeDecision(policy, enrichedContext, enrichedContext.environment),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI judgment timeout')), 30000); // 30秒タイムアウト
      })
    ]);
    
    const result = {
      ...decision,
      processingTime: Date.now() - startTime,
      policyUsed: activePolicies.length > 0 ? activePolicies[0].name : 'fallback-policy',
      context: enrichedContext
    };

    // Phase 3: 高度な監査システムに判定結果を記録
    try {
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await this.advancedAuditSystem.recordAuditEntry(
        enrichedContext,
        decision,
        result.policyUsed,
        result.processingTime,
        outcome,
        {
          requestType: action,
          resourcePath: resource,
          transport: 'stdio'
        }
      );

      // Phase 3: リアルタイム異常検知の実行
      const anomalyAlerts = await this.realTimeAnomalyDetector.detectRealTimeAnomalies(
        enrichedContext,
        decision,
        outcome
      );

      if (anomalyAlerts.length > 0) {
        this.logger.info(`Detected ${anomalyAlerts.length} real-time anomalies`, {
          alerts: anomalyAlerts.map(alert => ({
            id: alert.alertId,
            severity: alert.severity,
            pattern: alert.pattern.name
          }))
        });
      }

      // Phase 3: 新しい判定結果をキャッシュに保存
      try {
        await this.intelligentCacheSystem.set(
          enrichedContext,
          policy || '',
          enrichedContext.environment,
          result
        );
      } catch (cacheError) {
        this.logger.warn('Failed to cache decision result', cacheError);
      }
    } catch (auditError) {
      // Phase 3: 監査記録の失敗も重大なセキュリティ問題として扱う
      this.logger.error('Critical: Failed to record audit entry or detect anomalies', auditError);
      
      // 監査記録の失敗はコンプライアンス違反の可能性があるため、アラートを送信
      this.sendCriticalObligationFailureAlert(['監査記録失敗'], auditError as Error).catch(() => {
        this.logger.error('Failed to send audit failure alert');
      });
    }
    
    return result;
  }

  private selectApplicablePolicy(resource: string, agent?: string): string {
    // Claude Desktop 専用ポリシー
    if (agent === 'mcp-client') {
      return 'claude-desktop-policy';
    }
    
    if (resource.includes('customer') || resource.includes('personal')) {
      return 'customer-data-policy';
    } else if (resource.includes('email') || resource.includes('gmail')) {
      return 'email-access-policy';
    } else if (resource.includes('file') || resource.includes('document')) {
      return 'file-system-policy';
    } else if (resource.startsWith('tool:')) {
      const toolName = resource.substring(5);
      if (toolName.includes('delete') || toolName.includes('modify')) {
        return 'high-risk-operations-policy';
      }
      return 'tool-usage-policy';
    }
    
    return 'default-policy';
  }

  private async forwardToUpstream(method: string, params: any): Promise<any> {
    // Phase 3: サーキットブレーカーチェック
    if (this.isCircuitBreakerOpen(method)) {
      throw new Error(`Circuit breaker is open for ${method}`);
    }
    
    try {
      // stdioルーター経由でリクエストを転送
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };
      
      // タイムアウト付きでリクエスト実行
      const response = await Promise.race([
        this.stdioRouter.routeRequest(request),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Upstream request timeout')), 15000); // 15秒タイムアウト
        })
      ]);
      
      this.logger.debug(`Upstream response for ${method}:`, JSON.stringify(response).substring(0, 500));
      
      // JSON-RPCレスポンスから結果を抽出
      if (response.error) {
        this.recordCircuitBreakerFailure(method);
        throw new Error(response.error.message || 'Upstream server error');
      }
      
      // 成功時はサーキットブレーカーをリセット
      this.resetCircuitBreaker(method);
      
      // routeRequestの戻り値は既にresultを含んでいる
      this.logger.debug(`forwardToUpstream returning:`, JSON.stringify(response).substring(0, 200));
      return response;
    } catch (error) {
      // Phase 3: 上流サーバーエラーも厳格に処理
      this.recordCircuitBreakerFailure(method);
      this.logger.error(`Upstream forwarding failed for ${method}`, error);
      throw new Error(`Upstream service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async applyConstraints(data: any, constraints: string[]): Promise<any> {
    if (!constraints || constraints.length === 0) {
      return data;
    }

    // Phase 3: 新システムを完全に使用
    try {
      // 実際のコンテキストを作成
      const context: DecisionContext = {
        agent: 'mcp-client',
        action: 'apply-constraints',
        resource: 'data',
        purpose: 'constraint-enforcement',
        time: new Date(),
        environment: {
          transport: 'stdio'
        }
      };
      
      const result = await this.enforcementSystem.applyConstraints(constraints, data, context);
      
      // 制約適用の結果をログ
      this.logger.info('制約適用完了', {
        constraintCount: constraints.length,
        appliedConstraints: constraints
      });
      
      return result;
    } catch (error) {
      this.logger.error('制約適用エラー', error);
      
      // Phase 3: 新システム完全統合 - より堅牢なエラーハンドリング
      if (error instanceof Error) {
        // 制約適用失敗の場合、ポリシーに応じて対応
        if (error.message.includes('CRITICAL_CONSTRAINT_FAILURE')) {
          // 重要な制約の失敗時はアクセス拒否
          throw new Error(`Critical constraint failure: ${error.message}`);
        } else if (error.message.includes('SOFT_CONSTRAINT_FAILURE')) {
          // 軽微な制約の失敗時は警告ログと共に通す
          this.logger.warn('Soft constraint failure, allowing access with warning', error);
          return data;
        }
      }
      
      // Phase 3: その他のエラーも厳格に処理
      this.logger.error('制約適用で予期しないエラー、アクセス拒否', error);
      throw new Error(`Constraint application failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeObligations(obligations: string[], request: any): Promise<void> {
    if (!obligations || obligations.length === 0) {
      return;
    }

    // Phase 3: 新システムを完全に使用
    try {
      // 実際のコンテキストを作成
      const context: DecisionContext = {
        agent: 'mcp-client',
        action: request.params?.name || 'unknown',
        resource: `tool:${request.params?.name || 'unknown'}`,
        purpose: 'obligation-execution',
        time: new Date(),
        environment: {
          transport: 'stdio',
          request
        }
      };
      
      // ダミーの判定結果を作成
      const decision = {
        decision: 'PERMIT' as const,
        reason: 'Obligation execution after permission',
        confidence: 1.0,
        obligations
      };
      
      await this.enforcementSystem.executeObligations(obligations, context, decision);
      
      this.logger.info('義務実行完了', {
        obligationCount: obligations.length,
        executedObligations: obligations
      });
    } catch (error) {
      this.logger.error('義務実行エラー', error);
      
      // Phase 3: 新システム完全統合 - 重要な義務の失敗を追跡
      if (error instanceof Error) {
        // 重要な義務（監査ログ、コンプライアンス通知等）の失敗を特別扱い
        if (error.message.includes('CRITICAL_OBLIGATION_FAILURE')) {
          this.logger.error('重要な義務実行に失敗しました', {
            obligations,
            error: error.message,
            context: request.params
          });
          // 重要な義務の失敗は非同期でアラートを送信
          this.sendCriticalObligationFailureAlert(obligations, error).catch(alertError => {
            this.logger.error('アラート送信にも失敗', alertError);
          });
        }
      }
      
      // Phase 3: 義務実行の失敗はリクエスト自体には影響させない（非機能要件）
      // ただし、重要な義務の失敗は監視システムで追跡
    }
  }

  /**
   * 重要な義務実行失敗時のアラート送信
   * Phase 3: 新システム完全統合の一環
   */
  private async sendCriticalObligationFailureAlert(obligations: string[], error: Error): Promise<void> {
    try {
      // 重要な義務失敗の通知を作成
      const alertContext: DecisionContext = {
        agent: 'system-monitor',
        action: 'critical-obligation-failure',
        resource: 'obligation-system',
        purpose: 'system-monitoring',
        time: new Date(),
        environment: {
          transport: 'stdio',
          failedObligations: obligations,
          errorMessage: error.message
        }
      };

      // 通知システムを使用してアラート送信
      await this.enforcementSystem.executeObligations(
        ['緊急システムアラート送信', 'システム管理者への即座通知'], 
        alertContext, 
        {
          decision: 'PERMIT',
          reason: 'Critical obligation failure alert',
          confidence: 1.0,
          obligations: ['緊急システムアラート送信', 'システム管理者への即座通知']
        }
      );
    } catch (alertError) {
      // アラート送信自体が失敗した場合はログのみ
      this.logger.error('重要義務失敗アラートの送信に失敗', alertError);
    }
  }

  /**
   * Phase 3: 高度な監査・レポート機能
   */
  async generateComplianceReport(hours: number = 24): Promise<any> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
    
    return await this.advancedAuditSystem.generateComplianceReport({
      start: startTime,
      end: endTime
    });
  }

  async detectAnomalousAccess(threshold: number = 0.1): Promise<any[]> {
    return await this.advancedAuditSystem.detectAnomalousAccess(threshold);
  }

  async createAccessPatternAnalysis(days: number = 7): Promise<any> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
    
    return await this.advancedAuditSystem.createAccessPatternAnalysis({
      start: startTime,
      end: endTime
    });
  }

  async exportAuditLogs(format: 'JSON' | 'CSV' = 'JSON', hours: number = 24): Promise<Buffer> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
    
    return await this.advancedAuditSystem.exportAuditLogs(format, {
      start: startTime,
      end: endTime
    });
  }

  getAuditSystemStats(): any {
    return this.advancedAuditSystem.getSystemStats();
  }
  
  /**
   * ダッシュボードメトリクスを取得
   */
  async getDashboardMetrics(): Promise<any> {
    return await this.auditDashboardProvider.getDashboardMetrics();
  }
  
  /**
   * 監査システムへの参照を取得（HTTPプロキシ用）
   */
  getAuditSystem(): AdvancedAuditSystem {
    return this.advancedAuditSystem;
  }
  
  /**
   * ダッシュボードプロバイダーへの参照を取得（HTTPプロキシ用）
   */
  getAuditDashboardProvider(): AuditDashboardDataProvider {
    return this.auditDashboardProvider;
  }

  /**
   * Phase 3: サーキットブレーナー管理
   */
  private isCircuitBreakerOpen(method: string): boolean {
    const state = this.circuitBreakerState.get(method);
    if (!state || !state.isOpen) return false;
    
    // クールダウン期間が終了したかチェック
    if (Date.now() - state.lastFailure.getTime() > this.CIRCUIT_BREAKER_TIMEOUT) {
      state.isOpen = false;
      state.failures = 0;
      this.logger.info(`Circuit breaker reset for ${method}`);
      return false;
    }
    
    return true;
  }
  
  private recordCircuitBreakerFailure(method: string): void {
    const state = this.circuitBreakerState.get(method) || { failures: 0, lastFailure: new Date(), isOpen: false };
    
    state.failures++;
    state.lastFailure = new Date();
    
    if (state.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      state.isOpen = true;
      this.logger.warn(`Circuit breaker opened for ${method} after ${state.failures} failures`);
    }
    
    this.circuitBreakerState.set(method, state);
  }
  
  private resetCircuitBreaker(method: string): void {
    const state = this.circuitBreakerState.get(method);
    if (state && state.failures > 0) {
      state.failures = 0;
      state.isOpen = false;
      this.circuitBreakerState.set(method, state);
    }
  }
  
  getCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.circuitBreakerState.forEach((state, method) => {
      stats[method] = {
        failures: state.failures,
        isOpen: state.isOpen,
        lastFailure: state.lastFailure,
        timeUntilReset: state.isOpen ? 
          Math.max(0, this.CIRCUIT_BREAKER_TIMEOUT - (Date.now() - state.lastFailure.getTime())) : 0
      };
    });
    
    return stats;
  }
  
  /**
   * Phase 3: パフォーマンス統計情報取得
   */
  getCacheStats(): any {
    return this.intelligentCacheSystem.getStats();
  }

  async clearCache(): Promise<void> {
    this.intelligentCacheSystem.clear();
    this.logger.info('Cache cleared manually');
  }

  async invalidateCacheByPattern(pattern: string): Promise<number> {
    const count = this.intelligentCacheSystem.invalidateByPattern(pattern);
    this.logger.info('Cache invalidated by pattern', { pattern, count });
    return count;
  }

  getBatchJudgmentStats(): any {
    return this.batchJudgmentSystem.getStats();
  }

  getBatchQueueStatus(): any {
    return this.batchJudgmentSystem.getQueueStatus();
  }

  async forceProcessBatchQueue(): Promise<void> {
    await this.batchJudgmentSystem.forceProcessPendingRequests();
  }

  getSystemPerformanceStats(): {
    audit: any;
    cache: any;
    batchJudgment: any;
    queueStatus: any;
    anomalyStats: any;
    circuitBreaker: any;
    systemHealth: {
      upstreamServices: number;
      openCircuits: number;
      overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    };
  } {
    const circuitStats = this.getCircuitBreakerStats();
    const openCircuits = Object.values(circuitStats).filter((state: any) => state.isOpen).length;
    const totalServices = Object.keys(circuitStats).length;
    
    const overallStatus = 
      openCircuits === 0 ? 'HEALTHY' :
      openCircuits < totalServices * 0.5 ? 'DEGRADED' : 'CRITICAL';
    
    return {
      audit: this.getAuditSystemStats(),
      cache: this.getCacheStats(),
      batchJudgment: this.getBatchJudgmentStats(),
      queueStatus: this.getBatchQueueStatus(),
      anomalyStats: this.realTimeAnomalyDetector.getAnomalyStats(),
      circuitBreaker: circuitStats,
      systemHealth: {
        upstreamServices: totalServices,
        openCircuits,
        overallStatus
      }
    };
  }

  // パブリックメソッド
  addPolicy(name: string, policy: string): void {
    this.policies.set(name, policy);
    this.logger.info(`Policy added: ${name}`);
  }

  updatePolicy(name: string, policy: string): void {
    if (!this.policies.has(name)) {
      throw new Error(`Policy ${name} not found`);
    }
    this.policies.set(name, policy);
    this.logger.info(`Policy updated: ${name}`);
  }

  selectPolicy(resource: string): string {
    // シンプルな実装：リソースタイプに基づいてポリシーを選択
    if (resource.includes('tool')) {
      return this.policies.get('tool-policy') || this.policies.get('default') || '';
    }
    if (resource.includes('customer')) {
      return this.policies.get('customer-policy') || this.policies.get('default') || '';
    }
    return this.policies.get('default') || '';
  }

  addUpstreamServer(name: string, command: string, args: string[] = []): void {
    this.stdioRouter.addServerFromConfig(name, { command, args });
  }
  
  /**
   * Claude Desktop設定形式でサーバーを追加
   */
  /**
   * 起動時に上流サーバーのツールを事前読み込み（ポリシー評価なし）
   */
  async preloadUpstreamTools(): Promise<void> {
    this.logger.info('Preloading upstream server tools...');
    
    try {
      // stdioルーターが起動していることを確認
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // ポリシー判定なしでツール一覧を取得
      const result = await this.forwardToUpstream('tools/list', {});
      
      this.logger.debug('Preload result:', JSON.stringify(result, null, 2));
      
      if (result && result.result && result.result.tools) {
        const toolCount = result.result.tools.length;
        this.logger.info(`Preloaded ${toolCount} tools from upstream servers`);
        
        // ツール名をログ出力
        result.result.tools.forEach((tool: any) => {
          this.logger.info(`  - ${tool.name}: ${tool.description || 'No description'}`);
        });
      } else {
        this.logger.warn('No tools found from upstream servers');
        this.logger.debug('Result structure:', result);
      }
    } catch (error) {
      this.logger.error('Failed to preload upstream tools:', error);
      // エラーでも起動は続行
    }
  }
  
  addServerFromMCPConfig(name: string, config: MCPServerConfig): void {
    this.stdioRouter.addServerFromConfig(name, config);
  }
  
  /**
   * claude_desktop_config.jsonの内容をロード
   */
  loadDesktopConfig(config: { mcpServers: Record<string, MCPServerConfig> }): void {
    this.stdioRouter.loadServersFromDesktopConfig(config);
    
    // 上流サーバーをすぐに起動開始（非同期）
    this.logger.info('Starting upstream servers...');
    this.upstreamStartPromise = this.stdioRouter.startServers()
      .then(() => {
        this.logger.info('All upstream servers started successfully');
      })
      .catch((error) => {
        this.logger.error('Failed to start some upstream servers:', error);
      });
  }

  async start(): Promise<void> {
    // 制約・義務システムを初期化
    await this.enforcementSystem.initialize();
    this.logger.info('制約・義務実施システムを初期化しました');
    
    // 上流サーバーはloadDesktopConfigまたはaddUpstreamServerで事前に登録されている前提
    // ここでは起動のみ行う
    if (this.upstreamStartPromise) {
      // 既に起動プロセスが開始されている場合は待機
      await this.upstreamStartPromise;
    } else {
      // まだ起動していない場合は起動
      await this.stdioRouter.startServers();
    }
    
    // MCPサーバーを作成
    const transport = new StdioServerTransport();
    
    // MCPサーバーを接続（Claudeからの接続を受け付ける）
    await this.server.connect(transport);
    this.logger.info('🛡️ AEGIS MCP Proxy (stdio) started and accepting connections');
  }

  /**
   * Phase 3: システム健全性監視の開始
   */
  private startSystemHealthMonitoring(): void {
    // 5分毎にシステム統計をログ出力
    setInterval(() => {
      try {
        const stats = this.getSystemPerformanceStats();
        this.logger.info('System health check', {
          overallStatus: stats.systemHealth.overallStatus,
          openCircuits: stats.systemHealth.openCircuits,
          cacheHitRate: stats.cache.hitRate,
          totalAuditEntries: stats.audit.totalEntries
        });
        
        if (stats.systemHealth.overallStatus === 'CRITICAL') {
          this.logger.error('CRITICAL: System health is degraded, immediate attention required');
        }
      } catch (error) {
        this.logger.warn('Health monitoring failed', error);
      }
    }, 5 * 60 * 1000); // 5分毎
  }
  
  async stop(): Promise<void> {
    try {
      // Phase 3: システム停止時のクリーンアップ
      
      // 上流サーバーを停止
      await this.stdioRouter.stopServers();
      
      // MCPサーバーを停止
      await this.server.close();
      
      // キャッシュをクリア（機密情報の流出防止）
      this.intelligentCacheSystem.clear();
      
      this.logger.info('🛑 AEGIS MCP Proxy (stdio) stopped cleanly');
    } catch (error) {
      this.logger.error('Error during system shutdown', error);
      throw error;
    }
  }
}