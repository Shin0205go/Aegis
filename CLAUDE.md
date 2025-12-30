# AEGIS プロジェクト開発ガイド

**AEGIS - AI Data Guardian** のコードベース構造、開発ワークフロー、AIアシスタント向けの重要な規約をまとめたドキュメントです。

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [プロジェクトルール](#プロジェクトルール)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [アーキテクチャ概要](#アーキテクチャ概要)
5. [コンポーネント詳細](#コンポーネント詳細)
6. [開発ワークフロー](#開発ワークフロー)
7. [コーディング規約](#コーディング規約)
8. [テスト方針](#テスト方針)
9. [環境変数と設定](#環境変数と設定)
10. [実装状況](#実装状況)

---

## 📌 プロジェクト概要

**AEGIS（AI Data Guardian）** は、Model Context Protocol（MCP）を活用した、AIエージェント向けのデータ保護ファイアウォールです。

### 🎯 コアコンセプト

- **自然言語ポリシー**: XMLやJSONではなく、日本語の自然文でポリシーを記述
- **AI判定エンジン**: Claude Opus 4を使用したインテリジェントなアクセス制御
- **MCPプロキシ**: AI エージェントとデータソース間の透明な制御層
- **動的制御**: コンテキストに基づくリアルタイム判定

### ⚠️ プロジェクトステータス

- **現状**: Experimental / Proof of Concept（実験実装・概念実証）
- **本番利用**: 推奨されません
- **目的**: 自然言語ポリシーベースのAIガバナンスの実現可能性を検証

---

## 📝 プロジェクトルール

### 1. ファイル配置ルール

#### ルートディレクトリのMDファイル制限
ルートディレクトリに配置できるMarkdownファイルは以下の3つのみ：
- `README.md` - プロジェクト概要（簡潔に）
- `CONTRIBUTING.md` - コントリビューションガイド
- `CLAUDE.md` - このファイル（AIアシスタント用指示書）

**その他のドキュメントは必ず `docs/` ディレクトリ以下に配置**

#### テスト関連ファイル
- すべてのテストファイルは `test/` ディレクトリ以下に配置
- ルートに `test-*` のようなファイルやディレクトリを作成しない
- 例外: `test-stdio.js` のような一時的な手動テストスクリプトは許容されるが、定期的にクリーンアップすること

#### 設定ファイル
- デプロイメント用設定は `deployment/` ディレクトリに配置
- ルートには標準的な設定ファイルのみ配置（`package.json`, `tsconfig.json`, `.eslintrc.json` など）

#### レポート・ドキュメント
- テストカバレッジレポート → `docs/reports/`
- ガイドドキュメント → `docs/guides/`
- 管理者向けドキュメント → `docs/admin-guide/`
- 開発者向けドキュメント → `docs/developer-guide/`

### 2. コード品質ルール

#### Phase番号の禁止
- 「Phase 1」「Phase 2」などの開発フェーズ番号を使用しない
- 適切なアーキテクチャ用語を使用する：
  - **PEP** (Policy Enforcement Point) - ポリシー実行ポイント
  - **PDP** (Policy Decision Point) - ポリシー判定ポイント
  - **PIP** (Policy Information Point) - ポリシー情報ポイント
  - **PAP** (Policy Administration Point) - ポリシー管理ポイント

#### 外部通信機能
- メール送信、Slack通知などの外部通信は当面実装しない
- モック実装（ログ出力のみ）で十分
- 実装する場合は設定で無効化できるようにする

#### ODRL実装の廃止
- ODRL（Open Digital Rights Language）実装は完全に削除済み
- 自然言語ポリシーエンジンに一本化
- ODRLに関連するコード・コメント・ドキュメントは全て削除すること

---

## 📂 ディレクトリ構造

```
Aegis/
├── src/                          # ソースコード
│   ├── ai/                       # AI判定エンジン
│   │   ├── judgment-engine.ts   # メインの判定エンジン
│   │   ├── llm-factory.ts       # LLMプロバイダー抽象化
│   │   ├── anthropic-llm.ts     # Claude統合
│   │   ├── openai-llm.ts        # OpenAI統合（未サポート）
│   │   └── prompt-templates.ts  # プロンプトテンプレート
│   │
│   ├── core/                     # コアシステム
│   │   ├── controller.ts         # メインコントローラー
│   │   ├── enforcement.ts        # EnforcementSystem（制約・義務）
│   │   ├── errors.ts             # エラー定義
│   │   ├── constraints/          # 制約プロセッサ
│   │   │   ├── manager.ts        # ConstraintProcessorManager
│   │   │   ├── strategies.ts     # 制約ストラテジー
│   │   │   ├── types.ts          # 制約型定義
│   │   │   └── processors/       # 個別プロセッサ
│   │   │       ├── data-anonymizer.ts   # データ匿名化
│   │   │       ├── rate-limiter.ts      # レート制限
│   │   │       └── geo-restrictor.ts    # 地理的制限
│   │   └── obligations/          # 義務エグゼキューター
│   │       ├── manager.ts        # ObligationExecutorManager
│   │       ├── types.ts          # 義務型定義
│   │       └── executors/        # 個別エグゼキューター
│   │           ├── audit-logger.ts       # 監査ログ
│   │           ├── notifier.ts           # 通知システム
│   │           └── data-lifecycle.ts     # データライフサイクル
│   │
│   ├── mcp/                      # MCPプロキシ実装
│   │   ├── base-proxy.ts         # プロキシ基底クラス
│   │   ├── stdio-proxy.ts        # stdio トランスポート（Claude Desktop用）
│   │   ├── http-proxy.ts         # HTTP トランスポート（Web用）
│   │   ├── policy-enforcer.ts    # ポリシー実行ロジック
│   │   ├── stdio-router.ts       # stdio ルーティング
│   │   ├── tool-discovery.ts     # ツール検出
│   │   └── dynamic-tool-discovery.ts  # 動的ツール検出
│   │
│   ├── policy/                   # ポリシーエンジン
│   │   ├── ai-policy-engine.ts   # AIポリシー判定エンジン
│   │   └── policy-detector.ts    # ポリシー検出器
│   │
│   ├── policies/                 # ポリシー管理（PAP）
│   │   ├── administrator.ts      # ポリシー管理者
│   │   ├── policy-loader.ts      # ポリシーローダー
│   │   └── policy-resolver.ts    # ポリシー競合解決
│   │
│   ├── context/                  # コンテキスト収集（PIP）
│   │   ├── collector.ts          # コンテキストコレクター
│   │   ├── index.ts              # エクスポート
│   │   └── enrichers/            # コンテキストエンリッチャー
│   │       ├── index.ts
│   │       ├── time-based.ts          # 時間ベース情報
│   │       ├── agent-info.ts          # エージェント情報
│   │       ├── resource-classifier.ts # リソース分類
│   │       ├── security-info.ts       # セキュリティ情報
│   │       └── data-lineage.ts        # データ系譜
│   │
│   ├── audit/                    # 監査システム
│   │   ├── advanced-audit-system.ts        # 高度な監査システム
│   │   ├── audit-dashboard-data.ts         # ダッシュボードデータ
│   │   └── real-time-anomaly-detector.ts   # リアルタイム異常検知
│   │
│   ├── web/                      # Web UI
│   │   ├── index.html                      # メインページ
│   │   ├── policy-management.html          # ポリシー管理UI
│   │   └── audit-dashboard-enhanced.html   # 監査ダッシュボード
│   │
│   ├── api/                      # REST API
│   ├── schemas/                  # バリデーションスキーマ（Zod）
│   ├── types/                    # TypeScript型定義
│   ├── constants/                # 定数定義
│   ├── performance/              # パフォーマンス測定
│   ├── utils/                    # ユーティリティ
│   │   ├── logger.ts             # ロガー
│   │   ├── config.ts             # 設定管理
│   │   └── errors.ts             # エラーハンドリング
│   │
│   ├── index.ts                  # メインエントリーポイント
│   ├── mcp-server.ts             # MCPサーバーエントリーポイント
│   ├── server.ts                 # HTTPサーバー
│   └── simple-server.ts          # シンプルHTTPサーバー
│
├── test/                         # テストファイル
│   ├── ai/                       # AI判定エンジンのテスト
│   ├── integration/              # 統合テスト
│   ├── e2e/                      # E2Eテスト
│   ├── core/                     # コアシステムのテスト
│   ├── mcp/                      # MCPプロキシのテスト
│   ├── context/                  # コンテキスト収集のテスト
│   └── setup.ts                  # テストセットアップ
│
├── docs/                         # ドキュメント
│   ├── README.md                 # ドキュメントインデックス
│   ├── user-guide/               # ユーザーガイド
│   ├── admin-guide/              # 管理者ガイド
│   ├── developer-guide/          # 開発者ガイド
│   ├── guides/                   # 各種ガイド
│   ├── reference/                # リファレンス
│   └── reports/                  # テストレポート等
│
├── scripts/                      # スクリプト
│   ├── mcp-launcher.js           # MCPサーバー起動スクリプト
│   └── policies/                 # ポリシー管理スクリプト
│
├── policies/                     # ポリシー定義ファイル
│   ├── policies.json             # メインポリシーファイル
│   └── *.json                    # 個別ポリシーファイル
│
├── deployment/                   # デプロイメント設定
├── .github/                      # GitHub Actions等
├── .devcontainer/                # Dev Container設定
├── .specify/                     # Specify AI設定
│
├── package.json                  # プロジェクト設定
├── tsconfig.json                 # TypeScript設定
├── jest.config.js                # Jestテスト設定
├── .eslintrc.json                # ESLint設定
├── .env.example                  # 環境変数サンプル
├── README.md                     # プロジェクト概要
├── CONTRIBUTING.md               # コントリビューションガイド
└── CLAUDE.md                     # このファイル
```

### TypeScript パスエイリアス

`tsconfig.json` で以下のパスエイリアスが設定されています：

```json
{
  "@/*": ["./src/*"],
  "@/core/*": ["./src/core/*"],
  "@/ai/*": ["./src/ai/*"],
  "@/context/*": ["./src/context/*"],
  "@/mcp/*": ["./src/mcp/*"],
  "@/policies/*": ["./src/policies/*"],
  "@/monitoring/*": ["./src/monitoring/*"],
  "@/utils/*": ["./src/utils/*"]
}
```

コード内でこれらのエイリアスを使用してください。

---

## 🎯 アーキテクチャ概要

### 全体構成図

```
┌─────────────────────────────────────────────────────────────┐
│                    AIエージェント層                          │
│              (Claude Desktop, Web Apps, etc.)               │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCP Protocol
                  ▼
┌─────────────────────────────────────────────────────────────┐
│    PEP (Policy Enforcement Point) - MCPプロキシサーバー      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ MCPStdioPolicyProxy / MCPHttpPolicyProxy             │   │
│  │ - リクエストインターセプト                            │   │
│  │ - PolicyEnforcer統合                                 │   │
│  │ - ツール検出・ルーティング                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ EnforcementSystem: 制約・義務処理                     │   │
│  │ - ConstraintProcessorManager                         │   │
│  │   • DataAnonymizerProcessor (匿名化)                 │   │
│  │   • RateLimiterProcessor (レート制限)                │   │
│  │   • GeoRestrictorProcessor (地理的制限)              │   │
│  │ - ObligationExecutorManager                          │   │
│  │   • AuditLoggerExecutor (監査ログ)                   │   │
│  │   • NotifierExecutor (通知)                          │   │
│  │   • DataLifecycleExecutor (データ管理)               │   │
│  │ ✅ MCPプロキシに完全統合済み                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────┬──────────────────┬────────────────────────────────┘
          │                  │
          ▼                  ▼
┌──────────────────┐  ┌──────────────────────────────────────┐
│ PIP              │  │ PDP (Policy Decision Point)          │
│ ContextCollector │  │ AIJudgmentEngine + AIPolicyEngine    │
│                  │  │                                       │
│ - TimeBasedEnricher      │  │ ┌──────────────────────────┐ │
│ - AgentInfoEnricher      │  │ │自然言語ポリシー          │ │
│ - ResourceClassifier     │  │ │  ↓                       │ │
│ - SecurityInfoEnricher   │  │ │システムプロンプト変換    │ │
│ - DataLineageEnricher    │  │ │  ↓                       │ │
└──────────────────┘  │ │AI判定 (Claude Opus 4)    │ │
          │             │  │ │  ↓                       │ │
          │             │  │ │PERMIT/DENY/INDETERMINATE │ │
          │             │  │ └──────────────────────────┘ │
          │             │  │                               │
          │             │  │ キャッシュ・バッチ処理対応     │
          │             │  └──────────────────────────────┘
          │             │            ▲
          │             │            │
          │             │  ┌──────────────────────────────┐
          │             │  │ PAP (Policy Administration)  │
          │             └──│ PolicyAdministrator          │
          │                │                              │
          │                │ - ポリシーCRUD               │
          │                │ - バージョン管理             │
          │                │ - PolicyLoader               │
          │                │ - PolicyConflictResolver     │
          │                │ - PolicyApplicabilityFilter  │
          │                └──────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              上流MCPサーバー群（Upstream Servers）           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │Filesystem   │ │Execution    │ │その他MCPサーバー     │   │
│  │MCP Server   │ │MCP Server   │ │(Custom Servers)     │   │
│  └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### データフロー

```
1. AIエージェント
   ↓ MCPリクエスト (tools/call, resources/read, etc.)

2. PEP (MCPプロキシ)
   ├─① リクエスト受信
   ├─② コンテキスト構築 → PIP呼び出し
   ├─③ ポリシー選択
   ├─④ キャッシュチェック
   ├─⑤ PDP呼び出し → AI判定
   ├─⑥ 判定結果処理
   │   ├─ PERMIT → 制約適用 → 上流プロキシ → 義務実行
   │   ├─ DENY → エラー返却
   │   └─ INDETERMINATE → エラー返却
   └─⑦ 監査ログ記録 & 異常検知

   ↓ MCPレスポンス

3. AIエージェント
```

---

## 🔧 コンポーネント詳細

### 1. PDP (Policy Decision Point) - AI判定エンジン

**場所**: `src/ai/judgment-engine.ts`, `src/policy/ai-policy-engine.ts`

**役割**: 自然言語ポリシーを理解し、コンテキストに基づいてアクセス可否を判定

**主要クラス**:
- `AIJudgmentEngine`: LLM統合とプロンプト管理
- `AIPolicyEngine`: ポリシーベースの判定ロジック

**主要機能**:
- 自然言語ポリシー → システムプロンプト変換
- AI判定実行（Claude Opus 4使用）
- キャッシュ機能（重複判定の高速化）
- バッチ処理対応
- 信頼度スコア算出

**インターフェース**:
```typescript
interface PolicyDecision {
  decision: "PERMIT" | "DENY" | "INDETERMINATE";
  reason: string;
  confidence: number;  // 0-1
  constraints?: string[];
  obligations?: string[];
  metadata?: any;
}
```

### 2. PEP (Policy Enforcement Point) - MCPプロキシ

**場所**: `src/mcp/`

**役割**: 全MCPリクエストをインターセプトし、ポリシー制御を透明に実行

**主要クラス**:
- `MCPStdioPolicyProxy`: Claude Desktop統合用（stdio）
- `MCPHttpPolicyProxy`: Webアプリケーション統合用（HTTP）
- `PolicyEnforcer`: ポリシー実行ロジック（責務分離）

**主要機能**:
- リクエストインターセプト
- 動的ツール検出・ルーティング
- 上流サーバーへのプロキシ
- 制約・義務の適用
- 監査ログ記録

**対応MCPメソッド**:
- `tools/call` - ツール実行制御
- `tools/list` - ツール一覧取得
- `resources/read` - リソース読み取り制御
- `resources/list` - リソース一覧取得

### 3. PIP (Policy Information Point) - コンテキスト収集

**場所**: `src/context/`

**役割**: 判定に必要な環境情報を自動収集・拡張

**主要クラス**:
- `ContextCollector`: エンリッチャー管理
- 各種エンリッチャー（時間、エージェント、リソース、セキュリティ、データ系譜）

**収集情報**:
- 🕐 時間: 営業時間判定、タイムゾーン
- 👤 エージェント: 種別、クリアランスレベル
- 📁 リソース: データ種別、機密度
- 🔒 セキュリティ: IP、リスクスコア
- 🔗 データ系譜: 出所、加工履歴

### 4. PAP (Policy Administration Point) - ポリシー管理

**場所**: `src/policies/`

**役割**: 自然言語ポリシーのライフサイクル管理

**主要クラス**:
- `PolicyAdministrator`: ポリシーCRUD操作
- `PolicyLoader`: ポリシーファイル読み込み
- `PolicyConflictResolver`: ポリシー競合解決
- `PolicyApplicabilityFilter`: ポリシー適用フィルタリング

**主要機能**:
- ポリシー作成・更新・削除
- バージョン管理
- メタデータ管理（タグ、優先度）
- ポリシー検証
- インポート/エクスポート

### 5. EnforcementSystem - 制約・義務処理

**場所**: `src/core/enforcement.ts`, `src/core/constraints/`, `src/core/obligations/`

**役割**: 判定結果に基づく制約適用と義務実行

**制約プロセッサ**:
- `DataAnonymizerProcessor`: データ匿名化（マスク、トークン化、ハッシュ化）
- `RateLimiterProcessor`: レート制限（時間窓、キャッシュ）
- `GeoRestrictorProcessor`: 地理的制限（IPベース）

**義務エグゼキューター**:
- `AuditLoggerExecutor`: 監査ログ（暗号化、複数フォーマット）
- `NotifierExecutor`: 通知システム（マルチチャンネル）
- `DataLifecycleExecutor`: データライフサイクル管理

### 6. 監査システム

**場所**: `src/audit/`

**主要コンポーネント**:
- `AdvancedAuditSystem`: 高度な監査システム
- `RealTimeAnomalyDetector`: リアルタイム異常検知
- `AuditDashboardData`: ダッシュボードデータ生成

**機能**:
- 全アクセスの完全ログ記録
- 異常パターン検出
- 統計・メトリクス生成
- Web UIでのビジュアライゼーション

---

## 💻 開発ワークフロー

### 開発環境セットアップ

```bash
# リポジトリクローン
git clone https://github.com/Shin0205go/Aegis.git
cd Aegis

# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .envを編集してANTHROPIC_API_KEYを設定

# ビルド
npm run build

# 開発モード起動（ホットリロード）
npm run dev

# MCPサーバー起動
npm run start:mcp:http  # HTTPモード
npm run start:mcp:stdio # stdioモード
```

### 利用可能なスクリプト

| スクリプト | 説明 |
|-----------|------|
| `npm run dev` | 開発モード起動（tsx watch） |
| `npm run build` | TypeScriptコンパイル |
| `npm test` | ユニットテスト実行 |
| `npm run test:watch` | テスト監視モード |
| `npm run test:coverage` | カバレッジ付きテスト |
| `npm run test:e2e` | E2Eテスト実行 |
| `npm run test:all` | 全テスト実行 |
| `npm run lint` | ESLint実行 |
| `npm run format` | Prettier実行 |
| `npm run start` | プロダクションモード起動 |
| `npm run start:mcp` | MCPサーバー起動（デフォルト） |
| `npm run start:mcp:stdio` | MCPサーバー（stdioモード） |
| `npm run start:mcp:http` | MCPサーバー（HTTPモード） |
| `npm run clean` | dist/ディレクトリ削除 |

### Git ブランチ戦略

- `main` - 安定版（プロダクション相当）
- `develop` - 開発用統合ブランチ
- `feature/*` - 新機能開発
- `fix/*` - バグ修正
- `refactor/*` - リファクタリング
- `docs/*` - ドキュメント更新

### コミットメッセージ規約

Conventional Commits に従います：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント
- `test`: テスト追加・修正
- `chore`: ビルド・補助ツール
- `perf`: パフォーマンス改善
- `style`: コードスタイル（フォーマット）

**例:**
```
feat(mcp): stdioプロキシにツール検出機能を追加

動的にツールを検出し、プレフィックス付きでルーティングする機能を実装。
これにより、複数のMCPサーバーを透過的に統合できるようになった。

Closes #123
```

---

## 📐 コーディング規約

### TypeScript スタイル

#### 1. 型安全性
- `any` の使用を最小限に（やむを得ない場合のみ）
- 可能な限り厳密な型を定義
- `unknown` を `any` の代わりに検討
- `strict: true` 設定を遵守

```typescript
// ❌ Bad
function process(data: any) {
  return data.value;
}

// ✅ Good
interface DataInput {
  value: string;
}
function process(data: DataInput): string {
  return data.value;
}
```

#### 2. インターフェース vs Type
- 拡張可能な構造 → `interface`
- ユニオン型・条件型 → `type`
- 一貫性を保つ

```typescript
// ✅ Interface for extensibility
interface PolicyMetadata {
  id: string;
  name: string;
}

// ✅ Type for unions
type Decision = "PERMIT" | "DENY" | "INDETERMINATE";
```

#### 3. 非同期処理
- `async/await` を優先（Promise chainよりも）
- エラーハンドリングを必ず実装
- タイムアウト処理を考慮

```typescript
// ✅ Good
async function fetchPolicy(id: string): Promise<Policy> {
  try {
    const policy = await policyLoader.load(id);
    return policy;
  } catch (error) {
    logger.error('Failed to load policy:', error);
    throw new PolicyNotFoundError(id);
  }
}
```

#### 4. エラーハンドリング
- カスタムエラークラスを使用（`src/utils/errors.ts`）
- エラーメッセージは明確に
- スタックトレースを保持

```typescript
import { PolicyViolationError, ErrorCodes } from '@/utils/errors';

if (!isAuthorized) {
  throw new PolicyViolationError(
    'Access denied by policy',
    ErrorCodes.POLICY_VIOLATION,
    { policyId, reason }
  );
}
```

### ファイル構造規約

#### 1. ファイル命名
- ケバブケース: `policy-enforcer.ts`
- テストファイル: `*.test.ts` または `*.spec.ts`
- 型定義ファイル: `types.ts` または `*-types.ts`

#### 2. インポート順序
1. 外部パッケージ
2. 内部モジュール（パスエイリアス使用）
3. 相対パス
4. 型インポート（`import type`）

```typescript
// 1. 外部パッケージ
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import express from 'express';

// 2. 内部モジュール
import { Logger } from '@/utils/logger';
import { AIPolicyEngine } from '@/policy/ai-policy-engine';

// 3. 相対パス
import { PolicyEnforcer } from './policy-enforcer.js';

// 4. 型インポート
import type { DecisionContext, PolicyDecision } from '@/types';
```

#### 3. エクスポート規約
- デフォルトエクスポートは最小限に
- 名前付きエクスポートを優先
- `index.ts` でモジュール単位のエクスポートを集約

```typescript
// src/mcp/index.ts
export { MCPStdioPolicyProxy } from './stdio-proxy.js';
export { MCPHttpPolicyProxy } from './http-proxy.js';
export { PolicyEnforcer } from './policy-enforcer.js';
```

### コメント規約

#### 1. ドキュメントコメント（JSDoc）
- クラス・関数の前に記述
- パラメータと戻り値を説明
- 使用例を含める（複雑な場合）

```typescript
/**
 * 自然言語ポリシーに基づいてアクセス制御判定を実行
 *
 * @param context - 判定コンテキスト（エージェント、アクション、リソース等）
 * @param policy - 適用するポリシー（自然言語）
 * @returns 判定結果（PERMIT/DENY/INDETERMINATE）
 * @throws {LLMError} AI判定に失敗した場合
 *
 * @example
 * ```typescript
 * const decision = await judge(context, policy);
 * if (decision.decision === 'PERMIT') {
 *   // アクセス許可
 * }
 * ```
 */
async function judge(
  context: DecisionContext,
  policy: string
): Promise<PolicyDecision> {
  // 実装
}
```

#### 2. インラインコメント
- 複雑なロジックの説明
- なぜそうするのか（What ではなく Why）
- TODO/FIXME は課題管理システムと連携

```typescript
// ✅ Good: 理由を説明
// 営業時間外はデフォルトでDENYとする（セキュリティポリシー要件）
if (!isBusinessHours) {
  return { decision: 'DENY', reason: 'Outside business hours' };
}

// ❌ Bad: 自明なことの説明
// iをインクリメント
i++;
```

### ロギング規約

#### ログレベル
- `error`: エラー・例外（要対応）
- `warn`: 警告（注意が必要だが動作は継続）
- `info`: 重要な情報（起動、停止、ポリシー適用）
- `debug`: デバッグ情報（開発時のみ）

```typescript
// ✅ Good
logger.info('Policy enforced', {
  agent: context.agent,
  action: context.action,
  decision: decision.decision,
  policyId: policy.id
});

logger.error('AI judgment failed', {
  error: error.message,
  context: context,
  retryCount: 3
});
```

---

## 🧪 テスト方針

### テスト構成

```
test/
├── ai/                    # AI判定エンジンのテスト
├── core/                  # コアシステムのテスト
├── mcp/                   # MCPプロキシのテスト
├── context/               # コンテキスト収集のテスト
├── integration/           # 統合テスト
├── e2e/                   # E2Eテスト
└── setup.ts               # テスト共通設定
```

### テスト種別

#### 1. ユニットテスト
- 個別のクラス・関数をテスト
- モックを活用
- カバレッジ目標: 80%以上

```typescript
// test/ai/judgment-engine.test.ts
describe('AIJudgmentEngine', () => {
  it('should return PERMIT for allowed actions', async () => {
    const engine = new AIJudgmentEngine(mockConfig);
    const decision = await engine.judge(context, policy);
    expect(decision.decision).toBe('PERMIT');
  });
});
```

#### 2. 統合テスト
- 複数コンポーネントの連携をテスト
- 実際のファイルシステム・外部API使用

```typescript
// test/integration/mcp-enforcement.test.ts
describe('MCP Enforcement Integration', () => {
  it('should enforce policy on tool execution', async () => {
    const proxy = new MCPStdioPolicyProxy(config);
    const result = await proxy.handleToolCall(toolRequest);
    expect(result.allowed).toBe(false);
  });
});
```

#### 3. E2Eテスト
- エンドツーエンドのシナリオテスト
- 実際のMCPクライアントとの通信

#### 4. MCP Inspector テスト
手動テスト用：

```bash
cd test/mcp-inspector
./test-with-inspector.sh
```

### テスト実行

```bash
# 全ユニットテスト
npm test

# 監視モード
npm run test:watch

# カバレッジ
npm run test:coverage

# E2Eテスト
npm run test:e2e

# 特定ファイルのテスト
npm test -- judgment-engine.test.ts

# 詳細出力
npm run test:verbose
```

### モック規約

- `jest.mock()` で外部依存をモック
- テストファイル内でモック定義
- 実装の詳細ではなく、インターフェースをテスト

```typescript
// ✅ Good
jest.mock('@/ai/judgment-engine');
const mockJudgmentEngine = {
  judge: jest.fn().mockResolvedValue({
    decision: 'PERMIT',
    confidence: 0.95
  })
};
```

---

## ⚙️ 環境変数と設定

### 必須環境変数

| 環境変数 | 説明 | デフォルト値 |
|---------|------|------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude APIキー | - |
| `LLM_PROVIDER` | LLMプロバイダー | `anthropic` |
| `LLM_MODEL` | 使用モデル | `claude-opus-4-20250514` |

### オプション環境変数

| 環境変数 | 説明 | デフォルト値 |
|---------|------|------------|
| `LLM_TEMPERATURE` | AI生成温度（0-1） | `0.3` |
| `LLM_MAX_TOKENS` | 最大トークン数 | `4096` |
| `AEGIS_AI_THRESHOLD` | AI判定信頼度閾値 | `0.7` |
| `MCP_PROXY_PORT` | MCPプロキシポート | `3000` |
| `MCP_TRANSPORT` | トランスポート（stdio/http） | `http` |
| `AEGIS_LOG_LEVEL` | ログレベル | `info` |
| `LOG_FORMAT` | ログフォーマット（json/text） | `json` |
| `CACHE_ENABLED` | キャッシュ有効化 | `true` |
| `CACHE_TTL` | キャッシュTTL（秒） | `3600` |
| `NODE_ENV` | 環境（development/production） | `development` |

### ポリシーファイル

デフォルトポリシー: `policies/policies.json`

```json
{
  "policies": [
    {
      "id": "default-policy",
      "name": "デフォルトポリシー",
      "policy": "基本的に全てのアクセスを許可...",
      "priority": 1,
      "status": "active"
    }
  ]
}
```

### Claude Desktop 統合

`~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aegis": {
      "command": "node",
      "args": [
        "/path/to/Aegis/scripts/mcp-launcher.js",
        "stdio"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## 🛠️ 実装状況

### ✅ 完了済み機能

#### コア機能
- ✅ AI判定エンジン（Claude Opus 4統合）
- ✅ 自然言語ポリシー処理
- ✅ MCPプロキシ（stdio/HTTPトランスポート）
- ✅ 動的ツール検出・ルーティング
- ✅ コンテキスト収集（5種類のエンリッチャー）
- ✅ ポリシー管理（CRUD操作）

#### 制約・義務システム
- ✅ ConstraintProcessorManager
  - ✅ DataAnonymizerProcessor（マスク、トークン化、ハッシュ化）
  - ✅ RateLimiterProcessor（時間窓、キャッシュ）
  - ✅ GeoRestrictorProcessor（IPベース位置判定）
- ✅ ObligationExecutorManager
  - ✅ AuditLoggerExecutor（暗号化、複数フォーマット）
  - ✅ NotifierExecutor（マルチチャンネル）
  - ✅ DataLifecycleExecutor（データライフサイクル管理）
- ✅ MCPプロキシへの完全統合

#### 監査・監視
- ✅ AdvancedAuditSystem（高度な監査システム）
- ✅ RealTimeAnomalyDetector（リアルタイム異常検知）
- ✅ 監査ダッシュボード（Web UI）
- ✅ 統計・メトリクス生成

#### Web UI
- ✅ ポリシー管理UI
- ✅ 監査ダッシュボード（拡張版）
- ✅ メインページ

#### その他
- ✅ キャッシュシステム
- ✅ ログ記録システム
- ✅ エラーハンドリング
- ✅ 包括的なテストスイート

### ⏳ 開発中・計画中

#### 性能・スケーラビリティ
- ⏳ Redis統合（分散キャッシュ）
- ⏳ PostgreSQL統合（ポリシー永続化）
- ⏳ 水平スケーリング対応
- ⏳ 負荷分散

#### エンタープライズ機能
- ⏳ 高可用性・フェイルオーバー
- ⏳ 詳細な権限管理（RBAC）
- ⏳ 法的要件対応（GDPR、CCPA等）
- ⏳ マルチテナント対応

#### AI機能拡張
- ⏳ OpenAI GPT-4統合
- ⏳ Azure OpenAI統合
- ⏳ カスタムLLMプロバイダー対応
- ⏳ ポリシー自動生成

#### 開発者体験
- ⏳ CLIツール
- ⏳ VSCode拡張
- ⏳ SDK（Python、JavaScript）
- ⏳ GraphQL API

### 📊 現在の統計

- **ソースファイル数**: 69+ TypeScriptファイル
- **テストファイル数**: 50+ テストファイル
- **コンポーネント数**: 20+ 主要コンポーネント
- **ポリシーエンリッチャー**: 5種類
- **制約プロセッサー**: 3種類
- **義務エグゼキューター**: 3種類

---

## 📚 追加リソース

### ドキュメント

- [ユーザーガイド](./docs/user-guide/) - エンドユーザー向け
- [管理者ガイド](./docs/admin-guide/) - システム管理者向け
- [開発者ガイド](./docs/developer-guide/) - 開発者向け
- [API リファレンス](./docs/api-reference.md) - API詳細
- [アーキテクチャ](./docs/architecture.md) - システム設計

### 外部リンク

- [Model Context Protocol仕様](https://modelcontextprotocol.io/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [TypeScript ハンドブック](https://www.typescriptlang.org/docs/)

---

## 🤝 コントリビューション

プロジェクトへの貢献を歓迎します！詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

### クイックスタート

1. Issueを確認または作成
2. フォーク & ブランチ作成
3. コード実装 & テスト追加
4. `npm run lint && npm run format` 実行
5. プルリクエスト作成

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルをご覧ください。

---

**Built by Shingo Matsuo**
