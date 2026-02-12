// ============================================================================
// Performance and Stress Tests
// パフォーマンスとストレステスト
// ============================================================================

import { MCPHttpProxy } from '../../mcp/http-proxy';
import { PolicyEnforcer } from '../../mcp/policy-enforcer';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { IntelligentCacheSystem } from '../../performance/intelligent-cache-system';
import { RateLimiterProcessor } from '../../core/constraints/processors/rate-limiter';
import { Logger } from '../../utils/logger';
import type { AEGISConfig, DecisionContext, PolicyDecision, AccessControlResult } from '../../types';
import { performance } from 'perf_hooks';
import * as os from 'os';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../ai/llm-factory');

// Test configuration
const STRESS_TEST_CONFIG = {
  CONCURRENT_USERS: 100,
  REQUESTS_PER_USER: 50,
  RAMP_UP_TIME: 5000, // 5 seconds
  TEST_DURATION: 30000, // 30 seconds
  CACHE_SIZE: 10000,
  RATE_LIMIT: 1000 // requests per minute
};

describe('Performance and Stress Tests', () => {
  let mockLogger: jest.Mocked<Logger>;
  let systemMetrics: {
    startTime: number;
    endTime: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    maxResponseTime: number;
    throughput: number;
    cpuUsage: number[];
    memoryUsage: number[];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    systemMetrics = {
      startTime: 0,
      endTime: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      maxResponseTime: 0,
      throughput: 0,
      cpuUsage: [],
      memoryUsage: []
    };
  });

  describe('Load Testing', () => {
    it('should handle sustained load within SLA', async () => {
      // SLA: 99% of requests < 100ms, 99.9% availability
      
      const responseTimes: number[] = [];
      const errors: Error[] = [];
      
      // Simulate sustained load
      const loadGenerator = async (userId: number) => {
        for (let i = 0; i < STRESS_TEST_CONFIG.REQUESTS_PER_USER; i++) {
          const startTime = performance.now();
          
          try {
            const context: DecisionContext = {
              agent: `user-${userId}`,
              action: 'read',
              resource: `resource-${i % 10}`, // 10 different resources
              purpose: 'load-test',
              time: new Date(),
              environment: {
                loadTest: true,
                requestId: `${userId}-${i}`
              }
            };

            // Simulate policy decision
            await simulatePolicyDecision(context);
            
            const responseTime = performance.now() - startTime;
            responseTimes.push(responseTime);
            systemMetrics.successfulRequests++;
            
          } catch (error) {
            errors.push(error as Error);
            systemMetrics.failedRequests++;
          }
          
          systemMetrics.totalRequests++;
          
          // Random delay between requests (0-50ms)
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        }
      };

      systemMetrics.startTime = performance.now();
      
      // Create user load
      const userPromises: Promise<void>[] = [];
      for (let i = 0; i < STRESS_TEST_CONFIG.CONCURRENT_USERS; i++) {
        // Ramp up users gradually
        await new Promise(resolve => 
          setTimeout(resolve, (STRESS_TEST_CONFIG.RAMP_UP_TIME / STRESS_TEST_CONFIG.CONCURRENT_USERS) * i)
        );
        userPromises.push(loadGenerator(i));
      }

      // Wait for all users to complete
      await Promise.all(userPromises);
      
      systemMetrics.endTime = performance.now();

      // Calculate metrics
      responseTimes.sort((a, b) => a - b);
      systemMetrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      systemMetrics.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
      systemMetrics.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
      systemMetrics.maxResponseTime = responseTimes[responseTimes.length - 1];
      systemMetrics.throughput = systemMetrics.totalRequests / ((systemMetrics.endTime - systemMetrics.startTime) / 1000);

      // Verify SLA
      expect(systemMetrics.p99ResponseTime).toBeLessThan(100); // 99% < 100ms
      expect(systemMetrics.successfulRequests / systemMetrics.totalRequests).toBeGreaterThan(0.999); // 99.9% availability
      
      console.log('Load Test Results:', {
        totalRequests: systemMetrics.totalRequests,
        avgResponseTime: `${systemMetrics.avgResponseTime.toFixed(2)}ms`,
        p95ResponseTime: `${systemMetrics.p95ResponseTime.toFixed(2)}ms`,
        p99ResponseTime: `${systemMetrics.p99ResponseTime.toFixed(2)}ms`,
        throughput: `${systemMetrics.throughput.toFixed(2)} req/s`,
        errorRate: `${((systemMetrics.failedRequests / systemMetrics.totalRequests) * 100).toFixed(2)}%`
      });
    }, 60000); // 60 second timeout for load test

    it('should handle burst traffic gracefully', async () => {
      // Simulate sudden traffic spike
      const burstSize = 1000;
      const normalTraffic = 10;
      const results: { phase: string; success: number; failed: number; avgTime: number }[] = [];

      // Normal traffic
      let phase1Results = await generateTraffic(normalTraffic, 100);
      results.push({ phase: 'normal', ...phase1Results });

      // Burst traffic
      let phase2Results = await generateTraffic(burstSize, 10);
      results.push({ phase: 'burst', ...phase2Results });

      // Recovery to normal
      let recoveryResults = await generateTraffic(normalTraffic, 100);
      results.push({ phase: 'recovery', ...recoveryResults });

      // System should handle burst without crashing
      expect(phase2Results.failed / (phase2Results.success + phase2Results.failed)).toBeLessThan(0.05); // <5% error rate during burst
      
      // System should recover quickly
      expect(recoveryResults.avgTime).toBeLessThan(phase1Results.avgTime * 1.2); // Within 20% of normal
    });
  });

  describe('Cache Performance', () => {
    it('should achieve high cache hit rate under repeated requests', async () => {
      const cache = new IntelligentCacheSystem({
        maxSize: STRESS_TEST_CONFIG.CACHE_SIZE,
        ttl: 300000, // 5 minutes
        strategy: 'lfu-with-aging'
      });

      const uniqueContexts = 100;
      const requestsPerContext = 100;
      let cacheHits = 0;
      let cacheMisses = 0;

      // Generate requests with repeating patterns
      for (let i = 0; i < uniqueContexts * requestsPerContext; i++) {
        const contextId = i % uniqueContexts;
        const context: DecisionContext = {
          agent: `agent-${contextId % 10}`,
          action: contextId % 2 === 0 ? 'read' : 'write',
          resource: `resource-${contextId % 20}`,
          purpose: 'cache-test',
          time: new Date(),
          environment: { contextId }
        };

        const cacheKey = generateCacheKey('test-policy', context);
        const cached = await cache.get(context, 'test-policy', context.environment);

        if (cached) {
          cacheHits++;
        } else {
          cacheMisses++;
          // Simulate policy decision and cache it
          const decision: AccessControlResult = {
            decision: 'PERMIT',
            reason: 'Cached decision',
            confidence: 0.95,
            policyUsed: 'test-policy',
            processingTime: 10,
            constraints: [],
            obligations: []
          };
          await cache.set(context, 'test-policy', context.environment, decision);
        }
      }

      const hitRate = cacheHits / (cacheHits + cacheMisses);
      expect(hitRate).toBeGreaterThan(0.95); // Should achieve >95% hit rate

      const cacheStats = cache.getStats();
      console.log('Cache Performance:', {
        hitRate: `${(hitRate * 100).toFixed(2)}%`,
        totalRequests: cacheHits + cacheMisses,
        cacheSize: cacheStats.totalEntries,
        evictions: cacheStats.evictionCount
      });
    });

    it('should maintain performance with cache eviction', async () => {
      const smallCache = new IntelligentCacheSystem({
        maxSize: 100, // Small cache to force evictions
        ttl: 300000,
        strategy: 'lru'
      });

      const requestTimes: number[] = [];
      const totalRequests = 1000;

      for (let i = 0; i < totalRequests; i++) {
        const startTime = performance.now();
        
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: `resource-${i}`, // Unique resource each time
          purpose: 'eviction-test',
          time: new Date(),
          environment: {}
        };

        // Try cache first
        let decision = await smallCache.get(context, 'test-policy', context.environment);
        
        if (!decision) {
          // Simulate decision making
          decision = await simulatePolicyDecision(context);
          await smallCache.set(context, 'test-policy', decision, context.environment);
        }

        requestTimes.push(performance.now() - startTime);
      }

      // Performance should remain stable despite evictions
      const firstHalf = requestTimes.slice(0, totalRequests / 2);
      const secondHalf = requestTimes.slice(totalRequests / 2);
      
      const avgFirstHalf = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      
      // Second half should not be significantly slower
      expect(avgSecondHalf).toBeLessThan(avgFirstHalf * 1.5);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limits without significant overhead', async () => {
      const rateLimiter = new RateLimiterProcessor();
      await rateLimiter.initialize({
        defaultLimit: STRESS_TEST_CONFIG.RATE_LIMIT,
        windowSize: 60000, // 1 minute
        strategy: 'sliding-window'
      });

      const clients = 10;
      const requestsPerClient = 200;
      const results: { clientId: number; allowed: number; denied: number; avgTime: number }[] = [];

      const clientRequests = async (clientId: number) => {
        const allowed: number[] = [];
        const denied: number[] = [];
        const times: number[] = [];

        for (let i = 0; i < requestsPerClient; i++) {
          const startTime = performance.now();
          
          const constraint = `rate-limit:${STRESS_TEST_CONFIG.RATE_LIMIT}/min`;
          const context: DecisionContext = {
            agent: `client-${clientId}`,
            action: 'api-call',
            resource: 'api-endpoint',
            purpose: 'rate-limit-test',
            time: new Date(),
            environment: {}
          };

          try {
            await rateLimiter.apply(constraint, {}, context);
            allowed.push(i);
          } catch (error) {
            denied.push(i);
          }

          times.push(performance.now() - startTime);
          
          // Simulate realistic request spacing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        }

        return {
          clientId,
          allowed: allowed.length,
          denied: denied.length,
          avgTime: times.reduce((a, b) => a + b) / times.length
        };
      };

      // Run clients concurrently
      const clientPromises = Array(clients).fill(null).map((_, i) => clientRequests(i));
      const clientResults = await Promise.all(clientPromises);
      
      results.push(...clientResults);

      // Verify rate limiting accuracy
      results.forEach(result => {
        const effectiveRate = (result.allowed / requestsPerClient) * requestsPerClient * 60; // per minute
        expect(effectiveRate).toBeLessThanOrEqual(STRESS_TEST_CONFIG.RATE_LIMIT * 1.1); // Within 10% tolerance
      });

      // Verify low overhead
      const avgOverhead = results.reduce((sum, r) => sum + r.avgTime, 0) / results.length;
      expect(avgOverhead).toBeLessThan(5); // <5ms overhead per request
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory under sustained load', async () => {
      const memorySnapshots: number[] = [];
      const duration = 10000; // 10 seconds
      const interval = 100; // Check every 100ms
      
      // Take initial snapshot
      if (global.gc) global.gc();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate continuous load
      const loadPromise = (async () => {
        const endTime = Date.now() + duration;
        while (Date.now() < endTime) {
          await simulatePolicyDecision({
            agent: 'memory-test',
            action: 'read',
            resource: `resource-${Math.random()}`,
            purpose: 'memory-test',
            time: new Date(),
            environment: {}
          });
        }
      })();

      // Monitor memory usage
      const monitorPromise = (async () => {
        const endTime = Date.now() + duration;
        while (Date.now() < endTime) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      })();

      await Promise.all([loadPromise, monitorPromise]);

      // Force garbage collection and take final snapshot
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage().heapUsed;

      // Memory growth should be minimal
      const memoryGrowth = finalMemory - initialMemory;
      const growthPercentage = (memoryGrowth / initialMemory) * 100;
      
      expect(growthPercentage).toBeLessThan(10); // Less than 10% growth

      // Check for memory stability (no continuous growth)
      const secondHalf = memorySnapshots.slice(memorySnapshots.length / 2);
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
      const trend = (avgSecondHalf - memorySnapshots[0]) / memorySnapshots[0];
      
      expect(trend).toBeLessThan(0.05); // Less than 5% trending growth
    });

    it('should handle resource exhaustion gracefully', async () => {
      // Simulate various resource exhaustion scenarios
      const scenarios = [
        {
          name: 'CPU saturation',
          load: () => {
            // CPU-intensive operation
            const start = Date.now();
            while (Date.now() - start < 100) {
              Math.sqrt(Math.random());
            }
          }
        },
        {
          name: 'Memory pressure',
          load: () => {
            // Allocate large arrays
            const arrays = [];
            for (let i = 0; i < 100; i++) {
              arrays.push(new Array(10000).fill(Math.random()));
            }
            return arrays.length; // Prevent optimization
          }
        },
        {
          name: 'I/O saturation',
          load: async () => {
            // Simulate many concurrent I/O operations
            const promises = Array(100).fill(null).map(() => 
              new Promise(resolve => setTimeout(resolve, 1))
            );
            await Promise.all(promises);
          }
        }
      ];

      for (const scenario of scenarios) {
        const results = { success: 0, failed: 0, degraded: 0 };
        const responseTimes: number[] = [];

        // Apply load while making requests
        const testPromises = Array(50).fill(null).map(async () => {
          const startTime = performance.now();
          
          try {
            // Apply resource pressure
            await scenario.load();
            
            // Try to make decision
            await simulatePolicyDecision({
              agent: 'resource-test',
              action: 'read',
              resource: 'test-resource',
              purpose: scenario.name,
              time: new Date(),
              environment: {}
            });
            
            const responseTime = performance.now() - startTime;
            responseTimes.push(responseTime);
            
            if (responseTime > 1000) {
              results.degraded++;
            } else {
              results.success++;
            }
          } catch (error) {
            results.failed++;
          }
        });

        await Promise.all(testPromises);

        // System should remain responsive
        expect(results.failed / (results.success + results.failed + results.degraded)).toBeLessThan(0.01); // <1% failure rate
        
        console.log(`Resource exhaustion test - ${scenario.name}:`, results);
      }
    });
  });

  // Helper functions
  async function simulatePolicyDecision(context: DecisionContext): Promise<PolicyDecision> {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 10));
    
    return {
      decision: Math.random() > 0.1 ? 'PERMIT' : 'DENY',
      reason: 'Simulated decision',
      confidence: 0.9 + Math.random() * 0.1
    };
  }

  async function generateTraffic(
    concurrent: number, 
    requests: number
  ): Promise<{ success: number; failed: number; avgTime: number }> {
    let success = 0;
    let failed = 0;
    const times: number[] = [];

    const promises = Array(concurrent).fill(null).map(async () => {
      for (let i = 0; i < requests; i++) {
        const startTime = performance.now();
        try {
          await simulatePolicyDecision({
            agent: `traffic-${concurrent}-${i}`,
            action: 'read',
            resource: 'test-resource',
            purpose: 'traffic-test',
            time: new Date(),
            environment: {}
          });
          success++;
          times.push(performance.now() - startTime);
        } catch (error) {
          failed++;
        }
      }
    });

    await Promise.all(promises);

    return {
      success,
      failed,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length
    };
  }

  function generateCacheKey(policy: string, context: DecisionContext): string {
    return `${policy}:${context.agent}:${context.action}:${context.resource}`;
  }
});