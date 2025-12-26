// ============================================================================
// 統一MCPアーキテクチャ - ゲートウェイサーバー
// 複数クライアントからの接続を一元管理するMCPプロキシゲートウェイ
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type {
  UnifiedMCPConfig,
  ConnectedClient,
  GatewayStats
} from './types.js';
import { Logger } from '../utils/logger.js';
import { DynamicNotificationManager } from './notification-manager.js';
import { SemanticDelegationProvider } from './semantic-delegation.js';
import { AgentsMdLoader } from './agents-md-loader.js';
import { CrossPlatformConfigGenerator } from './config-generator.js';

/**
 * 統一ゲートウェイサーバーオプション
 */
export interface GatewayServerOptions {
  name?: string;
  version?: string;
  port?: number;
  enablePrompts?: boolean;
  enableResources?: boolean;
  enableSubscriptions?: boolean;
  enableAgentsMd?: boolean;
  projectDir?: string;
}

/**
 * 統一ゲートウェイMCPサーバー
 *
 * 「シックサーバー・シンクライアント」アーキテクチャの中核
 * - 複数のAIクライアント（Copilot、Gemini、Claude）からの接続を受け付け
 * - プロンプトとリソースを「Source of Truth」として提供
 * - list_changed通知によるリアルタイム更新
 * - AGENTS.md統合
 */
export class UnifiedGatewayServer {
  private logger: Logger;
  private server: Server;
  private options: Required<GatewayServerOptions>;

  // コンポーネント
  private notificationManager: DynamicNotificationManager;
  private delegationProvider: SemanticDelegationProvider;
  private agentsMdLoader: AgentsMdLoader;
  private configGenerator: CrossPlatformConfigGenerator;

  // 上流サーバーへのプロキシ用ツール登録
  private upstreamTools: Map<string, {
    name: string;
    description?: string;
    inputSchema: any;
    handler: (args: any) => Promise<any>;
  }> = new Map();

  // 統計
  private stats: GatewayStats = {
    connectedClients: 0,
    activeServers: 0,
    totalRequests: 0,
    cacheHitRate: 0,
    uptime: Date.now(),
    notificationsSent: 0
  };

  constructor(logger?: Logger, options: GatewayServerOptions = {}) {
    this.logger = logger || new Logger('info');

    this.options = {
      name: options.name || 'aegis-unified-gateway',
      version: options.version || '1.0.0',
      port: options.port || 3000,
      enablePrompts: options.enablePrompts ?? true,
      enableResources: options.enableResources ?? true,
      enableSubscriptions: options.enableSubscriptions ?? true,
      enableAgentsMd: options.enableAgentsMd ?? true,
      projectDir: options.projectDir || process.cwd()
    };

    // コンポーネント初期化
    this.notificationManager = new DynamicNotificationManager(this.logger);
    this.delegationProvider = new SemanticDelegationProvider(
      this.logger,
      this.notificationManager
    );
    this.agentsMdLoader = new AgentsMdLoader(this.logger, this.delegationProvider);
    this.configGenerator = new CrossPlatformConfigGenerator(this.logger);

    // MCPサーバー作成
    this.server = new Server(
      {
        name: this.options.name,
        version: this.options.version
      },
      {
        capabilities: {
          resources: this.options.enableResources ? {
            listChanged: true,
            subscribe: this.options.enableSubscriptions
          } : undefined,
          tools: {},
          prompts: this.options.enablePrompts ? {
            listChanged: true
          } : undefined
        }
      }
    );

    // ハンドラーセットアップ
    this.setupHandlers();

    // デフォルトコンテンツ登録
    this.registerDefaultContent();
  }

  /**
   * MCPハンドラーをセットアップ
   */
  private setupHandlers(): void {
    // ============================================================================
    // ツール関連
    // ============================================================================

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.stats.totalRequests++;

      const tools = Array.from(this.upstreamTools.values()).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }));

      // ビルトインツールを追加
      tools.push(
        {
          name: 'gateway_status',
          description: 'ゲートウェイの状態を取得',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'generate_client_configs',
          description: 'クロスプラットフォーム用の設定ファイルを生成',
          inputSchema: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string', enum: ['vscode', 'gemini', 'claude'] },
                description: '生成対象のプラットフォーム'
              },
              outputDir: {
                type: 'string',
                description: '出力ディレクトリ'
              }
            }
          }
        },
        {
          name: 'reload_agents_md',
          description: 'AGENTS.mdを再読み込み',
          inputSchema: { type: 'object', properties: {} }
        }
      );

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.stats.totalRequests++;
      const { name, arguments: args } = request.params;

      // ビルトインツール
      if (name === 'gateway_status') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(this.getStats(), null, 2)
            }
          ]
        };
      }

      if (name === 'generate_client_configs') {
        const configs = this.configGenerator.generateGatewayConfigs(
          `http://localhost:${this.options.port}`
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(configs, null, 2)
            }
          ]
        };
      }

      if (name === 'reload_agents_md') {
        await this.agentsMdLoader.loadAgentsMd(this.options.projectDir);
        return {
          content: [
            {
              type: 'text',
              text: 'AGENTS.md reloaded successfully'
            }
          ]
        };
      }

      // 上流ツールを呼び出し
      const tool = this.upstreamTools.get(name);
      if (tool) {
        try {
          const result = await tool.handler(args);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    });

    // ============================================================================
    // リソース関連
    // ============================================================================

    if (this.options.enableResources) {
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
        this.stats.totalRequests++;
        return { resources: this.delegationProvider.getMCPResourcesList() };
      });

      this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        this.stats.totalRequests++;
        const { uri } = request.params;

        const result = await this.delegationProvider.getMCPResource(uri);
        if (!result) {
          throw new Error(`Resource not found: ${uri}`);
        }

        return result;
      });

      // サブスクリプション
      if (this.options.enableSubscriptions) {
        this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
          const { uri } = request.params;
          // クライアントIDは通常メタデータから取得
          const clientId = 'default-client'; // TODO: 実際のクライアントID取得
          this.notificationManager.subscribeToResource(uri, clientId);
          return {};
        });

        this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
          const { uri } = request.params;
          const clientId = 'default-client';
          this.notificationManager.unsubscribeFromResource(uri, clientId);
          return {};
        });
      }
    }

    // ============================================================================
    // プロンプト関連
    // ============================================================================

    if (this.options.enablePrompts) {
      this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        this.stats.totalRequests++;
        return { prompts: this.delegationProvider.getMCPPromptsList() };
      });

      this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        this.stats.totalRequests++;
        const { name, arguments: args } = request.params;

        const result = await this.delegationProvider.getMCPPrompt(name, args || {});
        if (!result) {
          throw new Error(`Prompt not found: ${name}`);
        }

        return result;
      });
    }
  }

  /**
   * デフォルトコンテンツを登録
   */
  private async registerDefaultContent(): Promise<void> {
    // デフォルトプロンプトとリソースを登録
    this.delegationProvider.registerDefaultPrompts();
    this.delegationProvider.registerDefaultResources();

    // AGENTS.mdを読み込み
    if (this.options.enableAgentsMd) {
      await this.agentsMdLoader.loadAgentsMd(this.options.projectDir);
      this.agentsMdLoader.registerAgentsMdPrompt();
      this.agentsMdLoader.watchAgentsMd(this.options.projectDir);
    }

    this.logger.info('Default content registered');
  }

  // ============================================================================
  // ツール登録
  // ============================================================================

  /**
   * 上流ツールを登録
   */
  registerTool(
    name: string,
    description: string,
    inputSchema: any,
    handler: (args: any) => Promise<any>
  ): void {
    this.upstreamTools.set(name, { name, description, inputSchema, handler });
    this.logger.info(`Tool registered: ${name}`);

    // 変更を通知
    this.notificationManager.notifyToolsListChanged();
  }

  /**
   * ツールを削除
   */
  unregisterTool(name: string): boolean {
    const result = this.upstreamTools.delete(name);
    if (result) {
      this.logger.info(`Tool unregistered: ${name}`);
      this.notificationManager.notifyToolsListChanged();
    }
    return result;
  }

  /**
   * 上流MCPサーバーからツールをインポート
   */
  async importToolsFromUpstream(
    serverName: string,
    toolsList: Array<{ name: string; description?: string; inputSchema: any }>,
    callHandler: (toolName: string, args: any) => Promise<any>
  ): Promise<void> {
    for (const tool of toolsList) {
      const prefixedName = `${serverName}__${tool.name}`;
      this.registerTool(
        prefixedName,
        tool.description || '',
        tool.inputSchema,
        (args) => callHandler(tool.name, args)
      );
    }

    this.stats.activeServers++;
    this.logger.info(`Imported ${toolsList.length} tools from ${serverName}`);
  }

  // ============================================================================
  // クライアント管理
  // ============================================================================

  /**
   * クライアント接続を登録
   */
  registerClient(client: ConnectedClient): void {
    this.notificationManager.registerClient(client);
    this.stats.connectedClients++;
  }

  /**
   * クライアント切断を処理
   */
  unregisterClient(clientId: string): void {
    this.notificationManager.unregisterClient(clientId);
    this.stats.connectedClients--;
  }

  // ============================================================================
  // リソース・プロンプト管理
  // ============================================================================

  /**
   * リソースを追加
   */
  addResource(
    uri: string,
    name: string,
    content: string,
    options: { description?: string; mimeType?: string } = {}
  ): void {
    this.delegationProvider.registerResource({
      uri,
      name,
      description: options.description,
      mimeType: options.mimeType || 'text/plain',
      content
    });
  }

  /**
   * リソースコンテンツを更新
   */
  async updateResource(uri: string, content: string): Promise<void> {
    await this.delegationProvider.updateResourceContent(uri, content);
  }

  /**
   * プロンプトを追加
   */
  addPrompt(
    name: string,
    description: string,
    template: string,
    options: {
      arguments?: Array<{ name: string; description: string; required: boolean }>;
      resourceRefs?: string[];
    } = {}
  ): void {
    this.delegationProvider.registerPrompt({
      name,
      description,
      template,
      arguments: options.arguments?.map(a => ({
        ...a,
        type: 'string' as const
      })),
      resourceRefs: options.resourceRefs
    });
  }

  // ============================================================================
  // 設定生成
  // ============================================================================

  /**
   * クロスプラットフォーム設定を生成
   */
  generateClientConfigs(): {
    vscode: string;
    gemini: string;
    claude: string;
    claudeCommands: string[];
  } {
    const gatewayUrl = `http://localhost:${this.options.port}`;
    const configs = this.configGenerator.generateGatewayConfigs(gatewayUrl);

    return {
      vscode: JSON.stringify(configs.vscode, null, 2),
      gemini: JSON.stringify(configs.gemini, null, 2),
      claude: JSON.stringify(configs.claude, null, 2),
      claudeCommands: configs.claudeCommands || []
    };
  }

  /**
   * 薄いクライアント設定を生成
   */
  generateThinClientConfig(): string {
    return this.configGenerator.generateThinClientConfig(this.options.name);
  }

  // ============================================================================
  // サーバー操作
  // ============================================================================

  /**
   * MCPサーバーインスタンスを取得
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * 通知マネージャーを取得
   */
  getNotificationManager(): DynamicNotificationManager {
    return this.notificationManager;
  }

  /**
   * 委譲プロバイダーを取得
   */
  getDelegationProvider(): SemanticDelegationProvider {
    return this.delegationProvider;
  }

  /**
   * AGENTS.mdローダーを取得
   */
  getAgentsMdLoader(): AgentsMdLoader {
    return this.agentsMdLoader;
  }

  /**
   * 統計を取得
   */
  getStats(): GatewayStats {
    const notificationStats = this.notificationManager.getStats();
    const delegationStats = this.delegationProvider.getStats();

    return {
      ...this.stats,
      connectedClients: notificationStats.connectedClients,
      notificationsSent: notificationStats.notificationsSent,
      uptime: Date.now() - this.stats.uptime
    };
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    this.agentsMdLoader.unwatchAll();
    this.logger.info('Gateway server cleaned up');
  }
}

export default UnifiedGatewayServer;
