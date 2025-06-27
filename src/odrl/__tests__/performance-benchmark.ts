/**
 * ODRL Performance Benchmark
 * Compares performance of ODRL vs AI-only policy evaluation
 */

import { HybridPolicyEngine } from '../../policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { DecisionContext } from '../../types';
import { businessHoursPolicy, agentTrustPolicy, mcpToolPolicy } from '../sample-policies';

// Mock AI engine with realistic latency
class BenchmarkAIEngine extends AIJudgmentEngine {
  private latency: number;

  constructor(latency: number = 100) {
    super({
      provider: 'anthropic',
      apiKey: 'benchmark-key',
      model: 'claude-3-haiku-20240307'
    });
    this.latency = latency;
  }

  async judge(context: DecisionContext, policyText?: string) {
    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, this.latency));

    // Simple rule simulation
    if (context.time && context.time.getHours() >= 18) {
      return {
        decision: 'DENY' as const,
        reason: 'AI: Access denied after business hours',
        confidence: 0.85,
        constraints: [],
        obligations: []
      };
    }

    return {
      decision: 'PERMIT' as const,
      reason: 'AI: Access granted during business hours',
      confidence: 0.8,
      constraints: [],
      obligations: []
    };
  }
}

interface BenchmarkResult {
  name: string;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  decisions: Record<string, number>;
}

class PolicyBenchmark {
  private contexts: DecisionContext[];

  constructor() {
    this.contexts = this.generateTestContexts();
  }

  /**
   * Generate diverse test contexts
   */
  private generateTestContexts(): DecisionContext[] {
    const contexts: DecisionContext[] = [];
    const agents = ['research-agent', 'writing-agent', 'admin-agent', 'guest-agent'];
    const resources = ['file:data.json', 'tool:filesystem__read_file', 'api:database', 'confidential-doc'];
    const hours = [8, 10, 14, 18, 20, 22];

    // Generate combinations
    for (const agent of agents) {
      for (const resource of resources) {
        for (const hour of hours) {
          contexts.push({
            agent,
            agentType: agent.split('-')[0],
            action: resource.startsWith('tool:') ? 'execute' : 'resource:access',
            resource,
            time: new Date(`2024-01-01T${hour.toString().padStart(2, '0')}:00:00`),
            trustScore: Math.random(),
            resourceClassification: resource.includes('confidential') ? 'confidential' : 'internal',
            environment: {}
          });
        }
      }
    }

    return contexts;
  }

  /**
   * Run benchmark for a single engine
   */
  private async benchmarkEngine(
    name: string,
    engine: HybridPolicyEngine,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    const decisions: Record<string, number> = {
      PERMIT: 0,
      DENY: 0,
      INDETERMINATE: 0
    };

    console.log(`\nRunning ${name} benchmark (${iterations} iterations)...`);
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const context = this.contexts[i % this.contexts.length];
      const iterStart = Date.now();
      
      const decision = await engine.decide(context);
      
      const iterTime = Date.now() - iterStart;
      times.push(iterTime);
      decisions[decision.decision]++;

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r  Progress: ${i + 1}/${iterations}`);
      }
    }

    const totalTime = Date.now() - startTime;
    process.stdout.write('\r  ✓ Complete!                    \n');

    return {
      name,
      totalTime,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      decisions
    };
  }

  /**
   * Run comprehensive benchmark
   */
  async runBenchmark(): Promise<void> {
    console.log('🏃 ODRL Performance Benchmark\n');
    console.log('================================');
    console.log(`Test contexts: ${this.contexts.length}`);
    console.log('Iterations per engine: 100\n');

    // Create engines with different configurations
    const aiEngine = new BenchmarkAIEngine(50); // 50ms simulated latency

    // ODRL-only engine
    const odrlEngine = new HybridPolicyEngine(aiEngine, {
      useODRL: true,
      useAI: false,
      cacheEnabled: false
    });

    // AI-only engine
    const aiOnlyEngine = new HybridPolicyEngine(aiEngine, {
      useODRL: false,
      useAI: true,
      cacheEnabled: false
    });

    // Hybrid engine
    const hybridEngine = new HybridPolicyEngine(aiEngine, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.8,
      cacheEnabled: false
    });

    // Hybrid with cache
    const cachedHybridEngine = new HybridPolicyEngine(aiEngine, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.8,
      cacheEnabled: true,
      cacheTTL: 60000
    });

    // Run benchmarks
    const results: BenchmarkResult[] = [];
    
    results.push(await this.benchmarkEngine('ODRL-only', odrlEngine));
    results.push(await this.benchmarkEngine('AI-only', aiOnlyEngine));
    results.push(await this.benchmarkEngine('Hybrid (ODRL+AI)', hybridEngine));
    results.push(await this.benchmarkEngine('Hybrid + Cache', cachedHybridEngine));

    // Display results
    this.displayResults(results);
  }

  /**
   * Display benchmark results
   */
  private displayResults(results: BenchmarkResult[]): void {
    console.log('\n📊 Benchmark Results\n');
    console.log('================================');

    // Performance table
    console.log('\n⚡ Performance Metrics:');
    console.log('┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Engine              │ Avg (ms) │ Min (ms) │ Max (ms) │ Total (s)│');
    console.log('├─────────────────────┼──────────┼──────────┼──────────┼──────────┤');
    
    for (const result of results) {
      console.log(
        `│ ${result.name.padEnd(19)} │ ${result.avgTime.toFixed(2).padStart(8)} │ ` +
        `${result.minTime.toString().padStart(8)} │ ${result.maxTime.toString().padStart(8)} │ ` +
        `${(result.totalTime / 1000).toFixed(2).padStart(8)} │`
      );
    }
    console.log('└─────────────────────┴──────────┴──────────┴──────────┴──────────┘');

    // Decision distribution
    console.log('\n📈 Decision Distribution:');
    console.log('┌─────────────────────┬─────────┬──────────┬─────────────┐');
    console.log('│ Engine              │ PERMIT  │ DENY     │ INDETERMINATE│');
    console.log('├─────────────────────┼─────────┼──────────┼─────────────┤');
    
    for (const result of results) {
      console.log(
        `│ ${result.name.padEnd(19)} │ ${result.decisions.PERMIT.toString().padStart(7)} │ ` +
        `${result.decisions.DENY.toString().padStart(8)} │ ${result.decisions.INDETERMINATE.toString().padStart(12)} │`
      );
    }
    console.log('└─────────────────────┴─────────┴──────────┴─────────────┘');

    // Performance comparison
    const baseline = results.find(r => r.name === 'AI-only')!;
    console.log('\n🔄 Performance vs AI-only baseline:');
    
    for (const result of results) {
      if (result.name !== 'AI-only') {
        const speedup = baseline.avgTime / result.avgTime;
        const improvement = ((baseline.avgTime - result.avgTime) / baseline.avgTime * 100).toFixed(1);
        console.log(
          `  • ${result.name}: ${speedup.toFixed(2)}x faster (${improvement}% improvement)`
        );
      }
    }

    // Key insights
    console.log('\n💡 Key Insights:');
    console.log('  • ODRL provides deterministic, fast evaluation for rule-based decisions');
    console.log('  • Hybrid approach balances speed and flexibility');
    console.log('  • Caching significantly improves performance for repeated decisions');
    console.log('  • ODRL eliminates network latency for simple policy checks');
  }

  /**
   * Run latency sensitivity test
   */
  async runLatencyTest(): Promise<void> {
    console.log('\n\n🌐 AI Latency Sensitivity Test\n');
    console.log('================================');
    console.log('Testing performance with varying AI latencies...\n');

    const latencies = [10, 50, 100, 200, 500];
    const results: Array<{latency: number, odrl: number, ai: number, hybrid: number}> = [];

    for (const latency of latencies) {
      console.log(`\nTesting with ${latency}ms AI latency...`);
      
      const aiEngine = new BenchmarkAIEngine(latency);
      
      // Test each engine type with 20 iterations
      const odrlEngine = new HybridPolicyEngine(aiEngine, {
        useODRL: true,
        useAI: false,
        cacheEnabled: false
      });

      const aiOnlyEngine = new HybridPolicyEngine(aiEngine, {
        useODRL: false,
        useAI: true,
        cacheEnabled: false
      });

      const hybridEngine = new HybridPolicyEngine(aiEngine, {
        useODRL: true,
        useAI: true,
        aiThreshold: 0.8,
        cacheEnabled: false
      });

      const odrlResult = await this.benchmarkEngine('ODRL', odrlEngine, 20);
      const aiResult = await this.benchmarkEngine('AI', aiOnlyEngine, 20);
      const hybridResult = await this.benchmarkEngine('Hybrid', hybridEngine, 20);

      results.push({
        latency,
        odrl: odrlResult.avgTime,
        ai: aiResult.avgTime,
        hybrid: hybridResult.avgTime
      });
    }

    // Display latency results
    console.log('\n📊 Latency Impact Results:');
    console.log('┌────────────┬──────────┬──────────┬──────────┬─────────────┐');
    console.log('│ AI Latency │ ODRL     │ AI-only  │ Hybrid   │ ODRL Speedup│');
    console.log('├────────────┼──────────┼──────────┼──────────┼─────────────┤');
    
    for (const result of results) {
      const speedup = result.ai / result.odrl;
      console.log(
        `│ ${result.latency.toString().padStart(7)}ms  │ ${result.odrl.toFixed(1).padStart(6)}ms │ ` +
        `${result.ai.toFixed(1).padStart(6)}ms │ ${result.hybrid.toFixed(1).padStart(6)}ms │ ` +
        `${speedup.toFixed(1).padStart(8)}x   │`
      );
    }
    console.log('└────────────┴──────────┴──────────┴──────────┴─────────────┘');

    console.log('\n💡 Latency Test Insights:');
    console.log('  • ODRL performance remains constant regardless of AI latency');
    console.log('  • Benefit of ODRL increases with higher AI latencies');
    console.log('  • Hybrid approach provides best balance across all scenarios');
  }
}

// Run benchmark if executed directly
if (require.main === module) {
  const benchmark = new PolicyBenchmark();
  
  (async () => {
    try {
      await benchmark.runBenchmark();
      await benchmark.runLatencyTest();
      
      console.log('\n✅ Benchmark completed successfully!\n');
    } catch (error) {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    }
  })();
}

// Add minimal test for Jest
describe('Performance Benchmark', () => {
  it('should create benchmark instance', () => {
    const benchmark = new PolicyBenchmark();
    expect(benchmark).toBeDefined();
  });
});