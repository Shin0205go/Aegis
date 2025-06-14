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

export class MCPStdioPolicyProxy {
  private server: Server;
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  private contextCollector: ContextCollector;
  
  // stdioルーター
  private stdioRouter: StdioRouter;
  
  // ポリシー管理
  private policies = new Map<string, string>();
  
  private upstreamStartPromise: Promise<void> | null = null;

  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
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
        },
      }
    );
    
    this.setupHandlers();
    
    // stdioルーター初期化
    this.stdioRouter = new StdioRouter(this.logger);
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
        const decision = await this.enforcePolicy('execute', `tool:${request.params.name}`, { request });
        
        if (decision.decision === 'DENY') {
          throw new Error(`Access denied: ${decision.reason}`);
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
        }
        
        // フォールバック（空の配列を返す）
        this.logger.warn('No valid result from upstream, returning empty tools array');
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
    
    // 適用ポリシー選択
    const policyName = this.selectApplicablePolicy(resource, baseContext.agent);
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
    // stdioルーター経由でリクエストを転送
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    };
    
    const response = await this.stdioRouter.routeRequest(request);
    
    this.logger.debug(`Upstream response for ${method}:`, JSON.stringify(response).substring(0, 500));
    
    // JSON-RPCレスポンスから結果を抽出
    if (response.error) {
      throw new Error(response.error.message || 'Upstream server error');
    }
    
    // routeRequestの戻り値は既にresultを含んでいる
    return response;
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
    // リソースのコンテンツを匿名化
    if (!data || !data.contents) return data;
    
    const anonymizedContents = data.contents.map((content: any) => {
      if (content.text) {
        try {
          const parsed = JSON.parse(content.text);
          // 個人情報を匿名化
          if (parsed.name) parsed.name = '[REDACTED]';
          if (parsed.email) {
            const emailParts = parsed.email.split('@');
            parsed.email = '****@' + (emailParts[1] || 'example.com');
          }
          if (parsed.phone) parsed.phone = '[REDACTED]';
          if (parsed.address) parsed.address = '[REDACTED]';
          if (parsed.ssn) parsed.ssn = '[REDACTED]';
          
          return {
            ...content,
            text: JSON.stringify(parsed)
          };
        } catch (e) {
          // JSONでない場合はそのまま返す
          return content;
        }
      }
      return content;
    });
    
    return {
      ...data,
      contents: anonymizedContents
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
    // 設定から上流サーバーを登録
    if (this.config.mcp?.upstreamServers) {
      for (const serverConfig of this.config.mcp.upstreamServers) {
        this.stdioRouter.registerUpstreamServer(serverConfig);
      }
    }
    
    // 上流サーバーを起動
    await this.stdioRouter.startAllServers();
    
    // MCPサーバーを作成
    const transport = new StdioServerTransport();
    
    // MCPサーバーを接続（Claudeからの接続を受け付ける）
    await this.server.connect(transport);
    this.logger.info('🛡️ AEGIS MCP Proxy (stdio) started and accepting connections');
  }

  async stop(): Promise<void> {
    // 上流サーバーを停止
    await this.stdioRouter.stopServers();
    
    await this.server.close();
    this.logger.info('🛑 AEGIS MCP Proxy (stdio) stopped');
  }
}