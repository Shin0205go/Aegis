# 自然言語ポリシーアーキテクチャ 詳細設計書

## 🎯 アーキテクチャ概要

従来の複雑なIDSアーキテクチャを、自然言語ポリシー + MCPプロキシで簡素化した革新的な設計です。

```typescript
┌─────────────────────────────────────────────────────────────┐
│                    AIエージェント層                          │
├─────────────────────────────────────────────────────────────┤
│           MCPクライアント（各種AIエージェント）                │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCPリクエスト
                  ▼
┌─────────────────────────────────────────────────────────────┐
│    PEP (Policy Enforcement Point) - MCPプロキシサーバー      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │リクエスト    │ │判定エンジン  │ │制約・義務               │ │
│  │インターセプト│ │呼び出し      │ │実行                     │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │EnforcementSystem (Phase 3): 高度な制約・義務処理         │ │
│  │- ConstraintProcessorManager                              │ │
│  │- ObligationExecutorManager                               │ │
│  │✅ MCPプロキシへの統合完了                               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────┬───────────────────┬───────────────────────────────┘
          │                   │
          ▼                   ▼
┌─────────────────┐    ┌─────────────────────────────────────┐
│PIP              │    │PDP                                  │
│(Policy Info     │    │(Policy Decision Point)             │
│Point)           │    │自然言語ポリシー判定エンジン          │
│コンテキスト      │    │                                     │
│情報収集・拡張    │    │┌─────────────┐ ┌─────────────────┐│
│                 │    ││自然言語      │ │AI判定           ││
│┌─────────────┐  │    ││ポリシー      │ │(LLM)            ││
││エージェント  │  │    ││→システム     │ │                 ││
││情報取得      │  │    ││プロンプト変換│ │PERMIT/DENY/     ││
│└─────────────┘  │    │└─────────────┘ │INDETERMINATE    ││
│┌─────────────┐  │    │                 └─────────────────┘│
││リソース分類  │  │    │                                     │
│└─────────────┘  │    └─────────────────────────────────────┘
│┌─────────────┐  │                        ▲
││時間・場所    │  │                        │
││セキュリティ  │  │                        │
│└─────────────┘  │    ┌─────────────────────────────────────┐
└─────────────────┘    │PAP                                  │
          │             │(Policy Administration Point)       │
          │             │自然言語ポリシー管理                 │
          │             │                                     │
          │             │┌─────────────┐ ┌─────────────────┐│
          │             ││ポリシー作成  │ │バージョン管理   ││
          │             ││更新・削除    │ │メタデータ管理   ││
          │             │└─────────────┘ └─────────────────┘│
          │             │┌─────────────┐ ┌─────────────────┐│
          │             ││ポリシー検証  │ │インポート/      ││
          │             ││             │ │エクスポート     ││
          │             │└─────────────┘ └─────────────────┘│
          │             └─────────────────────────────────────┘
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    上流MCPサーバー群                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │Gmail MCP    │ │Google Drive │ │その他各種MCPサーバー     │ │
│  │サーバー     │ │MCPサーバー   │ │(Slack, Calendar, etc.)  │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 コンポーネント詳細設計

### 1. PDP (Policy Decision Point) - AIによる判定エンジン

**役割**: 自然言語ポリシーを理解し、リクエストに対してPERMIT/DENY/INDETERMINATEを判定

```typescript
interface PolicyDecision {
  decision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;                    // 判定理由の詳細
  confidence: number;                // 0-1の信頼度スコア
  constraints?: string[];            // 適用すべき制約
  obligations?: string[];            // 実行すべき義務
  metadata?: any;                    // 追加情報
}

interface DecisionContext {
  agent: string;                     // エージェントID
  action: string;                    // 実行するアクション
  resource: string;                  // アクセス対象リソース
  purpose?: string;                  // アクセス目的
  time: Date;                       // アクセス時刻
  location?: string;                // アクセス場所
  environment: Record<string, any>; // 環境情報
}
```

**主要機能**:
- **自然言語→システムプロンプト変換**: ポリシーを判定用プロンプトに変換
- **AI判定実行**: LLMを使用してコンテキストベースの判定
- **バッチ処理**: 複数リクエストの効率的な一括判定
- **キャッシュ機能**: 同一判定のキャッシュによる高速化

**判定プロセス**:
1. 自然言語ポリシーをシステムプロンプトに変換
2. コンテキスト情報とプロンプトをLLMに送信
3. JSON形式の構造化された判定結果を取得
4. 結果のパース・検証・キャッシュ

### 2. PEP (Policy Enforcement Point) - MCPプロキシサーバー

**役割**: 全MCPリクエストをインターセプトし、ポリシー制御を透明に実行

```typescript
class MCPPolicyEnforcementPoint {
  // MCPサーバーとして動作し、リクエストを制御
  private server: MCPServer;
  
  // 制御対象のMCPメソッド
  setupRequestHandlers() {
    this.server.setRequestHandler("resources/read", this.enforceResourceAccess);
    this.server.setRequestHandler("tools/call", this.enforceToolExecution);
    this.server.setRequestHandler("resources/list", this.enforceResourceListing);
  }
}
```

**主要機能**:
- **透明プロキシ**: エージェントから見て通常のMCPサーバーとして動作
- **リクエストインターセプト**: 全MCPリクエストの事前チェック
- **制約適用**: データ匿名化、時間制限、ログ記録等
- **義務実行**: 通知送信、削除スケジュール、レポート生成
- **監査ログ**: 全アクセスの詳細ログ記録

**制御フロー**:
1. MCPリクエスト受信
2. コンテキスト構築 & PIP呼び出し
3. 適用ポリシー選択
4. PDP判定実行
5. 判定結果に基づく処理分岐
6. 制約・義務の実行
   - Phase 3新システム（EnforcementSystem）を優先的に使用
   - エラー時はレガシーシステムにフォールバック
7. 上流サーバーへプロキシ
8. レスポンス処理 & 返却
9. 義務の非同期実行（監査ログ、通知等）

### 3. PIP (Policy Information Point) - コンテキスト情報収集

**役割**: 判定に必要な環境情報を収集・拡張

```typescript
interface ContextEnricher {
  name: string;
  enrich(context: DecisionContext): Promise<Record<string, any>>;
}
```

**情報収集カテゴリ**:

#### 🕐 時間ベース情報
- 営業時間判定
- 曜日・時間帯
- タイムゾーン情報

#### 👤 エージェント情報
- エージェント種別・部署
- クリアランスレベル
- 作成日・最終活動時刻

#### 📁 リソース分類
- データ種別（顧客・財務・一般）
- 機密度レベル
- 所有者・タグ情報

#### 🔒 セキュリティ情報
- 接続IP・VPN判定
- リスクスコア算出
- 過去の失敗試行

#### 🔗 データ系譜
- データの出所・加工履歴
- 依存リソース
- アクセス履歴

### 4. PAP (Policy Administration Point) - ポリシー管理

**役割**: 自然言語ポリシーのライフサイクル管理

```typescript
interface PolicyMetadata {
  id: string;
  name: string;
  description: string;
  version: string;              // セマンティックバージョニング
  createdAt: Date;
  createdBy: string;
  lastModified: Date;
  lastModifiedBy: string;
  tags: string[];
  status: "draft" | "active" | "deprecated";
}
```

**主要機能**:
- **ポリシー作成・更新・削除**: 完全なCRUD操作
- **バージョン管理**: セマンティックバージョニング + 履歴管理
- **メタデータ管理**: タグ・説明・ステータス管理
- **ポリシー検証**: AI判定による事前検証
- **インポート/エクスポート**: ポリシーの移行・バックアップ

## 📊 データフロー詳細

### リクエスト処理フロー

```typescript
1. AIエージェント
   ↓ MCPリクエスト
2. PEP (MCPプロキシサーバー)
   ├── コンテキスト構築
   ├── PIP呼び出し → 情報拡張
   ├── ポリシー選択
   ├── PDP呼び出し → AI判定
   ├── 判定結果処理
   │   ├── PERMIT → 制約・義務実行 → 上流プロキシ
   │   ├── DENY → エラー返却
   │   └── INDETERMINATE → エラー返却
   └── 監査ログ記録
   ↓ レスポンス
3. AIエージェント
```

### ポリシー適用例

**顧客データアクセス時**:
```typescript
const customerPolicy = `
顧客データアクセスポリシー：

【基本原則】
- 顧客データは顧客サポート目的でのみアクセス可能
- アクセスは営業時間内を基本とする
- 適切なクリアランスレベルが必要

【制限事項】  
- 外部エージェントのアクセス禁止
- データの外部共有は一切禁止
- 個人情報の長期保存禁止

【義務】
- 全アクセスのログ記録必須
- データ処理後の結果通知
- 30日後の自動削除スケジュール設定
`;

// 実際の判定結果例
const decision = {
  decision: "PERMIT",
  reason: "営業時間内の顧客サポートエージェントによる正当なアクセス",
  confidence: 0.95,
  constraints: ["個人情報の匿名化", "外部共有禁止"],
  obligations: ["アクセスログ記録", "30日後削除スケジュール設定"]
};
```

## 🎛️ インターフェース仕様

### MCPプロキシインターフェース

```typescript
// エージェントからは通常のMCPサーバーとして見える
interface MCPProxyInterface {
  // リソースアクセス制御
  "resources/read": (request: ResourceReadRequest) => Promise<ResourceResponse>;
  "resources/list": (request: ResourceListRequest) => Promise<ResourceListResponse>;
  
  // ツール実行制御
  "tools/call": (request: ToolCallRequest) => Promise<ToolCallResponse>;
  "tools/list": (request: ToolListRequest) => Promise<ToolListResponse>;
}
```

### ポリシー管理インターフェース

```typescript
interface PolicyManagementAPI {
  // ポリシーCRUD
  createPolicy(name: string, policy: string, metadata?: Partial<PolicyMetadata>): Promise<string>;
  updatePolicy(policyId: string, policy: string, updatedBy?: string): Promise<void>;
  deletePolicy(policyId: string): Promise<void>;
  
  // ポリシー取得
  getPolicy(policyId: string): Promise<{metadata: PolicyMetadata, policy: string} | null>;
  listPolicies(filter?: {status?: string, tags?: string[]}): Promise<PolicyMetadata[]>;
  
  // バージョン管理
  getPolicyHistory(policyId: string): Promise<PolicyVersion[]>;
  
  // インポート/エクスポート
  exportPolicy(policyId: string): Promise<PolicyExport>;
  importPolicy(exportData: PolicyExport, importedBy?: string): Promise<string>;
}
```

## 🚀 実装の特徴・利点

### 💡 従来IDSとの比較

| 要素 | 従来のIDS | 今回の設計 |
|------|-----------|------------|
| **ポリシー記述** | XACML/ODRL (XML) | 自然言語 |
| **判定エンジン** | ルールエンジン | AI/LLM |
| **統合方法** | アプリ改修必要 | MCPプロキシ (透明) |
| **設定管理** | 技術者専用 | 誰でも編集可能 |
| **柔軟性** | 事前定義ルールのみ | 動的推論 |
| **導入コスト** | 高 (大規模改修) | 低 (プロキシ設置のみ) |

### 🎯 技術的優位性

#### 1. **透明性**: エージェントは制御を意識しない
```typescript
// エージェントのコードは一切変更不要
const gmailAccess = await mcpClient.request("resources/read", {
  uri: "gmail://inbox/message/123"
}); // → 裏でポリシー制御が動作
```

#### 2. **自然言語の表現力**: 複雑な条件も直感的に記述
```typescript
const complexPolicy = `
緊急時対応ポリシー：
システム障害発生時は、通常の時間制限を解除し、
運用チームのみデータセンター内からのアクセスを許可。
ただし、個人情報を含む場合は役職者の事前承認必要。
`;
```

#### 3. **動的推論**: 事前に想定していない状況にも対応
```typescript
// AIが文脈から判断
const unusualRequest = {
  agent: "new-agent-type",
  action: "emergency-access", 
  resource: "critical-system-data",
  purpose: "disaster-recovery"
}; // → ポリシーの意図を理解して適切に判定
```

### 📈 スケーラビリティ

- **水平拡張**: PEPプロキシを複数起動可能
- **キャッシュ活用**: 同一判定の高速化
- **バッチ処理**: 複数リクエストの効率処理
- **非同期処理**: 義務実行の非同期化

### 🔒 セキュリティ考慮事項

- **監査証跡**: 全判定の完全ログ記録
- **権限分離**: ポリシー管理者とシステム管理者の分離
- **暗号化**: ポリシー・ログの暗号化保存
- **アクセス制御**: PAP自体へのアクセス制御

## 🛠️ 実装状況とロードマップ

### ✅ Phase 1: MVP完了 
- ✅ PDP基本実装 (自然言語→AI判定)
- ✅ PEP基本実装 (MCPプロキシ)
- ✅ Claude Desktop統合
- ✅ 上流MCPサーバーのツール集約
- ✅ ツールルーティングとプレフィックス処理
- ✅ 基本的なポリシー制御の動作確認

### ✅ Phase 2: 基本機能完了
- ✅ PIP実装 (コンテキスト収集)
- ✅ PAP実装 (ポリシー管理)
- ✅ 制約・義務の基本実装
- ✅ stdio/HTTPトランスポート対応

### ✅ Phase 3: 本格運用 (完了)
- ✅ 高度な制約・義務処理
  - ✅ ConstraintProcessorManager: 制約プロセッサ統合管理
  - ✅ DataAnonymizerProcessor: 高度な匿名化（マスク、トークン化、ハッシュ化）
  - ✅ RateLimiterProcessor: レート制限（時間窓管理、キャッシュ機能）
  - ✅ GeoRestrictorProcessor: 地理的制限（IPベース位置判定）
  - ✅ ObligationExecutorManager: 義務エグゼキューター統合管理
  - ✅ AuditLoggerExecutor: 監査ログ（暗号化、複数フォーマット対応）
  - ✅ NotifierExecutor: 通知システム（マルチチャンネル、エスカレーション）
  - ✅ DataLifecycleExecutor: データライフサイクル管理
  - ✅ MCPプロキシへの完全統合（EnforcementSystemが完全に統合済み）
- ⏳ 監査・レポート機能（基本的な監査ログは実装済み、高度なレポート機能は未実装）
- ⏳ 性能最適化・スケーラビリティ

### 📋 Phase 4: エンタープライズ (計画中)
- ⏳ 高可用性・フェイルオーバー
- ⏳ 詳細な権限管理
- ⏳ 法的要件対応 (GDPR等)

## 📊 現在の動作状況

**AEGIS MCPプロキシ**が正常に動作中：
- **12個のツール**がClaude Desktop経由で利用可能
- **ファイルシステム操作** (`filesystem__*`)
- **コマンド・コード実行** (`execution-server__*`)
- **内蔵ツール** (artifacts, repl, web_search, web_fetch)
- **リアルタイムポリシー制御**が全ツールに適用済み

### 🔄 実装状況
- **新システム（EnforcementSystem）**: 高度な制約・義務処理が完全統合済み
- **追加されたコンポーネント**:
  - `PolicyEnforcer`: ポリシー判定処理の責務分離
  - `ConstraintStrategy`: 制約処理のストラテジーパターン
  - `ErrorHandler`: 統一エラーハンドリング
  - `PromptTemplateEngine`: AIプロンプトテンプレート管理

この設計により、従来のIDSの複雑さを大幅に軽減しながら、自然言語の表現力とAIの推論能力を活用した、次世代のポリシー制御システムを実現できています。

## 🔧 設定と環境変数

### 環境変数一覧

| 環境変数 | 説明 | デフォルト値 |
|---------|------|------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude APIキー | - |
| `OPENAI_API_KEY` | OpenAI APIキー | - |
| `AEGIS_AI_THRESHOLD` | AI判定の信頼度閾値 | 0.7 |
| `MCP_PROXY_PORT` | MCPプロキシのポート番号 | 3000 |
| `MCP_TRANSPORT` | トランスポートモード（stdio/http） | http |
| `AEGIS_LOG_LEVEL` | ログレベル（debug/info/warn/error） | info |
| `CORS_ORIGINS` | CORS許可オリジン（カンマ区切り） | http://localhost:3000 |

### APIエンドポイント（HTTPモード）

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/mcp/messages` | POST | MCPメッセージ処理 |
| `/health` | GET | ヘルスチェック |
| `/policies` | GET | ポリシー一覧取得 |
| `/policies` | POST | ポリシー作成 |
| `/policies/:id` | PUT | ポリシー更新 |
| `/policies/:id` | DELETE | ポリシー削除 |
| `/api/audit/metrics` | GET | 監査メトリクス取得 |
| `/odrl/policies` | GET | ODRLポリシー一覧 |
| `/odrl/evaluate` | POST | ODRL評価実行 |

### 自動ポリシー選択ロジック

システムは以下の優先順位でポリシーを自動選択します：

1. **時間ベース選択**
   - 営業時間外: `after-hours-policy`
   - 営業時間内: 通常ポリシー

2. **エージェントベース選択**
   - Claude Desktop: `claude-desktop-policy`
   - その他: リソースベース選択

3. **リソースタイプベース選択**
   - 顧客データ: `customer-data-policy`
   - メール: `email-access-policy`
   - ファイル: `file-system-policy`
   - ツール実行（高リスク）: `high-risk-operations-policy`
   - ツール実行（通常）: `tool-usage-policy`

4. **デフォルト**: `default-policy`