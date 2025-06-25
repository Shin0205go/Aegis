// ============================================================================
// AEGIS - MCP Server Starter
// MCPサーバー起動処理の責務分離
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { Config } from '../utils/config.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { MCPStdioPolicyProxy } from './stdio-proxy.js';
import { MCPHttpPolicyProxy } from './http-proxy.js';
import { MCPPolicyProxyBase } from './base-proxy.js';
import type { AEGISConfig } from '../types/index.js';
import { SERVER } from '../constants/index.js';

export interface ServerStartOptions {
  transport: 'stdio' | 'http';
  logLevel?: string;
}

export interface ServerComponents {
  config: AEGISConfig;
  logger: Logger;
  judgmentEngine: AIJudgmentEngine | null;
  proxy: MCPPolicyProxyBase;
}

/**
 * MCPサーバー起動を管理するクラス
 */
export class MCPServerStarter {
  private logger: Logger;
  private config: AEGISConfig;
  private judgmentEngine: AIJudgmentEngine | null = null;
  private proxy: MCPPolicyProxyBase | null = null;

  constructor(private options: ServerStartOptions) {
    const logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.logger = new Logger(logLevel);
    this.config = new Config();
  }

  /**
   * サーバーを起動
   */
  async start(): Promise<void> {
    try {
      this.logger.info(`🚀 Starting AEGIS MCP Proxy Server (${this.options.transport} transport)...`);

      // 各ステップを順番に実行
      await this.initializeAIEngine();
      await this.createProxy();
      await this.loadUpstreamServers();
      await this.loadDefaultPolicies();
      await this.startServer();
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start MCP Proxy Server:', error);
      process.exit(1);
    }
  }

  /**
   * AI判定エンジンの初期化
   */
  private async initializeAIEngine(): Promise<void> {
    if (!this.config.llm.apiKey) {
      this.logger.warn('⚠️  AIのAPIキーが設定されていません。ODRLポリシーのみで動作します。');
      this.logger.warn('   AI判定を有効にするには、環境変数 OPENAI_API_KEY または ANTHROPIC_API_KEY を設定してください。');
      return;
    }

    this.logger.info('Initializing AI Judgment Engine...');
    this.judgmentEngine = new AIJudgmentEngine(this.config.llm);
  }

  /**
   * プロキシの作成
   */
  private async createProxy(): Promise<void> {
    if (this.options.transport === 'stdio') {
      this.logger.info('Using stdio transport (MCP standard)');
      this.proxy = new MCPStdioPolicyProxy(this.config, this.logger, this.judgmentEngine);
    } else {
      this.logger.info('Using HTTP transport (MCP standard)');
      this.proxy = new MCPHttpPolicyProxy(this.config, this.logger, this.judgmentEngine);
    }
  }

  /**
   * 上流サーバーの設定を読み込み
   */
  private async loadUpstreamServers(): Promise<void> {
    if (!this.proxy) return;

    if (this.options.transport === 'stdio') {
      await this.loadStdioUpstreamServers();
    } else {
      await this.loadHttpUpstreamServers();
    }
  }

  /**
   * stdioモード用の上流サーバー設定
   */
  private async loadStdioUpstreamServers(): Promise<void> {
    const stdioProxy = this.proxy as MCPStdioPolicyProxy;
    
    // 1. aegis-mcp-config.jsonから読み込み（優先）
    const aegisConfigPath = path.join(process.cwd(), 'aegis-mcp-config.json');
    
    if (fs.existsSync(aegisConfigPath)) {
      try {
        const configContent = fs.readFileSync(aegisConfigPath, 'utf-8');
        const aegisConfig = JSON.parse(configContent);
        
        if (aegisConfig.mcpServers) {
          this.logger.info('Loading upstream servers from aegis-mcp-config.json...');
          stdioProxy.loadDesktopConfig(aegisConfig);
          
          const serverNames = Object.keys(aegisConfig.mcpServers)
            .filter(name => name !== 'aegis-proxy' && name !== 'aegis');
          this.logger.info(`  ✓ Loaded ${serverNames.length} servers: ${serverNames.join(', ')}`);
          return;
        }
      } catch (error) {
        this.logger.warn('Failed to load aegis-mcp-config.json:', error);
      }
    }
    
    // 2. デフォルト設定から読み込み
    const defaultConfigPath = path.join(process.cwd(), 'claude_desktop_config.json');
    
    if (fs.existsSync(defaultConfigPath)) {
      try {
        const configContent = fs.readFileSync(defaultConfigPath, 'utf-8');
        const desktopConfig = JSON.parse(configContent);
        
        if (desktopConfig.mcpServers) {
          this.logger.info('Loading upstream servers from claude_desktop_config.json...');
          stdioProxy.loadDesktopConfig(desktopConfig);
          
          const serverNames = Object.keys(desktopConfig.mcpServers)
            .filter(name => name !== 'aegis-proxy' && name !== 'aegis');
          this.logger.info(`  ✓ Loaded ${serverNames.length} servers: ${serverNames.join(', ')}`);
        }
      } catch (error) {
        this.logger.warn('Failed to load claude_desktop_config.json:', error);
      }
    }
  }

  /**
   * HTTPモード用の上流サーバー設定
   */
  private async loadHttpUpstreamServers(): Promise<void> {
    const httpProxy = this.proxy as MCPHttpPolicyProxy;
    
    // ブリッジモードを有効化
    this.logger.info('Bridge mode enabled - stdio upstream servers supported');
    
    // aegis-mcp-config.jsonから読み込み
    const aegisConfigPath = path.join(process.cwd(), 'aegis-mcp-config.json');
    
    if (fs.existsSync(aegisConfigPath)) {
      try {
        const configContent = fs.readFileSync(aegisConfigPath, 'utf-8');
        const aegisConfig = JSON.parse(configContent);
        
        if (aegisConfig.mcpServers) {
          this.logger.info('Loading stdio upstream servers via bridge mode from aegis-mcp-config.json...');
          httpProxy.loadBridgedStdioServers(aegisConfig.mcpServers);
          
          const serverNames = Object.keys(aegisConfig.mcpServers)
            .filter(name => name !== 'aegis-proxy' && name !== 'aegis');
          this.logger.info(`  ✓ Loaded ${serverNames.length} stdio servers in bridge mode: ${serverNames.join(', ')}`);
        }
      } catch (error) {
        this.logger.warn('Failed to load aegis-mcp-config.json:', error);
      }
    }
  }

  /**
   * デフォルトポリシーの読み込み
   */
  private async loadDefaultPolicies(): Promise<void> {
    if (!this.proxy) return;

    this.logger.info('Loading default policies...');
    
    const policies = [
      { name: 'customer-data-policy', content: this.getCustomerDataPolicy() },
      { name: 'email-access-policy', content: this.getEmailAccessPolicy() },
      { name: 'file-system-policy', content: this.getFileSystemPolicy() },
      { name: 'high-risk-operations-policy', content: this.getHighRiskOperationsPolicy() },
      { name: 'default-policy', content: this.getDefaultPolicy() },
      { name: 'after-hours-policy', content: this.getAfterHoursPolicy() },
      { name: 'claude-desktop-policy', content: this.getClaudeDesktopPolicy() },
      { name: 'tool-control-policy', content: this.getToolControlPolicy() }
    ];

    for (const { name, content } of policies) {
      this.proxy.addPolicy(name, content);
      this.logger.info(`  ✓ Loaded policy: ${name}`);
    }
  }

  /**
   * サーバーの起動
   */
  private async startServer(): Promise<void> {
    if (!this.proxy) return;

    await this.proxy.start();

    if (this.options.transport === 'stdio') {
      this.logger.info('AEGIS MCP Proxy Server is running (stdio mode)');
      this.logger.info('Waiting for MCP requests via stdin...');
    } else {
      const httpProxy = this.proxy as MCPHttpPolicyProxy;
      const port = this.config.mcpProxy.port;
      
      this.logger.info(`🛡️ AEGIS MCP Proxy (HTTP) started on port ${port}`);
      this.logger.info(`📡 MCP endpoint: http://localhost:${port}/mcp/messages`);
      this.logger.info(`🌐 Web UI: http://localhost:${port}/`);
      this.logger.info(`🔗 Health check: http://localhost:${port}/health`);
      this.logger.info(`📋 Policy Management API: http://localhost:${port}/policies`);
      this.logger.info(`📊 Audit API: http://localhost:${port}/audit`);
      this.logger.info(`🔐 ODRL API: http://localhost:${port}/odrl`);
    }

    this.logger.info(`✅ AEGIS MCP Proxy Server is running (${this.options.transport} mode)`);
  }

  /**
   * グレースフルシャットダウンの設定
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`\n${signal} received. Starting graceful shutdown...`);

      try {
        if (this.proxy) {
          await this.proxy.stop();
        }
        this.logger.info('✅ AEGIS MCP Proxy Server stopped successfully');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  // ポリシー定義メソッド（簡潔化のため省略）
  private getCustomerDataPolicy(): string {
    return `
顧客データアクセスポリシー：
- 顧客データへのアクセスは、顧客サポート目的でのみ許可される
- 営業時間内（平日9:00-18:00）のアクセスを基本とする
- 緊急時は承認者の事前許可により時間外アクセスを許可
- 全てのアクセスは監査ログに記録される
- 個人情報を含むデータは匿名化処理を適用する`;
  }

  private getEmailAccessPolicy(): string {
    return `
メールアクセスポリシー：
- メールの読み取りは業務目的でのみ許可
- 送信者/受信者のプライバシーを保護する
- 添付ファイルのダウンロードは制限する
- アクセスログを記録し、30日間保管する`;
  }

  private getFileSystemPolicy(): string {
    return `
ファイルシステムアクセスポリシー：
- システムファイルへのアクセスは禁止
- 機密ファイルへのアクセスは役職者のみ許可
- ファイル操作は全て記録される
- 大量ファイルアクセスは異常として検知`;
  }

  private getHighRiskOperationsPolicy(): string {
    return `
高リスク操作ポリシー：
- データ削除・変更操作は承認が必要
- バッチ操作は制限される
- 全操作が詳細ログに記録される
- 異常なパターンは即座にアラート`;
  }

  private getDefaultPolicy(): string {
    return `
デフォルトアクセスポリシー：
- 基本的な読み取り操作は許可
- 書き込み・削除操作は制限
- 営業時間内のアクセスを推奨
- 異常なアクセスパターンを監視`;
  }

  private getAfterHoursPolicy(): string {
    return `
時間外アクセスポリシー：
- 営業時間外（18:00-翌9:00）のアクセスは原則禁止
- 緊急対応時のみ、事前承認により許可
- 全ての時間外アクセスは特別監査対象
- アクセス理由の記録が必須`;
  }

  private getClaudeDesktopPolicy(): string {
    return `
Claude Desktopエージェント専用ポリシー：
- Claude Desktopからのアクセスは基本的に許可
- ローカルファイルシステムへの読み取りアクセスを許可
- 実行可能ファイルの実行は慎重に判断
- プライバシーに配慮した動作を優先`;
  }

  private getToolControlPolicy(): string {
    return `
ツール制御ポリシー：
- 登録済みツールのみ実行を許可
- 危険なコマンド（rm -rf等）は禁止
- ネットワークアクセスを伴うツールは監視
- 実行履歴を完全に記録`;
  }
}