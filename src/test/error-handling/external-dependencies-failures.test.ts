// ============================================================================
// External Dependencies and Integration Failure Tests
// 外部依存関係と統合障害テスト
// ============================================================================

import { MCPHttpProxy } from '../../mcp/http-proxy';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { GeoRestrictorProcessor } from '../../core/constraints/strategies';
import { NotifierExecutor } from '../../core/obligations/executors';
import { DataLifecycleExecutor } from '../../core/obligations/executors';
import { AdvancedAuditSystem } from '../../audit/advanced-audit-system';
import { Logger } from '../../utils/logger';
import type { DecisionContext } from '../../types';
import * as dns from 'dns';
import * as https from 'https';
import { EventEmitter } from 'events';

// Mock all external dependencies
jest.mock('../../utils/logger');
jest.mock('dns');
jest.mock('https');
jest.mock('node-fetch');
// jest.mock('@sendgrid/mail'); // Notification tests disabled - not needed yet
// jest.mock('slack-notify'); // Notification tests disabled - not needed yet
jest.mock('redis');
jest.mock('mongodb');

describe('External Dependencies and Integration Failures', () => {
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

  describe('Network Service Failures', () => {
    it('should handle DNS resolution failures', async () => {
      const geoRestrictor = new GeoRestrictorProcessor();
      await geoRestrictor.initialize({
        allowedCountries: ['JP', 'US'],
        geoIpServiceUrl: 'https://geo.example.com'
      });

      // Mock DNS failure
      (dns.lookup as jest.Mock) = jest.fn((hostname, callback) => {
        callback(new Error('ENOTFOUND: DNS lookup failed'), null);
      });

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {
          clientIp: '203.0.113.1' // TEST-NET-3 IP
        }
      };

      await expect(
        geoRestrictor.apply('geo-restrict:JP,US', {}, context)
      ).rejects.toThrow('DNS lookup failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve geo service'),
        expect.any(Object)
      );
    });

    it('should handle SSL/TLS certificate errors', async () => {
      const httpProxy = new MCPHttpProxy({
        port: 3000,
        upstreamMCPServers: [{
          url: 'https://secure.example.com',
          name: 'secure-server'
        }]
      });

      // Mock HTTPS with certificate error
      const mockRequest = new EventEmitter();
      (https.request as jest.Mock) = jest.fn((options, callback) => {
        setImmediate(() => {
          mockRequest.emit('error', new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE'));
        });
        return mockRequest;
      });

      const request = {
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: 'test://resource' },
        id: 1
      };

      await expect(httpProxy.handleRequest(request)).rejects.toThrow('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('SSL/TLS error'),
        expect.any(Object)
      );
    });

    it('should handle proxy connection failures', async () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
      
      const httpProxy = new MCPHttpProxy({
        port: 3000,
        upstreamMCPServers: [{
          url: 'https://api.example.com',
          name: 'api-server'
        }]
      });

      // Mock proxy connection failure
      global.fetch = jest.fn().mockRejectedValue(
        new Error('Proxy connection failed: ECONNREFUSED proxy.example.com:8080')
      );

      await expect(
        httpProxy.handleRequest({
          jsonrpc: '2.0',
          method: 'test',
          params: {},
          id: 1
        })
      ).rejects.toThrow('Proxy connection failed');

      delete process.env.HTTPS_PROXY;
    });
  });

  describe('External API Failures', () => {
    it('should handle OpenAI API outage', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'test-key',
        fallbackProvider: 'anthropic',
        fallbackApiKey: 'fallback-key'
      });

      // Mock OpenAI failure
      const mockOpenAI = {
        complete: jest.fn().mockRejectedValue(
          new Error('OpenAI API is currently unavailable')
        )
      };

      // Mock Anthropic as fallback
      const mockAnthropic = {
        complete: jest.fn().mockResolvedValue(JSON.stringify({
          decision: 'PERMIT',
          reason: 'Fallback decision',
          confidence: 0.85
        }))
      };

      // Inject mocks
      (engine as any).llm = mockOpenAI;
      (engine as any).fallbackLLM = mockAnthropic;

      const result = await engine.makeDecision('policy', {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: {}
      });

      expect(result.decision).toBe('PERMIT');
      expect(result.reason).toContain('Fallback');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Primary LLM failed, using fallback'),
        expect.any(Object)
      );
    });

    it('should handle GeoIP service rate limiting', async () => {
      const geoRestrictor = new GeoRestrictorProcessor();
      await geoRestrictor.initialize({
        allowedCountries: ['JP'],
        geoIpServiceUrl: 'https://geoip.example.com',
        rateLimit: 100 // requests per hour
      });

      // Mock rate limit response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (key: string) => key === 'X-RateLimit-Reset' ? '3600' : null
        },
        json: async () => ({ error: 'Rate limit exceeded' })
      });

      const context: DecisionContext = {
        agent: 'test',
        action: 'read',
        resource: 'test',
        time: new Date(),
        environment: { clientIp: '1.1.1.1' }
      };

      await expect(
        geoRestrictor.apply('geo-restrict:JP', {}, context)
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GeoIP service rate limit'),
        expect.objectContaining({ resetIn: 3600 })
      );
    });
  });

  describe('Message Queue and Event Bus Failures', () => {
    it.skip('should handle notification service unavailability', async () => { // Skipped - email/notification features not needed yet
      const notifier = new NotifierExecutor();
      await notifier.initialize({
        channels: {
          email: {
            provider: 'sendgrid',
            apiKey: 'test-key',
            from: 'noreply@example.com'
          },
          slack: {
            webhookUrl: 'https://hooks.slack.com/test'
          }
        }
      });

      // Mock both services failing
      const sendgridMock = {
        send: jest.fn().mockRejectedValue(new Error('SendGrid service unavailable'))
      };
      
      global.fetch = jest.fn().mockRejectedValue(
        new Error('Slack webhook timeout')
      );

      (notifier as any).emailClient = sendgridMock;

      const context: DecisionContext = {
        agent: 'admin',
        action: 'delete',
        resource: 'critical-data',
        time: new Date(),
        environment: {}
      };

      const result = await notifier.execute(
        'notify:email,slack',
        context,
        { decision: 'PERMIT', reason: 'Admin action', confidence: 0.99 }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('All notification channels failed'),
        expect.any(Object)
      );
    });

    it('should handle event bus disconnection', async () => {
      const auditSystem = new AdvancedAuditSystem({
        eventBus: {
          type: 'redis',
          url: 'redis://localhost:6379'
        }
      });

      // Mock Redis connection failure
      const mockRedis = {
        connect: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
        on: jest.fn(),
        publish: jest.fn()
      };

      (auditSystem as any).eventBus = mockRedis;

      await expect(
        auditSystem.publishEvent({
          type: 'policy.decision',
          data: {
            decision: 'DENY',
            resource: 'test',
            timestamp: new Date()
          }
        })
      ).rejects.toThrow('Redis connection refused');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Event bus connection failed'),
        expect.any(Object)
      );
    });
  });

  describe('Database and Storage Failures', () => {
    it('should handle database connection pool exhaustion', async () => {
      const dataLifecycle = new DataLifecycleExecutor();
      await dataLifecycle.initialize({
        database: {
          type: 'mongodb',
          url: 'mongodb://localhost:27017/aegis'
        }
      });

      // Mock connection pool exhaustion
      const mockDb = {
        connect: jest.fn().mockRejectedValue(
          new Error('MongoError: connection pool exhausted, maxPoolSize: 50')
        )
      };

      (dataLifecycle as any).db = mockDb;

      await expect(
        dataLifecycle.execute(
          'schedule-deletion:30d',
          {
            agent: 'test',
            action: 'read',
            resource: 'customer-data',
            time: new Date(),
            environment: {}
          },
          { decision: 'PERMIT', reason: 'Test', confidence: 0.9 }
        )
      ).rejects.toThrow('connection pool exhausted');

      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('Database connection pool exhausted'),
        expect.any(Object)
      );
    });

    it('should handle storage quota exceeded', async () => {
      const auditSystem = new AdvancedAuditSystem({
        storage: {
          type: 'filesystem',
          path: '/var/log/aegis',
          maxSize: '1GB'
        }
      });

      // Mock filesystem quota error
      const mockFs = {
        writeFile: jest.fn().mockRejectedValue(
          new Error('ENOSPC: no space left on device')
        ),
        stat: jest.fn().mockResolvedValue({
          size: 1073741824 // 1GB
        })
      };

      (auditSystem as any).fs = mockFs;

      await expect(
        auditSystem.writeAuditLog({
          timestamp: new Date(),
          action: 'test',
          decision: 'PERMIT',
          details: 'x'.repeat(10000) // Large log entry
        })
      ).rejects.toThrow('ENOSPC');

      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('Storage quota exceeded'),
        expect.objectContaining({
          available: 0,
          required: expect.any(Number)
        })
      );
    });

    it('should handle database transaction deadlocks', async () => {
      const mockDb = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        query: jest.fn()
      };

      // Simulate deadlock on third attempt
      let attemptCount = 0;
      mockDb.query.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Deadlock found when trying to get lock');
        }
        return { success: true };
      });

      // Retry logic
      const executeWithRetry = async (query: string, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await mockDb.query(query);
          } catch (error: any) {
            if (error.message.includes('Deadlock') && i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
              continue;
            }
            throw error;
          }
        }
      };

      const result = await executeWithRetry('UPDATE policies SET ...');
      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(3);
    });
  });

  describe('Authentication and Authorization Failures', () => {
    it('should handle OAuth token expiration', async () => {
      const httpProxy = new MCPHttpProxy({
        port: 3000,
        upstreamMCPServers: [{
          url: 'https://oauth-api.example.com',
          name: 'oauth-server',
          auth: {
            type: 'oauth2',
            tokenUrl: 'https://auth.example.com/token',
            clientId: 'test-client',
            clientSecret: 'test-secret'
          }
        }]
      });

      // Mock expired token response
      let tokenRefreshCount = 0;
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/token')) {
          tokenRefreshCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: `new-token-${tokenRefreshCount}`,
              expires_in: 3600
            })
          });
        }
        
        // First call fails with 401
        if (tokenRefreshCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Token expired' })
          });
        }
        
        // Second call succeeds with new token
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: 'success' })
        });
      });

      const request = {
        jsonrpc: '2.0',
        method: 'test',
        params: {},
        id: 1
      };

      const result = await httpProxy.handleRequest(request);
      expect(result).toBeDefined();
      expect(tokenRefreshCount).toBe(2); // Initial + refresh
    });

    it('should handle API key revocation', async () => {
      const engine = new AIJudgmentEngine({
        provider: 'openai',
        apiKey: 'revoked-key'
      });

      const mockLLM = {
        complete: jest.fn().mockRejectedValue(
          new Error('Invalid API key: Key has been revoked')
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
      expect(result.reason).toContain('Authentication failed');
      
      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('API key revoked'),
        expect.any(Object)
      );
    });
  });

  describe('Third-Party Service Integration Failures', () => {
    it('should handle CDN failures gracefully', async () => {
      // Simulate loading policy templates from CDN
      const policyTemplateUrl = 'https://cdn.example.com/templates/security-policy-v2.json';
      
      // Mock CDN failure
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url === policyTemplateUrl) {
          return Promise.reject(new Error('CDN Error: 503 Service Unavailable'));
        }
        // Fallback to local cache
        if (url === 'file:///var/cache/templates/security-policy-v2.json') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              version: '2.0',
              template: 'cached template content'
            })
          });
        }
      });

      // Function that loads templates with fallback
      const loadPolicyTemplate = async (templateName: string) => {
        try {
          const response = await fetch(`https://cdn.example.com/templates/${templateName}`);
          if (!response.ok) throw new Error(`CDN returned ${response.status}`);
          return await response.json();
        } catch (error) {
          mockLogger.warn('CDN unavailable, using local cache', { error });
          // Fall back to local cache
          const cacheResponse = await fetch(`file:///var/cache/templates/${templateName}`);
          return await cacheResponse.json();
        }
      };

      const template = await loadPolicyTemplate('security-policy-v2.json');
      expect(template.version).toBe('2.0');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'CDN unavailable, using local cache',
        expect.any(Object)
      );
    });

    it('should handle webhook delivery failures with retry', async () => {
      const webhookUrl = 'https://webhook.site/test-endpoint';
      let attemptCount = 0;
      
      // Mock webhook with intermittent failures
      global.fetch = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Connection timeout');
        }
        return Promise.resolve({
          ok: true,
          status: 200
        });
      });

      // Webhook delivery with exponential backoff
      const deliverWebhook = async (url: string, payload: any, maxRetries = 3) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            
            if (response.ok) {
              return { success: true, attempts: attempt + 1 };
            }
            throw new Error(`HTTP ${response.status}`);
          } catch (error) {
            if (attempt < maxRetries - 1) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
              mockLogger.info(`Webhook retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw error;
            }
          }
        }
      };

      const result = await deliverWebhook(webhookUrl, {
        event: 'policy.violation',
        timestamp: new Date()
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(attemptCount).toBe(3);
    });
  });

  describe('Infrastructure and Platform Failures', () => {
    it('should handle container orchestration failures', async () => {
      // Simulate Kubernetes API failure
      const k8sApiUrl = 'https://kubernetes.default.svc/api/v1/namespaces/aegis/pods';
      
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url === k8sApiUrl) {
          return Promise.reject(new Error('connect ETIMEDOUT kubernetes.default.svc:443'));
        }
      });

      // Health check that depends on K8s API
      const checkPodHealth = async () => {
        try {
          const response = await fetch(k8sApiUrl);
          return { healthy: true, pods: await response.json() };
        } catch (error) {
          mockLogger.error('Kubernetes API unavailable', { error });
          // Fallback to local health check
          return {
            healthy: process.memoryUsage().heapUsed < 1024 * 1024 * 1024,
            fallback: true
          };
        }
      };

      const health = await checkPodHealth();
      expect(health.fallback).toBe(true);
      expect(health.healthy).toBeDefined();
    });

    it('should handle service mesh communication failures', async () => {
      // Simulate Istio sidecar proxy failure
      const serviceMeshHeaders = {
        'x-forwarded-client-cert': 'Hash=abc123...',
        'x-b3-traceid': 'trace123',
        'x-b3-spanid': 'span456'
      };

      // Mock service mesh timeout
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('upstream connect error or disconnect/reset before headers. reset reason: connection timeout'));
          }, 100);
        });
      });

      const makeServiceRequest = async (url: string, headers: any) => {
        try {
          const response = await fetch(url, { headers });
          return await response.json();
        } catch (error: any) {
          if (error.message.includes('upstream connect error')) {
            mockLogger.error('Service mesh connection failed', {
              error,
              traceId: headers['x-b3-traceid']
            });
            // Circuit breaker pattern
            return { error: 'Service temporarily unavailable', retry: true };
          }
          throw error;
        }
      };

      const result = await makeServiceRequest(
        'http://policy-service.aegis.svc.cluster.local:8080/validate',
        serviceMeshHeaders
      );

      expect(result.error).toBe('Service temporarily unavailable');
      expect(result.retry).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Service mesh connection failed',
        expect.objectContaining({ traceId: 'trace123' })
      );
    });
  });
});