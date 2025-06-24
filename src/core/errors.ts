// ============================================================================
// AEGIS - Custom Error Types
// システム固有のエラー型定義
// ============================================================================

/**
 * AEGIS基底エラークラス
 */
export abstract class AegisError extends Error {
  public readonly timestamp: Date;
  
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    
    // スタックトレースを正しく設定
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack
    };
  }
}

/**
 * ポリシー関連エラー
 */
export class PolicyError extends AegisError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'POLICY_ERROR', context, cause);
  }
}

export class PolicyNotFoundError extends PolicyError {
  constructor(policyId: string, cause?: Error) {
    super(`Policy not found: ${policyId}`, { policyId }, cause);
  }
}

export class PolicyValidationError extends PolicyError {
  constructor(message: string, policyId: string, validationErrors: string[], cause?: Error) {
    super(message, { policyId, validationErrors }, cause);
  }
}

/**
 * 判定エンジンエラー
 */
export class JudgmentError extends AegisError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'JUDGMENT_ERROR', context, cause);
  }
}

export class JudgmentTimeoutError extends JudgmentError {
  constructor(timeoutMs: number, context: Record<string, any>, cause?: Error) {
    super(`Judgment timeout after ${timeoutMs}ms`, { ...context, timeoutMs }, cause);
  }
}

/**
 * 制約実行エラー
 */
export class ConstraintError extends AegisError {
  constructor(message: string, constraint: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'CONSTRAINT_ERROR', { ...context, constraint }, cause);
  }
}

export class ConstraintExecutionError extends ConstraintError {
  constructor(constraint: string, reason: string, cause?: Error) {
    super(`Failed to execute constraint "${constraint}": ${reason}`, constraint, { reason }, cause);
  }
}

/**
 * 義務実行エラー
 */
export class ObligationError extends AegisError {
  constructor(message: string, obligation: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'OBLIGATION_ERROR', { ...context, obligation }, cause);
  }
}

export class ObligationExecutionError extends ObligationError {
  constructor(obligation: string, executor: string, reason: string, cause?: Error) {
    super(
      `Failed to execute obligation "${obligation}" with executor "${executor}": ${reason}`,
      obligation,
      { executor, reason },
      cause
    );
  }
}

/**
 * キャッシュ操作エラー
 */
export class CacheError extends AegisError {
  constructor(message: string, operation: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'CACHE_ERROR', { ...context, operation }, cause);
  }
}

export class CacheOperationError extends CacheError {
  constructor(operation: 'get' | 'set' | 'evict' | 'clear', reason: string, cause?: Error) {
    super(`Cache operation "${operation}" failed: ${reason}`, operation, { reason }, cause);
  }
}

/**
 * 上流サーバーエラー
 */
export class UpstreamError extends AegisError {
  constructor(message: string, serverName: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'UPSTREAM_ERROR', { ...context, serverName }, cause);
  }
}

export class UpstreamConnectionError extends UpstreamError {
  constructor(serverName: string, reason: string, cause?: Error) {
    super(`Failed to connect to upstream server "${serverName}": ${reason}`, serverName, { reason }, cause);
  }
}

export class UpstreamTimeoutError extends UpstreamError {
  constructor(serverName: string, timeoutMs: number, cause?: Error) {
    super(`Upstream server "${serverName}" timeout after ${timeoutMs}ms`, serverName, { timeoutMs }, cause);
  }
}

/**
 * サーキットブレーカーエラー
 */
export class CircuitBreakerError extends AegisError {
  constructor(message: string, method: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'CIRCUIT_BREAKER_ERROR', { ...context, method }, cause);
  }
}

export class CircuitBreakerOpenError extends CircuitBreakerError {
  constructor(method: string, timeUntilReset: number, cause?: Error) {
    super(
      `Circuit breaker is open for method "${method}". Reset in ${timeUntilReset}ms`,
      method,
      { timeUntilReset },
      cause
    );
  }
}

/**
 * 設定エラー
 */
export class ConfigurationError extends AegisError {
  constructor(message: string, configKey: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'CONFIGURATION_ERROR', { ...context, configKey }, cause);
  }
}

export class InvalidConfigurationError extends ConfigurationError {
  constructor(configKey: string, reason: string, cause?: Error) {
    super(`Invalid configuration for "${configKey}": ${reason}`, configKey, { reason }, cause);
  }
}

/**
 * 監査エラー
 */
export class AuditError extends AegisError {
  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, 'AUDIT_ERROR', context, cause);
  }
}

export class AuditRecordingError extends AuditError {
  constructor(reason: string, auditData: Record<string, any>, cause?: Error) {
    super(`Failed to record audit entry: ${reason}`, { reason, auditData }, cause);
  }
}