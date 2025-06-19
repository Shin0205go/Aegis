# 拡張・カスタマイズ

AEGISの拡張方法、プラグインアーキテクチャ、カスタムコンポーネントの作成について説明します。

## 🎯 拡張ポイント

AEGISは以下の拡張ポイントを提供しています：

1. **カスタムポリシーエンジン** - 独自の判定ロジック
2. **カスタムエンリッチャー** - コンテキスト情報の拡張
3. **カスタムMCPツール** - 新しいツールの追加
4. **カスタム制約プロセッサ** - 独自の制約実装
5. **カスタム義務エグゼキューター** - 独自の義務実装
6. **カスタムトランスポート** - 新しい通信方式
7. **プラグインシステム** - 総合的な機能拡張

## 🔌 プラグインアーキテクチャ

### プラグインインターフェース

```typescript
// src/plugins/plugin-interface.ts
export interface AEGISPlugin {
  // プラグインメタデータ
  name: string;
  version: string;
  description: string;
  author?: string;
  
  // ライフサイクルフック
  onInitialize?(context: PluginContext): Promise<void>;
  onStart?(context: PluginContext): Promise<void>;
  onStop?(context: PluginContext): Promise<void>;
  
  // 拡張ポイント
  policyEngines?: PolicyEngineExtension[];
  contextEnrichers?: ContextEnricherExtension[];
  mcpTools?: MCPToolExtension[];
  constraintProcessors?: ConstraintProcessorExtension[];
  obligationExecutors?: ObligationExecutorExtension[];
  
  // イベントハンドラー
  eventHandlers?: EventHandlerExtension[];
  
  // API拡張
  apiRoutes?: APIRouteExtension[];
  
  // UI拡張（将来実装）
  uiComponents?: UIComponentExtension[];
}

export interface PluginContext {
  logger: Logger;
  config: PluginConfig;
  eventBus: EventBus;
  storage: PluginStorage;
  api: {
    policyEngine: PolicyEngine;
    auditLogger: AuditLogger;
    agentRegistry: AgentRegistry;
  };
}
```

### プラグインの作成例

```typescript
// my-plugin/index.ts
import { AEGISPlugin, PluginContext } from '@aegis/plugin-interface';

export default class MyCustomPlugin implements AEGISPlugin {
  name = 'my-custom-plugin';
  version = '1.0.0';
  description = 'カスタム機能を追加するプラグイン';
  
  async onInitialize(context: PluginContext): Promise<void> {
    context.logger.info(`Initializing ${this.name}`);
    
    // 初期化処理
    await this.setupDatabase(context);
    await this.registerWebhooks(context);
  }
  
  // カスタムエンリッチャー
  contextEnrichers = [{
    name: 'custom-enricher',
    enrich: async (context: DecisionContext) => {
      // 外部APIからデータ取得
      const externalData = await this.fetchExternalData(context.agent);
      
      return {
        customScore: externalData.riskScore,
        customAttributes: externalData.attributes
      };
    }
  }];
  
  // カスタム制約プロセッサ
  constraintProcessors = [{
    name: 'watermark-constraint',
    canHandle: (constraint: string) => constraint.includes('watermark'),
    process: async (data: any, constraint: string) => {
      // データに透かしを追加
      if (typeof data === 'string') {
        return data + '\n[Processed by AEGIS]';
      }
      return data;
    }
  }];
  
  // イベントハンドラー
  eventHandlers = [{
    event: 'decision.made',
    handler: async (event: DecisionEvent) => {
      if (event.decision === 'DENY') {
        // カスタム通知を送信
        await this.sendAlert(event);
      }
    }
  }];
  
  // API拡張
  apiRoutes = [{
    method: 'GET',
    path: '/api/custom/stats',
    handler: async (req, res) => {
      const stats = await this.getCustomStats();
      res.json(stats);
    }
  }];
}
```

### プラグインの登録

```typescript
// aegis-config.ts
import MyCustomPlugin from './plugins/my-custom-plugin';
import SecurityPlugin from '@aegis/security-plugin';

export const config: AEGISConfig = {
  plugins: [
    new MyCustomPlugin(),
    new SecurityPlugin({
      enableAdvancedThreatDetection: true
    })
  ]
};
```

## 🧩 カスタムポリシーエンジン

### 基本実装

```typescript
// custom-policy-engine.ts
import { PolicyEngine, PolicyDecision, DecisionContext } from '@aegis/core';

export class RuleBasedPolicyEngine extends PolicyEngine {
  private rules: PolicyRule[] = [];
  
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.sortRulesByPriority();
  }
  
  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    // ルールベースの評価
    for (const rule of this.rules) {
      if (await this.matchesRule(context, rule)) {
        return {
          decision: rule.decision,
          reason: rule.reason,
          confidence: 1.0,
          constraints: rule.constraints,
          obligations: rule.obligations
        };
      }
    }
    
    // デフォルト判定
    return {
      decision: 'DENY',
      reason: 'No matching rule found',
      confidence: 1.0
    };
  }
  
  private async matchesRule(
    context: DecisionContext, 
    rule: PolicyRule
  ): Promise<boolean> {
    // エージェントマッチ
    if (rule.agent && !this.matchesPattern(context.agent, rule.agent)) {
      return false;
    }
    
    // アクションマッチ
    if (rule.action && !this.matchesPattern(context.action, rule.action)) {
      return false;
    }
    
    // リソースマッチ
    if (rule.resource && !this.matchesPattern(context.resource, rule.resource)) {
      return false;
    }
    
    // 条件評価
    if (rule.condition) {
      return await rule.condition(context);
    }
    
    return true;
  }
}

interface PolicyRule {
  priority: number;
  agent?: string | RegExp;
  action?: string | RegExp;
  resource?: string | RegExp;
  condition?: (context: DecisionContext) => Promise<boolean>;
  decision: 'PERMIT' | 'DENY';
  reason: string;
  constraints?: string[];
  obligations?: string[];
}
```

### ハイブリッドエンジン

```typescript
// hybrid-policy-engine.ts
export class HybridPolicyEngine extends PolicyEngine {
  constructor(
    private ruleEngine: RuleBasedPolicyEngine,
    private nlpEngine: NLPPolicyEngine,
    private mlEngine: MLPolicyEngine
  ) {
    super();
  }
  
  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    // 1. ルールベース評価（高速）
    const ruleDecision = await this.ruleEngine.evaluate(context);
    if (ruleDecision.confidence >= 0.95) {
      return ruleDecision;
    }
    
    // 2. 機械学習モデル評価
    const mlDecision = await this.mlEngine.evaluate(context);
    
    // 3. 必要に応じてNLP評価
    if (mlDecision.confidence < 0.8) {
      const nlpDecision = await this.nlpEngine.evaluate(context);
      
      // 決定の統合
      return this.combineDecisions([ruleDecision, mlDecision, nlpDecision]);
    }
    
    return mlDecision;
  }
  
  private combineDecisions(decisions: PolicyDecision[]): PolicyDecision {
    // 重み付き投票
    const weights = [0.4, 0.4, 0.2]; // ルール、ML、NLP
    let permitScore = 0;
    let denyScore = 0;
    
    decisions.forEach((decision, i) => {
      const weight = weights[i] * decision.confidence;
      if (decision.decision === 'PERMIT') {
        permitScore += weight;
      } else {
        denyScore += weight;
      }
    });
    
    return {
      decision: permitScore > denyScore ? 'PERMIT' : 'DENY',
      reason: this.generateCombinedReason(decisions),
      confidence: Math.max(permitScore, denyScore),
      constraints: this.mergeConstraints(decisions),
      obligations: this.mergeObligations(decisions)
    };
  }
}
```

## 🛠️ カスタムMCPツール

### ツールの実装

```typescript
// custom-mcp-tool.ts
import { MCPTool, ToolInput, ToolOutput } from '@aegis/mcp';

export class DatabaseQueryTool implements MCPTool {
  name = 'database_query';
  description = 'Execute database queries safely';
  
  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to execute'
      },
      database: {
        type: 'string',
        description: 'Target database name'
      },
      timeout: {
        type: 'number',
        description: 'Query timeout in seconds',
        default: 30
      }
    },
    required: ['query', 'database']
  };
  
  async execute(input: ToolInput): Promise<ToolOutput> {
    // 入力検証
    this.validateInput(input);
    
    // SQLインジェクション対策
    const sanitizedQuery = this.sanitizeQuery(input.query);
    
    // 権限チェック
    await this.checkPermissions(input.database);
    
    // クエリ実行
    const connection = await this.getConnection(input.database);
    
    try {
      const result = await connection.query(sanitizedQuery, {
        timeout: input.timeout * 1000
      });
      
      return {
        success: true,
        result: this.formatResult(result),
        metadata: {
          rowCount: result.rowCount,
          executionTime: result.executionTime
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: 'QUERY_FAILED'
      };
    } finally {
      await connection.release();
    }
  }
  
  private sanitizeQuery(query: string): string {
    // 危険な操作をブロック
    const dangerousPatterns = [
      /DROP\s+TABLE/i,
      /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,
      /UPDATE.*SET.*WHERE\s+1\s*=\s*1/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error('Dangerous query pattern detected');
      }
    }
    
    return query;
  }
}
```

### ツールの登録

```typescript
// tool-registry.ts
export class CustomToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  
  registerTool(tool: MCPTool): void {
    // ツール名の検証
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    
    // スキーマ検証
    this.validateToolSchema(tool);
    
    // 登録
    this.tools.set(tool.name, tool);
    
    // イベント発行
    this.eventBus.emit('tool.registered', {
      name: tool.name,
      description: tool.description
    });
  }
  
  async executeTool(
    name: string, 
    input: any,
    context: ExecutionContext
  ): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    
    // 実行前フック
    await this.runPreExecutionHooks(tool, input, context);
    
    // ツール実行
    const result = await tool.execute(input);
    
    // 実行後フック
    await this.runPostExecutionHooks(tool, input, result, context);
    
    return result;
  }
}
```

## 🔄 カスタム制約・義務

### 制約プロセッサ

```typescript
// custom-constraint-processor.ts
export class EncryptionConstraintProcessor implements ConstraintProcessor {
  name = 'encryption-constraint';
  
  canHandle(constraint: string): boolean {
    return constraint.toLowerCase().includes('encrypt');
  }
  
  async process(
    data: any,
    constraint: string,
    context: ProcessingContext
  ): Promise<any> {
    // 暗号化パラメータの抽出
    const params = this.parseConstraint(constraint);
    
    if (params.type === 'field-level') {
      // フィールドレベル暗号化
      return this.encryptFields(data, params.fields);
    } else if (params.type === 'full') {
      // 全体暗号化
      return this.encryptFull(data, params.algorithm);
    }
    
    return data;
  }
  
  private async encryptFields(data: any, fields: string[]): Promise<any> {
    const encrypted = { ...data };
    
    for (const field of fields) {
      if (field in encrypted) {
        encrypted[field] = await this.encrypt(encrypted[field]);
        encrypted[`${field}_encrypted`] = true;
      }
    }
    
    return encrypted;
  }
  
  private async encrypt(value: any): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }
}
```

### 義務エグゼキューター

```typescript
// custom-obligation-executor.ts
export class ComplianceReportExecutor implements ObligationExecutor {
  name = 'compliance-report';
  
  canHandle(obligation: string): boolean {
    return obligation.includes('compliance-report');
  }
  
  async execute(
    obligation: string,
    context: ExecutionContext,
    result: any
  ): Promise<void> {
    const params = this.parseObligation(obligation);
    
    // レポート生成
    const report = await this.generateReport({
      context,
      result,
      regulation: params.regulation,
      format: params.format || 'pdf'
    });
    
    // 保存
    await this.saveReport(report);
    
    // 通知
    if (params.notify) {
      await this.sendNotification(report, params.notify);
    }
    
    // 監査ログ
    await this.auditLogger.log({
      event: 'compliance.report.generated',
      regulation: params.regulation,
      reportId: report.id,
      context
    });
  }
  
  private async generateReport(params: ReportParams): Promise<ComplianceReport> {
    const template = await this.getTemplate(params.regulation);
    
    const data = {
      timestamp: new Date(),
      request: params.context,
      decision: params.result.decision,
      dataAccessed: this.extractAccessedData(params.result),
      purpose: params.context.metadata?.purpose,
      legalBasis: this.determineLegalBasis(params.context)
    };
    
    return {
      id: generateId(),
      regulation: params.regulation,
      content: await this.renderTemplate(template, data),
      format: params.format,
      generatedAt: new Date()
    };
  }
}
```

## 🎨 UI拡張（将来実装）

### カスタムダッシュボードウィジェット

```typescript
// custom-widget.tsx
import React from 'react';
import { Widget, WidgetProps } from '@aegis/ui';

export const RiskHeatmapWidget: React.FC<WidgetProps> = ({ data }) => {
  const [heatmapData, setHeatmapData] = useState([]);
  
  useEffect(() => {
    // データ処理
    const processed = processDataForHeatmap(data);
    setHeatmapData(processed);
  }, [data]);
  
  return (
    <Widget title="Risk Heatmap" icon="🔥">
      <Heatmap
        data={heatmapData}
        xAxis={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
        yAxis={['00:00', '06:00', '12:00', '18:00']}
        colorScale={['#00ff00', '#ffff00', '#ff0000']}
        onClick={(cell) => handleCellClick(cell)}
      />
    </Widget>
  );
};

// ウィジェット登録
export const widgetConfig = {
  id: 'risk-heatmap',
  component: RiskHeatmapWidget,
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 4, h: 3 },
  dataSource: '/api/custom/risk-matrix'
};
```

## 🔌 外部システム統合

### Webhook統合

```typescript
// webhook-integration.ts
export class WebhookIntegration {
  private webhooks: Map<string, WebhookConfig> = new Map();
  
  registerWebhook(config: WebhookConfig): void {
    this.webhooks.set(config.id, config);
    
    // イベントリスナー登録
    this.eventBus.on(config.event, async (data) => {
      if (this.shouldTrigger(config, data)) {
        await this.sendWebhook(config, data);
      }
    });
  }
  
  private async sendWebhook(
    config: WebhookConfig,
    data: any
  ): Promise<void> {
    const payload = this.buildPayload(config, data);
    
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AEGIS-Signature': this.generateSignature(payload, config.secret)
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
      
      // 成功ログ
      await this.auditLogger.log({
        event: 'webhook.sent',
        webhook: config.id,
        status: 'success'
      });
    } catch (error) {
      // エラーハンドリング
      await this.handleWebhookError(config, error);
    }
  }
}

interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  event: string;
  filter?: (data: any) => boolean;
  transform?: (data: any) => any;
  retry?: {
    count: number;
    delay: number;
  };
}
```

### メッセージキュー統合

```typescript
// message-queue-integration.ts
import { Queue } from 'bull';

export class MessageQueueIntegration {
  private queues: Map<string, Queue> = new Map();
  
  async setupQueue(name: string, config: QueueConfig): Promise<void> {
    const queue = new Queue(name, {
      redis: config.redis
    });
    
    // ワーカー設定
    queue.process(config.concurrency || 1, async (job) => {
      return this.processJob(name, job);
    });
    
    // イベントハンドラー
    queue.on('completed', (job, result) => {
      this.logger.info(`Job completed: ${job.id}`, { result });
    });
    
    queue.on('failed', (job, error) => {
      this.logger.error(`Job failed: ${job.id}`, { error });
    });
    
    this.queues.set(name, queue);
  }
  
  async publishToQueue(
    queueName: string,
    data: any,
    options?: JobOptions
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.add(data, options);
  }
}
```

## 📦 プラグインの配布

### パッケージ構造

```
my-aegis-plugin/
├── package.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts
│   ├── processors/
│   ├── executors/
│   └── utils/
├── tests/
└── examples/
```

### package.json

```json
{
  "name": "@mycompany/aegis-custom-plugin",
  "version": "1.0.0",
  "description": "Custom AEGIS plugin for enhanced security",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["aegis", "plugin", "security"],
  "peerDependencies": {
    "@aegis/core": "^1.0.0",
    "@aegis/plugin-interface": "^1.0.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

### プラグインのインストール

```bash
# npmから
npm install @mycompany/aegis-custom-plugin

# ローカルファイルから
npm install file:../my-aegis-plugin

# GitHubから
npm install github:mycompany/aegis-custom-plugin
```

## 🎯 ベストプラクティス

### 1. エラーハンドリング

```typescript
export class RobustPlugin implements AEGISPlugin {
  async onInitialize(context: PluginContext): Promise<void> {
    try {
      await this.initialize();
    } catch (error) {
      // エラーをログに記録
      context.logger.error('Plugin initialization failed', error);
      
      // グレースフルデグラデーション
      this.enableFallbackMode();
      
      // 必要に応じて再スロー
      if (this.isCritical) {
        throw new PluginInitializationError(
          `Failed to initialize ${this.name}`,
          error
        );
      }
    }
  }
}
```

### 2. パフォーマンス考慮

```typescript
export class PerformantEnricher implements ContextEnricher {
  private cache = new LRUCache<string, any>({ max: 1000 });
  
  async enrich(context: DecisionContext): Promise<any> {
    const cacheKey = this.getCacheKey(context);
    
    // キャッシュチェック
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }
    
    // バッチ処理の活用
    const enrichedData = await this.batchEnrich([context]);
    
    // キャッシュ更新
    this.cache.set(cacheKey, {
      data: enrichedData[0],
      timestamp: Date.now()
    });
    
    return enrichedData[0];
  }
}
```

### 3. テスト可能性

```typescript
// テスト可能な設計
export class TestablePlugin implements AEGISPlugin {
  constructor(
    private dependencies: {
      httpClient?: HttpClient;
      database?: Database;
      logger?: Logger;
    } = {}
  ) {
    // 依存性注入でテスト時にモックを注入可能
    this.httpClient = dependencies.httpClient || new DefaultHttpClient();
    this.database = dependencies.database || new DefaultDatabase();
    this.logger = dependencies.logger || new DefaultLogger();
  }
}

// テスト
describe('TestablePlugin', () => {
  it('should handle external API errors', async () => {
    const mockHttpClient = {
      get: jest.fn().mockRejectedValue(new Error('API Error'))
    };
    
    const plugin = new TestablePlugin({
      httpClient: mockHttpClient
    });
    
    // テスト実行...
  });
});
```

## 📚 関連ドキュメント

- [システムアーキテクチャ](./architecture.md) - 内部設計
- [API リファレンス](./api-reference.md) - プラグインAPI
- [開発環境・テスト](./development.md) - 開発ガイド