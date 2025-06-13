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
import fetch from 'node-fetch';

export class MCPHttpPolicyProxy {
  private server: Server;
  private app: express.Application;
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  private contextCollector: ContextCollector;
  
  // 上流サーバー管理
  private upstreamServers = new Map<string, { name: string; url: string }>();
  
  // ポリシー管理
  private policies = new Map<string, string>();
  
  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
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
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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
  }

  private setupHandlers(): void {
    // リソース読み取りハンドラー
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any, extra: any) => {
      const clientId = extra?.sessionId || 'http-client';
      this.logger.info('Resource read request', { uri: request.params.uri, clientId });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('read', request.params.uri, { 
          request,
          clientId,
          headers: {} 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/read', request.params);
        
        // 制約適用
        const constrainedResult = await this.applyConstraints(result, decision.constraints || []);
        
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
      const clientId = extra?.sessionId || 'http-client';
      this.logger.info('List resources request', { clientId });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('list', 'resource-listing', { 
          request,
          clientId,
          headers: {} 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('resources/list', request.params || {});
        
        return result;
      } catch (error) {
        this.logger.error('List resources error', error);
        throw error;
      }
    });

    // ツール実行ハンドラー
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
      const clientId = extra?.sessionId || 'http-client';
      this.logger.info('Tool call request', { name: request.params.name, clientId });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('execute', `tool:${request.params.name}`, { 
          request,
          clientId,
          headers: {} 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('tools/call', request.params);
        
        // 義務実行
        if (decision.obligations) {
          await this.executeObligations(decision.obligations, request);
        }
        
        return result;
      } catch (error) {
        this.logger.error('Tool call error', error);
        throw error;
      }
    });

    // ツール一覧ハンドラー
    this.server.setRequestHandler(ListToolsRequestSchema, async (request: any, extra: any) => {
      const clientId = extra?.sessionId || 'http-client';
      this.logger.info('List tools request', { clientId });
      
      try {
        // ポリシー判定実行
        const decision = await this.enforcePolicy('list', 'tool-listing', { 
          request,
          clientId,
          headers: {} 
        });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
        }
        
        // 上流サーバーに転送
        const result = await this.forwardToUpstream('tools/list', request.params || {});
        
        return result;
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
      agent: context.clientId || 'http-client',
      action,
      resource,
      purpose: context.request?.params?.purpose || 'general-operation',
      time: new Date(),
      environment: {
        transport: 'http',
        headers: context.headers,
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
    
    // AI判定実行
    const decision = await this.judgmentEngine.makeDecision(policy, enrichedContext, enrichedContext.environment);
    
    return {
      ...decision,
      processingTime: Date.now() - startTime,
      policyUsed: policyName,
      context: enrichedContext
    };
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
    // 最初の利用可能な上流サーバーを選択
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
    let result = data;
    
    for (const constraint of constraints) {
      if (constraint.includes('匿名化')) {
        // データの匿名化処理
        result = this.anonymizeData(result);
      } else if (constraint.includes('ログ記録')) {
        // 詳細ログを記録
        this.logger.audit('data-access', {
          data: JSON.stringify(result).substring(0, 200),
          constraints,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return result;
  }

  private async executeObligations(obligations: string[], request: any): Promise<void> {
    for (const obligation of obligations) {
      try {
        if (obligation.includes('通知')) {
          await this.sendNotification(request, obligation);
        } else if (obligation.includes('削除')) {
          await this.scheduleDataDeletion(request, obligation);
        } else if (obligation.includes('レポート')) {
          await this.generateAccessReport(request, obligation);
        }
      } catch (error) {
        this.logger.error(`Failed to execute obligation: ${obligation}`, error);
      }
    }
  }

  private anonymizeData(data: any): any {
    // 簡単な匿名化実装
    return {
      ...data,
      _aegis_anonymized: true
    };
  }

  private async sendNotification(request: any, obligation: string): Promise<void> {
    this.logger.info('Notification sent', { request, obligation });
  }

  private async scheduleDataDeletion(request: any, obligation: string): Promise<void> {
    this.logger.info('Data deletion scheduled', { request, obligation });
  }

  private async generateAccessReport(request: any, obligation: string): Promise<void> {
    this.logger.info('Access report generated', { request, obligation });
  }

  // パブリックメソッド
  addPolicy(name: string, policy: string): void {
    this.policies.set(name, policy);
    this.logger.info(`Policy added: ${name}`);
  }

  addUpstreamServer(name: string, url: string): void {
    this.upstreamServers.set(name, { name, url });
    this.logger.info(`Upstream server configured: ${name} -> ${url}`);
  }

  async start(): Promise<void> {
    const port = this.config.mcpProxy.port || 8080;
    
    // ヘルスチェックエンドポイント
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        upstreamServers: Array.from(this.upstreamServers.entries()).map(([name, server]) => ({
          name,
          url: server.url
        }))
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
    
    // MCPエンドポイント
    this.app.post('/mcp', async (req, res) => {
      // StreamableHTTPServerTransportで処理されるため、ここでは何もしない
      res.status(404).json({ error: 'Use MCP client SDK to connect' });
    });
    
    // HTTPトランスポートでサーバー起動
    const transport = new StreamableHTTPServerTransport({
      endpoint: '/mcp/messages',
      app: this.app,
      sessionIdGenerator: () => uuidv4()
    } as any);
    
    await this.server.connect(transport);
    
    // Expressサーバー起動
    const httpServer = this.app.listen(port, () => {
      this.logger.info(`🛡️ AEGIS MCP Proxy (HTTP) started on port ${port}`);
      this.logger.info(`📡 MCP endpoint: http://localhost:${port}/mcp/messages`);
      this.logger.info(`🔗 Health check: http://localhost:${port}/health`);
      this.logger.info(`📋 Policies API: http://localhost:${port}/policies`);
    });
    
    // サーバーインスタンスを保存
    (this as any).httpServer = httpServer;
  }

  async stop(): Promise<void> {
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
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}