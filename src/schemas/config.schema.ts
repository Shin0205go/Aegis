import { z } from 'zod';

// ============================================================================
// 設定関連のスキーマ定義
// ============================================================================

/**
 * LLMプロバイダー設定のスキーマ
 */
export const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseURL: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().min(1).default(4096),
  timeout: z.number().min(0).default(30000)
});

/**
 * キャッシュ設定のスキーマ
 */
export const cacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttl: z.number().min(0).default(3600),
  maxSize: z.number().min(0).default(1000),
  strategy: z.enum(['lru', 'lfu', 'fifo']).default('lru')
});

/**
 * ログ設定のスキーマ
 */
export const logConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty', 'text']).default('json'),
  filePath: z.string().optional(),
  maxFiles: z.number().min(1).default(7),
  maxSize: z.string().regex(/^\d+[kmg]b?$/i).default('10m')
});

/**
 * セキュリティ設定のスキーマ
 */
export const securityConfigSchema = z.object({
  enableRateLimiting: z.boolean().default(true),
  rateLimitWindowMs: z.number().min(0).default(60000),
  rateLimitMaxRequests: z.number().min(1).default(100),
  enableAuth: z.boolean().default(false),
  jwtSecret: z.string().optional(),
  corsOrigins: z.array(z.string()).default(['*']),
  enableAuditLog: z.boolean().default(true),
  auditLogPath: z.string().default('./logs/audit'),
  auditLogRetentionDays: z.number().min(1).default(90)
});

/**
 * 監視設定のスキーマ
 */
export const monitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  metricsPort: z.number().min(1).max(65535).default(9090),
  enableHealthCheck: z.boolean().default(true),
  healthCheckInterval: z.number().min(1000).default(30000),
  enableAnomalyDetection: z.boolean().default(true),
  anomalyThreshold: z.number().min(0).max(1).default(0.8)
});

/**
 * アプリケーション全体の設定スキーマ
 */
export const appConfigSchema = z.object({
  // 基本設定
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.number().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  
  // 各種設定
  llm: llmConfigSchema,
  cache: cacheConfigSchema,
  log: logConfigSchema,
  security: securityConfigSchema,
  monitoring: monitoringConfigSchema,
  
  // ポリシー設定
  policy: z.object({
    storageDir: z.string().default('./policies'),
    historyDir: z.string().default('./policies/history'),
    defaultStatus: z.enum(['active', 'inactive', 'draft']).default('active'),
    maxHistoryVersions: z.number().min(1).default(50),
    enableAutoBackup: z.boolean().default(true),
    backupInterval: z.number().min(60000).default(3600000)
  }),
  
  // MCP設定
  mcp: z.object({
    transport: z.enum(['stdio', 'http', 'websocket']).default('stdio'),
    httpPort: z.number().min(1).max(65535).default(8080),
    enableProxy: z.boolean().default(true),
    upstreamTimeout: z.number().min(0).default(30000),
    maxConcurrentConnections: z.number().min(1).default(100)
  })
});

/**
 * 環境変数から設定を生成するためのスキーマ
 */
export const envConfigSchema = z.object({
  // LLM設定
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).optional(),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  LLM_TEMPERATURE: z.string().transform(v => parseFloat(v)).optional(),
  LLM_MAX_TOKENS: z.string().transform(v => parseInt(v)).optional(),
  
  // サーバー設定
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  PORT: z.string().transform(v => parseInt(v)).optional(),
  HOST: z.string().optional(),
  POLICY_UI_PORT: z.string().transform(v => parseInt(v)).optional(),
  MCP_HTTP_PORT: z.string().transform(v => parseInt(v)).optional(),
  
  // ログ設定
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  LOG_FORMAT: z.enum(['json', 'pretty', 'text']).optional(),
  LOG_FILE_PATH: z.string().optional(),
  
  // キャッシュ設定
  CACHE_ENABLED: z.string().transform(v => v === 'true').optional(),
  CACHE_TTL: z.string().transform(v => parseInt(v)).optional(),
  CACHE_MAX_SIZE: z.string().transform(v => parseInt(v)).optional(),
  
  // セキュリティ設定
  ENABLE_RATE_LIMITING: z.string().transform(v => v === 'true').optional(),
  RATE_LIMIT_WINDOW_MS: z.string().transform(v => parseInt(v)).optional(),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(v => parseInt(v)).optional(),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().transform(v => v.split(',')).optional(),
  
  // 監査設定
  ENABLE_AUDIT_LOG: z.string().transform(v => v === 'true').optional(),
  AUDIT_LOG_PATH: z.string().optional(),
  AUDIT_LOG_RETENTION_DAYS: z.string().transform(v => parseInt(v)).optional(),
  ENABLE_AUDIT_ENCRYPTION: z.string().transform(v => v === 'true').optional(),
  
  // デバッグ設定
  DEBUG: z.string().optional(),
  ENABLE_SOURCE_MAPS: z.string().transform(v => v === 'true').optional()
});

/**
 * 環境変数からアプリケーション設定を生成
 */
export function buildConfigFromEnv(env: z.infer<typeof envConfigSchema>): z.infer<typeof appConfigSchema> {
  const provider = env.LLM_PROVIDER || 'anthropic';
  const apiKey = provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is required`);
  }
  
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: env.PORT || 3000,
    host: env.HOST || '0.0.0.0',
    
    llm: {
      provider,
      model: env.LLM_MODEL || (provider === 'openai' ? 'gpt-4' : 'claude-3-5-sonnet-20241022'),
      apiKey,
      baseURL: provider === 'openai' ? env.OPENAI_BASE_URL : env.ANTHROPIC_BASE_URL,
      temperature: env.LLM_TEMPERATURE || 0.3,
      maxTokens: env.LLM_MAX_TOKENS || 4096,
      timeout: 30000
    },
    
    cache: {
      enabled: env.CACHE_ENABLED ?? true,
      ttl: env.CACHE_TTL || 3600,
      maxSize: env.CACHE_MAX_SIZE || 1000,
      strategy: 'lru'
    },
    
    log: {
      level: env.LOG_LEVEL || 'info',
      format: env.LOG_FORMAT || 'json',
      filePath: env.LOG_FILE_PATH,
      maxFiles: 7,
      maxSize: '10m'
    },
    
    security: {
      enableRateLimiting: env.ENABLE_RATE_LIMITING ?? true,
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS || 60000,
      rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS || 100,
      enableAuth: false,
      jwtSecret: env.JWT_SECRET,
      corsOrigins: env.CORS_ORIGINS || ['*'],
      enableAuditLog: env.ENABLE_AUDIT_LOG ?? true,
      auditLogPath: env.AUDIT_LOG_PATH || './logs/audit',
      auditLogRetentionDays: env.AUDIT_LOG_RETENTION_DAYS || 90
    },
    
    monitoring: {
      enabled: true,
      metricsPort: 9090,
      enableHealthCheck: true,
      healthCheckInterval: 30000,
      enableAnomalyDetection: true,
      anomalyThreshold: 0.8
    },
    
    policy: {
      storageDir: './policies',
      historyDir: './policies/history',
      defaultStatus: 'active',
      maxHistoryVersions: 50,
      enableAutoBackup: true,
      backupInterval: 3600000
    },
    
    mcp: {
      transport: 'stdio',
      httpPort: env.MCP_HTTP_PORT || 8080,
      enableProxy: true,
      upstreamTimeout: 30000,
      maxConcurrentConnections: 100
    }
  };
}

// 型定義のエクスポート
export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type CacheConfig = z.infer<typeof cacheConfigSchema>;
export type LogConfig = z.infer<typeof logConfigSchema>;
export type SecurityConfig = z.infer<typeof securityConfigSchema>;
export type MonitoringConfig = z.infer<typeof monitoringConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type EnvConfig = z.infer<typeof envConfigSchema>;

// エイリアスのエクスポート（下位互換性のため）
export { appConfigSchema as AEGISConfigSchema };