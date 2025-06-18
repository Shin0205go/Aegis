# AEGIS API リファレンス

## 📋 目次

1. [概要](#概要)
2. [AEGISController API](#aegiscontroller-api)
3. [MCPプロキシ API](#mcpプロキシ-api)
4. [ポリシー管理 API](#ポリシー管理-api)
5. [ツール発見 API](#ツール発見-api)
6. [コンテキストエンリッチャー API](#コンテキストエンリッチャー-api)
7. [型定義](#型定義)
8. [エラーハンドリング](#エラーハンドリング)

## 概要

AEGIS APIは、自然言語ポリシーベースのアクセス制御を提供する包括的なインターフェースです。このドキュメントでは、主要なAPIとその使用方法について説明します。

### 基本的な使用方法

```typescript
import { AEGISController } from '@aegis/core/controller';
import { AnthropicLLM } from '@aegis/ai/anthropic-llm';

// LLMインスタンス初期化
const llm = new AnthropicLLM({
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// AEGISコントローラー初期化
const controller = new AEGISController(llm);

// ポリシー追加
await controller.addPolicy(
  'customer-access',
  '顧客データは営業時間内のみアクセス可能'
);

// アクセス制御実行
const result = await controller.controlAccess(
  'agent-001',
  'read',
  'customer-data',
  'support'
);
```

## AEGISController API

### クラス: `AEGISController`

メインのコントローラークラスで、すべての制御操作を統括します。

#### コンストラクタ

```typescript
constructor(llm: LLMInterface, logger?: Logger)
```

**パラメータ:**
- `config`: AEGIS設定オブジェクト
- `logger`: ロガーインスタンス

#### メソッド: `controlAccess`

アクセス制御判定を実行します。

```typescript
async controlAccess(
  agentId: string,
  action: string,
  resource: string,
  purpose?: string,
  additionalContext?: Record<string, any>
): Promise<AccessControlResult>
```

**パラメータ:**
- `agentId`: エージェントの識別子
- `action`: 実行するアクション（read, write, delete等）
- `resource`: アクセス対象リソース
- `purpose`: アクセス目的（オプション）
- `additionalContext`: 追加のコンテキスト情報（オプション）

**戻り値:**
```typescript
interface AccessControlResult {
  decision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;
  confidence: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  constraints?: string[];
  obligations?: string[];
  monitoringRequirements?: string[];
  validityPeriod?: {
    start?: Date;
    end?: Date;
  };
  processingTime: number;
  policyUsed: string;
  context?: DecisionContext;
  error?: string;
}
```

**使用例:**
```typescript
const result = await controller.controlAccess(
  'support-agent-123',
  'read',
  'customer://database/users/12345',
  'customer-inquiry',
  {
    ticketId: 'TICKET-789',
    urgency: 'high'
  }
);

if (result.decision === 'PERMIT') {
  console.log('アクセス許可:', result.reason);
  // 制約の適用
  result.constraints?.forEach(constraint => {
    console.log('制約:', constraint);
  });
} else {
  console.log('アクセス拒否:', result.reason);
}
```

#### メソッド: `addPolicy`

新しいポリシーを追加します。

```typescript
async addPolicy(
  name: string,
  policy: string,
  metadata?: any
): Promise<string>
```

**パラメータ:**
- `name`: ポリシー名
- `policy`: 自然言語で記述されたポリシー
- `metadata`: ポリシーのメタデータ（オプション）

**戻り値:** ポリシーID

**使用例:**
```typescript
const policyId = await controller.addPolicy(
  'data-retention-policy',
  `
  【データ保持ポリシー】
  
  基本原則：
  - 顧客データは最後のアクセスから1年間保持
  - 財務データは7年間保持必須
  
  制限事項：
  - 保持期間を過ぎたデータは自動削除
  - 削除前に30日間のアーカイブ期間を設ける
  `,
  {
    createdBy: 'admin',
    tags: ['retention', 'compliance']
  }
);
```

#### メソッド: `listPolicies`

登録されているポリシーの一覧を取得します。

```typescript
listPolicies(): NaturalLanguagePolicyDefinition[]
```

**戻り値:** ポリシー定義の配列

#### メソッド: `getStatistics`

システムの統計情報を取得します。

```typescript
getStatistics(): ControllerStatistics
```

**戻り値:**
```typescript
interface ControllerStatistics {
  totalDecisions: number;
  permitRate: number;
  denyRate: number;
  averageConfidence: number;
  topAgents: Array<{ agent: string; count: number }>;
  topResources: Array<{ resource: string; count: number }>;
  riskDistribution: Record<string, number>;
}
```

#### メソッド: `getDecisionHistory`

判定履歴を取得します。

```typescript
getDecisionHistory(filter?: {
  agent?: string;
  resource?: string;
  decision?: string;
  limit?: number;
}): DecisionHistoryEntry[]
```

## MCPプロキシ API

### クラス: `MCPPolicyProxy`

MCPプロトコルのプロキシサーバーとして動作します。

#### メソッド: `start`

プロキシサーバーを起動します。

```typescript
async start(): Promise<void>
```

#### メソッド: `stop`

プロキシサーバーを停止します。

```typescript
async stop(): Promise<void>
```

#### メソッド: `addUpstreamServer`

上流MCPサーバーを追加します。

```typescript
addUpstreamServer(name: string, url: string): void
```

**パラメータ:**
- `name`: サーバー名
- `url`: WebSocket URL

**使用例:**
```typescript
proxy.addUpstreamServer('gmail', 'ws://localhost:8080/gmail');
proxy.addUpstreamServer('gdrive', 'ws://localhost:8081/gdrive');
```

### REST API エンドポイント

#### `GET /api/health`

ヘルスチェックエンドポイント

**レスポンス:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "upstreamServers": [
    {
      "name": "gmail",
      "connected": true
    }
  ]
}
```

#### `GET /api/policies`

ポリシー一覧を取得

**レスポンス:**
```json
{
  "policies": [
    "customer-data-policy",
    "email-access-policy"
  ]
}
```

#### `POST /api/policies`

ポリシーを作成

**リクエストボディ:**
```json
{
  "name": "ポリシー名",
  "policy": "【ポリシー内容】..."
}
```

#### `PUT /api/policies/:id`

ポリシーを更新

**リクエストボディ:**
```json
{
  "policy": "【新しいポリシー内容】..."
}
```

#### `DELETE /api/policies/:id`

ポリシーを削除

## ポリシー管理 API

### インターフェース: `PolicyManagementAPI`

```typescript
interface PolicyManagementAPI {
  // ポリシーCRUD
  createPolicy(
    name: string,
    policy: string,
    metadata?: Partial<PolicyMetadata>
  ): Promise<string>;
  
  updatePolicy(
    policyId: string,
    policy: string,
    updatedBy?: string
  ): Promise<void>;
  
  deletePolicy(policyId: string): Promise<void>;
  
  // ポリシー取得
  getPolicy(policyId: string): Promise<{
    metadata: PolicyMetadata;
    policy: string;
  } | null>;
  
  listPolicies(filter?: {
    status?: string;
    tags?: string[];
  }): Promise<PolicyMetadata[]>;
  
  // バージョン管理
  getPolicyHistory(policyId: string): Promise<PolicyVersion[]>;
  
  // インポート/エクスポート
  exportPolicy(policyId: string): Promise<PolicyExport>;
  importPolicy(
    exportData: PolicyExport,
    importedBy?: string
  ): Promise<string>;
}
```

#### `POST /api/policies/test`

ポリシーをテスト

**リクエストボディ:**
```json
{
  "agent": "エージェントID",
  "action": "アクション",
  "resource": "リソース",
  "purpose": "目的",
  "environment": {
    "clientIP": "192.168.1.1"
  }
}
```

#### `POST /api/policies/analyze`

ポリシーを分析

**リクエストボディ:**
```json
{
  "policy": "分析したいポリシーテキスト"
}
```

## コンテキストエンリッチャー API

### インターフェース: `ContextEnricher`

カスタムエンリッチャーを作成するための基本インターフェース。

```typescript
interface ContextEnricher {
  name: string;
  enrich(context: DecisionContext): Promise<Record<string, any>>;
}
```

### 実装例: カスタムエンリッチャー

```typescript
export class GeolocationEnricher implements ContextEnricher {
  name = 'geolocation';
  
  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    const ip = context.environment.clientIP;
    const geoData = await this.lookupGeolocation(ip);
    
    return {
      country: geoData.country,
      city: geoData.city,
      isHighRiskCountry: this.isHighRisk(geoData.country)
    };
  }
  
  private async lookupGeolocation(ip: string): Promise<any> {
    // 地理情報を取得
  }
  
  private isHighRisk(country: string): boolean {
    const highRiskCountries = ['XX', 'YY'];
    return highRiskCountries.includes(country);
  }
}
```

### エンリッチャーの登録

```typescript
const collector = new ContextCollector();
collector.registerEnricher(new GeolocationEnricher());
collector.registerEnricher(new TimeBasedEnricher());
collector.registerEnricher(new AgentInfoEnricher());
```

## ツール発見 API

### クラス: `ToolDiscoveryService`

ハイブリッドMCPプロキシのツール管理を提供します。

#### コンストラクタ

```typescript
constructor(config: ToolDiscoveryConfig, logger: Logger)
```

**設定例:**
```typescript
const toolDiscovery = new ToolDiscoveryService({
  includeNativeTools: true,
  includeDiscoveredTools: true,
  policyControl: {
    defaultEnabled: true,
    exceptions: ['TodoRead', 'TodoWrite', 'LS'],
    toolPolicies: {
      'Bash': {
        enabled: true,
        constraints: ['危険なコマンドのブロック'],
        obligations: ['監査ログ記録']
      }
    }
  }
}, logger);
```

#### メソッド: `registerNativeTools`

Claude Code内蔵ツールを登録します。

```typescript
registerNativeTools(): void
```

**登録されるツール:**
- Agent: サブエージェント実行
- Bash: シェルコマンド実行
- Edit/MultiEdit: ファイル編集
- Read/Write: ファイル読み書き
- WebFetch/WebSearch: Web アクセス
- TodoRead/TodoWrite: タスク管理

#### メソッド: `registerToolFromClient`

動的に発見されたツールを登録します。

```typescript
registerToolFromClient(tool: any, sourceName: string): void
```

**パラメータ:**
- `tool`: ツール定義オブジェクト
- `sourceName`: ツールのソース名（例: 'vscode', 'third-party'）

#### メソッド: `getTool`

ツール情報を取得します。

```typescript
getTool(toolName: string): DiscoveredTool | undefined
```

**戻り値:**
```typescript
interface DiscoveredTool {
  name: string;
  description?: string;
  source: ToolSource;
  metadata?: Record<string, any>;
}

interface ToolSource {
  type: 'configured' | 'discovered' | 'native';
  name: string;
  policyControlled: boolean;
  prefix?: string;
}
```

#### メソッド: `assessToolRisk`

ツールのリスクレベルを評価します。

```typescript
assessToolRisk(toolName: string): 'low' | 'medium' | 'high'
```

#### メソッド: `getStats`

ツール統計情報を取得します。

```typescript
getStats(): {
  totalTools: number;
  bySource: Record<string, number>;
  policyControlled: number;
  riskDistribution: Record<string, number>;
}
```

## 型定義

### `DecisionContext`

```typescript
interface DecisionContext {
  agent: string;              // エージェントID
  action: string;             // アクション
  resource: string;           // リソース
  purpose?: string;           // 目的
  time: Date;                 // タイムスタンプ
  location?: string;          // 場所
  environment: Record<string, any>;  // 環境情報
}
```

### `PolicyDecision`

```typescript
interface PolicyDecision {
  decision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;
  confidence: number;         // 0.0 - 1.0
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  constraints?: string[];
  obligations?: string[];
  monitoringRequirements?: string[];
  validityPeriod?: {
    start?: Date;
    end?: Date;
  };
}
```

### `NaturalLanguagePolicyDefinition`

```typescript
interface NaturalLanguagePolicyDefinition {
  name: string;
  description: string;
  policy: string;             // 自然言語ポリシー本文
  examples?: Array<{
    scenario: string;
    expectedDecision: "PERMIT" | "DENY";
  }>;
  metadata: PolicyMetadata;
}
```

### `PolicyMetadata`

```typescript
interface PolicyMetadata {
  id: string;
  name: string;
  description: string;
  version: string;            // セマンティックバージョニング
  createdAt: Date;
  createdBy: string;
  lastModified: Date;
  lastModifiedBy: string;
  tags: string[];
  status: "draft" | "active" | "deprecated";
}
```

### `AEGISConfig`

```typescript
interface LLMConfig {
  provider: 'anthropic';  // 現在は 'anthropic' のみサポート
  model: string;
  apiKey: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
};

interface AEGISConfig {
  server?: {
    port?: number;
    host?: string;
  };
  cache?: {
    enabled?: boolean;
    ttl?: number;
    maxSize?: number;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'text';
  };
}
```

## エラーハンドリング

### エラーコード

| コード | 説明 | 対処法 |
|--------|------|--------|
| `AEGIS_001` | ポリシーが見つからない | ポリシー名を確認 |
| `AEGIS_002` | AI判定エラー | LLM設定を確認 |
| `AEGIS_003` | コンテキスト収集エラー | エンリッチャーを確認 |
| `AEGIS_004` | 上流サーバー接続エラー | ネットワーク設定を確認 |
| `AEGIS_005` | 認証エラー | APIキーを確認 |

### エラーハンドリング例

```typescript
try {
  const result = await aegis.controlAccess(
    agentId,
    action,
    resource
  );
} catch (error) {
  if (error.code === 'AEGIS_001') {
    console.error('ポリシーが設定されていません');
    // デフォルトポリシーを適用
  } else if (error.code === 'AEGIS_002') {
    console.error('AI判定に失敗しました:', error.message);
    // フォールバック処理
  } else {
    console.error('予期しないエラー:', error);
  }
}
```

### カスタムエラークラス

```typescript
export class AEGISError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AEGISError';
  }
}

// 使用例
throw new AEGISError(
  'AEGIS_001',
  'ポリシーが見つかりません',
  { policyName: 'unknown-policy' }
);
```

## まとめ

AEGIS APIは、自然言語ポリシーベースのアクセス制御を実現する包括的なインターフェースを提供します。主要な機能：

1. **シンプルなAPI**: 直感的なメソッドでアクセス制御を実装
2. **拡張性**: カスタムエンリッチャーによる機能拡張
3. **型安全性**: TypeScriptの型定義による安全な開発
4. **エラーハンドリング**: 体系的なエラー処理

詳細な実装例については、`examples/`ディレクトリのサンプルコードを参照してください。