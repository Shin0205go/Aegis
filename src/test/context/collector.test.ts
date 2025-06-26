// ============================================================================
// ContextCollector Test Suite
// ============================================================================

import { ContextCollector, ContextEnricher } from '../../context/collector';
import { DecisionContext } from '../../types';
import { Logger } from '../../utils/logger';

// Mock logger
jest.mock('../../utils/logger');

// Mock enricher implementations
class MockEnricher implements ContextEnricher {
  constructor(
    public name: string,
    private enrichData: Record<string, any>,
    private shouldFail: boolean = false,
    private delay: number = 0
  ) {}

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }
    
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    
    return this.enrichData;
  }
}

describe('ContextCollector', () => {
  let collector: ContextCollector;
  let mockLogger: jest.Mocked<Logger>;

  const baseContext: DecisionContext = {
    agent: 'test-agent',
    action: 'read',
    resource: 'file://test.txt',
    purpose: 'testing',
    time: new Date(),
    environment: {
      transport: 'http'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    collector = new ContextCollector();
    mockLogger = (Logger as jest.MockedClass<typeof Logger>).mock.instances[0] as jest.Mocked<Logger>;
  });

  describe('registerEnricher', () => {
    it('should register enricher successfully', () => {
      const enricher = new MockEnricher('test-enricher', { test: 'data' });
      
      collector.registerEnricher(enricher);
      
      expect(collector.getEnrichers()).toContain('test-enricher');
      expect(mockLogger.info).toHaveBeenCalledWith('エンリッチャー登録: test-enricher');
    });

    it('should allow registering multiple enrichers', () => {
      const enricher1 = new MockEnricher('enricher-1', { data1: 'value1' });
      const enricher2 = new MockEnricher('enricher-2', { data2: 'value2' });
      
      collector.registerEnricher(enricher1);
      collector.registerEnricher(enricher2);
      
      expect(collector.getEnrichers()).toHaveLength(2);
      expect(collector.getEnrichers()).toContain('enricher-1');
      expect(collector.getEnrichers()).toContain('enricher-2');
    });

    it('should overwrite existing enricher with same name', () => {
      const enricher1 = new MockEnricher('same-name', { data: 'original' });
      const enricher2 = new MockEnricher('same-name', { data: 'updated' });
      
      collector.registerEnricher(enricher1);
      collector.registerEnricher(enricher2);
      
      expect(collector.getEnrichers()).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('unregisterEnricher', () => {
    it('should unregister enricher successfully', () => {
      const enricher = new MockEnricher('test-enricher', { test: 'data' });
      
      collector.registerEnricher(enricher);
      collector.unregisterEnricher('test-enricher');
      
      expect(collector.getEnrichers()).not.toContain('test-enricher');
      expect(mockLogger.info).toHaveBeenCalledWith('エンリッチャー削除: test-enricher');
    });

    it('should handle unregistering non-existent enricher', () => {
      collector.unregisterEnricher('non-existent');
      
      expect(mockLogger.info).toHaveBeenCalledWith('エンリッチャー削除: non-existent');
    });
  });

  describe('enrichContext', () => {
    it('should enrich context with single enricher', async () => {
      const enricher = new MockEnricher('time-enricher', {
        'time-enricher': {
          currentTime: '2024-01-01T00:00:00Z',
          timezone: 'UTC'
        }
      });
      
      collector.registerEnricher(enricher);
      const enrichedContext = await collector.enrichContext(baseContext);
      
      expect(enrichedContext.environment.enrichments).toHaveProperty('time-enricher');
      expect(enrichedContext.environment.enrichments['time-enricher']).toEqual({
        currentTime: '2024-01-01T00:00:00Z',
        timezone: 'UTC'
      });
      expect(enrichedContext.environment.enrichmentTime).toBeGreaterThanOrEqual(0);
    });

    it('should enrich context with multiple enrichers in parallel', async () => {
      const enricher1 = new MockEnricher('enricher-1', { 'enricher-1': { data1: 'value1' } }, false, 50);
      const enricher2 = new MockEnricher('enricher-2', { 'enricher-2': { data2: 'value2' } }, false, 50);
      const enricher3 = new MockEnricher('enricher-3', { 'enricher-3': { data3: 'value3' } }, false, 50);
      
      collector.registerEnricher(enricher1);
      collector.registerEnricher(enricher2);
      collector.registerEnricher(enricher3);
      
      const startTime = Date.now();
      const enrichedContext = await collector.enrichContext(baseContext);
      const totalTime = Date.now() - startTime;
      
      // Should execute in parallel, so total time should be close to the longest delay (50ms)
      // not the sum (150ms)
      expect(totalTime).toBeLessThan(100);
      
      expect(enrichedContext.environment.enrichments).toHaveProperty('enricher-1');
      expect(enrichedContext.environment.enrichments).toHaveProperty('enricher-2');
      expect(enrichedContext.environment.enrichments).toHaveProperty('enricher-3');
    });

    it('should handle enricher failures gracefully', async () => {
      const successEnricher = new MockEnricher('success', { 'success': { data: 'ok' } });
      const failEnricher = new MockEnricher('fail', {}, true);
      
      collector.registerEnricher(successEnricher);
      collector.registerEnricher(failEnricher);
      
      const enrichedContext = await collector.enrichContext(baseContext);
      
      // Should still get data from successful enricher
      expect(enrichedContext.environment.enrichments).toHaveProperty('success');
      expect(enrichedContext.environment.enrichments['success']).toEqual({ data: 'ok' });
      
      // Failed enricher should not appear in results
      expect(enrichedContext.environment.enrichments).not.toHaveProperty('fail');
      
      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        'エンリッチャーエラー [fail]:',
        expect.any(Error)
      );
    });

    it('should handle enricher returning data without wrapper object', async () => {
      const enricher = new MockEnricher('simple', { data: 'value' });
      
      collector.registerEnricher(enricher);
      const enrichedContext = await collector.enrichContext(baseContext);
      
      expect(enrichedContext.environment.enrichments).toHaveProperty('simple');
      expect(enrichedContext.environment.enrichments.simple).toEqual({ data: 'value' });
    });

    it('should preserve original context properties', async () => {
      const enricher = new MockEnricher('test', { 'test': { data: 'value' } });
      collector.registerEnricher(enricher);
      
      const enrichedContext = await collector.enrichContext(baseContext);
      
      expect(enrichedContext.agent).toBe(baseContext.agent);
      expect(enrichedContext.action).toBe(baseContext.action);
      expect(enrichedContext.resource).toBe(baseContext.resource);
      expect(enrichedContext.purpose).toBe(baseContext.purpose);
      expect(enrichedContext.time).toBe(baseContext.time);
      expect(enrichedContext.environment.transport).toBe(baseContext.environment.transport);
    });

    it('should work with no enrichers', async () => {
      const enrichedContext = await collector.enrichContext(baseContext);
      
      expect(enrichedContext.environment.enrichments).toEqual({});
      expect(enrichedContext.environment.enrichmentTime).toBeGreaterThanOrEqual(0);
    });

    it('should log enrichment completion', async () => {
      const enricher = new MockEnricher('test', { 'test': { data: 'value' } });
      collector.registerEnricher(enricher);
      
      await collector.enrichContext(baseContext);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'コンテキスト拡張完了',
        expect.objectContaining({
          originalContext: baseContext,
          enrichedContext: expect.any(Object),
          enrichmentTime: expect.any(Number)
        })
      );
    });
  });

  describe('getEnrichers', () => {
    it('should return empty array when no enrichers registered', () => {
      expect(collector.getEnrichers()).toEqual([]);
    });

    it('should return list of registered enricher names', () => {
      collector.registerEnricher(new MockEnricher('enricher-1', {}));
      collector.registerEnricher(new MockEnricher('enricher-2', {}));
      collector.registerEnricher(new MockEnricher('enricher-3', {}));
      
      const enrichers = collector.getEnrichers();
      expect(enrichers).toHaveLength(3);
      expect(enrichers).toContain('enricher-1');
      expect(enrichers).toContain('enricher-2');
      expect(enrichers).toContain('enricher-3');
    });
  });

  describe('getEnrichmentStats', () => {
    it('should return stats with no enrichers', async () => {
      const stats = await collector.getEnrichmentStats();
      
      expect(stats).toEqual({
        totalEnrichers: 0,
        enrichers: []
      });
    });

    it('should return stats with enrichers', async () => {
      collector.registerEnricher(new MockEnricher('enricher-1', {}));
      collector.registerEnricher(new MockEnricher('enricher-2', {}));
      
      const stats = await collector.getEnrichmentStats();
      
      expect(stats).toEqual({
        totalEnrichers: 2,
        enrichers: ['enricher-1', 'enricher-2']
      });
    });
  });
});