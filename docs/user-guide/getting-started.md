# 導入・初期設定ガイド

このガイドでは、AEGISのインストールから基本的な動作確認までを説明します。

## 📋 システム要件

- **Node.js**: v20.0.0 以上
- **npm**: v9.0.0 以上
- **OS**: Windows、macOS、Linux
- **メモリ**: 4GB以上推奨
- **ディスク**: 1GB以上の空き容量

## 🚀 インストール手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/youraccount/aegis-policy-engine.git
cd aegis-policy-engine
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. ビルド

```bash
npm run build
```

## 🔧 環境設定

### 1. 環境変数ファイルの作成

```bash
cp .env.example .env
```

### 2. APIキーの設定

`.env` ファイルを編集し、使用するLLMプロバイダのAPIキーを設定します：

#### Anthropic Claude を使用する場合
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
```

#### OpenAI GPT を使用する場合
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### 3. その他の設定（オプション）

```bash
# ログレベル（debug, info, warn, error）
LOG_LEVEL=info

# ポート番号（デフォルト: 3000）
PORT=3000

# キャッシュ設定
CACHE_ENABLED=true
CACHE_TTL=3600
```

## 🏃 起動方法

### 方法1: 統合起動（推奨）

MCPサーバーとWeb UIを同時に起動します：

```bash
node mcp-launcher.js
```

起動後、以下のURLでアクセスできます：
- Web UI: http://localhost:3000/
- 監査ダッシュボード: http://localhost:3000/audit-dashboard.html
- リクエストダッシュボード: http://localhost:3000/request-dashboard.html

### 方法2: 個別起動

#### MCPサーバーのみ
```bash
# stdio版（Claude Desktop用）
npm run start:mcp

# HTTP版
npm run start:mcp:http
```

#### Web UIのみ
```bash
npm run start:api
```

## ✅ 動作確認

### 1. Web UI の確認

ブラウザで http://localhost:3000 にアクセスし、以下を確認：

- ✅ ホームページが表示される
- ✅ 各ダッシュボードへのリンクが機能する
- ✅ ポリシー管理画面が開ける

### 2. ヘルスチェック

```bash
curl http://localhost:3000/health
```

正常な応答例：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 3. ログの確認

```bash
# 起動ログ
tail -f logs/mcp-launcher.log

# 監査ログ（アクセスがあった場合）
tail -f logs/audit/audit_*.json
```

## 🔍 トラブルシューティング

### ポートが既に使用されている

エラー: `Error: listen EADDRINUSE: address already in use :::3000`

解決方法：
```bash
# 別のポートを使用
PORT=3001 node mcp-launcher.js
```

### APIキーが設定されていない

エラー: `Error: ANTHROPIC_API_KEY is not set`

解決方法：
1. `.env` ファイルを確認
2. 環境変数を再読み込み：
   ```bash
   source ~/.zshrc  # または ~/.bashrc
   ```

### ビルドエラー

エラー: `Cannot find module './dist/src/mcp-server.js'`

解決方法：
```bash
npm run build
```

### Node.js バージョンエラー

エラー: `The engine "node" is incompatible with this module`

解決方法：
```bash
# Node.js バージョン確認
node --version

# v20以上でない場合は、nvmなどでアップグレード
nvm install 20
nvm use 20
```

## 📝 次のステップ

インストールと基本設定が完了したら、次は：

1. **[Claude Desktop統合](./claude-desktop-setup.md)** - Claude DesktopでAEGISを使用
2. **[Web UI使用方法](./web-ui.md)** - 管理画面の使い方を学ぶ
3. **[ポリシー記述ガイド](./policy-writing.md)** - 最初のポリシーを作成

## 💡 Tips

- 開発環境では `npm run dev` で自動リロードが有効になります
- ログレベルを `debug` にすると詳細な動作ログが確認できます
- 本番環境への展開については [管理者ガイド](../admin-guide/deployment.md) を参照してください