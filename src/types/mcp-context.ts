// ============================================================================
// AEGIS - MCP Context Types
// MCPリクエストコンテキストの型定義
// ============================================================================

/**
 * MCPリクエストコンテキスト
 */
export interface MCPRequestContext {
  /** リクエストヘッダー */
  headers: Record<string, string | string[] | undefined>;
  
  /** セッションID */
  sessionId: string;
  
  /** リクエストタイムスタンプ */
  timestamp: number;
  
  /** クライアント情報 */
  clientInfo?: {
    name?: string;
    version?: string;
    address?: string;
  };
  
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * MCPリクエストエクストラ情報
 */
export interface MCPRequestExtra {
  /** リクエストコンテキスト */
  context?: MCPRequestContext;
  
  /** 元のHTTPリクエスト（HTTPモードの場合） */
  httpRequest?: {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
  };
}

/**
 * MCP上流サーバー設定
 */
export interface MCPUpstreamConfig {
  /** サーバー名 */
  name: string;
  
  /** トランスポートタイプ */
  transport: 'stdio' | 'http';
  
  /** stdioサーバー設定 */
  stdio?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
  
  /** HTTPサーバー設定 */
  http?: {
    url: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
}

/**
 * ポリシー判定用のコンテキスト
 */
export interface PolicyEnforcementContext {
  /** MCPリクエスト */
  request?: {
    params?: Record<string, unknown>;
  };
  
  /** クライアントID */
  clientId: string;
  
  /** HTTPヘッダー */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * MCPメソッドパラメータ
 */
export type MCPMethodParams = 
  | { uri: string } // ReadResourceRequest params
  | { name: string; arguments?: unknown } // CallToolRequest params
  | Record<string, unknown>; // Generic params

/**
 * 上流サーバーレスポンス
 */
export interface UpstreamResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCPサーバーインスタンス（内部用）
 */
export interface MCPServerInstance {
  /** HTTPサーバー（HTTPモードの場合） */
  httpServer?: any; // Express.Serverの型を避けるため
  
  /** stdioストリーム */
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  
  /** 起動時刻 */
  startedAt: Date;
  
  /** シャットダウン関数 */
  shutdown: () => Promise<void>;
}

/**
 * 監査統計情報
 */
export interface AuditStats {
  totalEntries: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * ダッシュボードメトリクス
 */
export interface DashboardMetrics {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  avgProcessingTime: number;
  topAgents: Array<{ agent: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  recentAlerts: Array<{
    timestamp: Date;
    type: string;
    severity: string;
    description: string;
  }>;
}

/**
 * サーキットブレーカー状態
 */
export interface CircuitBreakerState {
  failures: number;
  lastFailure: Date;
  isOpen: boolean;
}

/**
 * キャッシュ統計
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * バッチ判定統計
 */
export interface BatchJudgmentStats {
  totalBatches: number;
  totalRequests: number;
  avgBatchSize: number;
  avgProcessingTime: number;
}

/**
 * システム統計
 */
export interface SystemStats {
  audit: AuditStats;
  cache: CacheStats;
  batchJudgment: BatchJudgmentStats;
  queueStatus: {
    size: number;
    processing: boolean;
  };
  anomalyStats: {
    detected: number;
    threshold: number;
  };
  circuitBreaker: Record<string, CircuitBreakerState>;
}

/**
 * オブジェクトデータ型
 */
export interface ObjectData {
  [key: string]: string | number | boolean | null | undefined | ConstraintData;
}

/**
 * 制約処理用のデータ型
 */
export type ConstraintData = 
  | string
  | number
  | boolean
  | null
  | undefined
  | ConstraintData[]
  | ObjectData;

/**
 * 配列データ型
 */
export interface ArrayData {
  [key: string]: unknown[] | unknown;
}