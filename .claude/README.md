# AEGIS Claude Code Web版 設定ガイド

このディレクトリには、Claude Code Web版でAEGIS MCPプロキシを使用するための設定が含まれています。

## 📁 ファイル構成

```
.claude/
├── session-start-hook.sh       # SessionStart Hook スクリプト
├── settings.local.json         # ローカル設定（権限とHook設定）
├── settings.example.json       # 設定例
└── commands/                   # スラッシュコマンド定義
```

## 🚀 使い方

### 1. AEGIS MCPプロキシの起動

```bash
# HTTPモードで起動（ポート8080）
npm run start:mcp:http

# または手動で起動
node dist/src/mcp-server.js --transport http --port 8080
```

### 2. SessionStart Hookの動作確認

新しいClaude Code Webセッションを開始すると、自動的に`session-start-hook.sh`が実行されます。

手動でテストする場合：

```bash
# Web環境をシミュレート
export CLAUDE_CODE_REMOTE=true
./.claude/session-start-hook.sh
```

### 3. 接続確認

```bash
# ヘルスチェック
curl http://localhost:8080/health

# MCPエンドポイント
curl -X POST http://localhost:8080/mcp/messages \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'
```

## 🌐 Web UI

AEGIS MCPプロキシが起動すると、以下のWeb UIにアクセスできます：

- **ポリシー管理**: http://localhost:8080/
- **監査ダッシュボード**: http://localhost:8080/audit-dashboard-enhanced.html
- **ヘルスチェック**: http://localhost:8080/health
- **API**: http://localhost:8080/policies

## 🔧 設定のカスタマイズ

### 環境変数

`session-start-hook.sh`で設定される環境変数：

```bash
AEGIS_MCP_URL=http://localhost:8080    # MCPプロキシのURL
MCP_TRANSPORT=http                      # トランスポートモード
LLM_PROVIDER=anthropic                  # LLMプロバイダー
LLM_MODEL=claude-opus-4-20250514       # 使用するモデル
AEGIS_LOG_LEVEL=info                    # ログレベル
AEGIS_AI_THRESHOLD=0.7                  # AI判定の信頼度閾値
MCP_PROXY_PORT=8080                     # プロキシポート
```

### リモートデプロイ

プロダクション環境では、`session-start-hook.sh`内の`AEGIS_MCP_URL`を変更してください：

```bash
export AEGIS_MCP_URL=https://your-aegis-server.com:8080
```

## 📊 ポリシー制御

起動時に以下のポリシーが自動ロードされます：

1. `dev-permissive-policy` - 開発環境用の緩和ポリシー
2. `claude-desktop-policy` - Claude Desktop専用ポリシー
3. `strict-security-policy` - 厳格なセキュリティポリシー
4. `permissive-policy` - 基本的な許可ポリシー
5. `tool-control-policy` - ツール実行制御
6. `file-system-policy` - ファイルシステムアクセス制御
7. `high-risk-operations-policy` - 高リスク操作の制限
8. `default-policy` - デフォルトポリシー

## 🔍 トラブルシューティング

### SessionStart Hookが実行されない

1. スクリプトが実行可能か確認：
   ```bash
   ls -l .claude/session-start-hook.sh
   # 実行可能でない場合：
   chmod +x .claude/session-start-hook.sh
   ```

2. `settings.local.json`にHook設定があるか確認

### MCPプロキシに接続できない

1. プロキシが起動しているか確認：
   ```bash
   curl http://localhost:8080/health
   ```

2. ポートが使用中でないか確認：
   ```bash
   lsof -i :8080
   ```

3. ログを確認：
   ```bash
   # プロキシのログを確認（起動時に表示される）
   ```

### APIキーエラー

`.env`ファイルにAnthropic APIキーが設定されているか確認：

```bash
cat .env | grep ANTHROPIC_API_KEY
```

## 📖 詳細情報

- [AEGIS公式ドキュメント](../CLAUDE.md)
- [MCPプロトコル仕様](https://modelcontextprotocol.io/)
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
