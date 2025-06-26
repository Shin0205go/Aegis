/**
 * Test ODRL Hybrid Policy Engine
 */

import { ODRLEvaluator } from '../../src/odrl/evaluator';
import { ODRLParser } from '../../src/odrl/parser';
import { HybridPolicyEngine } from '../../src/policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { 
  businessHoursPolicy,
  agentTrustPolicy,
  mcpToolPolicy,
  claudeDesktopPolicy
} from '../../src/odrl/sample-policies';
import { DecisionContext } from '../../src/types';
import { AEGISPolicy } from '../../src/odrl/types';

// Mock AI engine for testing
class MockAIEngine implements Pick<AIJudgmentEngine, 'judge'> {
  async judge(context: DecisionContext, policyText?: string) {
    // Simple mock implementation
    return {
      decision: 'PERMIT' as const,
      reason: 'AI mock decision',
      confidence: 0.5,
      constraints: [],
      obligations: []
    };
  }
}

describe('Hybrid Policy Engine Tests', () => {
  let hybridEngine: HybridPolicyEngine;
  let mockAI: MockAIEngine;

  beforeEach(() => {
    mockAI = new MockAIEngine();
    hybridEngine = new HybridPolicyEngine(mockAI as any, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.8,
      cacheEnabled: false // Disable cache for testing
    });
  });

  describe('Business Hours Policy', () => {
    test('should PERMIT during business hours', async () => {
      // Set time to 10:00
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
      expect(decision.metadata?.engine).toBe('ODRL');
      expect(decision.confidence).toBe(1.0);
    });

    test('should DENY outside business hours', async () => {
      // Set time to 20:00 (8 PM)
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T20:00:00'),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('DENY');
    });

    test('should PERMIT with emergency flag regardless of time', async () => {
      // Set time to 20:00 with emergency flag
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T20:00:00'),
        environment: {},
        emergency: true
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
      expect(decision.reason).toContain('ODRL');
    });
  });

  describe('Agent Trust Policy', () => {
    test('should PERMIT trusted agent accessing confidential resources', async () => {
      const context: DecisionContext = {
        agent: 'trusted-agent',
        action: 'resource:access',
        resource: 'confidential-data',
        resourceClassification: 'confidential',
        trustScore: 0.8,
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
    });

    test('should DENY untrusted agent accessing confidential resources', async () => {
      const context: DecisionContext = {
        agent: 'untrusted-agent',
        action: 'resource:access',
        resource: 'confidential-data',
        resourceClassification: 'confidential',
        trustScore: 0.3,
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('DENY');
    });
  });

  describe('MCP Tool Policy', () => {
    test('should allow research agent to use read tools', async () => {
      const context: DecisionContext = {
        agent: 'research-agent-1',
        agentType: 'research',
        action: 'execute',
        resource: 'tool:filesystem__read_file',
        mcpTool: 'filesystem__read_file',
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
    });

    test('should deny research agent from using write tools', async () => {
      const context: DecisionContext = {
        agent: 'research-agent-1',
        agentType: 'research',
        action: 'execute',
        resource: 'tool:filesystem__write_file',
        mcpTool: 'filesystem__write_file',
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('DENY');
    });

    test('should allow writing agent to use write tools', async () => {
      const context: DecisionContext = {
        agent: 'writing-agent-1',
        agentType: 'writing',
        action: 'execute',
        resource: 'tool:filesystem__write_file',
        mcpTool: 'filesystem__write_file',
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
    });
  });

  describe('Claude Desktop Priority', () => {
    test('should allow Claude Desktop to access any tool', async () => {
      const context: DecisionContext = {
        agent: 'claude-desktop',
        action: 'execute',
        resource: 'tool:any_dangerous_tool',
        mcpTool: 'any_dangerous_tool',
        time: new Date('2024-01-01T22:00:00'), // Outside business hours
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      expect(decision.decision).toBe('PERMIT');
      expect(decision.obligations).toContain('Execute: aegis:log');
    });
  });

  describe('Hybrid Decision Making', () => {
    test('should fall back to AI when ODRL is indeterminate', async () => {
      // Create context that doesn't match any ODRL rules
      const context: DecisionContext = {
        agent: 'unknown-agent',
        action: 'unknown:action',
        resource: 'unknown:resource',
        time: new Date(),
        environment: {}
      };

      const decision = await hybridEngine.decide(context);
      
      // Should use AI fallback
      expect(decision.reason).toContain('AI');
    });

    test('should cache decisions', async () => {
      // Enable cache for this test
      const cachedEngine = new HybridPolicyEngine(mockAI as any, {
        useODRL: true,
        useAI: true,
        cacheEnabled: true,
        cacheTTL: 60000
      });

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'filesystem:read',
        resource: 'file:test.txt',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      };

      // First call
      const decision1 = await cachedEngine.decide(context);
      const time1 = decision1.metadata?.evaluationTime || 0;

      // Second call (should be cached)
      const decision2 = await cachedEngine.decide(context);
      const time2 = decision2.metadata?.evaluationTime || 0;

      expect(decision1.decision).toBe(decision2.decision);
      expect(time2).toBeLessThan(time1 as number); // Cached response should be faster
    });
  });

  describe('Policy Management', () => {
    test('should add new policies dynamically', () => {
      const newPolicy: AEGISPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'test:policy',
        profile: 'https://aegis.example.com/odrl/profile',
        permission: [{
          '@type': 'Permission',
          action: { value: 'test:action' }
        }]
      };

      hybridEngine.addPolicy(newPolicy);
      const policies = hybridEngine.getPolicies();
      
      expect(policies).toContainEqual(expect.objectContaining({ uid: 'test:policy' }));
    });

    test('should remove policies by ID', () => {
      const initialCount = hybridEngine.getPolicies().length;
      
      // Remove business hours policy
      const removed = hybridEngine.removePolicy('aegis:policy:business-hours-access');
      
      expect(removed).toBe(true);
      expect(hybridEngine.getPolicies().length).toBe(initialCount - 1);
    });
  });
});

// Run a quick test to verify everything works
if (require.main === module) {
  const runQuickTest = async () => {
    console.log('🧪 Running ODRL Hybrid Policy Engine Quick Test...\n');
    
    const mockAI = new MockAIEngine();
    const engine = new HybridPolicyEngine(mockAI as any, {
      useODRL: true,
      useAI: true,
      cacheEnabled: false
    });

    // Test 1: Business hours
    console.log('Test 1: Business hours check');
    const result1 = await engine.decide({
      agent: 'test-agent',
      action: 'filesystem:read',
      resource: 'file:test.txt',
      time: new Date('2024-01-01T10:00:00'),
      environment: {}
    });
    console.log(`Result: ${result1.decision} - ${result1.reason}\n`);

    // Test 2: Agent trust
    console.log('Test 2: Agent trust check');
    const result2 = await engine.decide({
      agent: 'low-trust-agent',
      agentType: 'external',
      action: 'resource:access',
      resource: 'confidential-data',
      resourceClassification: 'confidential',
      trustScore: 0.3,
      time: new Date(),
      environment: {}
    });
    console.log(`Result: ${result2.decision} - ${result2.reason}\n`);

    // Test 3: MCP tools
    console.log('Test 3: MCP tool access');
    const result3 = await engine.decide({
      agent: 'research-agent',
      agentType: 'research',
      action: 'execute',
      resource: 'tool:filesystem__read_file',
      mcpTool: 'filesystem__read_file',
      time: new Date(),
      environment: {}
    });
    console.log(`Result: ${result3.decision} - ${result3.reason}\n`);

    console.log('✅ Quick test completed!');
  };

  runQuickTest().catch(console.error);
}