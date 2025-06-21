/**
 * Comprehensive Test Suite for HybridPolicyEngine
 */

import { HybridPolicyEngine, HybridPolicyConfig } from '../hybrid-policy-engine';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { DecisionContext } from '../../types/policy';
import { ODRLPolicy, AEGISPolicy } from '../../odrl/types';

// Mock implementations
jest.mock('../../ai/judgment-engine');
jest.mock('../../utils/logger');

class MockAIEngine {
  async judge(context: DecisionContext, policyText?: string) {
    // Mock different responses based on context
    if (context.agent.includes('trusted')) {
      return {
        decision: 'PERMIT' as const,
        reason: 'AI approved trusted agent',
        confidence: 0.9,
        constraints: [],
        obligations: []
      };
    } else if (context.agent.includes('malicious')) {
      return {
        decision: 'DENY' as const,
        reason: 'AI detected malicious agent',
        confidence: 0.95,
        constraints: [],
        obligations: []
      };
    }
    return {
      decision: 'PERMIT' as const,
      reason: 'AI default decision',
      confidence: 0.5,
      constraints: [],
      obligations: []
    };
  }
}

describe('HybridPolicyEngine', () => {
  let hybridEngine: HybridPolicyEngine;
  let mockAI: MockAIEngine;
  const defaultConfig: HybridPolicyConfig = {
    useODRL: true,
    useAI: true,
    aiThreshold: 0.8,
    cacheEnabled: false // Disable cache for testing
  };

  beforeEach(() => {
    mockAI = new MockAIEngine();
    hybridEngine = new HybridPolicyEngine(mockAI as any, defaultConfig);
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      const engine = new HybridPolicyEngine(mockAI as any);
      expect(engine).toBeDefined();
    });

    test('should accept custom configuration', () => {
      const customConfig: HybridPolicyConfig = {
        useODRL: false,
        useAI: true,
        aiThreshold: 0.6,
        cacheEnabled: true,
        cacheTTL: 60000
      };
      const engine = new HybridPolicyEngine(mockAI as any, customConfig);
      expect(engine).toBeDefined();
    });
  });

  describe('decide() Method', () => {
    test('should handle ODRL-only mode', async () => {
      const engineODRLOnly = new HybridPolicyEngine(mockAI as any, {
        useODRL: true,
        useAI: false,
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      };

      const decision = await engineODRLOnly.decide(context);
      expect(decision.decision).toBeDefined();
      expect(decision.metadata?.engine).toBe('ODRL');
    });

    test('should handle AI-only mode', async () => {
      const engineAIOnly = new HybridPolicyEngine(mockAI as any, {
        useODRL: false,
        useAI: true,
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'trusted-agent',
        action: 'resource:access',
        resource: 'data:sensitive',
        time: new Date(),
        environment: {}
      };

      const decision = await engineAIOnly.decide(context);
      expect(decision.decision).toBe('PERMIT');
      expect(decision.reason).toContain('trusted');
      expect(decision.metadata?.engine).toBe('AI');
    });

    test('should handle hybrid mode with ODRL priority', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T10:00:00'), // Business hours
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      expect(decision.decision).toBeDefined();
      // Should use ODRL first if it can handle the case
      if (decision.metadata?.engine === 'ODRL') {
        expect(decision.confidence).toBe(1.0);
      }
    });

    test('should fall back to AI when ODRL is indeterminate', async () => {
      const context: DecisionContext = {
        agent: 'unknown-agent',
        action: 'custom:action',
        resource: 'custom:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      expect(decision.metadata?.engine).toContain('AI');
    });

    test('should handle neither engine enabled gracefully', async () => {
      const engineNone = new HybridPolicyEngine(mockAI as any, {
        useODRL: false,
        useAI: false,
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await engineNone.decide(context);
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('No policy engines enabled');
    });

    test('should handle errors gracefully', async () => {
      // Mock AI engine that throws error
      const errorAI = {
        judge: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
      };
      
      const engineWithError = new HybridPolicyEngine(errorAI as any, {
        useODRL: false,
        useAI: true,
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await engineWithError.decide(context);
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('error');
    });
  });

  describe('ODRL Policy Management', () => {
    test('should add new ODRL policy', () => {
      const newPolicy: AEGISPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'test:new-policy',
        profile: 'https://aegis.example.com/odrl/profile',
        permission: [{
          action: { value: 'test:action' }
        }]
      };

      const policyId = hybridEngine.addODRLPolicy('test-id', newPolicy);
      expect(policyId).toBe('test-id');
      
      const policies = hybridEngine.listODRLPolicies();
      expect(policies).toContainEqual(expect.objectContaining({ id: 'test-id' }));
    });

    test('should remove ODRL policy by ID', () => {
      const policies = hybridEngine.listODRLPolicies();
      const initialCount = policies.length;
      
      if (initialCount > 0) {
        const removed = hybridEngine.removeODRLPolicy(policies[0].id);
        expect(removed).toBe(true);
        expect(hybridEngine.listODRLPolicies().length).toBe(initialCount - 1);
      }
    });

    test('should return false when removing non-existent policy', () => {
      const removed = hybridEngine.removeODRLPolicy('non-existent-id');
      expect(removed).toBe(false);
    });

    test('should list all ODRL policies', () => {
      const policies = hybridEngine.listODRLPolicies();
      expect(Array.isArray(policies)).toBe(true);
      policies.forEach(policy => {
        expect(policy).toHaveProperty('id');
        expect(policy).toHaveProperty('name');
      });
    });
  });

  describe('Caching Behavior', () => {
    test('should cache decisions when enabled', async () => {
      const engineWithCache = new HybridPolicyEngine(mockAI as any, {
        useODRL: true,
        useAI: true,
        cacheEnabled: true,
        cacheTTL: 60000
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      // First call
      const decision1 = await engineWithCache.decide(context);
      const time1 = decision1.metadata?.evaluationTime || 0;

      // Second call (should be cached)
      const decision2 = await engineWithCache.decide(context);
      const time2 = decision2.metadata?.evaluationTime || 0;

      expect(decision1.decision).toBe(decision2.decision);
      expect(time2).toBeLessThan(time1); // Cached response should be faster
    });

    test('should invalidate cache after TTL', async () => {
      const engineWithCache = new HybridPolicyEngine(mockAI as any, {
        useODRL: true,
        useAI: true,
        cacheEnabled: true,
        cacheTTL: 100 // 100ms TTL for testing
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      // First call
      await engineWithCache.decide(context);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call (should not be cached)
      const decision2 = await engineWithCache.decide(context);
      expect(decision2.metadata?.cached).not.toBe(true);
    });

    test('should clear cache on demand', () => {
      const engineWithCache = new HybridPolicyEngine(mockAI as any, {
        useODRL: true,
        useAI: true,
        cacheEnabled: true
      });

      engineWithCache.clearCache();
      // Cache should be empty (no direct way to test, but method should not throw)
      expect(() => engineWithCache.clearCache()).not.toThrow();
    });
  });

  describe('AI Threshold Behavior', () => {
    test('should respect AI confidence threshold', async () => {
      const engineHighThreshold = new HybridPolicyEngine(mockAI as any, {
        useODRL: false,
        useAI: true,
        aiThreshold: 0.85, // High threshold
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'regular-agent', // Will get 0.5 confidence
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await engineHighThreshold.decide(context);
      // With 0.5 confidence and 0.85 threshold, decision might be different
      expect(decision.decision).toBeDefined();
      expect(decision.confidence).toBeDefined();
    });

    test('should handle low confidence AI decisions', async () => {
      const engineLowThreshold = new HybridPolicyEngine(mockAI as any, {
        useODRL: false,
        useAI: true,
        aiThreshold: 0.3, // Low threshold
        cacheEnabled: false
      });

      const context: DecisionContext = {
        agent: 'regular-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await engineLowThreshold.decide(context);
      expect(decision.decision).toBe('PERMIT'); // Should permit with low threshold
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should track engine statistics', () => {
      const stats = hybridEngine.getStats();
      expect(stats).toHaveProperty('odrlHits');
      expect(stats).toHaveProperty('aiHits');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('totalDecisions');
    });

    test('should update statistics after decisions', async () => {
      const statsBefore = hybridEngine.getStats();
      
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      };

      await hybridEngine.decide(context);
      
      const statsAfter = hybridEngine.getStats();
      expect(statsAfter.totalDecisions).toBeGreaterThan(statsBefore.totalDecisions);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null context gracefully', async () => {
      const decision = await hybridEngine.decide(null as any);
      expect(decision.decision).toBe('DENY');
      expect(decision.reason).toContain('Invalid context');
    });

    test('should handle missing required fields', async () => {
      const incompleteContext = {
        agent: 'test-agent'
        // Missing action, resource, etc.
      } as DecisionContext;

      const decision = await hybridEngine.decide(incompleteContext);
      expect(decision.decision).toBe('DENY');
    });

    test('should handle concurrent decisions', async () => {
      const contexts = Array(10).fill(null).map((_, i) => ({
        agent: `agent-${i}`,
        action: 'test:action',
        resource: 'test:resource',
        time: new Date(),
        environment: {}
      }));

      const decisions = await Promise.all(
        contexts.map(ctx => hybridEngine.decide(ctx))
      );

      expect(decisions).toHaveLength(10);
      decisions.forEach(decision => {
        expect(decision.decision).toBeDefined();
      });
    });
  });
});

// Integration test with real policy scenario
describe('HybridPolicyEngine Integration', () => {
  test('should handle complex policy scenario', async () => {
    const mockAI = new MockAIEngine();
    const engine = new HybridPolicyEngine(mockAI as any, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.7,
      cacheEnabled: true
    });

    // Scenario 1: Business hours access
    const businessHoursContext: DecisionContext = {
      agent: 'employee-123',
      action: 'filesystem:read',
      resource: 'file:report.pdf',
      time: new Date('2024-01-01T14:00:00'), // 2 PM
      environment: {}
    };

    const decision1 = await engine.decide(businessHoursContext);
    expect(decision1.decision).toBe('PERMIT');

    // Scenario 2: After hours access
    const afterHoursContext: DecisionContext = {
      agent: 'employee-123',
      action: 'filesystem:read',
      resource: 'file:report.pdf',
      time: new Date('2024-01-01T22:00:00'), // 10 PM
      environment: {}
    };

    const decision2 = await engine.decide(afterHoursContext);
    expect(decision2.decision).toBe('DENY');

    // Scenario 3: Emergency override
    const emergencyContext: DecisionContext = {
      agent: 'employee-123',
      action: 'filesystem:read',
      resource: 'file:report.pdf',
      time: new Date('2024-01-01T22:00:00'), // 10 PM
      emergency: true,
      environment: {}
    };

    const decision3 = await engine.decide(emergencyContext);
    expect(decision3.decision).toBe('PERMIT');
  });
});