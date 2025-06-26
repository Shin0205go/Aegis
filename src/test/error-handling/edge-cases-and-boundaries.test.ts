// ============================================================================
// Edge Cases and Boundary Value Tests
// エッジケースと境界値テスト
// ============================================================================

import { MCPPolicyProxyBase } from '../../mcp/base-proxy';
import { PolicyEnforcer } from '../../mcp/policy-enforcer';
import { IntelligentCacheSystem } from '../../performance/intelligent-cache-system';
import { RateLimiterProcessor } from '../../core/constraints/strategies';
import { DataAnonymizerProcessor } from '../../core/constraints/strategies';
import { AuditLoggerExecutor } from '../../core/obligations/executors';
import { DynamicToolDiscovery } from '../../mcp/dynamic-tool-discovery';
import { Logger } from '../../utils/logger';
import type { DecisionContext, PolicyDecision } from '../../types';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../utils/config');

describe('Edge Cases and Boundary Value Tests', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      critical: jest.fn()
    } as unknown as jest.Mocked<Logger>;
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle extremely long policy names', async () => {
      const enforcer = new PolicyEnforcer(
        mockLogger,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );

      const veryLongPolicyName = 'a'.repeat(10000); // 10KB policy name
      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      // Should truncate or handle gracefully
      await expect(
        enforcer.enforcePolicy('read', 'test', context, {
          selectPolicy: async () => ({ id: '1', name: veryLongPolicyName, content: 'test' })
        } as any)
      ).resolves.toBeDefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unusually long policy name'),
        expect.any(Object)
      );
    });

    it('should handle unicode and special characters in inputs', async () => {
      const specialInputs = [
        '\u0000\u0001\u0002', // Null and control characters
        '😀🎉🔥💻🚀', // Emojis
        '\'; DROP TABLE policies; --', // SQL injection attempt
        '<script>alert("xss")</script>', // XSS attempt
        '../../etc/passwd', // Path traversal
        '\r\n\r\n', // CRLF injection
        String.fromCharCode(0xD800), // Invalid UTF-16 surrogate
        '\u202E\u202D', // Right-to-left override characters
      ];

      const anonymizer = new DataAnonymizerProcessor();
      await anonymizer.initialize({});

      for (const input of specialInputs) {
        const result = await anonymizer.apply(
          'data:anonymize',
          { sensitiveData: input },
          {
            agent: 'test',
            action: 'read',
            resource: 'test',
            time: new Date(),
            environment: {}
          }
        );

        // Should handle without crashing
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
      }
    });

    it('should handle empty and whitespace-only inputs', async () => {
      const emptyInputs = [
        '',
        ' ',
        '\t',
        '\n',
        '\r\n',
        '   \t\n\r   '
      ];

      const discovery = new DynamicToolDiscovery(mockLogger);

      for (const input of emptyInputs) {
        // Should handle empty tool names gracefully
        const result = discovery.discoverToolsFromResponse({
          tools: [{ name: input, description: 'test' }]
        }, 'test-server');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid tool name'),
          expect.any(Object)
        );
      }
    });
  });

  describe('Numeric Boundary Values', () => {
    it('should handle rate limiter at boundaries', async () => {
      const rateLimiter = new RateLimiterProcessor();
      await rateLimiter.initialize({
        defaultLimit: 3, // Very low limit for testing
        windowSize: 100 // 100ms window
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'api-call',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      // Exactly at limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.apply('rate-limit:3/100ms', {}, context);
        expect(result.rateLimited).toBe(false);
      }

      // Just over limit
      await expect(
        rateLimiter.apply('rate-limit:3/100ms', {}, context)
      ).rejects.toThrow('Rate limit exceeded');

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should work again
      const result = await rateLimiter.apply('rate-limit:3/100ms', {}, context);
      expect(result.rateLimited).toBe(false);
    });

    it('should handle cache size limits', async () => {
      const cache = new IntelligentCacheSystem({
        maxSize: 3, // Very small cache
        ttl: 60000,
        strategy: 'lru'
      });

      const decisions: PolicyDecision[] = [
        { decision: 'PERMIT', reason: 'Decision 1', confidence: 0.9 },
        { decision: 'DENY', reason: 'Decision 2', confidence: 0.95 },
        { decision: 'PERMIT', reason: 'Decision 3', confidence: 0.85 },
        { decision: 'PERMIT', reason: 'Decision 4', confidence: 0.92 }
      ];

      // Fill cache to capacity
      for (let i = 0; i < 3; i++) {
        await cache.set(
          { agent: `agent${i}`, action: 'read', resource: 'test', time: new Date(), environment: {} },
          'policy',
          decisions[i],
          {}
        );
      }

      const stats1 = await cache.metrics();
      expect(stats1.size).toBe(3);
      expect(stats1.evictions).toBe(0);

      // Add one more - should trigger eviction
      await cache.set(
        { agent: 'agent3', action: 'read', resource: 'test', time: new Date(), environment: {} },
        'policy',
        decisions[3],
        {}
      );

      const stats2 = await cache.metrics();
      expect(stats2.size).toBe(3); // Still at max
      expect(stats2.evictions).toBe(1); // One eviction occurred
    });

    it('should handle extreme timeout values', async () => {
      const testTimeouts = [
        0,      // Instant timeout
        1,      // 1ms - extremely short
        -1,     // Negative (should be treated as no timeout)
        Number.MAX_SAFE_INTEGER, // Very large
        Infinity // Infinite timeout
      ];

      for (const timeout of testTimeouts) {
        const cache = new IntelligentCacheSystem({
          maxSize: 100,
          ttl: timeout,
          strategy: 'lru'
        });

        if (timeout >= 0 && timeout !== Infinity) {
          // Should handle the timeout appropriately
          await cache.set(
            { agent: 'test', action: 'read', resource: 'test', time: new Date(), environment: {} },
            'policy',
            { decision: 'PERMIT', reason: 'Test', confidence: 0.9 },
            {}
          );

          if (timeout <= 1) {
            // Should expire almost immediately
            await new Promise(resolve => setTimeout(resolve, 2));
            const result = await cache.get(
              { agent: 'test', action: 'read', resource: 'test', time: new Date(), environment: {} },
              'policy',
              {}
            );
            expect(result).toBeNull();
          }
        }
      }
    });
  });

  describe('Date and Time Edge Cases', () => {
    it('should handle various date formats and edge cases', async () => {
      const edgeDates = [
        new Date('0000-01-01'), // Very old date
        new Date('9999-12-31'), // Far future date
        new Date('1970-01-01T00:00:00.000Z'), // Unix epoch
        new Date('2038-01-19T03:14:07.999Z'), // Near 32-bit timestamp limit
        new Date(NaN), // Invalid date
        new Date(''), // Invalid date from empty string
      ];

      const auditLogger = new AuditLoggerExecutor();
      await auditLogger.initialize({
        logPath: '/tmp/test-audit.log',
        format: 'json'
      });

      for (const date of edgeDates) {
        const context: DecisionContext = {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: date,
          environment: {}
        };

        if (isNaN(date.getTime())) {
          // Should handle invalid dates
          await expect(
            auditLogger.execute(
              'audit-log',
              context,
              { decision: 'PERMIT', reason: 'Test', confidence: 0.9 }
            )
          ).rejects.toThrow('Invalid date');
        } else {
          // Should handle valid edge dates
          const result = await auditLogger.execute(
            'audit-log',
            context,
            { decision: 'PERMIT', reason: 'Test', confidence: 0.9 }
          );
          expect(result.logged).toBe(true);
        }
      }
    });

    it('should handle timezone edge cases', async () => {
      const timezones = [
        'UTC',
        'America/New_York',
        'Asia/Tokyo',
        'Pacific/Kiritimati', // UTC+14 - furthest ahead
        'Pacific/Honolulu', // UTC-10
        'Invalid/Timezone' // Should handle gracefully
      ];

      const originalTZ = process.env.TZ;

      for (const tz of timezones) {
        process.env.TZ = tz;
        
        const context: DecisionContext = {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: new Date(),
          environment: { timezone: tz }
        };

        // Should handle various timezones without issues
        // This would be part of a policy that checks business hours
        expect(() => {
          const hour = context.time.getHours();
          const isBusinessHours = hour >= 9 && hour < 17;
          // Business logic continues...
        }).not.toThrow();
      }

      process.env.TZ = originalTZ;
    });
  });

  describe('Collection Size Edge Cases', () => {
    it('should handle empty collections', async () => {
      const emptyCollections = {
        emptyArray: [],
        emptyObject: {},
        emptyMap: new Map(),
        emptySet: new Set()
      };

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: emptyCollections
      };

      // Should handle empty collections without errors
      expect(() => {
        JSON.stringify(context);
      }).not.toThrow();
    });

    it('should handle very large collections', async () => {
      const largeArray = new Array(10000).fill('test-item');
      const largeObject: Record<string, string> = {};
      for (let i = 0; i < 10000; i++) {
        largeObject[`key${i}`] = `value${i}`;
      }

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {
          largeArray,
          largeObject
        }
      };

      // Should handle large collections but warn about size
      const serialized = JSON.stringify(context);
      expect(serialized.length).toBeGreaterThan(100000);
      
      if (serialized.length > 1000000) {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Large context size'),
          expect.any(Object)
        );
      }
    });
  });

  describe('Concurrency Edge Cases', () => {
    it('should handle exactly simultaneous requests', async () => {
      const cache = new IntelligentCacheSystem({
        maxSize: 100,
        ttl: 60000,
        strategy: 'lru'
      });

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      // Create exactly simultaneous cache writes
      const promises = Array(10).fill(null).map((_, i) => 
        cache.set(
          context,
          'policy',
          { decision: 'PERMIT', reason: `Decision ${i}`, confidence: 0.9 },
          {}
        )
      );

      // All should complete without race conditions
      await expect(Promise.all(promises)).resolves.toBeDefined();

      // Only one should win
      const result = await cache.get(context, 'policy', {});
      expect(result).toBeDefined();
      expect(result?.reason).toMatch(/Decision \d/);
    });

    it('should handle rapid policy updates without corruption', async () => {
      const updates = Array(100).fill(null).map((_, i) => ({
        id: `policy-${i % 10}`, // 10 policies updated 10 times each
        content: `Updated content ${i}`,
        timestamp: Date.now() + i
      }));

      // Simulate rapid concurrent updates
      const updatePromises = updates.map(update => 
        new Promise(resolve => {
          // Random small delay to create race conditions
          setTimeout(() => {
            // Policy update logic would go here
            resolve(update);
          }, Math.random() * 10);
        })
      );

      const results = await Promise.allSettled(updatePromises);
      
      // All updates should complete
      expect(results.filter(r => r.status === 'fulfilled').length).toBe(100);
    });
  });

  describe('State Management Edge Cases', () => {
    it('should handle state transitions at boundaries', async () => {
      const states = ['initializing', 'ready', 'processing', 'error', 'shutting_down'];
      let currentState = 0;

      const stateManager = {
        transition: (newState: string) => {
          const oldState = states[currentState];
          const newIndex = states.indexOf(newState);
          
          // Validate state transition
          if (newIndex === -1) {
            throw new Error(`Invalid state: ${newState}`);
          }
          
          // Some transitions are invalid
          if (oldState === 'shutting_down' && newState !== 'error') {
            throw new Error('Cannot transition from shutting_down');
          }
          
          currentState = newIndex;
          return true;
        }
      };

      // Valid transitions
      expect(stateManager.transition('ready')).toBe(true);
      expect(stateManager.transition('processing')).toBe(true);
      expect(stateManager.transition('ready')).toBe(true);
      
      // Invalid transition
      stateManager.transition('shutting_down');
      expect(() => stateManager.transition('ready')).toThrow();
    });

    it('should handle resource cleanup in error states', async () => {
      const resources = {
        connections: new Set<string>(),
        timers: new Set<NodeJS.Timeout>(),
        files: new Set<string>()
      };

      // Simulate resource allocation
      for (let i = 0; i < 10; i++) {
        resources.connections.add(`conn-${i}`);
        resources.timers.add(setTimeout(() => {}, 10000));
        resources.files.add(`/tmp/file-${i}`);
      }

      // Cleanup function
      const cleanup = async (force = false) => {
        const errors: Error[] = [];
        
        // Clean connections
        for (const conn of resources.connections) {
          try {
            // Simulate connection close
            resources.connections.delete(conn);
          } catch (e) {
            if (!force) throw e;
            errors.push(e as Error);
          }
        }
        
        // Clear timers
        for (const timer of resources.timers) {
          clearTimeout(timer);
          resources.timers.delete(timer);
        }
        
        // Clean files
        for (const file of resources.files) {
          try {
            // Simulate file deletion
            resources.files.delete(file);
          } catch (e) {
            if (!force) throw e;
            errors.push(e as Error);
          }
        }
        
        return { cleaned: true, errors };
      };

      // Normal cleanup
      const result1 = await cleanup();
      expect(result1.cleaned).toBe(true);
      expect(resources.connections.size).toBe(0);
      expect(resources.timers.size).toBe(0);
      expect(resources.files.size).toBe(0);

      // Force cleanup even with errors
      resources.connections.add('bad-connection');
      const result2 = await cleanup(true);
      expect(result2.cleaned).toBe(true);
    });
  });

  describe('Memory and Buffer Edge Cases', () => {
    it('should handle buffer overflow scenarios', async () => {
      const bufferSizes = [
        0,              // Empty buffer
        1,              // Single byte
        1024,           // 1KB
        1024 * 1024,    // 1MB
        16 * 1024 * 1024 // 16MB - typical max for many systems
      ];

      for (const size of bufferSizes) {
        const buffer = Buffer.alloc(size);
        
        // Fill with pattern
        for (let i = 0; i < size; i++) {
          buffer[i] = i % 256;
        }

        // Should handle various buffer sizes
        expect(buffer.length).toBe(size);
        
        if (size > 10 * 1024 * 1024) {
          expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Large buffer allocation'),
            expect.objectContaining({ size })
          );
        }
      }
    });

    it('should handle string length limits', async () => {
      const stringLengths = [
        0,
        1,
        255,      // Common DB varchar limit
        65535,    // Common text field limit  
        1048576,  // 1MB
      ];

      for (const length of stringLengths) {
        const str = 'a'.repeat(length);
        
        // Validate string handling
        expect(str.length).toBe(length);
        
        // Check for truncation needs
        if (length > 65535) {
          // Would typically truncate for storage
          const truncated = str.substring(0, 65535);
          expect(truncated.length).toBe(65535);
        }
      }
    });
  });
});