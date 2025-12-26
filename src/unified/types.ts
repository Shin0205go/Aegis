// ============================================================================
// 統一MCPアーキテクチャ - 型定義
// クロスプラットフォーム構成と動的コンテキスト管理
// ============================================================================

/**
 * マスター構成定義（プラットフォーム非依存）
 */
export interface UnifiedMCPConfig {
  version: string;
  servers: UnifiedServerDefinition[];
  prompts: UnifiedPromptDefinition[];
  resources: UnifiedResourceDefinition[];
  globalSettings: GlobalSettings;
}

/**
 * 統一サーバー定義
 */
export interface UnifiedServerDefinition {
  name: string;
  description?: string;
  command: string;
  args: string[];
  envVars: string[];
  transport: 'stdio' | 'sse' | 'http';
  clients: {
    copilot: boolean;
    gemini: boolean;
    claude: boolean;
  };
  // 認証設定
  auth?: {
    type: 'none' | 'oauth' | 'api-key' | 'env-var';
    config?: Record<string, string>;
  };
  // ヘルスチェック設定
  healthCheck?: {
    enabled: boolean;
    interval?: number;
    timeout?: number;
  };
}

/**
 * 統一プロンプト定義（意味論的委譲用）
 */
export interface UnifiedPromptDefinition {
  name: string;
  description: string;
  template: string;
  arguments?: PromptArgument[];
  // プロンプトが参照するリソース
  resourceRefs?: string[];
  // 適用条件
  conditions?: {
    agents?: string[];
    contexts?: string[];
    timeRanges?: TimeRange[];
  };
}

/**
 * プロンプト引数定義
 */
export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  enum?: string[];
}

/**
 * 統一リソース定義
 */
export interface UnifiedResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  // 静的コンテンツまたは動的生成
  content?: string;
  generator?: ResourceGenerator;
  // サブスクリプション対応
  subscription?: {
    enabled: boolean;
    updateInterval?: number;
  };
  // アクセス制御
  access?: {
    agents?: string[];
    roles?: string[];
    requireAuth?: boolean;
  };
}

/**
 * リソース生成器設定
 */
export interface ResourceGenerator {
  type: 'file' | 'database' | 'api' | 'custom';
  source: string;
  transform?: string; // JSONPath or transform function
  cache?: {
    enabled: boolean;
    ttl: number;
  };
}

/**
 * 時間範囲
 */
export interface TimeRange {
  start: string; // HH:mm format
  end: string;
  days?: number[]; // 0-6, Sunday = 0
  timezone?: string;
}

/**
 * グローバル設定
 */
export interface GlobalSettings {
  // デフォルトのクライアント許可設定
  defaultClients: {
    copilot: boolean;
    gemini: boolean;
    claude: boolean;
  };
  // 環境変数のプレフィックス
  envPrefix?: string;
  // ログ設定
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };
  // セキュリティ設定
  security?: {
    allowedOrigins?: string[];
    requireAuth?: boolean;
  };
}

// ============================================================================
// プラットフォーム固有の構成型
// ============================================================================

/**
 * VS Code / GitHub Copilot 構成
 */
export interface VSCodeMCPConfig {
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Gemini CLI 構成
 */
export interface GeminiCLIConfig {
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabledTools?: string[];
  }>;
  extensions?: Record<string, any>;
}

/**
 * Claude Desktop / Claude Code 構成
 */
export interface ClaudeConfig {
  mcpServers: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

// ============================================================================
// 動的通知型
// ============================================================================

/**
 * MCP通知型
 */
export type MCPNotificationType =
  | 'notifications/tools/list_changed'
  | 'notifications/resources/list_changed'
  | 'notifications/prompts/list_changed'
  | 'notifications/resources/updated'
  | 'roots/list_changed';

/**
 * 通知メッセージ
 */
export interface NotificationMessage {
  jsonrpc: '2.0';
  method: MCPNotificationType;
  params?: {
    uri?: string;
    meta?: Record<string, any>;
  };
}

/**
 * サブスクリプション情報
 */
export interface ResourceSubscription {
  uri: string;
  clientId: string;
  subscribedAt: Date;
  lastUpdate?: Date;
}

// ============================================================================
// AGENTS.md 関連型
// ============================================================================

/**
 * AGENTS.md パース結果
 */
export interface AgentsMdContent {
  // 基本情報
  name?: string;
  description?: string;

  // ビルド・テスト手順
  buildCommands?: string[];
  testCommands?: string[];

  // コーディング規約
  codingStyle?: {
    language?: string;
    guidelines?: string[];
  };

  // MCPサーバー参照
  mcpServerRefs?: string[];

  // カスタムセクション
  sections: Record<string, string>;

  // 生のコンテンツ
  rawContent: string;
}

/**
 * クロスプラットフォーム生成結果
 */
export interface GeneratedConfigs {
  vscode?: VSCodeMCPConfig;
  gemini?: GeminiCLIConfig;
  claude?: ClaudeConfig;
  // 生成コマンド（CLI用）
  claudeCommands?: string[];
}

/**
 * 構成生成オプション
 */
export interface ConfigGeneratorOptions {
  platforms: ('vscode' | 'gemini' | 'claude')[];
  outputDir?: string;
  envFile?: string;
  includeComments?: boolean;
  expandEnvVars?: boolean;
}

// ============================================================================
// ゲートウェイ関連型
// ============================================================================

/**
 * 接続クライアント情報
 */
export interface ConnectedClient {
  id: string;
  type: 'copilot' | 'gemini' | 'claude' | 'unknown';
  transport: 'stdio' | 'sse' | 'http';
  connectedAt: Date;
  lastActivity: Date;
  capabilities: ClientCapabilities;
  roots?: string[];
}

/**
 * クライアント能力
 */
export interface ClientCapabilities {
  supportsListChanged: boolean;
  supportsRoots: boolean;
  supportsSubscriptions: boolean;
  supportedPromptTemplates: boolean;
}

/**
 * ゲートウェイ統計
 */
export interface GatewayStats {
  connectedClients: number;
  activeServers: number;
  totalRequests: number;
  cacheHitRate: number;
  uptime: number;
  notificationsSent: number;
}
