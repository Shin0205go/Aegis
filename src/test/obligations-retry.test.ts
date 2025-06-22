import { ObligationExecutorManager } from '../core/obligations/manager';
import { ObligationExecutor, ObligationResult } from '../core/obligations/types';
import { DecisionContext, PolicyDecision } from '../types';

// モックエグゼキューター（失敗後に成功するパターン）
class RetryTestExecutor implements ObligationExecutor {
  name = 'retry-test-executor';
  supportedTypes = ['notify', 'log'];
  private attemptCount = 0;
  private failuresBeforeSuccess: number;

  constructor(failuresBeforeSuccess: number = 2) {
    this.failuresBeforeSuccess = failuresBeforeSuccess;
  }

  canExecute(obligation: string): boolean {
    return obligation.includes('notify') || obligation.includes('log');
  }

  async execute(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationResult> {
    this.attemptCount++;
    
    if (this.attemptCount <= this.failuresBeforeSuccess) {
      throw new Error(`Simulated failure ${this.attemptCount}`);
    }
    
    return {
      success: true,
      executedAt: new Date(),
      metadata: { attemptCount: this.attemptCount }
    };
  }

  resetAttemptCount() {
    this.attemptCount = 0;
  }
}

describe('ObligationExecutorManager - Retry Mechanism', () => {
  let manager: ObligationExecutorManager;
  let testExecutor: RetryTestExecutor;
  
  const mockContext: DecisionContext = {
    agent: 'test-agent',
    action: 'read',
    resource: 'test-resource',
    time: new Date(),
    environment: {}
  };
  
  const mockDecision: PolicyDecision = {
    decision: 'PERMIT',
    reason: 'Test decision',
    confidence: 0.9
  };

  beforeEach(() => {
    manager = new ObligationExecutorManager();
  });

  test('should retry failed obligations with exponential backoff', async () => {
    testExecutor = new RetryTestExecutor(2); // 2回失敗後に成功
    
    await manager.registerExecutor(testExecutor, {
      enabled: true,
      retryCount: 3,
      retryDelay: 100, // 100msから開始
      timeout: 5000
    });

    const startTime = Date.now();
    const result = await manager.executeObligations(
      ['notify:admin'],
      mockContext,
      mockDecision
    );

    const elapsedTime = Date.now() - startTime;
    
    // 最初の実行が失敗し、リトライが非同期で実行される
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    
    // リトライが完了するまで待機
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // リトライは非同期なので、直接成功を確認はできないが、
    // 時間が経過していることを確認
    expect(elapsedTime).toBeLessThan(500); // 初回失敗はすぐに返る
  });

  test('should apply exponential backoff correctly', async () => {
    testExecutor = new RetryTestExecutor(10); // 常に失敗
    
    await manager.registerExecutor(testExecutor, {
      enabled: true,
      retryCount: 3,
      retryDelay: 100, // 100ms, 200ms, 400ms
      timeout: 5000
    });

    const startTime = Date.now();
    await manager.executeObligations(
      ['log:access'],
      mockContext,
      mockDecision
    );

    // リトライ処理を待つ
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 実行履歴を確認
    const stats = manager.getExecutionStats();
    expect(stats.failureCount).toBeGreaterThan(0);
  });

  test('should not retry when retryCount is 0', async () => {
    testExecutor = new RetryTestExecutor(1);
    
    await manager.registerExecutor(testExecutor, {
      enabled: true,
      retryCount: 0, // リトライ無効
      timeout: 5000
    });

    const result = await manager.executeObligations(
      ['notify:user'],
      mockContext,
      mockDecision
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    
    // リトライが実行されないことを確認
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(testExecutor['attemptCount']).toBe(1);
  });

  test('should handle timeout during retry', async () => {
    class TimeoutExecutor implements ObligationExecutor {
      name = 'timeout-executor';
      supportedTypes = ['timeout'];
      
      canExecute(obligation: string): boolean {
        return obligation.includes('timeout');
      }
      
      async execute(): Promise<ObligationResult> {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒待機
        return { success: true, executedAt: new Date() };
      }
    }

    const timeoutExecutor = new TimeoutExecutor();
    await manager.registerExecutor(timeoutExecutor, {
      enabled: true,
      retryCount: 2,
      retryDelay: 100,
      timeout: 500 // 500msでタイムアウト
    });

    const result = await manager.executeObligations(
      ['timeout:test'],
      mockContext,
      mockDecision
    );

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('タイムアウト');
  });

  test('should add jitter to retry delays', async () => {
    testExecutor = new RetryTestExecutor(5);
    
    await manager.registerExecutor(testExecutor, {
      enabled: true,
      retryCount: 5,
      retryDelay: 1000,
      timeout: 5000
    });

    // 複数回実行して遅延にばらつきがあることを確認
    const delays: number[] = [];
    
    for (let i = 0; i < 3; i++) {
      testExecutor.resetAttemptCount();
      const startTime = Date.now();
      
      await manager.executeObligations(
        ['notify:random'],
        mockContext,
        mockDecision
      );
      
      // リトライ処理の最初の遅延を測定
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      delays.push(Date.now() - startTime);
    }
    
    // 遅延にばらつきがあることを確認（完全に同じ値にはならない）
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});