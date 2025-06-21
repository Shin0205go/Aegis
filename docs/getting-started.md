# AEGIS はじめに

## 📋 目次

1. [AEGISとは](#aegisとは)
2. [クイックスタート](#クイックスタート)
3. [起動方法](#起動方法)
4. [基本的な使い方](#基本的な使い方)
5. [設定オプション](#設定オプション)
6. [次のステップ](#次のステップ)

## AEGISとは

AEGIS (Agent Governance & Enforcement Intelligence System) は、AIエージェントのアクセス制御を自然言語ポリシーで実現する革新的なシステムです。

### 主な特徴

- **自然言語ポリシー**: XMLやJSONではなく、日本語でポリシーを記述
- **AI判定エンジン**: LLMを活用した柔軟な判定
- **透明なプロキシ**: MCPプロトコルに対応し、既存システムを改修不要
- **包括的なコンテキスト**: 時間、場所、エージェント情報などを考慮

## クイックスタート

### 1. インストール

```bash
# リポジトリのクローン
git clone https://github.com/Shin0205go/Aegis.git
cd Aegis

# 依存関係のインストール
npm install

# 環境設定
cp .env.example .env
# .envファイルを編集してAPIキーを設定
```

### 2. 環境変数の設定

`.env`ファイルを編集：

```env
# 必須設定
ANTHROPIC_API_KEY=your-anthropic-api-key

# LLM設定（オプション、デフォルト値あり）
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022

# オプション設定
PORT=3000
LOG_LEVEL=info
```

### 3. ビルド

```bash
npm run build
```

## 起動方法

AEGISには複数の起動方法があります：

### 1. Web UI による管理 (`npm run start:mcp:http`)

AEGISには視覚的にポリシーを管理できるWeb UIが含まれています：

```bash
# HTTPトランスポートでMCPサーバー起動（Web UI含む）
npm run start:mcp:http

# 開発モード（ホットリロード付き）
npm run dev:mcp:http

# React UI（オプション、より高度なUI）
cd web && npm install && npm run dev
```

MCPサーバーが起動したら、ブラウザで http://localhost:3000 にアクセスすると、以下の機能が利用できます：
- ポリシーの作成・編集・削除
- リアルタイムポリシー解析
- アクセス制御のテストシミュレーション
- ポリシーのバージョン管理

### 2. MCP公式仕様プロキシサーバー (`npm run start:mcp`)

MCP公式仕様にstdioトランスポートで起動します（推奨）。Claude Desktop等のMCPクライアントから接続可能です。

```bash
# stdioトランスポート（デフォルト）
npm run start:mcp

# HTTPトランスポート
npm run start:mcp:http
```

**Claude Desktop統合**:

方法1: 直接起動
```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["/path/to/Aegis/dist/src/mcp-server.js"],
      "cwd": "/path/to/Aegis"
    }
  }
}
```

方法2: ランチャースクリプト使用（推奨）
```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["/path/to/Aegis/mcp-launcher.js"],
      "cwd": "/path/to/Aegis"
    }
  }
}
```

**ハイブリッドMCPプロキシ設定** (aegis-mcp-config.json):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${HOME}/Documents"]
    }
  },
  "proxySettings": {
    "includeNativeTools": true,
    "includeDiscoveredTools": true,
    "toolSources": [
      {
        "type": "native",
        "name": "claude-code",
        "policyControlled": true,
        "prefix": ""
      }
    ],
    "policyControl": {
      "defaultEnabled": true,
      "exceptions": ["TodoRead", "TodoWrite", "LS"],
      "toolPolicies": {
        "Bash": {
          "enabled": true,
          "constraints": ["危険なコマンドのブロック"],
          "obligations": ["監査ログ記録"]
        },
        "WebFetch": {
          "enabled": true,
          "constraints": ["HTTPSのみ許可"]
        }
      }
    }
  }
}
```

### 3. ライブラリとしての統合

**注意**: WebSocketトランスポートは廃止されました。MCPプロキシサーバーの統合をご利用ください。

他のNode.jsアプリケーションに組み込んで使用できます：

```typescript
// your-app.ts
import { AEGISController } from '@aegis/core/controller';
import { AnthropicLLM } from '@aegis/ai/anthropic-llm';

async function main() {
  // LLMインスタンス初期化
  const llm = new AnthropicLLM({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  // AEGIS初期化
  const aegis = new AEGISController(llm);

  // ポリシー追加
  await aegis.addPolicy('customer-access', '顧客データは営業時間内のみアクセス可能');

  // アクセス制御
  const result = await aegis.controlAccess(
    'agent-001',
    'read',
    'customer-data',
    'support'
  );

  console.log('判定結果:', result.decision);
}
```

**用途:**
- 既存のアプリケーションにアクセス制御を追加したい場合
- プログラマティックにポリシー制御を行いたい場合
- マイクロサービスの一部として組み込む場合

### 使い分けガイド

| 項目 | MCPプロキシ (HTTP) | MCPプロキシ (stdio) | ライブラリ |
|------|-------------------|-------------------|------------|
| **起動方法** | `npm run start:mcp:http` | `npm run start:mcp` | コード内 |
| **用途** | Web UI + API提供 | Claude Desktop統合 | 組み込み制御 |
| **対象ユーザー** | 管理者/開発者 | AIユーザー | 開発者 |
| **設定方法** | Web UI/API | 設定ファイル | プログラム |

## 基本的な使い方

### MCPプロキシサーバーの場合

1. **サーバー起動**
```bash
npm run start:mcp
```

2. **Claude Desktop接続設定**

Claude Desktopの設定ファイルに追加：
```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["/path/to/aegis/dist/src/mcp-server.js"],
      "cwd": "/path/to/aegis"
    }
  }
}
```

3. **ポリシー追加**

Web UIまたはREST APIでポリシーを追加：
```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "customer-access",
    "policy": "顧客データは営業時間内のみアクセス可能。カスタマーサポート部門に限定。"
  }'
```

### ライブラリとしての場合

```typescript
import { AEGISController } from './dist/src/core/controller.js';
import { PolicyAdministrator } from './dist/src/policies/administrator.js';
import { AnthropicLLM } from './dist/src/ai/anthropic-llm.js';

// 初期化
const llm = new AnthropicLLM({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022'
});
const aegis = new AEGISController(llm);
const policyAdmin = new PolicyAdministrator();

// ポリシー作成
const policyId = await policyAdmin.createPolicy(
  'working-hours-policy',
  '営業時間（平日9-18時）のみアクセス可能',
  { createdBy: 'admin' }
);

// アクセス判定
const result = await aegis.controlAccess(
  'agent-123',
  'read',
  'sensitive-data'
);

if (result.decision === 'PERMIT') {
  console.log('アクセス許可');
} else {
  console.log('アクセス拒否:', result.reason);
}
```

## 設定オプション

### 環境変数

主要な環境変数（詳細は`.env.example`参照）：

```env
# AI判定エンジン設定
LLM_PROVIDER=anthropic      # 現在は 'anthropic' のみサポート
LLM_MODEL=claude-3-5-sonnet-20241022  # 使用するモデル
ANTHROPIC_API_KEY=xxx       # Anthropic APIキー（必須）

# サーバー設定
PORT=3000                   # サーバーポート
LOG_LEVEL=info             # ログレベル
NODE_ENV=production        # 環境

# キャッシュ設定
CACHE_ENABLED=true         # キャッシュ有効化
CACHE_TTL=3600            # キャッシュ期間（秒）

# MCP設定
AEGIS_CONFIG_PATH=./aegis-mcp-config.json  # MCP設定ファイルパス
CLAUDE_DESKTOP_CONFIG_PATH=auto            # Claude Desktop設定（自動検出）

# Web UI設定
POLICY_UI_PORT=3000        # Web UIポート

# セキュリティ設定
ENABLE_RATE_LIMITING=true  # レート制限
RATE_LIMIT_MAX_REQUESTS=100 # 最大リクエスト数/分
```

### ハイブリッドMCPプロキシ設定

AEGISは3種類のツールソースをサポートします：

1. **設定ベースツール** (`configured`)
   - `aegis-mcp-config.json`で定義したMCPサーバー
   - 例: filesystem, github, google-drive

2. **ネイティブツール** (`native`)
   - Claude Code内蔵ツール（Agent, Bash, Edit, Read等）
   - デフォルトで統合、プレフィックスなし

3. **動的発見ツール** (`discovered`)
   - VSCode統合、サードパーティMCPツール
   - 実行時に自動検出

設定例：
```json
{
  "proxySettings": {
    "includeNativeTools": true,      // Claude Code内蔵ツールを含める
    "includeDiscoveredTools": true,  // 動的発見ツールを含める
    "policyControl": {
      "defaultEnabled": true,        // デフォルトでポリシー制御
      "exceptions": ["TodoRead"],    // 除外するツール
      "toolPolicies": {              // ツール別の詳細設定
        "Bash": {
          "enabled": true,
          "constraints": ["危険なコマンドのブロック"]
        }
      }
    }
  }
}
```

### CLIオプション

現在のバージョンでは、設定は主に環境変数で行います。CLIオプションは将来的に追加予定です。

## 次のステップ

1. **Claude Desktopとの統合**
   - [MCP統合ガイド](./mcp-integration.md)を参照

2. **ポリシーの作成**
   - [自然言語ポリシー記述ガイド](./policy-writing-guide.md)を参照

3. **本番環境へのデプロイ**
   - [デプロイメントガイド](./deployment.md)を参照

4. **APIの詳細**
   - [APIリファレンス](./api-reference.md)を参照

5. **運用管理**
   - [ガバナンス運用ガイド](./governance-guide.md)を参照

## トラブルシューティング

### よくある問題

**Q: "APIキーが設定されていません"エラー**
```bash
# 環境変数を確認
echo $ANTHROPIC_API_KEY

# .envファイルが読み込まれているか確認
cat .env | grep API_KEY
```

**Q: ポート競合エラー**
```bash
# 使用中のポートを確認
lsof -i :3000

# 別のポートで起動
PORT=3001 npm run start:server
```

**Q: ビルドエラー**
```bash
# クリーンビルド
npm run clean
npm run build

# TypeScriptバージョン確認
npx tsc --version
```

## Phase 3 新機能

AEGISには以下の高度な機能が実装されています：

### 🔄 改良エラーハンドリング
- Circuit Breakerパターンによる障害の自動隔離
- 段階的なエラー復旧メカニズム
- 詳細なエラー分類とレポート

### 🚨 リアルタイム異常検知
- アクセスパターンの機械学習分析
- 異常スコアリングとアラート
- 自動的なリスク評価と対応

### 💾 インテリジェントキャッシュ
- 判定結果の賢いキャッシュ戦略
- コンテキスト依存のキャッシュ無効化
- メモリ効率的な実装

### ⚡ バッチ判定システム
- 複数リクエストの一括処理
- レート制限とスロットリング
- 効率的なリソース利用

### サポート

問題が解決しない場合は、[GitHubのIssue](https://github.com/Shin0205go/Aegis/issues)で報告してください。