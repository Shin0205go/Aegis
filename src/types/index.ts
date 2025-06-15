// ============================================================================
// AEGIS - 型定義
// ============================================================================

// ============================================================================
// 基本的な決定コンテキスト
// ============================================================================
export interface DecisionContext {
  agent: string;
  action: string;
  resource: string;
  purpose?: string;
  time: Date;
  location?: string;
  environment: Record<string, any>;
  
  // PIPで拡張される追加フィールド
  agentType?: string;
  clearanceLevel?: string;
  violationHistory?: number;
  trustScore?: number;
  isBusinessHours?: boolean;
  securityScore?: number;
  resourceSensitivity?: string;
}

// ============================================================================
// AIポリシー判定結果
// ============================================================================
export interface PolicyDecision {
  decision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;
  confidence: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  constraints?: string[];
  obligations?: string[];
  monitoringRequirements?: string[];
  validityPeriod?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// アクセス制御結果
// ============================================================================
export interface AccessControlResult extends PolicyDecision {
  processingTime: number;
  policyUsed: string;
  context?: DecisionContext;
  error?: string;
}

// ============================================================================
// 自然言語ポリシー定義
// ============================================================================
export interface NaturalLanguagePolicyDefinition {
  name: string;
  description: string;
  policy: string; // 自然言語でのポリシー記述
  examples: PolicyExample[];
  metadata: PolicyMetadata;
}

export interface PolicyExample {
  scenario: string;
  expectedDecision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;
}

export interface PolicyMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: Date;
  createdBy: string;
  lastModified: Date;
  lastModifiedBy: string;
  tags: string[];
  status: "draft" | "active" | "deprecated";
}

// ポリシーバージョン管理
export interface PolicyVersion {
  version: string;
  policy: string;
  createdAt: Date;
  createdBy: string;
  changeLog: string;
}

// ============================================================================
// 判定履歴
// ============================================================================
export interface DecisionHistoryEntry {
  id: string;
  timestamp: Date;
  context: DecisionContext;
  decision: PolicyDecision;
  policyUsed: string;
}

// ============================================================================
// 統計情報
// ============================================================================
export interface ControllerStatistics {
  totalDecisions: number;
  permitRate: number;
  denyRate: number;
  permitCount: number;
  denyCount: number;
  indeterminateCount: number;
  averageConfidence: number;
  averageProcessingTime: number;
  topAgents: Array<{ agent: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  riskDistribution: Record<string, number>;
}

// ============================================================================
// コンテキスト拡張ルール
// ============================================================================
export interface ContextEnrichmentRule {
  name: string;
  priority: number;
  condition: (context: DecisionContext) => boolean;
  enrich: (context: DecisionContext) => Promise<Record<string, any>>;
}

// ============================================================================
// LLM設定
// ============================================================================
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'azure';
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  baseURL?: string;
}

// ============================================================================
// キャッシュ設定
// ============================================================================
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  maxSize: number;
}

// ============================================================================
// アラートルール
// ============================================================================
export interface AlertRule {
  name: string;
  condition: (result: AccessControlResult) => boolean;
  action: (result: AccessControlResult) => Promise<void>;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
}

// ============================================================================
// MCPプロキシ設定
// ============================================================================
export interface MCPProxyConfig {
  port: number;
  upstreamServers: Record<string, string>;
  corsOrigins?: string[];
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

// ============================================================================
// モニタリング設定
// ============================================================================
export interface MonitoringConfig {
  enabled: boolean;
  metricsPort?: number;
  healthCheckPath?: string;
  auditLogEnabled?: boolean;
}

// ============================================================================
// 全体設定
// ============================================================================
export interface AEGISConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  llm: LLMConfig;
  cache: CacheConfig;
  mcpProxy: MCPProxyConfig;
  monitoring: MonitoringConfig;
  
  defaultPolicyStrictness: 'low' | 'medium' | 'high' | 'strict';
  policyValidationEnabled: boolean;
  
  secretKey: string;
  jwtSecret?: string;
}

// ============================================================================
// エラー定義
// ============================================================================
export class PolicyViolationError extends Error {
  constructor(
    message: string,
    public readonly decision: PolicyDecision,
    public readonly context: DecisionContext
  ) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class LLMError extends Error {
  constructor(message: string, public readonly provider: string) {
    super(message);
    this.name = "LLMError";
  }
}

// ============================================================================
// ユーティリティ型
// ============================================================================
export type Awaitable<T> = T | Promise<T>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// イベント型
// ============================================================================
export interface AEGISEvent {
  type: string;
  timestamp: Date;
  data: any;
}

export interface PolicyEvent extends AEGISEvent {
  type: 'policy_created' | 'policy_updated' | 'policy_deleted';
  data: {
    policyId: string;
    policyName: string;
    userId?: string;
  };
}

export interface DecisionEvent extends AEGISEvent {
  type: 'decision_made';
  data: {
    context: DecisionContext;
    decision: PolicyDecision;
    processingTime: number;
  };
}

export interface AlertEvent extends AEGISEvent {
  type: 'alert_triggered';
  data: {
    rule: string;
    severity: string;
    message: string;
    context?: DecisionContext;
  };
}