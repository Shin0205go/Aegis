import { ErrorHandler, AegisError, ErrorContext } from '../utils/error-handler';
import { Logger } from '../utils/logger';
import { ERROR_MESSAGES } from '../constants';

// Loggerをモック
jest.mock('../utils/logger');

describe('ErrorHandler', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Loggerのモック設定
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);
  });

  describe('AegisError', () => {
    it('正しく初期化される', () => {
      const context: ErrorContext = {
        component: 'test-component',
        operation: 'test-operation',
        requestId: '123'
      };
      const cause = new Error('Original error');

      const error = new AegisError('Test error', 'TEST_ERROR', context, cause);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.context).toEqual(context);
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('AegisError');
    });

    it('contextとcauseはオプショナル', () => {
      const error = new AegisError('Simple error', 'SIMPLE_ERROR');

      expect(error.message).toBe('Simple error');
      expect(error.code).toBe('SIMPLE_ERROR');
      expect(error.context).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });
  });

  describe('handleAsync', () => {
    it('成功した操作の結果を返す', async () => {
      const result = await ErrorHandler.handleAsync(
        async () => 'success',
        'test-operation'
      );

      expect(result).toBe('success');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('エラーをキャッチしてログを出力する', async () => {
      const error = new Error('Test error');
      
      const result = await ErrorHandler.handleAsync(
        async () => { throw error; },
        'test-operation'
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in test-operation:',
        expect.objectContaining({
          message: 'Test error',
          code: 'UNKNOWN_ERROR',
          context: { operation: 'test-operation' }
        })
      );
    });

    it('throwOnErrorオプションでエラーを再スローする', async () => {
      const error = new Error('Test error');

      await expect(
        ErrorHandler.handleAsync(
          async () => { throw error; },
          'test-operation',
          { throwOnError: true }
        )
      ).rejects.toThrow(AegisError);
    });

    it('includeStackオプションでスタックトレースを含める', async () => {
      const error = new Error('Test error');

      await ErrorHandler.handleAsync(
        async () => { throw error; },
        'test-operation',
        { includeStack: true }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in test-operation:',
        expect.objectContaining({
          stack: expect.stringContaining('Error: Test error')
        })
      );
    });

    it('カスタムロガーを使用する', async () => {
      const customLogger = {
        error: jest.fn()
      } as any;

      await ErrorHandler.handleAsync(
        async () => { throw new Error('Test'); },
        'test-operation',
        { logger: customLogger }
      );

      expect(customLogger.error).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('AegisErrorをそのまま保持する', async () => {
      const aegisError = new AegisError('Aegis error', 'AEGIS_CODE', { test: true });

      await ErrorHandler.handleAsync(
        async () => { throw aegisError; },
        'test-operation'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in test-operation:',
        expect.objectContaining({
          message: 'Aegis error',
          code: 'AEGIS_CODE',
          context: { test: true }
        })
      );
    });
  });

  describe('handle', () => {
    it('成功した操作の結果を返す', () => {
      const result = ErrorHandler.handle(
        () => 'success',
        'test-operation'
      );

      expect(result).toBe('success');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('エラーをキャッチしてログを出力する', () => {
      const error = new Error('Sync error');
      
      const result = ErrorHandler.handle(
        () => { throw error; },
        'test-operation'
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in test-operation:',
        expect.objectContaining({
          message: 'Sync error',
          code: 'UNKNOWN_ERROR'
        })
      );
    });

    it('throwOnErrorオプションでエラーを再スローする', () => {
      const error = new Error('Test error');

      expect(() => 
        ErrorHandler.handle(
          () => { throw error; },
          'test-operation',
          { throwOnError: true }
        )
      ).toThrow(AegisError);
    });

    it('非Errorオブジェクトも処理する', () => {
      const result = ErrorHandler.handle(
        () => { throw 'string error'; },
        'test-operation'
      );

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in test-operation:',
        expect.objectContaining({
          message: 'string error',
          code: 'UNKNOWN_ERROR',
          context: expect.objectContaining({
            originalError: 'string error'
          })
        })
      );
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('タイムアウト前に完了する操作の結果を返す', async () => {
      const promise = ErrorHandler.withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'success';
        },
        1000,
        'test-operation'
      );

      jest.advanceTimersByTime(50);
      const result = await promise;

      expect(result).toBe('success');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('タイムアウトした場合にエラーをスローする', async () => {
      const promise = ErrorHandler.withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return 'never reached';
        },
        1000,
        'test-operation'
      );

      jest.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(AegisError);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Timeout or error in test-operation:',
        expect.objectContaining({
          message: ERROR_MESSAGES.TIMEOUT,
          code: 'TIMEOUT',
          timeoutMs: 1000
        })
      );
    });

    it('操作中のエラーも適切に処理する', async () => {
      const error = new Error('Operation error');

      await expect(
        ErrorHandler.withTimeout(
          async () => { throw error; },
          1000,
          'test-operation'
        )
      ).rejects.toThrow(AegisError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Timeout or error in test-operation:',
        expect.objectContaining({
          message: 'Operation error',
          code: 'UNKNOWN_ERROR'
        })
      );
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('最初の試行で成功した場合、結果を返す', async () => {
      const result = await ErrorHandler.withRetry(
        async () => 'success',
        3,
        1000,
        'test-operation'
      );

      expect(result).toBe('success');
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('失敗後にリトライして成功する', async () => {
      let attempts = 0;
      
      const promise = ErrorHandler.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success';
        },
        3,
        1000,
        'test-operation'
      );

      // 最初の失敗
      await Promise.resolve();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempt 1/3 failed in test-operation:',
        expect.objectContaining({
          message: 'Attempt 1 failed'
        })
      );

      // 1秒待機してリトライ
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempt 2/3 failed in test-operation:',
        expect.objectContaining({
          message: 'Attempt 2 failed'
        })
      );

      // もう1秒待機して成功
      jest.advanceTimersByTime(1000);
      
      const result = await promise;
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('全ての試行が失敗した場合、最後のエラーをスローする', async () => {
      const promise = ErrorHandler.withRetry(
        async () => { throw new Error('Always fails'); },
        3,
        1000,
        'test-operation'
      );

      // 全ての試行を進める
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(AegisError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'All 3 attempts failed in test-operation'
      );
      expect(mockLogger.warn).toHaveBeenCalledTimes(3);
    });

    it('カスタムロガーを使用する', async () => {
      const customLogger = {
        warn: jest.fn(),
        error: jest.fn()
      } as any;

      const promise = ErrorHandler.withRetry(
        async () => { throw new Error('Test'); },
        2,
        100,
        'test-operation',
        { logger: customLogger }
      );

      jest.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow();

      expect(customLogger.warn).toHaveBeenCalled();
      expect(customLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('handleBatch', () => {
    it('全ての操作が成功した場合の結果を返す', async () => {
      const operations = [
        async () => 'result1',
        async () => 'result2',
        async () => 'result3'
      ];

      const results = await ErrorHandler.handleBatch(
        operations,
        'batch-operation'
      );

      expect(results).toEqual([
        { success: true, result: 'result1' },
        { success: true, result: 'result2' },
        { success: true, result: 'result3' }
      ]);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('失敗した操作のエラーを記録する', async () => {
      const operations = [
        async () => 'success',
        async () => { throw new Error('Failed'); },
        async () => 'also success'
      ];

      await expect(
        ErrorHandler.handleBatch(operations, 'batch-operation')
      ).rejects.toThrow(AegisError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Batch operation 1 failed in batch-operation:',
        expect.objectContaining({
          message: 'Failed'
        })
      );
    });

    it('continueOnError=trueで全ての操作を実行する', async () => {
      const operations = [
        async () => 'result1',
        async () => { throw new Error('Error2'); },
        async () => 'result3',
        async () => { throw new Error('Error4'); }
      ];

      const results = await ErrorHandler.handleBatch(
        operations,
        'batch-operation',
        { continueOnError: true }
      );

      expect(results).toEqual([
        { success: true, result: 'result1' },
        { success: false, error: expect.any(AegisError) },
        { success: true, result: 'result3' },
        { success: false, error: expect.any(AegisError) }
      ]);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });

    it('空の操作配列も処理する', async () => {
      const results = await ErrorHandler.handleBatch(
        [],
        'empty-batch'
      );

      expect(results).toEqual([]);
    });
  });

  describe('createAegisError', () => {
    it('既存のAegisErrorをそのまま返す', () => {
      const originalError = new AegisError('Original', 'ORIGINAL_CODE');
      const result = ErrorHandler['createAegisError'](originalError, 'context');

      expect(result).toBe(originalError);
    });

    it('Error オブジェクトから AegisError を作成する', () => {
      const error = new Error('Test error');
      const result = ErrorHandler['createAegisError'](error, 'test-context');

      expect(result).toBeInstanceOf(AegisError);
      expect(result.message).toBe('Test error');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.context).toEqual({ operation: 'test-context' });
      expect(result.cause).toBe(error);
    });

    it('タイムアウトエラーを認識する', () => {
      const error = new Error('Request timeout exceeded');
      const result = ErrorHandler['createAegisError'](error, 'context');

      expect(result.code).toBe('TIMEOUT');
    });

    it('接続拒否エラーを認識する', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const result = ErrorHandler['createAegisError'](error, 'context');

      expect(result.code).toBe('CONNECTION_REFUSED');
    });

    it('パイプエラーを認識する', () => {
      const error = new Error('write EPIPE');
      const result = ErrorHandler['createAegisError'](error, 'context');

      expect(result.code).toBe('PIPE_ERROR');
    });

    it('サーキットブレーカーエラーを認識する', () => {
      const error = new Error('Circuit breaker is open');
      const result = ErrorHandler['createAegisError'](error, 'context');

      expect(result.code).toBe('CIRCUIT_BREAKER_OPEN');
    });

    it('非Errorオブジェクトも処理する', () => {
      const result = ErrorHandler['createAegisError']('string error', 'context');

      expect(result).toBeInstanceOf(AegisError);
      expect(result.message).toBe('string error');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.context?.originalError).toBe('string error');
    });

    it('nullやundefinedも処理する', () => {
      const nullResult = ErrorHandler['createAegisError'](null, 'context');
      const undefinedResult = ErrorHandler['createAegisError'](undefined, 'context');

      expect(nullResult.message).toBe('null');
      expect(undefinedResult.message).toBe('undefined');
    });
  });

  describe('formatError', () => {
    it('AegisErrorをフォーマットする', () => {
      const error = new AegisError('Test error', 'TEST_CODE');
      const formatted = ErrorHandler.formatError(error);

      expect(formatted).toBe('[TEST_CODE] Test error');
    });

    it('通常のErrorをフォーマットする', () => {
      const error = new Error('Regular error');
      const formatted = ErrorHandler.formatError(error);

      expect(formatted).toBe('Regular error');
    });

    it('文字列をそのまま返す', () => {
      const formatted = ErrorHandler.formatError('string error');

      expect(formatted).toBe('string error');
    });

    it('その他の値を文字列に変換する', () => {
      expect(ErrorHandler.formatError(123)).toBe('123');
      expect(ErrorHandler.formatError(true)).toBe('true');
      expect(ErrorHandler.formatError(null)).toBe('null');
      expect(ErrorHandler.formatError(undefined)).toBe('undefined');
      expect(ErrorHandler.formatError({ error: 'object' })).toBe('[object Object]');
    });
  });

  describe('createMCPErrorResponse', () => {
    it('AegisErrorからMCPエラーレスポンスを作成する', () => {
      const error = new AegisError(
        'Policy violation',
        'POLICY_VIOLATION',
        { resource: 'secret-data' }
      );

      const response = ErrorHandler.createMCPErrorResponse(error, 'req-123');

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'req-123',
        error: {
          code: -32001,
          message: 'Policy violation',
          data: { resource: 'secret-data' }
        }
      });
    });

    it('通常のErrorからMCPエラーレスポンスを作成する', () => {
      const error = new Error('Internal error');
      const response = ErrorHandler.createMCPErrorResponse(error);

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: { operation: 'mcp-response' }
        }
      });
    });

    it('エラーコードを適切にマッピングする', () => {
      const testCases = [
        { code: 'INVALID_REQUEST', expectedCode: -32600 },
        { code: 'METHOD_NOT_FOUND', expectedCode: -32601 },
        { code: 'INVALID_PARAMS', expectedCode: -32602 },
        { code: 'POLICY_VIOLATION', expectedCode: -32001 },
        { code: 'TIMEOUT', expectedCode: -32002 },
        { code: 'CONNECTION_REFUSED', expectedCode: -32003 },
        { code: 'CIRCUIT_BREAKER_OPEN', expectedCode: -32003 },
        { code: 'UNKNOWN', expectedCode: -32603 }
      ];

      testCases.forEach(({ code, expectedCode }) => {
        const error = new AegisError('Test', code);
        const response = ErrorHandler.createMCPErrorResponse(error);
        expect(response.error.code).toBe(expectedCode);
      });
    });

    it('リクエストIDがない場合はnullを使用する', () => {
      const error = new Error('Test');
      const response = ErrorHandler.createMCPErrorResponse(error);

      expect(response.id).toBeNull();
    });

    it('数値のリクエストIDも処理する', () => {
      const error = new Error('Test');
      const response = ErrorHandler.createMCPErrorResponse(error, 12345);

      expect(response.id).toBe(12345);
    });
  });
});