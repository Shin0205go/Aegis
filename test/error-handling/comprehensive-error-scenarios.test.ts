// ============================================================================
// Comprehensive Error Handling Test Suite
// 包括的なエラーハンドリングテスト
// ============================================================================

import { MCPStdioProxy } from '../../../src/mcp/stdio-proxy';
import { MCPHttpProxy } from '../../../src/mcp/http-proxy';
import { PolicyEnforcer } from '../../../src/mcp/policy-enforcer';
import { AIJudgmentEngine } from '../../../src/ai/judgment-engine';
import { ContextCollector } from '../../../src/context/collector';
import { ConstraintProcessorManager } from '../../../src/core/constraints/manager';
import { ObligationExecutorManager } from '../../../src/core/obligations/manager';
import { StdioRouter } from '../../../src/mcp/stdio-router';
import { ToolDiscoveryService } from '../../../src/mcp/tool-discovery';
import { HybridPolicyEngine } from '../../../src/policies/hybrid-policy-engine';
import { Logger } from '../../../src/utils/logger';
import type { DecisionContext, PolicyDecision, AEGISConfig } from '../../../src/types';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as net from 'net';

// Mock all dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/ai/llm-factory');
jest.mock('child_process');
jest.mock('fs/promises');

describe('Comprehensive Error Handling Tests', () => {
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

    (Logger as any).mockImplementation(() => mockLogger);
  });

  describe('Network and Connection Errors', () => {
    it('should handle network timeout during upstream MCP server communication', async () => {
      const router = new StdioRouter(
        [{
          name: 'test-server',
          command: 'node',
          args: ['server.js'],
          env: {}
        }],
        'test-prefix'
      );

      // Mock spawn to simulate timeout
      const mockProcess = {
        stdout: { on: jest.fn(), once: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn() },
        on: jest.fn((event, handler) => {
          if (event === 'spawn') {
            // Simulate spawn but then timeout
            setTimeout(() => handler(), 10);
          }
        }),
        kill: jest.fn()
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      // Simulate connection timeout
      mockProcess.stdout.once.mockImplementation((event, handler) => {
        if (event === 'data') {
          // Never call handler - simulate timeout
          setTimeout(() => {
            mockProcess.on.mock.calls
              .find(([e]) => e === 'error')?.[1]
              (new Error('Connection timeout'));
          }, 100);
        }
      });

      const initPromise = router.initialize();
      
      await expect(initPromise).rejects.toThrow('Connection timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect'),
        expect.any(Object)
      );
    });

    it('should handle sudden disconnection of upstream server', async () => {
      const proxy = new MCPStdioProxy({
        port: 3001,
        upstreamMCPServers: [{
          name: 'unstable-server',
          command: 'node',
          args: ['server.js'],
          env: {}
        }]
      });

      // Mock server that disconnects after initial connection
      const mockProcess = {
        stdout: { on: jest.fn(), once: jest.fn() },
        stderr: { on: jest.fn() },
        stdin: { write: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };

      (spawn as jest.Mock).mockReturnValue(mockProcess);

      // Simulate successful initial connection
      mockProcess.stdout.once.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(`content-length: 2\r\n\r\n{}\r\n`));
        }
      });

      // Then simulate unexpected disconnection
      setTimeout(() => {
        const exitHandler = mockProcess.on.mock.calls.find(([e]) => e === 'exit')?.[1];
        if (exitHandler) exitHandler(1, null);
      }, 50);

      // Try to make a request after disconnection
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      };

      await expect(proxy.handleRequest(request)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Process exited'),
        expect.objectContaining({ code: 1 })
      );
    });

    it('should handle HTTP proxy connection refused', async () => {
      const httpProxy = new MCPHttpProxy({
        port: 3002,
        upstreamMCPServers: [{
          url: 'http://localhost:9999', // Non-existent server
          name: 'test-http-server'
        }]
      });

      // Mock fetch to simulate connection refused
      global.fetch = jest.fn().mockRejectedValue(
        new Error('fetch failed: ECONNREFUSED')
      );

      const request = {
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: 'test://resource' },
        id: 1
      };

      await expect(httpProxy.handleRequest(request)).rejects.toThrow('ECONNREFUSED');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('HTTP request failed'),
        expect.any(Object)
      );
    });
  });

  describe('Policy Engine Errors', () => {
    it('should handle policy file not found', async () => {
      const policyEngine = new HybridPolicyEngine(mockLogger);
      
      // Mock file not found
      (fs.readdir as jest.Mock).mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      await expect(policyEngine.loadPolicies()).rejects.toThrow('ENOENT');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load policies'),
        expect.any(Object)
      );
    });

    it('should handle corrupted policy file', async () => {
      const policyEngine = new HybridPolicyEngine(mockLogger);
      
      // Mock corrupted JSON
      (fs.readdir as jest.Mock).mockResolvedValue(['policy1.json']);
      (fs.readFile as jest.Mock).mockResolvedValue(
        Buffer.from('{ invalid json ]}')
      );

      await expect(policyEngine.loadPolicies()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse policy'),
        expect.any(Object)
      );
    });

    it('should handle circular policy references', async () => {
      const policyEngine = new HybridPolicyEngine(mockLogger);
      
      // Mock policies with circular reference
      const circularPolicy1 = {
        id: 'policy1',
        name: 'Policy 1',
        includes: ['policy2']
      };
      
      const circularPolicy2 = {
        id: 'policy2',
        name: 'Policy 2',
        includes: ['policy1'] // Circular reference
      };

      (fs.readdir as jest.Mock).mockResolvedValue(['policy1.json', 'policy2.json']);
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(circularPolicy1))
        .mockResolvedValueOnce(JSON.stringify(circularPolicy2));

      await expect(policyEngine.loadPolicies()).rejects.toThrow('Circular');
    });
  });

  describe('AI Judgment Engine Errors', () => {
    it('should handle LLM API rate limit', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key'
      });

      const mockLLM = {
        complete: jest.fn().mockRejectedValue(
          new Error('Rate limit exceeded: 429 Too Many Requests')
        )
      };

      (engine as any).llm = mockLLM;

      const policy = 'Test policy';
      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      const result = await engine.makeDecision(policy, context);
      
      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reason).toContain('Rate limit');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit hit'),
        expect.any(Object)
      );
    });

    it('should handle malformed LLM response', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key'
      });

      const mockLLM = {
        complete: jest.fn().mockResolvedValue(
          'This is not JSON at all, just plain text response'
        )
      };

      (engine as any).llm = mockLLM;

      const result = await engine.makeDecision('policy', {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      });

      expect(result.decision).toBe('INDETERMINATE');
      expect(result.reason).toContain('判定処理エラー');
    });

    it('should handle LLM returning invalid decision values', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key'
      });

      const mockLLM = {
        complete: jest.fn().mockResolvedValue(JSON.stringify({
          decision: 'MAYBE', // Invalid decision value
          reason: 'Not sure',
          confidence: 2.5 // Invalid confidence > 1
        }))
      };

      (engine as any).llm = mockLLM;

      const result = await engine.makeDecision('policy', {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      });

      expect(result.decision).toBe('INDETERMINATE');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid decision format'),
        expect.any(Object)
      );
    });
  });

  describe('Constraint Processing Errors', () => {
    it('should handle constraint processor initialization failure', async () => {
      const manager = new ConstraintProcessorManager(mockLogger);
      
      // Register a failing processor
      const failingProcessor = {
        name: 'failing-processor',
        canHandle: jest.fn().mockReturnValue(true),
        apply: jest.fn(),
        initialize: jest.fn().mockRejectedValue(
          new Error('Failed to connect to external service')
        )
      };

      manager.registerProcessor(failingProcessor);

      await expect(
        manager.initialize({ processors: { 'failing-processor': { enabled: true } } })
      ).rejects.toThrow('Failed to connect');
    });

    it('should handle constraint application timeout', async () => {
      const manager = new ConstraintProcessorManager(mockLogger);
      
      const slowProcessor = {
        name: 'slow-processor',
        canHandle: jest.fn().mockReturnValue(true),
        apply: jest.fn().mockImplementation(async () => {
          // Simulate very slow processing
          await new Promise(resolve => setTimeout(resolve, 10000));
        })
      };

      manager.registerProcessor(slowProcessor);
      
      // Set short timeout
      manager.setTimeout(100);

      const resultPromise = manager.applyConstraints(
        ['slow-processor:test'],
        { data: 'test' },
        {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: new Date(),
          environment: {}
        }
      );

      await expect(resultPromise).rejects.toThrow('Constraint processing timeout');
    });

    it('should handle cyclic constraint dependencies', async () => {
      const manager = new ConstraintProcessorManager(mockLogger);
      
      // Create processors with cyclic dependencies
      const processorA = {
        name: 'processor-a',
        canHandle: (c: string) => c.startsWith('processor-a'),
        apply: jest.fn().mockResolvedValue({
          data: 'processed',
          additionalConstraints: ['processor-b:test'] // Depends on B
        })
      };

      const processorB = {
        name: 'processor-b',
        canHandle: (c: string) => c.startsWith('processor-b'),
        apply: jest.fn().mockResolvedValue({
          data: 'processed',
          additionalConstraints: ['processor-a:test'] // Depends on A - cycle!
        })
      };

      manager.registerProcessor(processorA);
      manager.registerProcessor(processorB);

      await expect(
        manager.applyConstraints(
          ['processor-a:test'],
          { data: 'test' },
          {
            agent: 'test',
            action: 'read',
            resource: 'test',
            time: new Date(),
            environment: {}
          }
        )
      ).rejects.toThrow('Cyclic constraint dependency detected');
    });
  });

  describe('Obligation Execution Errors', () => {
    it('should handle obligation executor failure with retry', async () => {
      const manager = new ObligationExecutorManager(mockLogger);
      
      let attemptCount = 0;
      const flakeyExecutor = {
        name: 'flakey-executor',
        canHandle: jest.fn().mockReturnValue(true),
        execute: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        })
      };

      manager.registerExecutor(flakeyExecutor);

      const result = await manager.executeObligations(
        ['flakey-executor:test'],
        {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: new Date(),
          environment: {}
        },
        { decision: 'PERMIT', reason: 'Test', confidence: 0.9 }
      );

      expect(attemptCount).toBe(3);
      expect(result.successful).toContain('flakey-executor:test');
    });

    it('should handle complete obligation failure after retries', async () => {
      const manager = new ObligationExecutorManager(mockLogger);
      
      const alwaysFailExecutor = {
        name: 'always-fail',
        canHandle: jest.fn().mockReturnValue(true),
        execute: jest.fn().mockRejectedValue(
          new Error('Permanent failure')
        )
      };

      manager.registerExecutor(alwaysFailExecutor);

      const result = await manager.executeObligations(
        ['always-fail:critical'],
        {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: new Date(),
          environment: {}
        },
        { decision: 'PERMIT', reason: 'Test', confidence: 0.9 }
      );

      expect(result.failed).toContain('always-fail:critical');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to execute obligation after retries'),
        expect.any(Object)
      );
    });
  });

  describe('Context Collection Errors', () => {
    it('should handle enricher timeout gracefully', async () => {
      const collector = new ContextCollector(mockLogger);
      
      const slowEnricher = {
        name: 'slow-enricher',
        enrich: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return { slowData: 'should not appear' };
        })
      };

      const fastEnricher = {
        name: 'fast-enricher',
        enrich: jest.fn().mockResolvedValue({ fastData: 'quick result' })
      };

      collector.registerEnricher(slowEnricher);
      collector.registerEnricher(fastEnricher);
      collector.setTimeout(100);

      const baseContext: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      const enriched = await collector.collectContext(baseContext);

      // Fast enricher should succeed
      expect(enriched.environment.fastData).toBe('quick result');
      // Slow enricher should be skipped
      expect(enriched.environment.slowData).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Context enrichment timeout'),
        expect.any(Object)
      );
    });

    it('should handle enricher throwing errors', async () => {
      const collector = new ContextCollector(mockLogger);
      
      const errorEnricher = {
        name: 'error-enricher',
        enrich: jest.fn().mockRejectedValue(
          new Error('Database connection failed')
        )
      };

      const goodEnricher = {
        name: 'good-enricher',
        enrich: jest.fn().mockResolvedValue({ goodData: 'success' })
      };

      collector.registerEnricher(errorEnricher);
      collector.registerEnricher(goodEnricher);

      const baseContext: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      const enriched = await collector.collectContext(baseContext);

      // Good enricher should succeed
      expect(enriched.environment.goodData).toBe('success');
      // Error enricher should be skipped
      expect(enriched.environment.errorData).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Enricher error-enricher failed'),
        expect.any(Object)
      );
    });
  });

  describe('Resource Exhaustion Errors', () => {
    it('should handle memory exhaustion gracefully', async () => {
      const enforcer = new PolicyEnforcer(
        mockLogger,
        new ContextCollector(mockLogger),
        new HybridPolicyEngine(mockLogger),
        new AIJudgmentEngine({ provider: 'openai', apiKey: 'test' }),
        new ConstraintProcessorManager(mockLogger),
        new ObligationExecutorManager(mockLogger)
      );

      // Simulate memory pressure
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 1.9 * 1024 * 1024 * 1024, // 1.9GB (close to 2GB limit)
        heapTotal: 2 * 1024 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
        rss: 2 * 1024 * 1024 * 1024
      });

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'large-resource',
        time: new Date(),
        environment: {}
      };

      // Should trigger memory protection
      const result = await enforcer.enforcePolicy('read', 'large-resource', context);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('High memory usage detected'),
        expect.any(Object)
      );

      // Restore original
      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle file descriptor exhaustion', async () => {
      const router = new StdioRouter([], 'test');
      
      // Simulate too many open processes
      const mockProcesses = [];
      for (let i = 0; i < 100; i++) {
        mockProcesses.push({
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          stdin: { write: jest.fn() },
          on: jest.fn(),
          kill: jest.fn(),
          pid: 1000 + i
        });
      }

      (spawn as jest.Mock).mockImplementation(() => {
        if (mockProcesses.length > 50) {
          throw new Error('EMFILE: too many open files');
        }
        return mockProcesses.pop();
      });

      await expect(
        router.initialize()
      ).rejects.toThrow('EMFILE');

      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('Resource exhaustion'),
        expect.any(Object)
      );
    });
  });

  describe('Concurrent Access Errors', () => {
    it('should handle race conditions in policy updates', async () => {
      const policyEngine = new HybridPolicyEngine(mockLogger);
      
      // Simulate concurrent policy updates
      const update1 = policyEngine.updatePolicy('policy1', {
        name: 'Updated by request 1',
        content: 'New content 1'
      });

      const update2 = policyEngine.updatePolicy('policy1', {
        name: 'Updated by request 2',
        content: 'New content 2'
      });

      const results = await Promise.allSettled([update1, update2]);
      
      // One should succeed, one should fail with conflict
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
      
      if (failed[0].status === 'rejected') {
        expect(failed[0].reason.message).toContain('Conflict');
      }
    });

    it('should handle deadlock in constraint processing', async () => {
      const manager = new ConstraintProcessorManager(mockLogger);
      
      // Create processors that wait for each other
      const lockA = { locked: false };
      const lockB = { locked: false };

      const processorA = {
        name: 'processor-a',
        canHandle: (c: string) => c.startsWith('a:'),
        apply: jest.fn().mockImplementation(async () => {
          lockA.locked = true;
          // Wait for B to lock
          while (!lockB.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          // Try to acquire B's resource - deadlock!
          return { data: 'processed' };
        })
      };

      const processorB = {
        name: 'processor-b',
        canHandle: (c: string) => c.startsWith('b:'),
        apply: jest.fn().mockImplementation(async () => {
          lockB.locked = true;
          // Wait for A to lock
          while (!lockA.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          // Try to acquire A's resource - deadlock!
          return { data: 'processed' };
        })
      };

      manager.registerProcessor(processorA);
      manager.registerProcessor(processorB);
      manager.setTimeout(500); // Short timeout to detect deadlock

      const promise1 = manager.applyConstraints(
        ['a:test', 'b:test'],
        { data: 'test' },
        {
          agent: 'test',
          action: 'read',
          resource: 'test',
          time: new Date(),
          environment: {}
        }
      );

      await expect(promise1).rejects.toThrow('timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Possible deadlock detected'),
        expect.any(Object)
      );
    });
  });

  describe('Data Corruption and Validation Errors', () => {
    it('should detect and handle corrupted cache entries', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Manually corrupt cache
      const cache = (engine as any).cache;
      cache.set('test-key', 'corrupted-non-object-value');

      const policy = 'Test policy';
      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      // Mock fresh LLM response
      (engine as any).llm = {
        complete: jest.fn().mockResolvedValue(JSON.stringify({
          decision: 'PERMIT',
          reason: 'Fresh decision',
          confidence: 0.95
        }))
      };

      const result = await engine.makeDecision(policy, context);

      expect(result.decision).toBe('PERMIT');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Corrupted cache entry'),
        expect.any(Object)
      );
    });

    it('should validate and reject malformed requests', async () => {
      const proxy = new MCPStdioProxy({
        port: 3003,
        upstreamMCPServers: []
      });

      const malformedRequests = [
        null,
        undefined,
        'not-an-object',
        { /* missing jsonrpc */ method: 'test' },
        { jsonrpc: '1.0', method: 'test' }, // Wrong version
        { jsonrpc: '2.0' /* missing method */ },
        { jsonrpc: '2.0', method: '', params: {} }, // Empty method
        { jsonrpc: '2.0', method: 123, params: {} }, // Non-string method
      ];

      for (const badRequest of malformedRequests) {
        await expect(
          proxy.handleRequest(badRequest as any)
        ).rejects.toThrow();
      }

      expect(mockLogger.error).toHaveBeenCalledTimes(malformedRequests.length);
    });
  });

  describe('Recovery and Resilience', () => {
    it('should recover from temporary AI service outage', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key',
        retryAttempts: 3,
        retryDelay: 10
      });

      let attemptCount = 0;
      const mockLLM = {
        complete: jest.fn().mockImplementation(async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Service temporarily unavailable');
          }
          return JSON.stringify({
            decision: 'PERMIT',
            reason: 'Recovered',
            confidence: 0.9
          });
        })
      };

      (engine as any).llm = mockLLM;

      const result = await engine.makeDecision('policy', {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      });

      expect(result.decision).toBe('PERMIT');
      expect(attemptCount).toBe(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt'),
        expect.any(Object)
      );
    });

    it('should gracefully degrade when non-critical services fail', async () => {
      const enforcer = new PolicyEnforcer(
        mockLogger,
        new ContextCollector(mockLogger),
        new HybridPolicyEngine(mockLogger),
        new AIJudgmentEngine({ provider: 'openai', apiKey: 'test' }),
        new ConstraintProcessorManager(mockLogger),
        new ObligationExecutorManager(mockLogger)
      );

      // Mock non-critical enricher failure
      const mockEnricher = {
        name: 'optional-enricher',
        enrich: jest.fn().mockRejectedValue(new Error('Service down')),
        isCritical: false
      };

      (enforcer as any).contextCollector.registerEnricher(mockEnricher);

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      };

      // Should still work without optional enricher
      const result = await enforcer.enforcePolicy('read', 'test', context);
      
      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Non-critical service failure'),
        expect.any(Object)
      );
    });
  });
});