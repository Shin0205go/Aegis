// ============================================================================
// AEGIS - Agent Governance & Enforcement Intelligence System
// メインエントリーポイント
// ============================================================================

import { AEGISController } from './core/controller.js';
import { AIJudgmentEngine } from './ai/judgment-engine.js';
import { ContextCollector } from './context/collector.js';
// Removed old WebSocket proxy import
import { MCPStdioPolicyProxy } from './mcp/stdio-proxy.js';
import { MCPHttpPolicyProxy } from './mcp/http-proxy.js';
import { PolicyAdministrator } from './policies/administrator.js';
import { Logger } from './utils/logger.js';
import { Config } from './utils/config.js';

import type {
  DecisionContext,
  PolicyDecision,
  AccessControlResult,
  NaturalLanguagePolicyDefinition
} from './types/index.js';

// メインクラス
export class AEGIS {
  private controller: AEGISController;
  private logger: Logger;
  private config: Config;

  constructor(config?: Partial<Config>) {
    this.config = new Config(config);
    this.logger = new Logger(this.config.logLevel);
    
    // コンポーネント初期化
    this.controller = new AEGISController(this.config, this.logger);
    
    this.logger.info('🛡️ AEGIS System initialized successfully');
  }

  // メインのアクセス制御メソッド
  async controlAccess(
    agentId: string,
    action: string,
    resource: string,
    purpose?: string,
    additionalContext?: Record<string, any>
  ): Promise<AccessControlResult> {
    return await this.controller.controlAccess(
      agentId,
      action,
      resource,
      purpose,
      additionalContext
    );
  }

  // ポリシー管理
  async addPolicy(name: string, policy: string, metadata?: any): Promise<string> {
    return await this.controller.addPolicy(name, policy, metadata);
  }

  // 統計情報取得
  getStatistics() {
    return this.controller.getStatistics();
  }

  // システム起動
  async start(): Promise<void> {
    await this.controller.start();
    this.logger.info('🚀 AEGIS System started successfully');
  }

  // システム停止
  async stop(): Promise<void> {
    await this.controller.stop();
    this.logger.info('🛑 AEGIS System stopped');
  }
}

// コンポーネントのエクスポート
export {
  AEGISController,
  AIJudgmentEngine,
  ContextCollector,
  // MCPPolicyProxy removed - use MCPStdioPolicyProxy or MCPHttpPolicyProxy
  MCPStdioPolicyProxy,
  MCPHttpPolicyProxy,
  PolicyAdministrator,
  type DecisionContext,
  type PolicyDecision,
  type AccessControlResult,
  type NaturalLanguagePolicyDefinition
};

// エラークラスのエクスポート
export {
  AEGISError,
  PolicyViolationError,
  ConfigurationError,
  LLMError,
  AuthenticationError,
  ResourceNotFoundError,
  ValidationError,
  TimeoutError,
  RateLimitError,
  NetworkError,
  ErrorCodes,
  ErrorHandler
} from './utils/errors.js';

// 統一MCPアーキテクチャ
export {
  // 型定義
  type UnifiedMCPConfig,
  type UnifiedServerDefinition,
  type UnifiedPromptDefinition,
  type UnifiedResourceDefinition,
  type VSCodeMCPConfig,
  type GeminiCLIConfig,
  type ClaudeConfig,
  type GeneratedConfigs,
  type ConfigGeneratorOptions,
  type ConnectedClient,
  type ClientCapabilities,
  type GatewayStats,
  type AgentsMdContent,
  type MCPNotificationType,
  type NotificationMessage,
  type ResourceSubscription,

  // コンポーネント
  CrossPlatformConfigGenerator,
  DynamicNotificationManager,
  SemanticDelegationProvider,
  AgentsMdLoader,
  UnifiedGatewayServer,
  type GatewayServerOptions
} from './unified/index.js';

// デフォルトエクスポート
export default AEGIS;