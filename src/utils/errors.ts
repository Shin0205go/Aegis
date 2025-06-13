// ============================================================================
// AEGIS - カスタムエラークラス
// ============================================================================

/**
 * AEGIS基本エラークラス
 * すべてのAEGISエラーの基底クラス
 */
export class AEGISError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AEGISError';
    
    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * エラーをJSON形式で出力
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * ポリシー違反エラー
 * アクセスがポリシーによって拒否された場合
 */
export class PolicyViolationError extends AEGISError {
  constructor(
    message: string,
    public policyName: string,
    public decision: 'DENY' | 'INDETERMINATE',
    details?: any
  ) {
    super('AEGIS_POLICY_VIOLATION', message, details);
    this.name = 'PolicyViolationError';
  }
}

/**
 * 設定エラー
 * 設定が不正または不完全な場合
 */
export class ConfigurationError extends AEGISError {
  constructor(message: string, details?: any) {
    super('AEGIS_CONFIG_ERROR', message, details);
    this.name = 'ConfigurationError';
  }
}

/**
 * LLMエラー
 * AI/LLMプロバイダーとの通信や処理でエラーが発生した場合
 */
export class LLMError extends AEGISError {
  constructor(
    message: string,
    public provider: string,
    public originalError?: any
  ) {
    super('AEGIS_LLM_ERROR', message, { provider, originalError });
    this.name = 'LLMError';
  }
}

/**
 * 認証エラー
 * 認証に失敗した場合
 */
export class AuthenticationError extends AEGISError {
  constructor(message: string, details?: any) {
    super('AEGIS_AUTH_ERROR', message, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * リソースが見つからないエラー
 * ポリシーやリソースが存在しない場合
 */
export class ResourceNotFoundError extends AEGISError {
  constructor(
    resourceType: string,
    resourceId: string,
    details?: any
  ) {
    super(
      'AEGIS_RESOURCE_NOT_FOUND',
      `${resourceType} not found: ${resourceId}`,
      { resourceType, resourceId, ...details }
    );
    this.name = 'ResourceNotFoundError';
  }
}

/**
 * 検証エラー
 * 入力データやパラメータが不正な場合
 */
export class ValidationError extends AEGISError {
  constructor(
    message: string,
    public field?: string,
    public value?: any,
    details?: any
  ) {
    super('AEGIS_VALIDATION_ERROR', message, { field, value, ...details });
    this.name = 'ValidationError';
  }
}

/**
 * タイムアウトエラー
 * 処理がタイムアウトした場合
 */
export class TimeoutError extends AEGISError {
  constructor(
    operation: string,
    timeoutMs: number,
    details?: any
  ) {
    super(
      'AEGIS_TIMEOUT',
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { operation, timeoutMs, ...details }
    );
    this.name = 'TimeoutError';
  }
}

/**
 * レート制限エラー
 * API呼び出し制限に達した場合
 */
export class RateLimitError extends AEGISError {
  constructor(
    message: string,
    public retryAfter?: number,
    details?: any
  ) {
    super('AEGIS_RATE_LIMIT', message, { retryAfter, ...details });
    this.name = 'RateLimitError';
  }
}

/**
 * ネットワークエラー
 * ネットワーク接続に問題がある場合
 */
export class NetworkError extends AEGISError {
  constructor(
    message: string,
    public endpoint?: string,
    public originalError?: any
  ) {
    super('AEGIS_NETWORK_ERROR', message, { endpoint, originalError });
    this.name = 'NetworkError';
  }
}

/**
 * エラーコード定義
 */
export const ErrorCodes = {
  // ポリシー関連
  AEGIS_001: 'ポリシーが見つかりません',
  AEGIS_002: 'AI判定エラー',
  AEGIS_003: 'コンテキスト収集エラー',
  
  // 接続関連
  AEGIS_004: '上流サーバー接続エラー',
  AEGIS_005: '認証エラー',
  AEGIS_006: 'ネットワークエラー',
  
  // 設定関連
  AEGIS_007: '設定エラー',
  AEGIS_008: '必須パラメータ不足',
  
  // リソース関連
  AEGIS_009: 'リソースが見つかりません',
  AEGIS_010: 'アクセス権限がありません',
  
  // システム関連
  AEGIS_011: 'システムエラー',
  AEGIS_012: 'タイムアウト',
  AEGIS_013: 'レート制限超過',
  
  // 検証関連
  AEGIS_014: '入力データ検証エラー',
  AEGIS_015: 'ポリシー構文エラー'
} as const;

/**
 * エラーハンドリングユーティリティ
 */
export class ErrorHandler {
  /**
   * エラーを適切なAEGISErrorに変換
   */
  static wrap(error: any, defaultCode: string = 'AEGIS_011'): AEGISError {
    // すでにAEGISErrorの場合はそのまま返す
    if (error instanceof AEGISError) {
      return error;
    }

    // 既知のエラータイプをチェック
    if (error.code === 'ECONNREFUSED') {
      return new NetworkError(
        'Connection refused',
        error.address,
        error
      );
    }

    if (error.code === 'ETIMEDOUT') {
      return new TimeoutError(
        'Network operation',
        error.timeout || 0,
        error
      );
    }

    if (error.response?.status === 429) {
      return new RateLimitError(
        'Rate limit exceeded',
        error.response.headers?.['retry-after'],
        error
      );
    }

    if (error.response?.status === 401) {
      return new AuthenticationError(
        'Authentication failed',
        error
      );
    }

    // デフォルトのAEGISError
    return new AEGISError(
      defaultCode,
      error.message || 'Unknown error',
      error
    );
  }

  /**
   * エラーレスポンスを生成
   */
  static toResponse(error: AEGISError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
  }

  /**
   * HTTPステータスコードを取得
   */
  static getHttpStatus(error: AEGISError): number {
    const statusMap: Record<string, number> = {
      AEGIS_AUTH_ERROR: 401,
      AEGIS_POLICY_VIOLATION: 403,
      AEGIS_RESOURCE_NOT_FOUND: 404,
      AEGIS_VALIDATION_ERROR: 400,
      AEGIS_TIMEOUT: 408,
      AEGIS_RATE_LIMIT: 429,
      AEGIS_CONFIG_ERROR: 500,
      AEGIS_LLM_ERROR: 502,
      AEGIS_NETWORK_ERROR: 503
    };

    return statusMap[error.code] || 500;
  }
}