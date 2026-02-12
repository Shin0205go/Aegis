// ============================================================================
// AEGIS - 設定管理
// ============================================================================

import dotenv from 'dotenv';
import type { AEGISConfig, LLMConfig, CacheConfig, MCPProxyConfig, MonitoringConfig } from '../types/index.js';
import { SERVER } from '../constants/index.js';

const DEFAULT_SECRET_KEY = 'default-secret-key-change-in-production';
const MIN_SECRET_KEY_LENGTH = 32;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_CACHE_TTL = 300;

// 環境変数読み込み（システム環境変数を優先）
dotenv.config({ override: false });

export class Config {
  private config: AEGISConfig;

  constructor(overrides?: Partial<AEGISConfig>) {
    const env = process.env;

    const nodeEnv = (overrides?.nodeEnv as any) ?? (env.AEGIS_NODE_ENV as any) ?? (env.NODE_ENV as any) ?? 'development';
    const port = this.parseInteger(overrides?.port ?? env.AEGIS_PORT ?? env.PORT, SERVER.DEFAULT_PORT.HTTP);
    const logLevel = (overrides?.logLevel as any) ?? (env.AEGIS_LOG_LEVEL as any) ?? (env.LOG_LEVEL as any) ?? 'info';

    const provider = (overrides?.llm?.provider as any) ?? (env.AEGIS_AI_PROVIDER as any) ?? (env.LLM_PROVIDER as any) ?? 'anthropic';
    const llmConfig: LLMConfig = {
      provider,
      apiKey: overrides?.llm?.apiKey ?? this.getApiKey(provider),
      model: overrides?.llm?.model ?? env.AEGIS_AI_MODEL ?? env.LLM_MODEL ?? 'claude-opus-4-20250514',
      maxTokens: this.parseInteger(overrides?.llm?.maxTokens ?? env.AEGIS_AI_MAX_TOKENS ?? env.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS),
      temperature: this.parseFloat(overrides?.llm?.temperature ?? env.AEGIS_AI_TEMPERATURE ?? env.LLM_TEMPERATURE, DEFAULT_TEMPERATURE),
      baseURL: overrides?.llm?.baseURL ?? env.AEGIS_AI_BASE_URL ?? env.LLM_BASE_URL
    };

    const cacheConfig: CacheConfig = {
      enabled: overrides?.cache?.enabled ?? this.parseBoolean(env.AEGIS_CACHE_ENABLED ?? env.CACHE_ENABLED, true),
      ttl: this.parseInteger(overrides?.cache?.ttl ?? env.AEGIS_CACHE_TTL ?? env.CACHE_TTL, DEFAULT_CACHE_TTL),
      maxSize: this.parseInteger(overrides?.cache?.maxSize ?? env.AEGIS_CACHE_MAX_SIZE ?? env.CACHE_MAX_SIZE, 1000)
    };

    const mcpProxyConfig: MCPProxyConfig = {
      port: this.parseInteger(overrides?.mcpProxy?.port ?? env.AEGIS_MANAGEMENT_PORT ?? env.MCP_PROXY_PORT ?? env.MANAGEMENT_PORT, SERVER.DEFAULT_PORT.HTTP),
      upstreamServers: overrides?.mcpProxy?.upstreamServers ?? this.parseUpstreamServers(env.AEGIS_MCP_UPSTREAM_SERVERS ?? env.MCP_UPSTREAM_SERVERS ?? ''),
      corsOrigins: overrides?.mcpProxy?.corsOrigins ?? this.parseStringList(env.AEGIS_CORS_ORIGINS ?? env.CORS_ORIGINS) ?? [`http://localhost:${SERVER.DEFAULT_PORT.HTTP}`]
    };

    const monitoringConfig: MonitoringConfig = {
      enabled: overrides?.monitoring?.enabled ?? this.parseBoolean(env.AEGIS_MONITORING_ENABLED ?? env.MONITORING_ENABLED, true),
      metricsPort: this.parseInteger(overrides?.monitoring?.metricsPort ?? env.AEGIS_METRICS_PORT ?? env.METRICS_PORT, 9090),
      healthCheckPath: overrides?.monitoring?.healthCheckPath ?? env.AEGIS_HEALTH_CHECK_ENDPOINT ?? env.HEALTH_CHECK_ENDPOINT ?? '/health',
      auditLogEnabled: overrides?.monitoring?.auditLogEnabled ?? this.parseBoolean(env.AEGIS_AUDIT_LOG_ENABLED ?? env.AUDIT_LOG_ENABLED, true)
    };

    const defaultPolicyStrictness = (overrides?.defaultPolicyStrictness as any) ?? (env.AEGIS_DEFAULT_POLICY_STRICTNESS as any) ?? (env.DEFAULT_POLICY_STRICTNESS as any) ?? 'medium';
    const policyValidationEnabled = overrides?.policyValidationEnabled ?? this.parseBoolean(env.AEGIS_POLICY_VALIDATION_ENABLED ?? env.POLICY_VALIDATION_ENABLED, true);

    const securitySecretKey = overrides?.security?.secretKey ?? overrides?.secretKey ?? env.AEGIS_SECRET_KEY ?? env.SECRET_KEY ?? DEFAULT_SECRET_KEY;
    const securityJwtSecret = overrides?.security?.jwtSecret ?? overrides?.jwtSecret ?? env.AEGIS_JWT_SECRET ?? env.JWT_SECRET;
    const securityTeamEmails = overrides?.security?.teamEmails ?? this.parseStringList(env.AEGIS_SECURITY_TEAM_EMAILS ?? env.SECURITY_TEAM_EMAILS);

    this.config = {
      ...overrides,
      nodeEnv,
      port,
      logLevel,
      llm: { ...llmConfig, ...overrides?.llm },
      cache: { ...cacheConfig, ...overrides?.cache },
      mcpProxy: { ...mcpProxyConfig, ...overrides?.mcpProxy },
      monitoring: { ...monitoringConfig, ...overrides?.monitoring },
      defaultPolicyStrictness,
      policyValidationEnabled,
      secretKey: securitySecretKey,
      jwtSecret: securityJwtSecret,
      securityTeamEmails: securityTeamEmails,
      security: {
        secretKey: securitySecretKey,
        jwtSecret: securityJwtSecret,
        teamEmails: securityTeamEmails,
        ...overrides?.security
      }
    };

    // 設定検証
    this.validateConfig();
  }

  private parseInteger(value: string | number | undefined, defaultValue: number): number {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private parseFloat(value: string | number | undefined, defaultValue: number): number {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    return defaultValue;
  }

  private parseStringList(value: string | undefined): string[] | undefined {
    if (!value) {
      return undefined;
    }

    const list = value
      .split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);

    return list.length > 0 ? list : undefined;
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
      return process.env.OPENAI_API_KEY || process.env.AEGIS_OPENAI_API_KEY || '';
    } else if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY || process.env.AEGIS_ANTHROPIC_API_KEY || '';
    } else if (provider === 'azure') {
      return process.env.AZURE_OPENAI_API_KEY || process.env.AEGIS_AZURE_OPENAI_API_KEY || '';
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
          console.warn('[Config] Warning: OpenAI API key not set. Set OPENAI_API_KEY environment variable.');
        }
      }
    }

    // セキュリティ設定検証
    if (this.config.nodeEnv === 'production' && this.config.secretKey === DEFAULT_SECRET_KEY) {
      throw new Error('[Config] Secret key must be changed in production environment');
    }

    if (this.config.nodeEnv === 'production' && (!this.config.secretKey || this.config.secretKey.length < MIN_SECRET_KEY_LENGTH)) {
      throw new Error('[Config] Secret key must be at least 32 characters long in production');
    }

    // ポート番号検証
    if (!this.isValidPort(this.config.port)) {
      this.config.port = SERVER.DEFAULT_PORT.HTTP;
      if (!isStdioMode && process.env.LOG_SILENT !== 'true') {
        console.warn('[Config] Invalid port specified. Falling back to default port.');
      }
    }

    // LLM設定の詳細検証
    const llm = this.config.llm;
    if (llm) {
      if (llm.maxTokens !== undefined && llm.maxTokens <= 0) {
        llm.maxTokens = DEFAULT_MAX_TOKENS;
        if (!isStdioMode && process.env.LOG_SILENT !== 'true') {
          console.warn('[Config] Invalid maxTokens specified. Using default value.');
        }
      }

      if (llm.temperature !== undefined && (llm.temperature < 0 || llm.temperature > 1)) {
        llm.temperature = DEFAULT_TEMPERATURE;
        if (!isStdioMode && process.env.LOG_SILENT !== 'true') {
          console.warn('[Config] Temperature must be between 0 and 1. Using default value.');
        }
      }
    }

    // キャッシュ設定検証
    const cache = this.config.cache;
    if (cache) {
      if (cache.ttl <= 0) {
        cache.ttl = DEFAULT_CACHE_TTL;
        if (!isStdioMode && process.env.LOG_SILENT !== 'true') {
          console.warn('[Config] Cache TTL must be greater than zero. Using default value.');
        }
      }
    }

    if (!isStdioMode) {
      if (process.env.LOG_SILENT !== 'true') {
        console.info('[Config] Configuration loaded successfully');
        console.info(`[Config] Environment: ${this.config.nodeEnv}`);
        console.info(`[Config] LLM Provider: ${this.config.llm?.provider}`);
        console.info(`[Config] LLM Model: ${this.config.llm?.model}`);
      }
    }
  }

  private isValidPort(port: number | undefined): boolean {
    return port !== undefined && Number.isInteger(port) && port > 0 && port <= 65535;
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
  get security() { return this.config.security; }
  get securityTeamEmails() { return this.config.securityTeamEmails; }
  get secretKey() { return this.config.security?.secretKey ?? this.config.secretKey; }
  get jwtSecret() { return this.config.security?.jwtSecret ?? this.config.jwtSecret; }

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
      jwtSecret: this.config.jwtSecret ? '[REDACTED]' : '[NOT_SET]',
      security: this.config.security ? {
        ...this.config.security,
        secretKey: this.config.security.secretKey ? '[REDACTED]' : '[NOT_SET]',
        jwtSecret: this.config.security.jwtSecret ? '[REDACTED]' : '[NOT_SET]'
      } : undefined
    };
  }

  // 設定全体を取得（テスト用）
  getConfig(): AEGISConfig {
    return { ...this.config };
  }
}