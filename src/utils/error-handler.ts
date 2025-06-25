// ============================================================================
// AEGIS - Unified Error Handler
// 統一されたエラーハンドリングユーティリティ
// ============================================================================

import { Logger } from './logger.js';
import { ERROR_MESSAGES } from '../constants/index.js';

export interface ErrorContext {
  component?: string;
  operation?: string;
  requestId?: string | number;
  details?: Record<string, any>;
  [key: string]: any;
}

export class AegisError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AegisError';
  }
}

export interface ErrorHandlerOptions {
  logger?: Logger;
  throwOnError?: boolean;
  includeStack?: boolean;
}

export class ErrorHandler {
  private static logger = new Logger('error-handler');

  /**
   * 非同期操作のエラーハンドリング
   */
  static async handleAsync<T>(
    operation: () => Promise<T>,
    context: string,
    options: ErrorHandlerOptions = {}
  ): Promise<T | null> {
    const logger = options.logger || this.logger;
    
    try {
      return await operation();
    } catch (error) {
      const aegisError = this.createAegisError(error, context);
      
      logger.error(`Error in ${context}:`, {
        message: aegisError.message,
        code: aegisError.code,
        context: aegisError.context,
        stack: options.includeStack ? aegisError.stack : undefined
      });
      
      if (options.throwOnError) {
        throw aegisError;
      }
      
      return null;
    }
  }

  /**
   * 同期操作のエラーハンドリング
   */
  static handle<T>(
    operation: () => T,
    context: string,
    options: ErrorHandlerOptions = {}
  ): T | null {
    const logger = options.logger || this.logger;
    
    try {
      return operation();
    } catch (error) {
      const aegisError = this.createAegisError(error, context);
      
      logger.error(`Error in ${context}:`, {
        message: aegisError.message,
        code: aegisError.code,
        context: aegisError.context,
        stack: options.includeStack ? aegisError.stack : undefined
      });
      
      if (options.throwOnError) {
        throw aegisError;
      }
      
      return null;
    }
  }

  /**
   * タイムアウト付き非同期操作
   */
  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    context: string,
    options: ErrorHandlerOptions = {}
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new AegisError(
          ERROR_MESSAGES.TIMEOUT,
          'TIMEOUT',
          { context, timeoutMs }
        ));
      }, timeoutMs);
    });
    
    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      const logger = options.logger || this.logger;
      const aegisError = this.createAegisError(error, context);
      
      logger.error(`Timeout or error in ${context}:`, {
        message: aegisError.message,
        code: aegisError.code,
        timeoutMs,
        context: aegisError.context
      });
      
      throw aegisError;
    }
  }

  /**
   * リトライ付き非同期操作
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    retryDelay: number,
    context: string,
    options: ErrorHandlerOptions = {}
  ): Promise<T> {
    const logger = options.logger || this.logger;
    let lastError: AegisError | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.createAegisError(error, context);
        
        logger.warn(`Attempt ${attempt}/${maxRetries} failed in ${context}:`, {
          message: lastError.message,
          code: lastError.code
        });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    logger.error(`All ${maxRetries} attempts failed in ${context}`);
    throw lastError!;
  }

  /**
   * バッチ操作のエラーハンドリング
   */
  static async handleBatch<T>(
    operations: Array<() => Promise<T>>,
    context: string,
    options: ErrorHandlerOptions & { continueOnError?: boolean } = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: AegisError }>> {
    const logger = options.logger || this.logger;
    const results: Array<{ success: boolean; result?: T; error?: AegisError }> = [];
    
    for (let i = 0; i < operations.length; i++) {
      try {
        const result = await operations[i]();
        results.push({ success: true, result });
      } catch (error) {
        const aegisError = this.createAegisError(error, `${context}[${i}]`);
        
        logger.error(`Batch operation ${i} failed in ${context}:`, {
          message: aegisError.message,
          code: aegisError.code
        });
        
        results.push({ success: false, error: aegisError });
        
        if (!options.continueOnError) {
          throw aegisError;
        }
      }
    }
    
    return results;
  }

  /**
   * AegisError の作成
   */
  private static createAegisError(error: unknown, context: string): AegisError {
    if (error instanceof AegisError) {
      return error;
    }
    
    if (error instanceof Error) {
      // 既知のエラーパターンをコードにマッピング
      let code = 'UNKNOWN_ERROR';
      
      if (error.message.includes('timeout')) {
        code = 'TIMEOUT';
      } else if (error.message.includes('ECONNREFUSED')) {
        code = 'CONNECTION_REFUSED';
      } else if (error.message.includes('EPIPE')) {
        code = 'PIPE_ERROR';
      } else if (error.message.includes('Circuit breaker')) {
        code = 'CIRCUIT_BREAKER_OPEN';
      }
      
      return new AegisError(error.message, code, { operation: context }, error);
    }
    
    return new AegisError(
      String(error),
      'UNKNOWN_ERROR',
      { operation: context, originalError: error }
    );
  }

  /**
   * エラーの安全なフォーマット
   */
  static formatError(error: unknown): string {
    if (error instanceof AegisError) {
      return `[${error.code}] ${error.message}`;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    return String(error);
  }
  
  /**
   * Create MCP error response
   */
  static createMCPErrorResponse(
    error: unknown,
    requestId?: string | number
  ): {
    jsonrpc: '2.0';
    id: string | number | null;
    error: {
      code: number;
      message: string;
      data?: Record<string, any>;
    };
  } {
    const aegisError = error instanceof AegisError ? error : this.createAegisError(error, 'mcp-response');
    
    // Map error codes to JSON-RPC error codes
    let code = -32603; // Internal error
    
    switch (aegisError.code) {
      case 'INVALID_REQUEST':
        code = -32600;
        break;
      case 'METHOD_NOT_FOUND':
        code = -32601;
        break;
      case 'INVALID_PARAMS':
        code = -32602;
        break;
      case 'POLICY_VIOLATION':
        code = -32001; // Application error
        break;
      case 'TIMEOUT':
        code = -32002;
        break;
      case 'CONNECTION_REFUSED':
      case 'CIRCUIT_BREAKER_OPEN':
        code = -32003;
        break;
    }
    
    return {
      jsonrpc: '2.0',
      id: requestId || null,
      error: {
        code,
        message: aegisError.message,
        data: aegisError.context
      }
    };
  }
}