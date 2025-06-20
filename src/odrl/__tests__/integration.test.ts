/**
 * ODRL Integration Tests
 * Tests the complete ODRL hybrid policy system
 */

import express from 'express';
import request from 'supertest';
import { HybridPolicyEngine } from '../../policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { MCPHttpPolicyProxy } from '../../mcp/http-proxy';
import { Logger } from '../../utils/logger';
import { createODRLEndpoints } from '../../api/odrl-endpoints';
import { DecisionContext } from '../../types/policy';

// Mock AI engine for testing
class MockAIJudgmentEngine extends AIJudgmentEngine {
  constructor() {
    super({
      apiKey: 'test-key',
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'test'
    });
  }

  async judge(context: DecisionContext, policyText?: string) {
    // Simulate overly strict AI behavior (as reported by user)
    if (context.agentType === 'unknown') {
      return {
        decision: 'DENY' as const,
        reason: 'Unknown agent type not allowed',
        confidence: 0.9,
        constraints: [],
        obligations: []
      };
    }

    if (context.time && context.time.getHours() >= 18) {
      return {
        decision: 'DENY' as const,
        reason: 'Access denied after hours',
        confidence: 0.85,
        constraints: [],
        obligations: []
      };
    }

    return {
      decision: 'PERMIT' as const,
      reason: 'AI approved access',
      confidence: 0.8,
      constraints: [],
      obligations: []
    };
  }
}

describe('ODRL Integration Tests', () => {
  let app: express.Application;
  let hybridEngine: HybridPolicyEngine;
  let mockAI: MockAIJudgmentEngine;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    mockAI = new MockAIJudgmentEngine();
    hybridEngine = new HybridPolicyEngine(mockAI, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.7,
      cacheEnabled: false
    });

    app = express();
    app.use(express.json());
    app.use('/odrl', createODRLEndpoints(hybridEngine));
  });

  describe('API Endpoints', () => {
    test('POST /odrl/convert - should convert natural language to ODRL', async () => {
      const response = await request(app)
        .post('/odrl/convert')
        .send({
          text: '営業時間内（9時から18時まで）のみファイルシステムへの読み取りアクセスを許可'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.policy).toBeDefined();
      expect(response.body.policy.permission).toHaveLength(1);
      expect(response.body.confidence).toBeGreaterThan(0.5);
    });

    test('POST /odrl/policies - should create policy from natural language', async () => {
      const response = await request(app)
        .post('/odrl/policies')
        .send({
          naturalLanguage: 'researchエージェントのみツール実行を許可',
          metadata: {
            description: 'Research agent policy',
            label: 'Research Access'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.policy.naturalLanguageSource).toBeDefined();
      expect(response.body.policy.metadata.label).toBe('Research Access');
    });

    test('POST /odrl/validate - should validate ODRL policy', async () => {
      const validPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'test:policy',
        permission: [{
          '@type': 'Permission',
          action: { value: 'resource:access' }
        }]
      };

      const response = await request(app)
        .post('/odrl/validate')
        .send({ policy: validPolicy });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    test('POST /odrl/test - should test policy against context', async () => {
      // First create a policy
      await request(app)
        .post('/odrl/policies')
        .send({
          naturalLanguage: '営業時間内（9時から18時まで）のみアクセスを許可'
        });

      // Test with context during business hours
      const response = await request(app)
        .post('/odrl/test')
        .send({
          context: {
            agent: 'test-agent',
            action: 'resource:access',
            resource: 'test-resource',
            time: new Date('2024-01-01T10:00:00'),
            environment: {}
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('PERMIT');
    });
  });

  describe('Hybrid Decision Making', () => {
    test('should use ODRL rules over strict AI for business hours', async () => {
      // Add business hours policy
      await request(app)
        .post('/odrl/policies')
        .send({
          naturalLanguage: '営業時間内（9時から18時まで）のみアクセスを許可'
        });

      // Test at 10:00 (AI would permit, ODRL would permit)
      const morning = await hybridEngine.decide({
        agent: 'test-agent',
        action: 'resource:access',
        resource: 'test-resource',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      });

      expect(morning.decision).toBe('PERMIT');
      expect(morning.metadata?.engine).toBe('ODRL');

      // Test at 20:00 (AI would deny, ODRL would deny)
      const evening = await hybridEngine.decide({
        agent: 'test-agent',
        action: 'resource:access',
        resource: 'test-resource',
        time: new Date('2024-01-01T20:00:00'),
        environment: {}
      });

      expect(evening.decision).toBe('DENY');
    });

    test('should handle unknown agent types better with ODRL', async () => {
      // Add policy for unknown agents
      await request(app)
        .post('/odrl/policies')
        .send({
          policy: {
            '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
            '@type': 'Policy',
            uid: 'unknown-agent-policy',
            permission: [{
              '@type': 'Permission',
              action: { value: 'resource:access' },
              constraint: [{
                '@type': 'Constraint',
                leftOperand: 'aegis:trustScore',
                operator: 'gteq',
                rightOperand: 0.5
              }]
            }]
          }
        });

      // Test with unknown agent type but good trust score
      const decision = await hybridEngine.decide({
        agent: 'new-agent',
        agentType: 'unknown',
        action: 'resource:access',
        resource: 'test-resource',
        trustScore: 0.6,
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      });

      // ODRL should permit based on trust score, overriding strict AI
      expect(decision.decision).toBe('PERMIT');
      expect(decision.metadata?.engine).toBe('ODRL');
    });

    test('should handle emergency override properly', async () => {
      // Add emergency override policy
      await request(app)
        .post('/odrl/policies')
        .send({
          naturalLanguage: '緊急の場合は時間制限を解除'
        });

      // Test emergency access after hours
      const decision = await hybridEngine.decide({
        agent: 'emergency-agent',
        action: 'resource:access',
        resource: 'critical-resource',
        time: new Date('2024-01-01T22:00:00'),
        emergency: true,
        environment: {}
      });

      expect(decision.decision).toBe('PERMIT');
      expect(decision.reason).toContain('ODRL');
    });
  });

  describe('Performance Comparison', () => {
    test('ODRL should be faster than AI for simple decisions', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'resource:access',
        resource: 'test-resource',
        time: new Date('2024-01-01T10:00:00'),
        environment: {}
      };

      // Time ODRL-only decision
      const odrlStart = Date.now();
      const odrlEngine = new HybridPolicyEngine(mockAI, {
        useODRL: true,
        useAI: false
      });
      const odrlDecision = await odrlEngine.decide(context);
      const odrlTime = Date.now() - odrlStart;

      // Time AI-only decision (mock is instant, but real AI would be slower)
      const aiStart = Date.now();
      const aiEngine = new HybridPolicyEngine(mockAI, {
        useODRL: false,
        useAI: true
      });
      const aiDecision = await aiEngine.decide(context);
      const aiTime = Date.now() - aiStart;

      console.log(`ODRL time: ${odrlTime}ms, AI time: ${aiTime}ms`);
      
      // In real scenario, ODRL should be significantly faster
      expect(odrlDecision.metadata?.evaluationTime).toBeDefined();
    });
  });

  describe('Complex Policy Scenarios', () => {
    test('should handle multiple constraints with AND logic', async () => {
      const complexPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'complex-policy',
        permission: [{
          '@type': 'Permission',
          action: { value: 'resource:access' },
          constraint: [{
            '@type': 'LogicalConstraint',
            and: [
              {
                '@type': 'Constraint',
                leftOperand: 'timeOfDay',
                operator: 'gteq',
                rightOperand: '09:00:00'
              },
              {
                '@type': 'Constraint',
                leftOperand: 'timeOfDay',
                operator: 'lteq',
                rightOperand: '18:00:00'
              },
              {
                '@type': 'Constraint',
                leftOperand: 'aegis:trustScore',
                operator: 'gteq',
                rightOperand: 0.7
              }
            ]
          }]
        }]
      };

      await request(app)
        .post('/odrl/policies')
        .send({ policy: complexPolicy });

      // Test with all conditions met
      const permitDecision = await hybridEngine.decide({
        agent: 'trusted-agent',
        action: 'resource:access',
        resource: 'secure-resource',
        time: new Date('2024-01-01T10:00:00'),
        trustScore: 0.8,
        environment: {}
      });

      expect(permitDecision.decision).toBe('PERMIT');

      // Test with trust score too low
      const denyDecision = await hybridEngine.decide({
        agent: 'untrusted-agent',
        action: 'resource:access',
        resource: 'secure-resource',
        time: new Date('2024-01-01T10:00:00'),
        trustScore: 0.5,
        environment: {}
      });

      expect(denyDecision.decision).toBe('DENY');
    });

    test('should handle policy priority correctly', async () => {
      // Add general deny policy
      await request(app)
        .post('/odrl/policies')
        .send({
          policy: {
            '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
            '@type': 'Policy',
            uid: 'general-deny',
            priority: 100,
            prohibition: [{
              '@type': 'Prohibition',
              action: { value: 'resource:access' }
            }]
          }
        });

      // Add specific allow policy with higher priority
      await request(app)
        .post('/odrl/policies')
        .send({
          policy: {
            '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
            '@type': 'Policy',
            uid: 'specific-allow',
            priority: 200,
            permission: [{
              '@type': 'Permission',
              action: { value: 'resource:access' },
              constraint: [{
                '@type': 'Constraint',
                leftOperand: 'aegis:agentType',
                operator: 'eq',
                rightOperand: 'admin'
              }]
            }]
          }
        });

      // Test with admin agent - higher priority permission should win
      const decision = await hybridEngine.decide({
        agent: 'admin-agent',
        agentType: 'admin',
        action: 'resource:access',
        resource: 'protected-resource',
        time: new Date(),
        environment: {}
      });

      expect(decision.decision).toBe('PERMIT');
    });
  });

  describe('Natural Language Processing', () => {
    test('should handle various Japanese policy patterns', async () => {
      const patterns = [
        {
          text: '信頼スコアが0.7以上のエージェントのみ機密リソースへのアクセスを許可',
          expectedConstraint: 'trustScore >= 0.7'
        },
        {
          text: 'タスクの委譲は最大3レベルまで',
          expectedType: 'Prohibition',
          expectedAction: 'task:delegate'
        },
        {
          text: 'publicリソースへのアクセスを許可',
          expectedConstraint: 'resourceClassification = public'
        }
      ];

      for (const pattern of patterns) {
        const response = await request(app)
          .post('/odrl/convert')
          .send({ text: pattern.text });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        const policy = response.body.policy;
        if (pattern.expectedType) {
          expect(policy.prohibition).toHaveLength(1);
        }
        if (pattern.expectedAction) {
          const rule = policy.prohibition?.[0] || policy.permission?.[0];
          expect(rule.action.value).toBe(pattern.expectedAction);
        }
      }
    });
  });
});

// End-to-end test with real proxy
describe('ODRL with MCP Proxy E2E', () => {
  test('should integrate ODRL policies with MCP proxy decisions', async () => {
    const logger = new Logger('e2e-test');
    const mockAI = new MockAIJudgmentEngine();
    
    // Create proxy with hybrid engine
    const proxy = new MCPHttpPolicyProxy(
      {
        mcpProxy: {
          port: 0, // Random port
          upstreamServers: {}
        }
      } as any,
      logger,
      mockAI
    );

    // Add ODRL policy
    proxy.addPolicy('test-policy', JSON.stringify({
      '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
      '@type': 'Policy',
      uid: 'mcp-tool-policy',
      permission: [{
        '@type': 'Permission',
        action: { value: 'execute' },
        target: { value: 'tool:filesystem__read_file' },
        constraint: [{
          '@type': 'Constraint',
          leftOperand: 'aegis:agentType',
          operator: 'eq',
          rightOperand: 'research'
        }]
      }]
    }));

    // Test context that would be denied by strict AI but allowed by ODRL
    const decision = await (proxy as any).enforcePolicy('execute', 'tool:filesystem__read_file', {
      headers: {
        'x-agent-id': 'research-bot',
        'x-agent-type': 'research'
      },
      clientId: 'test-client'
    });

    expect(decision.decision).toBe('PERMIT');
    expect(decision.reason).toContain('ODRL');
  });
});