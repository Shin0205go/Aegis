// ============================================================================
// PolicyEnforcer Test Suite
// ============================================================================

import { PolicyEnforcer } from '../../mcp/policy-enforcer';
import { Logger } from '../../utils/logger';
import type {
  IContextCollector,
  IIntelligentCacheSystem,
  IHybridPolicyEngine,
  IAdvancedAuditSystem,
  IRealTimeAnomalyDetector,
  IPolicyLoader
} from '../../types/component-interfaces';
import type { 
  DecisionContext, 
  PolicyDecision,
  AccessControlResult 
} from '../../types';
import { TIMEOUTS } from '../../constants';

// Mock implementations
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
} as unknown as Logger;

const mockContextCollector: IContextCollector = {
  enrichContext: jest.fn()
};

const mockCacheSystem: IIntelligentCacheSystem = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  clear: jest.fn(),
  metrics: jest.fn()
};

const mockPolicyEngine: IHybridPolicyEngine = {
  decide: jest.fn()
};

const mockAuditSystem: IAdvancedAuditSystem = {
  recordAuditEntry: jest.fn(),
  searchAuditEntries: jest.fn(),
  getAuditAnalytics: jest.fn(),
  exportAuditData: jest.fn(),
  cleanupOldEntries: jest.fn()
};

const mockAnomalyDetector: IRealTimeAnomalyDetector = {
  analyzeDecision: jest.fn(),
  getAnomalies: jest.fn(),
  trainModel: jest.fn(),
  getDetectionStatus: jest.fn()
};

const mockPolicyLoader: IPolicyLoader = {
  loadPolicies: jest.fn(),
  getActivePolicies: jest.fn().mockReturnValue([
    {
      name: 'test-policy',
      policy: 'Test policy content',
      metadata: {
        id: 'policy-1',
        name: 'test-policy',
        version: '1.0.0',
        priority: 1,
        createdAt: new Date(),
        lastModified: new Date(),
        status: 'active',
        engine: 'ai'
      }
    }
  ]),
  formatPolicyForAI: jest.fn().mockReturnValue('Formatted test policy'),
  getPolicyById: jest.fn(),
  reloadPolicies: jest.fn(),
  validatePolicy: jest.fn(),
  getPolicyHistory: jest.fn()
};

describe('PolicyEnforcer', () => {
  let policyEnforcer: PolicyEnforcer;

  beforeEach(() => {
    jest.clearAllMocks();
    
    policyEnforcer = new PolicyEnforcer(
      mockLogger,
      mockContextCollector,
      mockCacheSystem,
      mockPolicyEngine,
      mockAuditSystem,
      mockAnomalyDetector
    );
  });

  describe('enforcePolicy', () => {
    const baseContext = {
      agent: 'test-agent',
      request: { params: { purpose: 'test-purpose' } },
      transport: 'http'
    };

    const enrichedContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      purpose: 'test-purpose',
      time: new Date(),
      environment: {
        transport: 'http',
        agent: 'test-agent',
        request: { params: { purpose: 'test-purpose' } }
      }
    };

    const policyDecision: PolicyDecision = {
      decision: 'PERMIT',
      reason: 'Test allowed',
      confidence: 0.95,
      constraints: [],
      obligations: []
    };

    beforeEach(() => {
      (mockContextCollector.enrichContext as jest.Mock).mockResolvedValue(enrichedContext);
      (mockPolicyEngine.decide as jest.Mock).mockResolvedValue(policyDecision);
      (mockCacheSystem.get as jest.Mock).mockResolvedValue(null);
    });

    it('should execute full policy enforcement flow successfully', async () => {
      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext,
        mockPolicyLoader
      );

      // Verify context enrichment
      expect(mockContextCollector.enrichContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'test-agent',
          action: 'read',
          resource: 'file://test.txt',
          purpose: 'test-purpose'
        })
      );

      // Verify policy selection
      expect(mockPolicyLoader.getActivePolicies).toHaveBeenCalled();
      expect(mockPolicyLoader.formatPolicyForAI).toHaveBeenCalled();

      // Verify cache check
      expect(mockCacheSystem.get).toHaveBeenCalledWith(
        enrichedContext,
        'Formatted test policy',
        enrichedContext.environment
      );

      // Verify policy decision
      expect(mockPolicyEngine.decide).toHaveBeenCalledWith(
        enrichedContext,
        'Formatted test policy'
      );

      // Verify result
      expect(result).toMatchObject({
        decision: 'PERMIT',
        reason: 'Test allowed',
        confidence: 0.95,
        policyUsed: 'custom-policy',
        processingTime: expect.any(Number)
      });

      // Verify post-processing
      expect(mockAuditSystem.recordAuditEntry).toHaveBeenCalled();
      expect(mockCacheSystem.set).toHaveBeenCalled();
      expect(mockAnomalyDetector.analyzeDecision).toHaveBeenCalled();
    });

    it('should use cached result when available', async () => {
      const cachedDecision: PolicyDecision = {
        decision: 'DENY',
        reason: 'Cached denial',
        confidence: 0.99,
        constraints: [],
        obligations: []
      };

      (mockCacheSystem.get as jest.Mock).mockResolvedValue(cachedDecision);

      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      // Should not call policy engine when cached
      expect(mockPolicyEngine.decide).not.toHaveBeenCalled();

      // Should return cached result
      expect(result).toMatchObject({
        decision: 'DENY',
        reason: 'Cached denial',
        confidence: 0.99,
        policyUsed: 'default-policy'
      });

      // Should still record audit
      expect(mockAuditSystem.recordAuditEntry).toHaveBeenCalledWith(
        enrichedContext,
        cachedDecision,
        'cached-result',
        expect.any(Number),
        'FAILURE',
        expect.any(Object)
      );
    });

    it('should handle policy decision timeout', async () => {
      // Mock a delayed decision that will timeout
      (mockPolicyEngine.decide as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, TIMEOUTS.POLICY_DECISION + 1000))
      );

      await expect(
        policyEnforcer.enforcePolicy('read', 'file://test.txt', baseContext)
      ).rejects.toThrow('Policy decision timeout');
    }, 10000);

    it('should work without optional components', async () => {
      // Create enforcer without cache and anomaly detector
      const minimalEnforcer = new PolicyEnforcer(
        mockLogger,
        mockContextCollector,
        null, // No cache
        mockPolicyEngine,
        mockAuditSystem,
        null  // No anomaly detector
      );

      const result = await minimalEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      // Should work without cache
      expect(mockCacheSystem.get).not.toHaveBeenCalled();
      expect(mockCacheSystem.set).not.toHaveBeenCalled();

      // Should work without anomaly detector
      expect(mockAnomalyDetector.analyzeDecision).not.toHaveBeenCalled();

      // Should still return valid result
      expect(result).toMatchObject({
        decision: 'PERMIT',
        policyUsed: 'default-policy'
      });
    });

    it('should handle errors in post-processing gracefully', async () => {
      // Mock errors in post-processing
      (mockAuditSystem.recordAuditEntry as jest.Mock).mockRejectedValue(
        new Error('Audit system error')
      );
      (mockCacheSystem.set as jest.Mock).mockRejectedValue(
        new Error('Cache system error')
      );

      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      // Should still return result despite post-processing errors
      expect(result).toMatchObject({
        decision: 'PERMIT',
        policyUsed: 'default-policy'
      });

      // Should log errors
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to record audit entry',
        expect.any(Error)
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cache decision result',
        expect.any(Error)
      );
    });

    it('should use default policy when no policy loader provided', async () => {
      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      expect(mockPolicyEngine.decide).toHaveBeenCalledWith(
        enrichedContext,
        null // No policy
      );

      expect(result.policyUsed).toBe('default-policy');
    });

    it('should handle INDETERMINATE decisions correctly', async () => {
      const indeterminateDecision: PolicyDecision = {
        decision: 'INDETERMINATE',
        reason: 'Unable to determine',
        confidence: 0.5,
        constraints: [],
        obligations: []
      };

      (mockPolicyEngine.decide as jest.Mock).mockResolvedValue(indeterminateDecision);

      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      expect(result.decision).toBe('INDETERMINATE');

      // Verify audit outcome is ERROR for INDETERMINATE
      expect(mockAuditSystem.recordAuditEntry).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(String),
        expect.any(Number),
        'ERROR',
        expect.any(Object)
      );
    });

    it('should include constraints and obligations in result', async () => {
      const decisionWithConstraints: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Allowed with restrictions',
        confidence: 0.9,
        constraints: ['time-limit:1h', 'data-anonymization'],
        obligations: ['audit-log', 'notify-admin']
      };

      (mockPolicyEngine.decide as jest.Mock).mockResolvedValue(decisionWithConstraints);

      const result = await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        baseContext
      );

      expect(result.constraints).toEqual(['time-limit:1h', 'data-anonymization']);
      expect(result.obligations).toEqual(['audit-log', 'notify-admin']);
    });

    it('should handle context enrichment errors', async () => {
      (mockContextCollector.enrichContext as jest.Mock).mockRejectedValue(
        new Error('Context enrichment failed')
      );

      await expect(
        policyEnforcer.enforcePolicy('read', 'file://test.txt', baseContext)
      ).rejects.toThrow('Context enrichment failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Policy enforcement error:',
        expect.any(Error)
      );
    });

    it('should handle empty context gracefully', async () => {
      const emptyContext = {};

      await policyEnforcer.enforcePolicy(
        'read',
        'file://test.txt',
        emptyContext
      );

      expect(mockContextCollector.enrichContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'mcp-client', // Default agent
          action: 'read',
          resource: 'file://test.txt',
          purpose: 'general-operation', // Default purpose
          environment: {
            transport: 'stdio', // Default transport
          }
        })
      );
    });
  });
});