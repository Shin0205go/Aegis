/**
 * ODRL Hybrid Policy Engine Demo
 * 
 * This demonstrates how the ODRL-based policy engine solves the problem
 * of overly strict AI judgments while maintaining security.
 */

import { HybridPolicyEngine } from '../src/policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../src/ai/judgment-engine';
import { NLToODRLConverter } from '../src/odrl/nl-to-odrl-converter-refactored';
import { DecisionContext } from '../src/types/policy';
import { Logger } from '../src/utils/logger';

// Mock AI for demo (simulates overly strict behavior)
class StrictMockAI extends AIJudgmentEngine {
  constructor() {
    super({
      apiKey: 'demo-key',
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'demo'
    });
  }

  async judge(context: DecisionContext, policyText?: string) {
    // Simulate the overly strict AI behavior reported by user
    const reasons: string[] = [];
    
    if (context.agentType === 'unknown') {
      reasons.push('Unknown agent type');
    }
    
    if (context.time && context.time.getHours() >= 18) {
      reasons.push('After business hours');
    }
    
    if (!context.trustScore || context.trustScore < 0.9) {
      reasons.push('Insufficient trust score');
    }
    
    if (context.environment?.clientIp && !context.environment.clientIp.startsWith('192.168')) {
      reasons.push('External IP address');
    }

    if (reasons.length > 0) {
      return {
        decision: 'DENY' as const,
        reason: `AI strict mode: ${reasons.join(', ')}`,
        confidence: 0.95,
        constraints: [],
        obligations: []
      };
    }

    return {
      decision: 'PERMIT' as const,
      reason: 'AI: All strict conditions met',
      confidence: 0.9,
      constraints: [],
      obligations: []
    };
  }
}

async function runDemo() {
  console.log('🎯 ODRL Hybrid Policy Engine Demo\n');
  console.log('This demo shows how ODRL solves the AI strictness problem.\n');
  
  const logger = new Logger('demo');
  const strictAI = new StrictMockAI();
  const nlConverter = new NLToODRLConverter();
  
  // Create engines for comparison
  const aiOnlyEngine = new HybridPolicyEngine(strictAI, {
    useODRL: false,
    useAI: true,
    cacheEnabled: false
  });
  
  const hybridEngine = new HybridPolicyEngine(strictAI, {
    useODRL: true,
    useAI: true,
    aiThreshold: 0.7,
    cacheEnabled: false
  });
  
  // Add natural language policies
  const policies = [
    '営業時間内（9時から18時まで）のアクセスを許可',
    '信頼スコアが0.5以上のエージェントは機密リソースへのアクセスを許可',
    'researchエージェントタイプはファイル読み取りツールの実行を許可',
    '緊急フラグが設定されている場合は全ての時間制限を解除'
  ];
  
  console.log('📝 Converting natural language policies to ODRL...\n');
  
  for (const nlPolicy of policies) {
    const result = await nlConverter.convert(nlPolicy);
    if (result.success && result.policy) {
      hybridEngine.addPolicy(result.policy);
      console.log(`✅ Added: "${nlPolicy}"`);
    }
  }
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Research agent at 8PM',
      context: {
        agent: 'research-bot-123',
        agentType: 'research',
        action: 'execute',
        resource: 'tool:filesystem__read_file',
        mcpTool: 'filesystem__read_file',
        time: new Date('2024-01-01T20:00:00'),
        trustScore: 0.6,
        environment: { clientIp: '203.0.113.1' }
      }
    },
    {
      name: 'Unknown agent during business hours',
      context: {
        agent: 'new-service',
        agentType: 'unknown',
        action: 'resource:access',
        resource: 'api:database',
        time: new Date('2024-01-01T10:00:00'),
        trustScore: 0.7,
        environment: { clientIp: '203.0.113.1' }
      }
    },
    {
      name: 'Low trust agent accessing confidential data',
      context: {
        agent: 'guest-agent',
        agentType: 'guest',
        action: 'resource:access',
        resource: 'confidential-report',
        resourceClassification: 'confidential',
        time: new Date('2024-01-01T14:00:00'),
        trustScore: 0.6,
        environment: { clientIp: '192.168.1.100' }
      }
    },
    {
      name: 'Emergency access at midnight',
      context: {
        agent: 'ops-agent',
        agentType: 'operations',
        action: 'resource:access',
        resource: 'critical-system',
        time: new Date('2024-01-01T00:00:00'),
        emergency: true,
        trustScore: 0.8,
        environment: { clientIp: '10.0.0.50' }
      }
    }
  ];
  
  console.log('\n\n🔬 Testing scenarios...\n');
  console.log('=' .repeat(80));
  
  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario: ${scenario.name}`);
    console.log('-'.repeat(60));
    
    // Test with AI-only
    const aiDecision = await aiOnlyEngine.decide(scenario.context);
    console.log(`\n🤖 AI-only decision: ${aiDecision.decision}`);
    console.log(`   Reason: ${aiDecision.reason}`);
    
    // Test with hybrid
    const hybridDecision = await hybridEngine.decide(scenario.context);
    console.log(`\n🔄 Hybrid decision: ${hybridDecision.decision}`);
    console.log(`   Reason: ${hybridDecision.reason}`);
    console.log(`   Engine used: ${hybridDecision.metadata?.engine || 'Unknown'}`);
    
    // Show the improvement
    if (aiDecision.decision !== hybridDecision.decision) {
      console.log(`\n✨ ODRL improved the decision from ${aiDecision.decision} to ${hybridDecision.decision}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:\n');
  console.log('The ODRL hybrid approach successfully:');
  console.log('  ✅ Allows legitimate access that strict AI would deny');
  console.log('  ✅ Provides fast, deterministic decisions for common cases');
  console.log('  ✅ Maintains security through well-defined rules');
  console.log('  ✅ Falls back to AI for complex scenarios not covered by rules');
  
  // Performance comparison
  console.log('\n⚡ Performance comparison:');
  
  const testContext = scenarios[0].context;
  
  const aiStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await aiOnlyEngine.decide(testContext);
  }
  const aiTime = Date.now() - aiStart;
  
  const hybridStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await hybridEngine.decide(testContext);
  }
  const hybridTime = Date.now() - hybridStart;
  
  console.log(`  • AI-only: ${aiTime}ms for 100 decisions (${(aiTime/100).toFixed(2)}ms avg)`);
  console.log(`  • Hybrid: ${hybridTime}ms for 100 decisions (${(hybridTime/100).toFixed(2)}ms avg)`);
  console.log(`  • Speedup: ${(aiTime/hybridTime).toFixed(2)}x faster with ODRL`);
  
  console.log('\n✅ Demo completed!\n');
}

// Run the demo
if (require.main === module) {
  runDemo().catch(console.error);
}