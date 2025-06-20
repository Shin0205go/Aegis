// ============================================================================
// AEGIS - MCP Policy Enforcement Point (Streamable HTTP トランスポート版)
// MCP公式仕様に準拠したHTTPベースの実装
// ============================================================================

import { 
  StreamableHTTPServerTransport,
  StreamableHTTPServerTransportOptions 
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema, 
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
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
import { EnforcementSystem } from '../core/enforcement.js';
import { AdvancedAuditSystem } from '../audit/advanced-audit-system.js';
import { AuditDashboardDataProvider } from '../audit/audit-dashboard-data.js';
import { createAuditEndpoints } from '../api/audit-endpoints.js';
import { createODRLEndpoints } from '../api/odrl-endpoints.js';
import { StdioRouter, MCPServerConfig } from './stdio-router.js';
import { HybridPolicyEngine } from '../policy/hybrid-policy-engine.js';
// Use Node.js built-in fetch (Node 18+)

export class MCPHttpPolicyProxy {
  private server: Server;
  private app: express.Application;
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  private hybridPolicyEngine: HybridPolicyEngine;
  private contextCollector: ContextCollector;
  private enforcementSystem: EnforcementSystem;
  
  // 上流サーバー管理
  private upstreamServers = new Map<string, { name: string; url: string }>();
  
  // ポリシー管理
  private policies = new Map<string, string>();
  
  // Phase 3: 高度な監査システム
  private advancedAuditSystem: AdvancedAuditSystem;
  private auditDashboardProvider: AuditDashboardDataProvider;
  
  // リクエストコンテキスト管理
  private requestContext = new Map<string, any>();
  
  // stdio上流サーバー管理（ブリッジモード）
  private stdioRouter?: StdioRouter;
  private bridgeMode: boolean = false;
  
  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    
    // ハイブリッドポリシーエンジン初期化
    this.hybridPolicyEngine = new HybridPolicyEngine(judgmentEngine, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.7, // AI判定の信頼度閾値を下げる（現在の厳格すぎる問題に対処）
      cacheEnabled: true,
      cacheTTL: 300000 // 5分
    });
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // 制約・義務実施システム初期化
    this.enforcementSystem = new EnforcementSystem();
    
    // Phase 3: 高度な監査システム初期化
    this.advancedAuditSystem = new AdvancedAuditSystem();
    this.auditDashboardProvider = new AuditDashboardDataProvider(this.advancedAuditSystem);
    
    // Express アプリ作成
    this.app = express();
    this.setupMiddleware();
    
    // MCPサーバー作成
    this.server = new Server(
      {
        name: 'aegis-policy-proxy-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
    
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      // CORS 設定
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Agent-ID, X-Agent-Type, X-Agent-Metadata, mcp-session-id');
      
      // リクエストコンテキストを保存
      const sessionId = (Array.isArray(req.headers['mcp-session-id']) ? req.headers['mcp-session-id'][0] : req.headers['mcp-session-id']) || uuidv4();
      this.requestContext.set(sessionId, {
        headers: req.headers,
        sessionId,
        timestamp: Date.now()
      });
      
      // レスポンス送信後にコンテキストをクリア
      res.on('finish', () => {
        // 古いコンテキストをクリーンアップ（1時間以上経過したもの）
        const now = Date.now();
        this.requestContext.forEach((ctx, sid) => {
          if (now - ctx.timestamp > 3600000) { // 1時間
            this.requestContext.delete(sid);
          }
        });
      });
      
      next();
    });
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
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any, extra: any) => {
      const sessionId = extra?.sessionId || 'http-client';
      const context = this.requestContext.get(sessionId) || { headers: {} };
      
      this.logger.info('Resource read request', { 
        uri: request.params.uri, 
        sessionId,
        agentId: context.headers['x-agent-id'] || context.headers['X-Agent-ID'] 
      });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('read', request.params.uri, { 
          request,
          clientId: sessionId,
          headers: context.headers 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/read', request.params);
        
        // ブリッジモードの場合、resultはすでに正しい形式
        let contents = result;
        if (this.bridgeMode && result && result.result) {
          contents = result.result.contents || result.result;
        }
        
        // 制約適用
        const constrainedResult = await this.applyConstraints(contents, decision.constraints || []);
        
        return {
          contents: constrainedResult
        };
      } catch (error) {
        this.logger.error('Resource read error', error);
        throw error;
      }
    });

    // リソース一覧ハンドラー
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request: any, extra: any) => {
      const sessionId = extra?.sessionId || 'http-client';
      const context = this.requestContext.get(sessionId) || { headers: {} };
      
      this.logger.info('List resources request', { 
        sessionId,
        agentId: context.headers['x-agent-id'] || context.headers['X-Agent-ID'] 
      });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('list', 'resource-listing', { 
          request,
          clientId: sessionId,
          headers: context.headers 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/list', request.params || {});
        
        // ブリッジモードの場合、resultはすでに正しい形式
        if (this.bridgeMode && result && result.result) {
          return result.result;
        }
        
        return result;
      } catch (error) {
        this.logger.error('List resources error', error);
        throw error;
      }
    });

    // ツール実行ハンドラー
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
      const sessionId = extra?.sessionId || 'http-client';
      const context = this.requestContext.get(sessionId) || { headers: {} };
      
      this.logger.info('Tool call request', { 
        name: request.params.name, 
        sessionId,
        agentId: context.headers['x-agent-id'] || context.headers['X-Agent-ID'] 
      });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('execute', `tool:${request.params.name}`, { 
          request,
          clientId: sessionId,
          headers: context.headers 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // ブリッジモードの場合、プレフィックスを除去してから転送
        const forwardParams = { ...request.params };
        if (this.bridgeMode) {
          // filesystem__read_file -> read_file のように変換
          const toolName = request.params.name;
          const prefixMatch = toolName.match(/^([^_]+)__(.+)$/);
          if (prefixMatch) {
            forwardParams.name = prefixMatch[2];
          }
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('tools/call', forwardParams);
        
        // 義務実行
        if (decision.obligations) {
          await this.executeObligations(decision.obligations, request);
        }
        
        // ブリッジモードの場合、resultはすでに正しい形式
        if (this.bridgeMode && result && result.result) {
          return result.result;
        }
        
        return result;
      } catch (error) {
        this.logger.error('Tool call error', error);
        throw error;
      }
    });

    // ツール一覧ハンドラー
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: any, extra: any) => {
      const sessionId = extra?.sessionId || 'http-client';
      const context = this.requestContext.get(sessionId) || { headers: {} };
      
      this.logger.info('List tools request', { 
        sessionId,
        agentId: context.headers['x-agent-id'] || context.headers['X-Agent-ID'] 
      });
      
      try {
        // ツールリストは基本的に許可（読み取り専用操作）
        // TODO: ポリシー判定を調整後に再有効化
        /*
        const decision = await this.enforcePolicy('list', 'tool-listing', { 
          request,
          clientId: sessionId,
          headers: context.headers 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        */
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('tools/list', request.params || {});
        
        // ブリッジモードの場合、resultはすでに正しい形式
        if (this.bridgeMode && result && result.result) {
          return result.result;
        }
        
        return result;
      } catch (error) {
        this.logger.error('List tools error', error);
        throw error;
      }
    });
  }

  private async enforcePolicy(action: string, resource: string, context: any): Promise<AccessControlResult> {
    const startTime = Date.now();
    
    // ヘッダーからエージェント情報を取得
    const agentId = context.headers?.['X-Agent-ID'] || context.headers?.['x-agent-id'] || context.clientId || 'http-client';
    const agentType = context.headers?.['X-Agent-Type'] || context.headers?.['x-agent-type'] || 'unknown';
    const agentMetadata = context.headers?.['X-Agent-Metadata'] || context.headers?.['x-agent-metadata'];
    
    // 基本コンテキスト構築
    const baseContext: DecisionContext = {
      agent: agentId,
      action,
      resource,
      purpose: context.request?.params?.purpose || 'general-operation',
      time: new Date(),
      environment: {
        transport: 'http',
        headers: context.headers,
        agentType,
        agentMetadata: agentMetadata ? JSON.parse(agentMetadata) : {},
        ...context
      }
    };
    
    // コンテキスト拡張
    const enrichedContext = await this.contextCollector.enrichContext(baseContext);
    
    // 適用ポリシー選択
    const policyName = this.selectApplicablePolicy(resource);
    const policy = this.policies.get(policyName);
    
    if (!policy) {
      this.logger.warn(`No policy found for resource: ${resource}`);
      // ポリシーがない場合はデフォルトで許可
      return {
        decision: 'PERMIT',
        reason: 'No policy defined',
        confidence: 1.0,
        processingTime: Date.now() - startTime,
        policyUsed: 'default'
      };
    }
    
    // ハイブリッドポリシーエンジンで判定実行
    const decision = await this.hybridPolicyEngine.decide(enrichedContext, policy);
    
    const result = {
      ...decision,
      processingTime: Date.now() - startTime,
      policyUsed: policyName,
      context: enrichedContext
    };
    
    // Phase 3: 監査ログ記録
    try {
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await this.advancedAuditSystem.recordAuditEntry(
        enrichedContext,
        decision,
        policyName,
        result.processingTime,
        outcome,
        {
          requestType: action,
          resourcePath: resource,
          transport: 'http'
        }
      );
    } catch (auditError) {
      this.logger.error('Failed to record audit entry', auditError);
    }
    
    return result;
  }

  private selectApplicablePolicy(resource: string): string {
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
    // ブリッジモードの場合はstdioルーターを使用
    if (this.bridgeMode && this.stdioRouter) {
      try {
        const request = {
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        };
        
        const response = await this.stdioRouter.routeRequest(request);
        
        // stdioルーターのレスポンスを処理
        if (response.error) {
          throw new Error(response.error.message || 'Upstream server error');
        }
        
        // routeRequestの戻り値は既にresultを含んでいる
        return response;
      } catch (error) {
        this.logger.error('Failed to forward to stdio upstream', error);
        throw error;
      }
    }
    
    // HTTPモードの場合は従来の処理
    const upstreamServer = Array.from(this.upstreamServers.values())[0];
    
    if (!upstreamServer) {
      throw new Error('No upstream servers available');
    }
    
    try {
      // HTTPを介して上流サーバーと通信
      const response = await fetch(`${upstreamServer.url}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Upstream server error: ${response.statusText}`);
      }
      
      const result = await response.json() as any;
      return result.result || result;
    } catch (error) {
      this.logger.error(`Failed to forward to upstream: ${upstreamServer.name}`, error);
      throw error;
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
        agent: 'http-client',
        action: 'apply-constraints',
        resource: 'data',
        purpose: 'constraint-enforcement',
        time: new Date(),
        environment: {
          transport: 'http'
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
      // エラー時はデータをそのまま返す（フェイルオープン）
      return data;
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
        agent: 'http-client',
        action: request.params?.name || 'unknown',
        resource: `tool:${request.params?.name || 'unknown'}`,
        purpose: 'obligation-execution',
        time: new Date(),
        environment: {
          transport: 'http',
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
      // 義務実行の失敗はリクエスト自体には影響させない
    }
  }

  // レガシーメソッドは削除（新システムで完全に処理）

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

  addUpstreamServer(name: string, url: string): void {
    this.upstreamServers.set(name, { name, url });
    this.logger.info(`Upstream server configured: ${name} -> ${url}`);
  }
  
  /**
   * ブリッジモードを有効化してstdio上流サーバーをサポート
   */
  enableBridgeMode(): void {
    if (!this.stdioRouter) {
      this.stdioRouter = new StdioRouter(this.logger);
      this.bridgeMode = true;
      this.logger.info('Bridge mode enabled - stdio upstream servers supported');
    }
  }
  
  /**
   * stdio上流サーバーを追加（ブリッジモード）
   */
  addStdioUpstreamServer(name: string, config: MCPServerConfig): void {
    if (!this.stdioRouter) {
      this.enableBridgeMode();
    }
    this.stdioRouter!.addServerFromConfig(name, config);
    this.logger.info(`Stdio upstream server configured: ${name}`);
  }
  
  /**
   * Claude Desktop設定からstdio上流サーバーをロード
   */
  loadStdioServersFromConfig(config: { mcpServers: Record<string, MCPServerConfig> }): void {
    if (!this.stdioRouter) {
      this.enableBridgeMode();
    }
    this.stdioRouter!.loadServersFromDesktopConfig(config);
    const serverNames = Object.keys(config.mcpServers)
      .filter(name => name !== 'aegis-proxy' && name !== 'aegis');
    this.logger.info(`Loaded ${serverNames.length} stdio upstream servers: ${serverNames.join(', ')}`);
  }

  async start(): Promise<void> {
    const port = this.config.mcpProxy.port || 8080;
    
    // 制約・義務システムを初期化
    await this.enforcementSystem.initialize();
    this.logger.info('制約・義務実施システムを初期化しました');
    
    // ブリッジモードの場合はstdioサーバーを起動
    if (this.bridgeMode && this.stdioRouter) {
      this.logger.info('Starting stdio upstream servers in bridge mode...');
      await this.stdioRouter.startServers();
      this.logger.info('Stdio upstream servers started');
    }
    
    // 設定から上流サーバーを登録
    if (this.config.mcpProxy?.upstreamServers) {
      for (const [name, url] of Object.entries(this.config.mcpProxy.upstreamServers)) {
        this.addUpstreamServer(name, url);
      }
    }
    
    // 静的ファイルの提供（監査ダッシュボード用）
    this.app.use('/public', express.static('public'));
    
    // ヘルスチェックエンドポイント
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        version: '1.0.0',
        upstream: Array.from(this.upstreamServers.entries()).reduce((acc, [name, server]) => {
          acc[name] = {
            url: server.url,
            status: 'healthy'
          };
          return acc;
        }, {} as any)
      });
    });

    // ポリシー管理API
    this.app.get('/policies', (req, res) => {
      res.json({
        policies: Array.from(this.policies.keys())
      });
    });

    this.app.post('/policies/:name', (req, res) => {
      const { name } = req.params;
      const { policy } = req.body;
      
      this.policies.set(name, policy);
      this.logger.info(`Policy updated: ${name}`);
      
      res.json({ success: true, message: `Policy ${name} updated` });
    });
    
    // Phase 3: 監査APIエンドポイントを追加
    const auditRouter = createAuditEndpoints({
      auditSystem: this.advancedAuditSystem,
      dashboardProvider: this.auditDashboardProvider
    });
    this.app.use('/audit', auditRouter);
    
    // Enhanced Audit Statistics API
    const { createAuditStatisticsAPI } = await import('../api/audit-statistics-api.js');
    const statsRouter = createAuditStatisticsAPI(this.advancedAuditSystem);
    this.app.use('/audit', statsRouter);
    
    // ODRL Policy APIエンドポイントを追加
    const odrlRouter = createODRLEndpoints(this.hybridPolicyEngine);
    this.app.use('/odrl', odrlRouter);
    
    // HTTPトランスポートを初期化
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => {
        // HTTPモードでは各リクエストが独立しているため、新規生成
        return uuidv4();
      },
      enableJsonResponse: false // SSEストリーミングを有効化
    });
    
    // POST: JSON-RPCリクエストの処理
    this.app.post('/mcp/messages', async (req, res) => {
      await transport.handleRequest(req, res, req.body);
    });
    
    // GET: SSEストリームの確立
    this.app.get('/mcp/messages', async (req, res) => {
      await transport.handleRequest(req, res);
    });
    
    // DELETE: セッションの終了
    this.app.delete('/mcp/messages', async (req, res) => {
      await transport.handleRequest(req, res);
    });
    
    await this.server.connect(transport);
    
    // Expressサーバー起動（Promiseでラップ）
    await new Promise<void>((resolve, reject) => {
      let server: any;
      server = this.app.listen(port, () => {
        this.logger.info(`🛡️ AEGIS MCP Proxy (HTTP) started on port ${port}`);
        this.logger.info(`📡 MCP endpoint: http://localhost:${port}/mcp/messages`);
        this.logger.info(`🌐 Web UI: http://localhost:${port}/`);
        this.logger.info(`🔗 Health check: http://localhost:${port}/health`);
        this.logger.info(`📋 Policy Management API: http://localhost:${port}/policies`);
        this.logger.info(`📊 Audit API: http://localhost:${port}/audit`);
        this.logger.info(`🔐 ODRL API: http://localhost:${port}/odrl`);
        
        // サーバーインスタンスを保存
        (this as any).httpServer = server;
        resolve();
      });
      
      server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    // stdio上流サーバーを停止
    if (this.bridgeMode && this.stdioRouter) {
      await this.stdioRouter.stopServers();
      this.logger.info('Stdio upstream servers stopped');
    }
    
    // HTTPサーバーを停止
    const httpServer = (this as any).httpServer;
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    
    await this.server.close();
    this.logger.info('🛑 AEGIS MCP Proxy (HTTP) stopped');
  }

  // ============================================================================
  // Helper Functions (from API server)
  // ============================================================================

  private generatePolicySuggestions(policy: string): string[] {
    const suggestions = [];
    
    // 時間指定の曖昧さをチェック
    if (policy.includes('営業時間') && !policy.match(/\d+時/)) {
      suggestions.push('「営業時間」を「平日9時から18時」のように具体的に指定することをお勧めします');
    }
    
    // 対象の明確化
    if (policy.includes('外部') && !policy.includes('外部エージェント')) {
      suggestions.push('「外部」が何を指すか明確にしてください（例：外部エージェント、外部ネットワーク）');
    }
    
    // 義務の明確化
    if (policy.includes('ログ') && !policy.match(/\d+日/)) {
      suggestions.push('ログの保存期間を明確に指定してください（例：30日間）');
    }
    
    return suggestions;
  }

  private detectPolicyWarnings(policy: string): string[] {
    const warnings = [];
    
    // 矛盾チェック
    if (policy.includes('すべて許可') && policy.includes('禁止')) {
      warnings.push('「すべて許可」と「禁止」が同じポリシー内に存在します。矛盾している可能性があります');
    }
    
    // セキュリティ警告
    if (policy.includes('制限なし') || policy.includes('無制限')) {
      warnings.push('セキュリティリスク: 無制限なアクセスは推奨されません');
    }
    
    // 曖昧な表現
    const ambiguousTerms = ['適切に', '必要に応じて', '場合によって'];
    ambiguousTerms.forEach(term => {
      if (policy.includes(term)) {
        warnings.push(`曖昧な表現「${term}」が含まれています。具体的な条件を指定してください`);
      }
    });
    
    return warnings;
  }
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}