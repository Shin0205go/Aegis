// ============================================================================
// AEGIS - System Constants
// 全システムで使用される定数定義
// ============================================================================

// タイムアウト設定
export const TIMEOUTS = {
  // ポリシー判定
  POLICY_DECISION: 30000,        // 30秒
  POLICY_DECISION_BATCH: 60000,  // 60秒（バッチ処理）
  
  // 上流サーバー
  UPSTREAM_REQUEST: 15000,       // 15秒
  UPSTREAM_SERVER_INIT: 30000,   // 30秒（起動時）
  
  // 制約・義務実行
  CONSTRAINT_EXECUTION: 10000,   // 10秒
  OBLIGATION_EXECUTION: 30000,   // 30秒
  
  // その他
  CONTEXT_ENRICHMENT: 5000,      // 5秒
  CACHE_OPERATION: 1000,         // 1秒
  AUDIT_WRITE: 5000,            // 5秒
} as const;

// サーキットブレーカー設定
export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,          // 連続失敗回数の閾値
  COOLDOWN_MS: 60000,           // クールダウン時間（1分）
  HALF_OPEN_RETRY: 1,           // ハーフオープン時のリトライ回数
} as const;

// キャッシュ設定
export const CACHE = {
  // インテリジェントキャッシュ
  INTELLIGENT_CACHE: {
    MAX_ENTRIES: 500,
    DEFAULT_TTL: 300,           // 5分
    CONFIDENCE_THRESHOLD: 0.8,
    COMPRESSION_THRESHOLD: 1024, // 1KB以上で圧縮
  },
  
  // 判定結果キャッシュ
  DECISION_CACHE: {
    MAX_ENTRIES: 1000,
    DEFAULT_TTL: 300000,        // 5分（ミリ秒）
  },
  
  // レート制限キャッシュ
  RATE_LIMIT_CACHE: {
    CLEANUP_INTERVAL: 300000,   // 5分
  },
} as const;

// バッチ処理設定
export const BATCH = {
  MAX_SIZE: {
    STDIO: 5,                   // stdioモードでは小さく
    HTTP: 10,                   // HTTPモードでは大きく
  },
  TIMEOUT: 2000,                // 2秒
  MAX_QUEUE_SIZE: 100,
} as const;

// サーバー設定
export const SERVER = {
  DEFAULT_PORT: {
    HTTP: 3000,
    API: 8080,
  },
  GRACEFUL_SHUTDOWN_TIMEOUT: 10000, // 10秒
} as const;

// 監査設定
export const AUDIT = {
  LOG_FLUSH_INTERVAL: 5000,     // 5秒
  MAX_QUEUE_SIZE: 100,
  LOG_ROTATION: {
    MAX_SIZE: '10MB',
    MAX_FILES: 10,
    DATE_PATTERN: 'YYYY-MM-DD',
  },
} as const;

// ポリシー設定
export const POLICY = {
  DEFAULT_PRIORITY: 100,
  AI_CONFIDENCE_THRESHOLD: 0.7,
  ODRL_NAMESPACE: 'https://aegis.example.com/odrl/',
} as const;

// 営業時間（デフォルト）
export const BUSINESS_HOURS = {
  START: 9,                     // 9時
  END: 18,                      // 18時
  TIMEZONE: 'Asia/Tokyo',
} as const;

// エラーメッセージテンプレート
export const ERROR_MESSAGES = {
  POLICY_NOT_FOUND: 'No policy found for resource',
  ACCESS_DENIED: 'Access denied',
  UPSTREAM_UNAVAILABLE: 'Upstream service unavailable',
  CIRCUIT_BREAKER_OPEN: 'Circuit breaker is open',
  TIMEOUT: 'Operation timed out',
  INVALID_CONTEXT: 'Invalid context provided',
} as const;

// ログレベル
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;