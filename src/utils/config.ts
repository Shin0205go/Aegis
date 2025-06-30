// ============================================================================
// AEGIS - 設定管理
// ============================================================================

import dotenv from 'dotenv';
import type { AEGISConfig, LLMConfig, CacheConfig, MCPProxyConfig, MonitoringConfig } from '../types/index.js';
import { SERVER } from '../constants/index.js';

// 環境変数読み込み（システム環境変数を優先）
dotenv.config({ override: false });

export class Config {
  private config: AEGISConfig;

  constructor(overrides?: Partial<AEGISConfig>) {
    this.config = {
      // 基本設定
      nodeEnv: (process.env.AEGIS_NODE_ENV as any) || 'development',
      port: parseInt(process.env.AEGIS_PORT || String(SERVER.DEFAULT_PORT.HTTP)),
      logLevel: (process.env.AEGIS_LOG_LEVEL as any) || 'info',

      // LLM設定
      llm: {
        provider: ((process.env.LLM_PROVIDER || 'anthropic') as 'openai' | 'anthropic' | 'azure'),
        apiKey: this.getApiKey(overrides?.llm?.provider || process.env.LLM_PROVIDER || 'anthropic'),
        model: process.env.LLM_MODEL || 'claude-opus-4-20250514',
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
        baseURL: process.env.LLM_BASE_URL
      },

      // キャッシュ設定
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.CACHE_TTL || '300'), // 5分
        maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000')
      },

      // MCPプロキシ設定
      mcpProxy: {
        port: parseInt(process.env.AEGIS_MANAGEMENT_PORT || process.env.MCP_PROXY_PORT || String(SERVER.DEFAULT_PORT.HTTP)),
        upstreamServers: this.parseUpstreamServers(process.env.MCP_UPSTREAM_SERVERS || ''),
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || [`http://localhost:${SERVER.DEFAULT_PORT.HTTP}`]
      },

      // モニタリング設定
      monitoring: {
        enabled: process.env.MONITORING_ENABLED !== 'false',
        metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
        healthCheckPath: process.env.HEALTH_CHECK_ENDPOINT || '/health',
        auditLogEnabled: process.env.AUDIT_LOG_ENABLED !== 'false'
      },

      // ポリシー設定
      defaultPolicyStrictness: (process.env.DEFAULT_POLICY_STRICTNESS as any) || 'medium',
      policyValidationEnabled: process.env.POLICY_VALIDATION_ENABLED !== 'false',

      // セキュリティ設定
      secretKey: process.env.AEGIS_SECRET_KEY || 'default-secret-key-change-in-production',
      jwtSecret: process.env.JWT_SECRET,

      // オーバーライド適用
      ...overrides
    };

    // 設定検証
    this.validateConfig();
  }

  private parseUpstreamServers(serversStr: string): Record<string, string> {
    const servers: Record<string, string> = {};
    if (serversStr) {
      serversStr.split(',').forEach(server => {
        const [name, ...urlParts] = server.trim().split(':');
        const url = urlParts.join(':'); // URLにコロンが含まれる場合を考慮
        if (name && url) {
          servers[name] = url;
        }
      });
    }
    return servers;
  }

  private getApiKey(provider: string): string {
    // プロバイダーに応じて適切な API キーを取得
    if (provider === 'openai') {
      return process.env.OPENAI_API_KEY || '';
    } else if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY || '';
    }
    return '';
  }

  private validateConfig(): void {
    // Suppress all output in MCP stdio mode
    const isStdioMode = process.env.MCP_TRANSPORT === 'stdio' || process.argv.includes('--stdio');
    
    // LLM設定検証
    if (!this.config.llm?.apiKey) {
      if (!isStdioMode) {
        if (process.env.LOG_SILENT !== 'true') {
          console.error('[Config] Warning: OpenAI API key not set. Set OPENAI_API_KEY environment variable.');
        }
      }
    }

    // セキュリティ設定検証
    if (this.config.nodeEnv === 'production' && this.config.secretKey === 'default-secret-key-change-in-production') {
      throw new Error('[Config] Secret key must be changed in production environment');
    }

    if (!isStdioMode) {
      if (process.env.LOG_SILENT !== 'true') {
        console.error('[Config] Configuration loaded successfully');
        console.error(`[Config] Environment: ${this.config.nodeEnv}`);
        console.error(`[Config] LLM Provider: ${this.config.llm?.provider}`);
        console.error(`[Config] LLM Model: ${this.config.llm?.model}`);
      }
    }
  }

  // 設定取得メソッド
  get nodeEnv() { return this.config.nodeEnv; }
  get port() { return this.config.port; }
  get logLevel() { return this.config.logLevel; }
  get llm(): LLMConfig { return this.config.llm!; }
  get cache(): CacheConfig { return this.config.cache!; }
  get mcpProxy(): MCPProxyConfig { return this.config.mcpProxy; }
  get monitoring(): MonitoringConfig { return this.config.monitoring!; }
  get defaultPolicyStrictness() { return this.config.defaultPolicyStrictness; }
  get policyValidationEnabled() { return this.config.policyValidationEnabled; }
  get secretKey() { return this.config.secretKey; }
  get jwtSecret() { return this.config.jwtSecret; }

  // 開発環境チェック
  get isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }

  // デバッグ情報出力
  toJSON(): Partial<AEGISConfig> {
    return {
      ...this.config,
      llm: this.config.llm ? {
        ...this.config.llm,
        apiKey: this.config.llm.apiKey ? '[REDACTED]' : '[NOT_SET]'
      } : undefined,
      secretKey: '[REDACTED]',
      jwtSecret: this.config.jwtSecret ? '[REDACTED]' : '[NOT_SET]'
    };
  }

  // 設定全体を取得（テスト用）
  getConfig(): AEGISConfig {
    return { ...this.config };
  }
}