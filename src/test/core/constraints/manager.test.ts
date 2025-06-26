// ============================================================================
// ConstraintProcessorManager Test Suite
// ============================================================================

import { ConstraintProcessorManager } from '../../../core/constraints/manager';
import { ConstraintProcessor, ConstraintProcessorConfig } from '../../../core/constraints/types';
import { DecisionContext } from '../../../types';
import { Logger } from '../../../utils/logger';

// Mock logger
jest.mock('../../../utils/logger');

// Mock constraint processor implementation
class MockConstraintProcessor implements ConstraintProcessor {
  public initialized = false;
  public cleanedUp = false;
  
  constructor(
    public name: string,
    public supportedTypes: string[],
    private processFunc?: (constraint: string, data: any, context: DecisionContext) => Promise<any>,
    private shouldFail = false,
    private delay = 0
  ) {}

  async initialize(config: any): Promise<void> {
    this.initialized = true;
  }

  async cleanup(): Promise<void> {
    this.cleanedUp = true;
  }

  canProcess(constraint: string): boolean {
    return this.supportedTypes.some(type => constraint.startsWith(type));
  }

  async apply(constraint: string, data: any, context: DecisionContext): Promise<any> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    
    if (this.processFunc) {
      return this.processFunc(constraint, data, context);
    }
    
    // Default behavior - add processed marker
    return {
      ...data,
      [`processed_by_${this.name}`]: true,
      [`constraint_${constraint}`]: 'applied'
    };
  }
}

describe('ConstraintProcessorManager', () => {
  let manager: ConstraintProcessorManager;
  let mockLogger: jest.Mocked<Logger>;

  const testContext: DecisionContext = {
    agent: 'test-agent',
    action: 'read',
    resource: 'file://test.txt',
    purpose: 'testing',
    time: new Date(),
    environment: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ConstraintProcessorManager();
    mockLogger = (Logger as jest.MockedClass<typeof Logger>).mock.instances[0] as jest.Mocked<Logger>;
  });

  describe('registerProcessor', () => {
    it('should register processor successfully', async () => {
      const processor = new MockConstraintProcessor('test-processor', ['test:', 'demo:']);
      
      await manager.registerProcessor(processor);
      
      const processors = manager.getProcessors();
      expect(processors).toHaveLength(1);
      expect(processors[0]).toEqual({
        name: 'test-processor',
        supportedTypes: ['test:', 'demo:'],
        enabled: true
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith('制約プロセッサ登録: test-processor');
      expect(mockLogger.info).toHaveBeenCalledWith('登録完了: test-processor, サポートタイプ: test:, demo:');
    });

    it('should initialize processor with config', async () => {
      const processor = new MockConstraintProcessor('init-processor', ['init:']);
      const config: ConstraintProcessorConfig = {
        enabled: true,
        timeout: 5000,
        config: { someOption: 'value' }
      };
      
      await manager.registerProcessor(processor, config);
      
      expect(processor.initialized).toBe(true);
    });

    it('should register multiple processors', async () => {
      const processor1 = new MockConstraintProcessor('processor-1', ['type1:']);
      const processor2 = new MockConstraintProcessor('processor-2', ['type2:']);
      const processor3 = new MockConstraintProcessor('processor-3', ['type3:']);
      
      await manager.registerProcessor(processor1);
      await manager.registerProcessor(processor2);
      await manager.registerProcessor(processor3);
      
      const processors = manager.getProcessors();
      expect(processors).toHaveLength(3);
    });
  });

  describe('unregisterProcessor', () => {
    it('should unregister processor and call cleanup', async () => {
      const processor = new MockConstraintProcessor('cleanup-processor', ['cleanup:']);
      
      await manager.registerProcessor(processor);
      await manager.unregisterProcessor('cleanup-processor');
      
      expect(processor.cleanedUp).toBe(true);
      expect(manager.getProcessors()).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith('制約プロセッサ登録解除: cleanup-processor');
    });

    it('should handle unregistering non-existent processor', async () => {
      await manager.unregisterProcessor('non-existent');
      
      expect(mockLogger.info).toHaveBeenCalledWith('制約プロセッサ登録解除: non-existent');
    });
  });

  describe('applyConstraints', () => {
    it('should apply single constraint successfully', async () => {
      const processor = new MockConstraintProcessor('data-processor', ['data:']);
      await manager.registerProcessor(processor);
      
      const inputData = { value: 'original' };
      const result = await manager.applyConstraints(['data:anonymize'], inputData, testContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        value: 'original',
        'processed_by_data-processor': true,
        'constraint_data:anonymize': 'applied'
      });
      expect(result.appliedConstraints).toEqual(['data:anonymize']);
      expect(mockLogger.info).toHaveBeenCalledWith('制約適用成功: data:anonymize');
    });

    it('should apply multiple constraints in order', async () => {
      const processor1 = new MockConstraintProcessor('processor1', ['step1:'], 
        async (constraint, data) => ({ ...data, step1: true })
      );
      const processor2 = new MockConstraintProcessor('processor2', ['step2:'],
        async (constraint, data) => ({ ...data, step2: true })
      );
      
      await manager.registerProcessor(processor1);
      await manager.registerProcessor(processor2);
      
      const result = await manager.applyConstraints(
        ['step1:process', 'step2:process'],
        { value: 'test' },
        testContext
      );
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        value: 'test',
        step1: true,
        step2: true
      });
      expect(result.appliedConstraints).toEqual(['step1:process', 'step2:process']);
    });

    it('should skip unknown constraints', async () => {
      const processor = new MockConstraintProcessor('known-processor', ['known:']);
      await manager.registerProcessor(processor);
      
      const result = await manager.applyConstraints(
        ['unknown:constraint', 'known:constraint'],
        { value: 'test' },
        testContext
      );
      
      expect(result.success).toBe(true);
      expect(result.appliedConstraints).toEqual(['known:constraint']);
      expect(mockLogger.warn).toHaveBeenCalledWith('制約プロセッサが見つかりません: unknown:constraint');
    });

    it('should handle processor failures', async () => {
      const processor = new MockConstraintProcessor('failing-processor', ['fail:'], undefined, true);
      await manager.registerProcessor(processor);
      
      const result = await manager.applyConstraints(['fail:test'], { value: 'test' }, testContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('制約適用失敗: fail:test');
      expect(mockLogger.error).toHaveBeenCalledWith('制約適用エラー: fail:test', expect.any(Error));
    });

    it('should respect processor timeout', async () => {
      const processor = new MockConstraintProcessor('slow-processor', ['slow:'], undefined, false, 2000);
      await manager.registerProcessor(processor, { enabled: true, timeout: 100 });
      
      const result = await manager.applyConstraints(['slow:test'], { value: 'test' }, testContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('タイムアウト: 100ms');
    });

    it('should skip disabled processors', async () => {
      const processor = new MockConstraintProcessor('disabled-processor', ['disabled:']);
      await manager.registerProcessor(processor, { enabled: false });
      
      const result = await manager.applyConstraints(['disabled:test'], { value: 'test' }, testContext);
      
      expect(result.appliedConstraints).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith('制約プロセッサが見つかりません: disabled:test');
    });

    it('should return original data when no constraints', async () => {
      const inputData = { value: 'original' };
      const result = await manager.applyConstraints([], inputData, testContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(inputData);
      expect(result.appliedConstraints).toEqual([]);
    });
  });

  describe('applyConstraint', () => {
    it('should apply single constraint successfully', async () => {
      const processor = new MockConstraintProcessor('single-processor', ['single:']);
      await manager.registerProcessor(processor);
      
      const result = await manager.applyConstraint('single:test', { value: 'test' }, testContext);
      
      expect(result).toHaveProperty('processed_by_single-processor', true);
    });

    it('should throw error on failure', async () => {
      const processor = new MockConstraintProcessor('error-processor', ['error:'], undefined, true);
      await manager.registerProcessor(processor);
      
      await expect(
        manager.applyConstraint('error:test', { value: 'test' }, testContext)
      ).rejects.toThrow('制約適用失敗: error:test');
    });
  });

  describe('findProcessorForConstraint', () => {
    it('should find correct processor for constraint', async () => {
      const processor1 = new MockConstraintProcessor('proc1', ['type1:', 'type2:']);
      const processor2 = new MockConstraintProcessor('proc2', ['type3:', 'type4:']);
      
      await manager.registerProcessor(processor1);
      await manager.registerProcessor(processor2);
      
      // Use applyConstraints to indirectly test findProcessorForConstraint
      const result1 = await manager.applyConstraints(['type1:test'], {}, testContext);
      expect(result1.data).toHaveProperty('processed_by_proc1');
      
      const result2 = await manager.applyConstraints(['type3:test'], {}, testContext);
      expect(result2.data).toHaveProperty('processed_by_proc2');
    });
  });

  describe('getProcessors', () => {
    it('should return empty array when no processors', () => {
      expect(manager.getProcessors()).toEqual([]);
    });

    it('should return all registered processors with status', async () => {
      await manager.registerProcessor(
        new MockConstraintProcessor('proc1', ['type1:']),
        { enabled: true }
      );
      await manager.registerProcessor(
        new MockConstraintProcessor('proc2', ['type2:']),
        { enabled: false }
      );
      await manager.registerProcessor(
        new MockConstraintProcessor('proc3', ['type3:'])
      );
      
      const processors = manager.getProcessors();
      expect(processors).toEqual([
        { name: 'proc1', supportedTypes: ['type1:'], enabled: true },
        { name: 'proc2', supportedTypes: ['type2:'], enabled: false },
        { name: 'proc3', supportedTypes: ['type3:'], enabled: true }
      ]);
    });
  });

  describe('updateProcessorConfig', () => {
    it('should update processor config', async () => {
      const processor = new MockConstraintProcessor('config-processor', ['config:']);
      await manager.registerProcessor(processor, { enabled: true, timeout: 5000 });
      
      manager.updateProcessorConfig('config-processor', { 
        enabled: false, 
        timeout: 10000 
      });
      
      const processors = manager.getProcessors();
      expect(processors[0].enabled).toBe(false);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'プロセッサ設定更新: config-processor',
        { enabled: false, timeout: 10000 }
      );
    });

    it('should create config for processor without initial config', async () => {
      const processor = new MockConstraintProcessor('no-config', ['test:']);
      await manager.registerProcessor(processor);
      
      manager.updateProcessorConfig('no-config', { timeout: 3000 });
      
      // Processor should still be enabled by default
      const processors = manager.getProcessors();
      expect(processors[0].enabled).toBe(true);
    });
  });
});