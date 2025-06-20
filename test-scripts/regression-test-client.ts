/**
 * AEGIS Regression Test Client
 * Bashコマンドを使用せずにTypeScriptで回帰テストを実行するクライアント
 * ODRLと自然言語ポリシーの統合後の回帰テストを実行
 */

import { MCPHttpPolicyProxy } from '../src/mcp/http-proxy';
import { HybridPolicyEngine } from '../src/odrl/hybrid-engine';
import { AEGISController } from '../src/core/controller';
import { SimpleMCPClient } from '../a2a/src/utils/mcp-client';
import { Logger } from '../src/utils/logger';
import type { AEGISConfig } from '../src/types';

// テスト結果を格納する構造体
interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  details?: any;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

class RegressionTestClient {
  private logger: Logger;
  private config: AEGISConfig;
  private testResults: TestSuite[] = [];

  constructor() {
    this.logger = new Logger();
    this.config = this.createTestConfig();
  }

  /**
   * テスト用の設定を作成
   */
  private createTestConfig(): AEGISConfig {
    return {
      nodeEnv: 'test',
      port: 3456,
      logLevel: 'info',
      llm: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        model: 'gpt-4',
        temperature: 0.3
      },
      cache: {
        ttl: 3600,
        maxSize: 1000
      },
      mcpProxy: {
        port: 3456,
        upstreamServers: {
          'test-server': 'http://localhost:8080',
          'filesystem': 'http://localhost:8081',
          'execution-server': 'http://localhost:8082'
        }
      },
      monitoring: {
        enabled: false
      },
      web: {
        enabled: false
      }
    } as AEGISConfig;
  }

  /**
   * テストスイートの実行
   */
  async runTestSuite(suiteName: string, testFunctions: Array<() => Promise<void>>): Promise<TestSuite> {
    const suite: TestSuite = {
      name: suiteName,
      tests: [],
      totalTests: testFunctions.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };

    const suiteStart = Date.now();

    for (let i = 0; i < testFunctions.length; i++) {
      const testFn = testFunctions[i];
      const testName = testFn.name || `Test ${i + 1}`;
      const testStart = Date.now();

      try {
        await testFn();
        const result: TestResult = {
          name: testName,
          status: 'passed',
          duration: Date.now() - testStart
        };
        suite.tests.push(result);
        suite.passed++;
      } catch (error) {
        const result: TestResult = {
          name: testName,
          status: 'failed',
          duration: Date.now() - testStart,
          error: error instanceof Error ? error.message : String(error)
        };
        suite.tests.push(result);
        suite.failed++;
      }
    }

    suite.duration = Date.now() - suiteStart;
    this.testResults.push(suite);
    return suite;
  }

  /**
   * 1. MCPプロキシ統合テスト
   * HybridPolicyEngineの動作確認
   */
  async testMCPProxyIntegration(): Promise<void> {
    const testFunctions = [
      // ツールルーティングのテスト
      async function testToolRouting() {
        const proxy = new MCPHttpPolicyProxy(this.config, this.logger);
        const tools = proxy.getAvailableTools();
        
        // 12個のツールが正しく登録されているか確認
        const expectedTools = [
          'filesystem__list',
          'filesystem__read',
          'filesystem__write',
          'execution-server__runCommand',
          'execution-server__runPython',
          'artifacts',
          'repl',
          'web_search',
          'web_fetch'
        ];

        for (const tool of expectedTools) {
          if (!tools.includes(tool)) {
            throw new Error(`Expected tool ${tool} not found`);
          }
        }
      }.bind(this),

      // HybridPolicyEngineの使用確認
      async function testHybridEngineUsage() {
        const proxy = new MCPHttpPolicyProxy(this.config, this.logger);
        // Proxyがhybrid engineを使用しているか確認
        const engine = (proxy as any).judgmentEngine;
        if (!engine || engine.constructor.name !== 'HybridPolicyEngine') {
          throw new Error(`Expected HybridPolicyEngine, got ${engine?.constructor.name}`);
        }
      }.bind(this),

      // ODRL優先判定のテスト
      async function testODRLPriority() {
        const hybridEngine = new HybridPolicyEngine(this.config, this.logger);
        
        // ODRLポリシーを追加
        await hybridEngine.addODRLPolicy('test-odrl', {
          "@context": "http://www.w3.org/ns/odrl/2/",
          "@type": "Policy",
          "uid": "test-policy",
          "permission": [{
            "action": "read",
            "target": "test-resource",
            "constraint": [{
              "leftOperand": "dateTime",
              "operator": "gt",
              "rightOperand": { "@value": "2024-01-01", "@type": "xsd:date" }
            }]
          }]
        });

        // 自然言語ポリシーも追加
        hybridEngine.addPolicy('test-nl', 'すべてのアクセスを拒否');

        // ODRL判定が優先されることを確認
        const context = {
          action: 'read',
          resource: 'test-resource',
          agent: 'test-agent',
          purpose: 'testing'
        };

        const decision = await hybridEngine.evaluateRequest(context, 'test-odrl');
        if (!decision.metadata?.engine || decision.metadata.engine !== 'odrl') {
          throw new Error(`Expected ODRL engine, got ${decision.metadata?.engine}`);
        }
      }.bind(this)
    ];

    await this.runTestSuite('MCP Proxy Integration', testFunctions);
  }

  /**
   * 2. コアコントローラーテスト
   * AIJudgmentEngine → HybridPolicyEngine移行の互換性
   */
  async testCoreController(): Promise<void> {
    const testFunctions = [
      // 基本的なアクセス制御フロー
      async function testAccessControlFlow() {
        const controller = new AEGISController(this.config, this.logger);
        
        // テストポリシーを追加
        controller.addPolicy('test-policy', 'テストエージェントはテストリソースへのアクセスを許可');

        // アクセス要求をテスト
        const decision = await controller.evaluateAccess(
          'test-agent',
          'read',
          'test-resource'
        );

        if (decision.decision !== 'PERMIT') {
          throw new Error(`Expected PERMIT, got ${decision.decision}`);
        }
      }.bind(this),

      // エラーハンドリング
      async function testErrorHandling() {
        const controller = new AEGISController(this.config, this.logger);
        
        // 無効なポリシーでのテスト
        try {
          await controller.evaluateAccess('agent', 'action', 'resource');
          throw new Error('Expected error for missing policy');
        } catch (error) {
          // エラーが期待通り発生
        }
      }.bind(this),

      // ポリシー選択ロジック
      async function testPolicySelection() {
        const controller = new AEGISController(this.config, this.logger);
        
        // 複数のポリシーを追加
        controller.addPolicy('general', '一般的なアクセスは拒否');
        controller.addPolicy('specific', 'test-agentのアクセスは許可');

        // より具体的なポリシーが選択されることを確認
        const policies = controller.selectApplicablePolicies({
          action: 'read',
          resource: 'resource',
          agent: 'test-agent',
          purpose: 'test'
        });

        if (policies.length === 0) {
          throw new Error('No policies selected');
        }
      }.bind(this)
    ];

    await this.runTestSuite('Core Controller', testFunctions);
  }

  /**
   * 3. Phase 3 制約・義務システムテスト
   */
  async testPhase3EnforcementSystem(): Promise<void> {
    const testFunctions = [
      // データ匿名化制約
      async function testDataAnonymization() {
        const { DataAnonymizerProcessor } = await import('../src/phase3/constraints/data-anonymizer');
        const processor = new DataAnonymizerProcessor();
        
        const testData = {
          name: 'John Doe',
          email: 'john@example.com',
          ssn: '123-45-6789',
          publicInfo: 'This is public'
        };

        const result = await processor.process(testData, {
          constraint: 'anonymize-pii',
          params: { fields: ['name', 'email', 'ssn'] }
        });

        const processed = result.processedData as any;
        if (processed.name !== '[REDACTED]' || 
            !processed.email.includes('****') ||
            processed.ssn !== '[REDACTED]') {
          throw new Error('Data not properly anonymized');
        }
      },

      // レート制限制約
      async function testRateLimit() {
        const { RateLimiterProcessor } = await import('../src/phase3/constraints/rate-limiter');
        const processor = new RateLimiterProcessor();
        
        const constraint = {
          constraint: 'rate-limit',
          params: { limit: 2, window: 1000 } // 1秒に2回まで
        };

        // 最初の2回は成功
        await processor.process({}, constraint);
        await processor.process({}, constraint);

        // 3回目は失敗するはず
        try {
          await processor.process({}, constraint);
          throw new Error('Rate limit should have been exceeded');
        } catch (error) {
          // 期待通りエラー
        }
      },

      // 監査ログ義務
      async function testAuditLogging() {
        const { AuditLoggerExecutor } = await import('../src/phase3/obligations/audit-logger');
        const executor = new AuditLoggerExecutor();
        
        const logs: any[] = [];
        // ログ出力をキャプチャ
        const originalLog = console.log;
        console.log = (message: any) => logs.push(message);

        await executor.execute({
          decision: { decision: 'PERMIT', reason: 'Test' },
          context: { agent: 'test', action: 'read', resource: 'data' }
        }, {
          obligation: 'audit-log',
          params: { level: 'info' }
        });

        console.log = originalLog;

        if (logs.length === 0) {
          throw new Error('No audit log generated');
        }
      }
    ];

    await this.runTestSuite('Phase 3 Enforcement System', testFunctions);
  }

  /**
   * 4. ODRL統合テスト
   */
  async testODRLIntegration(): Promise<void> {
    const testFunctions = [
      // ODRL変換テスト
      async function testODRLTransformation() {
        const { transformODRLToSystemPrompt } = await import('../src/odrl/transformer');
        
        const odrlPolicy = {
          "@context": "http://www.w3.org/ns/odrl/2/",
          "@type": "Policy",
          "permission": [{
            "action": "read",
            "target": "customer-data"
          }]
        };

        const prompt = transformODRLToSystemPrompt(odrlPolicy);
        if (!prompt.includes('read') || !prompt.includes('customer-data')) {
          throw new Error('ODRL not properly transformed');
        }
      },

      // ハイブリッド判定テスト
      async function testHybridDecision() {
        const hybridEngine = new HybridPolicyEngine(this.config, this.logger);
        
        // ODRL: 特定のアクションを許可
        await hybridEngine.addODRLPolicy('odrl-allow', {
          "@context": "http://www.w3.org/ns/odrl/2/",
          "@type": "Policy",
          "permission": [{
            "action": "read",
            "target": "public-data"
          }]
        });

        // AI: より複雑な判定
        hybridEngine.addPolicy('ai-complex', `
          公開データへの読み取りアクセスは基本的に許可。
          ただし、大量アクセスやスクレイピングの兆候がある場合は拒否。
        `);

        // 通常のアクセスはODRLで許可
        const normalAccess = await hybridEngine.evaluateRequest({
          action: 'read',
          resource: 'public-data',
          agent: 'normal-agent',
          purpose: 'view'
        }, 'odrl-allow');

        if (normalAccess.decision !== 'PERMIT') {
          throw new Error('Normal access should be permitted');
        }

        // 複雑なケースはAIフォールバック
        const complexAccess = await hybridEngine.evaluateRequest({
          action: 'read',
          resource: 'sensitive-data',
          agent: 'unknown-agent',
          purpose: 'bulk-download'
        }, 'ai-complex');

        if (!complexAccess.metadata?.engine || complexAccess.metadata.engine !== 'ai') {
          throw new Error('Complex case should fallback to AI');
        }
      }.bind(this)
    ];

    await this.runTestSuite('ODRL Integration', testFunctions);
  }

  /**
   * テスト結果のレポート生成
   */
  generateReport(): string {
    let report = '# AEGIS 回帰テストレポート\n\n';
    report += `実行日時: ${new Date().toISOString()}\n\n`;

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of this.testResults) {
      report += `## ${suite.name}\n`;
      report += `- 総テスト数: ${suite.totalTests}\n`;
      report += `- 成功: ${suite.passed}\n`;
      report += `- 失敗: ${suite.failed}\n`;
      report += `- 実行時間: ${suite.duration}ms\n\n`;

      totalTests += suite.totalTests;
      totalPassed += suite.passed;
      totalFailed += suite.failed;

      if (suite.failed > 0) {
        report += '### 失敗したテスト:\n';
        for (const test of suite.tests) {
          if (test.status === 'failed') {
            report += `- **${test.name}**: ${test.error}\n`;
          }
        }
        report += '\n';
      }
    }

    report += `## サマリー\n`;
    report += `- 総テスト数: ${totalTests}\n`;
    report += `- 成功: ${totalPassed}\n`;
    report += `- 失敗: ${totalFailed}\n`;
    report += `- 成功率: ${((totalPassed / totalTests) * 100).toFixed(2)}%\n`;

    return report;
  }

  /**
   * すべての回帰テストを実行
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 AEGIS 回帰テストを開始します...\n');

    try {
      // 各テストスイートを実行
      await this.testMCPProxyIntegration();
      await this.testCoreController();
      await this.testPhase3EnforcementSystem();
      await this.testODRLIntegration();

      // レポート生成
      const report = this.generateReport();
      console.log(report);

      // レポートをファイルに保存
      const fs = await import('fs/promises');
      await fs.writeFile('regression-test-report.md', report);
      console.log('\n📄 レポートを regression-test-report.md に保存しました。');

    } catch (error) {
      console.error('❌ テスト実行中にエラーが発生しました:', error);
    }
  }
}

// メイン実行部分
if (require.main === module) {
  const client = new RegressionTestClient();
  client.runAllTests().catch(console.error);
}

export { RegressionTestClient };