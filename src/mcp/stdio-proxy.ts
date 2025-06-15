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
  
  private upstreamStartPromise: Promise<void> | null = null;

  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // 制約・義務実施システム初期化
    this.enforcementSystem = new EnforcementSystem();
    
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

  async stop(): Promise<void> {
    // 上流サーバーを停止
    await this.stdioRouter.stopServers();
    
    await this.server.close();
    this.logger.info('🛑 AEGIS MCP Proxy (stdio) stopped');
  }
}