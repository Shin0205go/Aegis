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
git clone https://github.com/your-org/aegis-policy-engine.git
cd aegis-policy-engine

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
OPENAI_API_KEY=your-openai-api-key
# または
ANTHROPIC_API_KEY=your-anthropic-api-key

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

### 1. MCP公式仕様プロキシサーバー (`npm run start:mcp`)

MCP公式仕様にstdioトランスポートで起動します（推奨）。Claude Desktop等のMCPクライアントから接続可能です。

```bash
# stdioトランスポート（デフォルト）
# Claude Desktopの設定から自動的に他のMCPサーバーを読み込みます
npm run start:mcp

# HTTPトランスポート
npm run start:mcp:http
```

**Claude Desktop統合の利点**:
- `claude_desktop_config.json`から他のMCPサーバー設定を自動読み込み
- 既存のMCPサーバー（Gmail、Google Drive等）にポリシー制御を追加
- 追加設定なしで即座に使用開始可能

### 2. WebSocketプロキシサーバーとして起動 (`npm run start:server`)

カスタムWebSocketトランスポートで起動します（非MCP公式）。

```bash
# 基本的な起動
npm run start:server

# ビルドと起動を同時に実行
npm run build && npm run start:server

# カスタムポートで起動
PORT=8080 npm run start:server

# デバッグモードで起動
LOG_LEVEL=debug npm run start:server
```

**起動後の確認:**
```bash
# ヘルスチェック
curl http://localhost:3000/health

# ポリシー一覧
curl http://localhost:3000/policies
```

**用途:**
- AIエージェントのMCP通信を制御したい場合
- WebSocketベースのプロキシサーバーが必要な場合
- 独立したサービスとして運用する場合

### 3. ライブラリとして使用 (`npm run start`)

他のNode.jsアプリケーションに組み込んで使用します。

```typescript
// your-app.ts
import { AEGIS } from 'aegis-policy-engine';

async function main() {
  // AEGIS初期化
  const aegis = new AEGIS({
    llm: {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY
    }
  });

  // システム起動
  await aegis.start();

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

| 項目 | `start:server` | `start` (ライブラリ) |
|------|----------------|---------------------|
| **起動方法** | コマンドライン | プログラムから |
| **通信方法** | WebSocket/HTTP | 関数呼び出し |
| **用途** | MCPプロキシ | 組み込み制御 |
| **設定** | 環境変数/CLI | コード内 |
| **スケーリング** | 複数インスタンス | アプリ内 |

## 基本的な使い方

### MCPプロキシサーバーの場合

1. **サーバー起動**
```bash
npm run start:server
```

2. **エージェント接続設定**

エージェント側でMCPサーバーのURLを設定：
```
ws://localhost:3000/mcp
```

3. **ポリシー追加**

REST APIでポリシーを追加：
```bash
curl -X POST http://localhost:3000/policies/customer-access \
  -H "Content-Type: application/json" \
  -d '{
    "policy": "顧客データは営業時間内のみアクセス可能。カスタマーサポート部門に限定。"
  }'
```

### ライブラリとしての場合

```typescript
import { AEGIS, PolicyAdministrator } from 'aegis-policy-engine';

// 初期化
const aegis = new AEGIS(config);
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
# LLM設定
LLM_PROVIDER=openai          # 'openai' または 'anthropic'
LLM_MODEL=gpt-4             # 使用するモデル
OPENAI_API_KEY=xxx          # OpenAI APIキー
ANTHROPIC_API_KEY=xxx       # Anthropic APIキー

# サーバー設定
PORT=3000                   # サーバーポート
LOG_LEVEL=info             # ログレベル
NODE_ENV=production        # 環境

# キャッシュ設定
CACHE_ENABLED=true         # キャッシュ有効化
CACHE_TTL=3600            # キャッシュ期間（秒）

# 上流サーバー（MCPプロキシ用）
UPSTREAM_SERVERS=gmail:ws://localhost:8080,gdrive:ws://localhost:8081
```

### CLIオプション（server.jsのみ）

```bash
# ヘルプ表示
node dist/server.js --help

# ポート指定
node dist/server.js --port 8080

# プロバイダー指定
node dist/server.js --provider anthropic --model claude-3-opus-20240229

# デバッグモード
node dist/server.js --debug
```

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
echo $OPENAI_API_KEY

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

### サポート

問題が解決しない場合は、[GitHubのIssue](https://github.com/your-org/aegis-policy-engine/issues)で報告してください。