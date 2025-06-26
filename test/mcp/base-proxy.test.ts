// ============================================================================
// MCPPolicyProxyBase Test Suite
// ============================================================================

import { MCPPolicyProxyBase } from '../../src/mcp/base-proxy';
import { Logger } from '../../src/utils/logger';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { ContextCollector } from '../../src/context/collector';
import { EnforcementSystem } from '../../src/core/enforcement';
import { HybridPolicyEngine } from '../../src/policy/hybrid-policy-engine';
import { AdvancedAuditSystem } from '../../src/audit/advanced-audit-system';
import { AuditDashboardDataProvider } from '../../src/audit/audit-dashboard-data';
import type { AEGISConfig, DecisionContext, AccessControlResult, PolicyDecision } from '../../src/types';

// Mock all dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/ai/judgment-engine');
jest.mock('../../src/context/collector');
jest.mock('../../src/core/enforcement');
jest.mock('../../src/policy/hybrid-policy-engine');
jest.mock('../../src/audit/advanced-audit-system');
jest.mock('../../src/audit/audit-dashboard-data');
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn()
  }))
}));

// Concrete implementation for testing
class TestMCPProxy extends MCPPolicyProxyBase {
  public startCalled = false;
  public stopCalled = false;
  public setupHandlersCalled = false;

  async start(): Promise<void> {
    this.startCalled = true;
    this.setupHandlers();
  }

  async stop(): Promise<void> {
    this.stopCalled = true;
  }

  protected setupHandlers(): void {
    this.setupHandlersCalled = true;
  }

  // Expose protected methods for testing
  public testSelectApplicablePolicy(context: DecisionContext): Promise<string | null> {
    return this.selectApplicablePolicy(context);
  }

  public testApplyConstraints(result: AccessControlResult, request: any, response: any): Promise<any> {
    return this.applyConstraints(result, request, response);
  }

  public testExecuteObligations(result: AccessControlResult, context: DecisionContext): Promise<void> {
    return this.executeObligations(result, context);
  }

  public getPolicies(): Map<string, string> {
    return this.policies;
  }

  public getContextCollector(): ContextCollector {
    return this.contextCollector;
  }

  public getEnforcementSystem(): EnforcementSystem {
    return this.enforcementSystem;
  }

  public getHybridPolicyEngine(): HybridPolicyEngine {
    return this.hybridPolicyEngine;
  }
}

// Mock implementations
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
} as unknown as Logger;

const mockJudgmentEngine = {} as unknown as AIJudgmentEngine;

const testConfig: AEGISConfig = {
  port: 3000,
  upstreamMCPServers: [],
  enableLogging: true,
  logLevel: 'info'
};

describe('MCPPolicyProxyBase', () => {
  let proxy: TestMCPProxy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Logger to return our mockLogger
    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);
    
    // Setup mocked ContextCollector
    (ContextCollector as jest.MockedClass<typeof ContextCollector>).mockImplementation(() => ({
      registerEnricher: jest.fn()
    } as any));
    
    // Setup mocked HybridPolicyEngine
    (HybridPolicyEngine as jest.MockedClass<typeof HybridPolicyEngine>).mockImplementation(() => ({
      addPolicy: jest.fn()
    } as any));
    
    // Setup mocked EnforcementSystem
    (EnforcementSystem as jest.MockedClass<typeof EnforcementSystem>).mockImplementation(() => ({
      applyConstraints: jest.fn(),
      executeObligations: jest.fn()
    } as any));
    
    // Setup mocked AdvancedAuditSystem
    (AdvancedAuditSystem as jest.MockedClass<typeof AdvancedAuditSystem>).mockImplementation(() => ({} as any));
    
    // Setup mocked AuditDashboardDataProvider
    (AuditDashboardDataProvider as jest.MockedClass<typeof AuditDashboardDataProvider>).mockImplementation(() => ({} as any));
    
    proxy = new TestMCPProxy(testConfig, mockLogger, mockJudgmentEngine);
  });

  describe('initialization', () => {
    it('should initialize all components correctly', () => {
      expect(proxy.getContextCollector()).toBeDefined();
      expect(proxy.getEnforcementSystem()).toBeDefined();
      expect(proxy.getHybridPolicyEngine()).toBeDefined();
      expect(proxy.getPolicies()).toBeDefined();
      expect(proxy.getPolicies().size).toBe(0);
    });

    it('should register all context enrichers', () => {
      const contextCollector = proxy.getContextCollector();
      expect(contextCollector.registerEnricher).toHaveBeenCalledTimes(4);
    });

    it('should initialize hybrid policy engine with correct settings', () => {
      const hybridEngine = proxy.getHybridPolicyEngine();
      expect(hybridEngine).toBeDefined();
      // Hybrid engine should be configured with AI enabled when judgment engine is provided
    });

    it('should work without judgment engine', () => {
      const proxyWithoutAI = new TestMCPProxy(testConfig, mockLogger, null);
      expect(proxyWithoutAI.getHybridPolicyEngine()).toBeDefined();
      // Should still work but with AI disabled
    });
  });

  describe('selectApplicablePolicy', () => {
    const baseContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      purpose: 'general',
      time: new Date(),
      environment: {}
    };

    it('should select after-hours policy when outside business hours', async () => {
      // Add after-hours policy
      proxy.addPolicy('after-hours-policy', 'Restrict access after hours');

      // Mock current hour to be after hours
      const originalHours = Date.prototype.getHours;
      Date.prototype.getHours = jest.fn().mockReturnValue(22); // 10 PM

      const policy = await proxy.testSelectApplicablePolicy(baseContext);
      expect(policy).toBe('after-hours-policy');
      expect(mockLogger.info).toHaveBeenCalledWith('After-hours policy selected');

      // Restore
      Date.prototype.getHours = originalHours;
    });

    it('should select customer-data-policy for customer resources', async () => {
      const customerContext = {
        ...baseContext,
        resource: 'db://customer/123'
      };

      const policy = await proxy.testSelectApplicablePolicy(customerContext);
      expect(policy).toBe('customer-data-policy');
    });

    it('should select email-access-policy for email resources', async () => {
      const emailContext = {
        ...baseContext,
        resource: 'email://inbox/message/456'
      };

      const policy = await proxy.testSelectApplicablePolicy(emailContext);
      expect(policy).toBe('email-access-policy');
    });

    it('should select file-system-policy for file resources', async () => {
      const fileContext = {
        ...baseContext,
        resource: 'file://documents/report.pdf'
      };

      const policy = await proxy.testSelectApplicablePolicy(fileContext);
      expect(policy).toBe('file-system-policy');
    });

    it('should select high-risk-operations-policy for dangerous actions', async () => {
      const deleteContext = {
        ...baseContext,
        action: 'delete'
      };

      const policy = await proxy.testSelectApplicablePolicy(deleteContext);
      expect(policy).toBe('high-risk-operations-policy');
    });

    it('should select default-policy when no specific policy matches', async () => {
      const genericContext = {
        ...baseContext,
        resource: 'unknown://resource'
      };

      const policy = await proxy.testSelectApplicablePolicy(genericContext);
      expect(policy).toBe('default-policy');
    });
  });

  describe('applyConstraints', () => {
    const mockContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      purpose: 'general',
      time: new Date(),
      environment: {}
    };

    const mockResult: AccessControlResult = {
      decision: 'PERMIT',
      reason: 'Allowed',
      confidence: 0.9,
      constraints: ['anonymize-data', 'rate-limit:10/min'],
      obligations: [],
      processingTime: 100,
      policyUsed: 'test-policy',
      context: mockContext
    };

    it('should apply constraints successfully', async () => {
      const mockRequest = { data: 'original' };
      const mockResponse = { data: 'sensitive data' };

      // Mock enforcement system
      const enforcementSystem = proxy.getEnforcementSystem();
      jest.spyOn(enforcementSystem, 'applyConstraints').mockResolvedValue({
        data: 'anonymized data'
      });

      const result = await proxy.testApplyConstraints(mockResult, mockRequest, mockResponse);

      expect(enforcementSystem.applyConstraints).toHaveBeenCalledTimes(2); // Two constraints
      expect(result).toEqual({ data: 'anonymized data' });
      expect(mockLogger.info).toHaveBeenCalledWith('Applying constraint: anonymize-data');
      expect(mockLogger.info).toHaveBeenCalledWith('Constraint applied successfully: anonymize-data');
    });

    it('should return original response when no constraints', async () => {
      const resultNoConstraints = { ...mockResult, constraints: [] };
      const mockResponse = { data: 'original' };

      const result = await proxy.testApplyConstraints(resultNoConstraints, {}, mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when constraint application fails', async () => {
      const enforcementSystem = proxy.getEnforcementSystem();
      jest.spyOn(enforcementSystem, 'applyConstraints').mockRejectedValue(
        new Error('Constraint error')
      );

      await expect(
        proxy.testApplyConstraints(mockResult, {}, {})
      ).rejects.toThrow('Constraint enforcement failed: anonymize-data');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('executeObligations', () => {
    const mockContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      purpose: 'general',
      time: new Date(),
      environment: {}
    };

    const mockResult: AccessControlResult = {
      decision: 'PERMIT',
      reason: 'Allowed',
      confidence: 0.9,
      constraints: [],
      obligations: ['audit-log', 'notify-admin'],
      processingTime: 100,
      policyUsed: 'test-policy'
    };

    it('should execute obligations successfully', async () => {
      const enforcementSystem = proxy.getEnforcementSystem();
      jest.spyOn(enforcementSystem, 'executeObligations').mockResolvedValue(undefined);

      await proxy.testExecuteObligations(mockResult, mockContext);

      expect(enforcementSystem.executeObligations).toHaveBeenCalledWith(
        ['audit-log', 'notify-admin'],
        mockContext,
        mockResult
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Obligation executed: audit-log');
      expect(mockLogger.info).toHaveBeenCalledWith('Obligation executed: notify-admin');
    });

    it('should handle empty obligations', async () => {
      const resultNoObligations = { ...mockResult, obligations: [] };

      await proxy.testExecuteObligations(resultNoObligations, mockContext);

      const enforcementSystem = proxy.getEnforcementSystem();
      expect(enforcementSystem.executeObligations).not.toHaveBeenCalled();
    });

    it('should log error when obligation execution fails', async () => {
      const enforcementSystem = proxy.getEnforcementSystem();
      jest.spyOn(enforcementSystem, 'executeObligations').mockRejectedValue(
        new Error('Obligation error')
      );

      await proxy.testExecuteObligations(mockResult, mockContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to execute obligations:',
        expect.any(Error)
      );
    });
  });

  describe('addPolicy', () => {
    it('should add policy to internal map and hybrid engine', () => {
      const hybridEngine = proxy.getHybridPolicyEngine();
      jest.spyOn(hybridEngine, 'addPolicy').mockImplementation(() => {});

      proxy.addPolicy('test-policy', 'Test policy content');

      expect(proxy.getPolicies().get('test-policy')).toBe('Test policy content');
      expect(hybridEngine.addPolicy).toHaveBeenCalledWith({
        uid: 'aegis:policy:test-policy',
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        profile: 'https://aegis.example.com/odrl/profile',
        permission: [],
        naturalLanguageSource: 'Test policy content'
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Policy added: test-policy');
    });

    it('should handle hybrid engine errors gracefully', () => {
      const hybridEngine = proxy.getHybridPolicyEngine();
      jest.spyOn(hybridEngine, 'addPolicy').mockImplementation(() => {
        throw new Error('Engine error');
      });

      proxy.addPolicy('error-policy', 'Error policy content');

      // Should still add to internal map
      expect(proxy.getPolicies().get('error-policy')).toBe('Error policy content');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to add policy error-policy to hybrid engine:',
        expect.any(Error)
      );
    });
  });

  describe('getSystemPerformanceStats', () => {
    it('should return performance statistics', () => {
      const stats = proxy.getSystemPerformanceStats();
      expect(stats).toHaveProperty('audit');
      expect(stats.audit).toEqual({});
    });
  });

  describe('abstract method implementation', () => {
    it('should call start method', async () => {
      await proxy.start();
      expect(proxy.startCalled).toBe(true);
      expect(proxy.setupHandlersCalled).toBe(true);
    });

    it('should call stop method', async () => {
      await proxy.stop();
      expect(proxy.stopCalled).toBe(true);
    });
  });
});