// ============================================================================
// ObligationExecutorManager Test Suite
// ============================================================================

import { ObligationExecutorManager } from '../../../core/obligations/manager';
import { ObligationExecutor, ObligationResult, ObligationExecutorConfig } from '../../../core/obligations/types';
import { DecisionContext, PolicyDecision } from '../../../types';
import { Logger } from '../../../utils/logger';

// Mock logger
jest.mock('../../../utils/logger');

// Mock obligation executor implementation
class MockObligationExecutor implements ObligationExecutor {
  public initialized = false;
  public cleanedUp = false;
  
  constructor(
    public name: string,
    public supportedTypes: string[],
    private executeFunc?: (obligation: string, context: DecisionContext, decision: PolicyDecision) => Promise<ObligationResult>,
    private shouldFail = false,
    private delay = 0
  ) {}

  async initialize(config: any): Promise<void> {
    this.initialized = true;
  }

  async cleanup(): Promise<void> {
    this.cleanedUp = true;
  }

  canExecute(obligation: string): boolean {
    return this.supportedTypes.some(type => obligation.startsWith(type));
  }

  async execute(obligation: string, context: DecisionContext, decision: PolicyDecision): Promise<ObligationResult> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    
    if (this.executeFunc) {
      return this.executeFunc(obligation, context, decision);
    }
    
    // Default behavior - return success with metadata
    return {
      success: true,
      executedAt: new Date(),
      metadata: {
        executor: this.name,
        obligation: obligation
      }
    };
  }
}

describe('ObligationExecutorManager', () => {
  let manager: ObligationExecutorManager;
  let mockLogger: jest.Mocked<Logger>;

  const testContext: DecisionContext = {
    agent: 'test-agent',
    action: 'read',
    resource: 'file://test.txt',
    purpose: 'testing',
    time: new Date(),
    environment: {}
  };

  const testDecision: PolicyDecision = {
    decision: 'PERMIT',
    reason: 'Test allowed',
    confidence: 0.95,
    constraints: [],
    obligations: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ObligationExecutorManager();
    mockLogger = (Logger as jest.MockedClass<typeof Logger>).mock.instances[0] as jest.Mocked<Logger>;
  });

  describe('registerExecutor', () => {
    it('should register executor successfully', async () => {
      const executor = new MockObligationExecutor('test-executor', ['test:', 'demo:']);
      
      await manager.registerExecutor(executor);
      
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(1);
      expect(executors[0]).toEqual({
        name: 'test-executor',
        supportedTypes: ['test:', 'demo:'],
        enabled: true
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith('義務エグゼキューター登録: test-executor');
      expect(mockLogger.info).toHaveBeenCalledWith('登録完了: test-executor, サポートタイプ: test:, demo:');
    });

    it('should initialize executor with config', async () => {
      const executor = new MockObligationExecutor('init-executor', ['init:']);
      const config: ObligationExecutorConfig = {
        enabled: true,
        timeout: 5000,
        retryCount: 3,
        config: { someOption: 'value' }
      };
      
      await manager.registerExecutor(executor, config);
      
      expect(executor.initialized).toBe(true);
    });

    it('should register multiple executors', async () => {
      const executor1 = new MockObligationExecutor('executor-1', ['type1:']);
      const executor2 = new MockObligationExecutor('executor-2', ['type2:']);
      const executor3 = new MockObligationExecutor('executor-3', ['type3:']);
      
      await manager.registerExecutor(executor1);
      await manager.registerExecutor(executor2);
      await manager.registerExecutor(executor3);
      
      const executors = manager.getExecutors();
      expect(executors).toHaveLength(3);
    });
  });

  describe('unregisterExecutor', () => {
    it('should unregister executor and call cleanup', async () => {
      const executor = new MockObligationExecutor('cleanup-executor', ['cleanup:']);
      
      await manager.registerExecutor(executor);
      await manager.unregisterExecutor('cleanup-executor');
      
      expect(executor.cleanedUp).toBe(true);
      expect(manager.getExecutors()).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith('義務エグゼキューター登録解除: cleanup-executor');
    });

    it('should handle unregistering non-existent executor', async () => {
      await manager.unregisterExecutor('non-existent');
      
      expect(mockLogger.info).toHaveBeenCalledWith('義務エグゼキューター登録解除: non-existent');
    });
  });

  describe('executeObligations', () => {
    it('should execute single obligation successfully', async () => {
      const executor = new MockObligationExecutor('audit-executor', ['audit:']);
      await manager.registerExecutor(executor);
      
      const result = await manager.executeObligations(['audit:log'], testContext, testDecision);
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].metadata).toEqual({
        executor: 'audit-executor',
        obligation: 'audit:log'
      });
      expect(result.errors).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('義務実行成功: audit:log');
    });

    it('should execute multiple obligations in order', async () => {
      const results: string[] = [];
      const executor1 = new MockObligationExecutor('executor1', ['step1:'], 
        async (obligation) => {
          results.push('step1');
          return { success: true, executedAt: new Date(), metadata: { step: 1 } };
        }
      );
      const executor2 = new MockObligationExecutor('executor2', ['step2:'],
        async (obligation) => {
          results.push('step2');
          return { success: true, executedAt: new Date(), metadata: { step: 2 } };
        }
      );
      
      await manager.registerExecutor(executor1);
      await manager.registerExecutor(executor2);
      
      const result = await manager.executeObligations(
        ['step1:process', 'step2:process'],
        testContext,
        testDecision
      );
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(results).toEqual(['step1', 'step2']);
    });

    it('should handle unknown obligations', async () => {
      const executor = new MockObligationExecutor('known-executor', ['known:']);
      await manager.registerExecutor(executor);
      
      const result = await manager.executeObligations(
        ['unknown:obligation', 'known:obligation'],
        testContext,
        testDecision
      );
      
      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1); // Only known obligation
      expect(result.errors).toContain('未対応の義務: unknown:obligation');
      expect(mockLogger.warn).toHaveBeenCalledWith('義務エグゼキューターが見つかりません: unknown:obligation');
    });

    it('should handle executor failures', async () => {
      const executor = new MockObligationExecutor('failing-executor', ['fail:'], undefined, true);
      await manager.registerExecutor(executor);
      
      const result = await manager.executeObligations(['fail:test'], testContext, testDecision);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('義務実行エラー: fail:test');
      expect(result.results[0].success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should respect executor timeout', async () => {
      const executor = new MockObligationExecutor('slow-executor', ['slow:'], undefined, false, 2000);
      await manager.registerExecutor(executor, { enabled: true, timeout: 100 });
      
      const result = await manager.executeObligations(['slow:test'], testContext, testDecision);
      
      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('タイムアウト: 100ms');
    });

    it('should skip disabled executors', async () => {
      const executor = new MockObligationExecutor('disabled-executor', ['disabled:']);
      await manager.registerExecutor(executor, { enabled: false });
      
      const result = await manager.executeObligations(['disabled:test'], testContext, testDecision);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('未対応の義務: disabled:test');
    });

    it('should handle empty obligations', async () => {
      const result = await manager.executeObligations([], testContext, testDecision);
      
      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('executeObligation', () => {
    it('should execute single obligation successfully', async () => {
      const executor = new MockObligationExecutor('single-executor', ['single:']);
      await manager.registerExecutor(executor);
      
      const result = await manager.executeObligation('single:test', testContext, testDecision);
      
      expect(result.success).toBe(true);
      expect(result.metadata).toHaveProperty('executor', 'single-executor');
    });

    it('should throw error on failure', async () => {
      const executor = new MockObligationExecutor('error-executor', ['error:'], undefined, true);
      await manager.registerExecutor(executor);
      
      await expect(
        manager.executeObligation('error:test', testContext, testDecision)
      ).rejects.toThrow('義務実行エラー: error:test');
    });
  });

  describe('getExecutors', () => {
    it('should return empty array when no executors', () => {
      expect(manager.getExecutors()).toEqual([]);
    });

    it('should return all registered executors with status', async () => {
      await manager.registerExecutor(
        new MockObligationExecutor('exec1', ['type1:']),
        { enabled: true }
      );
      await manager.registerExecutor(
        new MockObligationExecutor('exec2', ['type2:']),
        { enabled: false }
      );
      await manager.registerExecutor(
        new MockObligationExecutor('exec3', ['type3:'])
      );
      
      const executors = manager.getExecutors();
      expect(executors).toEqual([
        { name: 'exec1', supportedTypes: ['type1:'], enabled: true },
        { name: 'exec2', supportedTypes: ['type2:'], enabled: false },
        { name: 'exec3', supportedTypes: ['type3:'], enabled: true }
      ]);
    });
  });

  describe('updateExecutorConfig', () => {
    it('should update executor config', async () => {
      const executor = new MockObligationExecutor('config-executor', ['config:']);
      await manager.registerExecutor(executor, { enabled: true, timeout: 5000 });
      
      manager.updateExecutorConfig('config-executor', { 
        enabled: false, 
        timeout: 10000,
        retryCount: 5
      });
      
      const executors = manager.getExecutors();
      expect(executors[0].enabled).toBe(false);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'エグゼキューター設定更新: config-executor',
        { enabled: false, timeout: 10000, retryCount: 5 }
      );
    });
  });

  describe('execution history and stats', () => {
    it('should record execution history', async () => {
      const executor = new MockObligationExecutor('history-executor', ['history:']);
      await manager.registerExecutor(executor);
      
      await manager.executeObligations(['history:test1', 'history:test2'], testContext, testDecision);
      
      const history = manager.getExecutionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].obligation).toBe('history:test2'); // Reverse order
      expect(history[1].obligation).toBe('history:test1');
    });

    it('should limit execution history size', async () => {
      const executor = new MockObligationExecutor('bulk-executor', ['bulk:']);
      await manager.registerExecutor(executor);
      
      // Set private maxHistorySize through reflection (for testing)
      (manager as any).maxHistorySize = 5;
      
      // Execute more than limit
      for (let i = 0; i < 10; i++) {
        await manager.executeObligation(`bulk:test${i}`, testContext, testDecision);
      }
      
      const history = manager.getExecutionHistory();
      expect(history).toHaveLength(5);
      expect(history[0].obligation).toBe('bulk:test9'); // Most recent
    });

    it('should calculate execution statistics', async () => {
      const successExecutor = new MockObligationExecutor('success', ['success:']);
      const failExecutor = new MockObligationExecutor('fail', ['fail:'], undefined, true);
      
      await manager.registerExecutor(successExecutor);
      await manager.registerExecutor(failExecutor);
      
      // Execute some obligations
      await manager.executeObligations(['success:1', 'success:2'], testContext, testDecision);
      await manager.executeObligations(['fail:1'], testContext, testDecision);
      await manager.executeObligations(['success:3'], testContext, testDecision);
      
      const stats = manager.getExecutionStats();
      
      expect(stats.totalExecutions).toBe(4); // 3 success + 1 fail
      expect(stats.successCount).toBe(3);
      expect(stats.failureCount).toBe(1);
      expect(stats.averageDuration).toBeGreaterThan(0);
      
      expect(stats.byObligation['success:1']).toEqual({
        count: 1,
        successCount: 1,
        failureCount: 0
      });
      
      expect(stats.byObligation['fail:1']).toEqual({
        count: 1,
        successCount: 0,
        failureCount: 1
      });
      
      expect(stats.byExecutor['success']).toEqual({
        count: 3,
        successCount: 3,
        failureCount: 0
      });
      
      expect(stats.byExecutor['fail']).toEqual({
        count: 1,
        successCount: 0,
        failureCount: 1
      });
    });

    it('should handle empty stats', () => {
      const stats = manager.getExecutionStats();
      
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.byObligation).toEqual({});
      expect(stats.byExecutor).toEqual({});
    });
  });
});