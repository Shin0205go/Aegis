# AEGIS MCP統合ガイド

## 📋 目次

1. [MCPプロキシ概要](#mcpプロキシ概要)
2. [Claude Desktop設定](#claude-desktop設定)
3. [設定例](#設定例)
4. [動作確認](#動作確認)
5. [トラブルシューティング](#トラブルシューティング)

## MCPプロキシ概要

AEGISのMCPプロキシサーバーは、Claude DesktopなどのMCPクライアントと上流のMCPサーバー（Gmail、Google Driveなど）の間に立ち、自然言語ポリシーに基づいてアクセス制御を行います。

```
Claude Desktop → AEGIS MCPプロキシ → 上流MCPサーバー（Gmail等）
```

AEGISは、MCP公式仕様に準拠した2つのトランスポートをサポートしています：
- **stdio**: 標準入出力を使用（推奨）
- **Streamable HTTP**: HTTPストリーミング（SSE対応）

**注意**: 以前のWebSocket実装は非推奨となり、MCP公式仕様に準拠した実装に移行しました。

## Claude Desktop設定

### 1. AEGISサーバーの起動

まず、AEGISのMCPプロキシサーバーを起動します：

```bash
# 環境変数の設定
export OPENAI_API_KEY="your-api-key"

# MCP公式仕様版のサーバー起動
# stdioトランスポート（デフォルト、推奨）
npm run start:mcp

# または HTTPトランスポート
npm run start:mcp:http
```

### 2. claude_desktop_config.json の設定

Claude Desktopの設定ファイル `claude_desktop_config.json` に以下を追加します：

#### 基本的な設定（stdioトランスポート、MCP推奨）

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": [
        "/path/to/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "LOG_LEVEL": "info"
      }
    },
    // AEGISが自動的にこれらのサーバーを管理・制御します
    "gmail": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gmail"]
    },
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"]
    }
  }
}
```

**ポイント**: AEGISは`claude_desktop_config.json`から他のMCPサーバー設定を自動的に読み込み、ポリシー制御を適用します。

**注意**: APIキー（`OPENAI_API_KEY` または `ANTHROPIC_API_KEY`）は、セキュリティのため環境変数から自動的に取得されます。シェルで事前に設定してください：

```bash
export OPENAI_API_KEY="your-api-key"
# または
export ANTHROPIC_API_KEY="your-api-key"
```

#### 上流サーバーと組み合わせた設定

AEGISを通して他のMCPサーバーにアクセスする場合：

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": [
        "/path/to/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "LLM_PROVIDER": "openai",
        "LLM_MODEL": "gpt-4",
        "LOG_LEVEL": "info",
        "CACHE_ENABLED": "true",
        "UPSTREAM_SERVERS_STDIO": "extra-server:node /path/to/extra-mcp.js"
      }
    }
  }
}
```

## 設定例

### 例1: OpenAI GPT-4を使用

```json
{
  "mcpServers": {
    "aegis-security": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/server.js"
      ],
      "env": {
        "LLM_PROVIDER": "openai",
        "LLM_MODEL": "gpt-4",
        "PORT": "3000",
        "LOG_LEVEL": "info",
        "CACHE_ENABLED": "true",
        "CACHE_TTL": "3600"
      }
    }
  }
}
```

**前提**: 環境変数 `OPENAI_API_KEY` が設定されていること

### 例2: Anthropic Claudeを使用

```json
{
  "mcpServers": {
    "aegis-security": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/server.js"
      ],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "LLM_MODEL": "claude-3-opus-20240229",
        "PORT": "3000",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

**前提**: 環境変数 `ANTHROPIC_API_KEY` が設定されていること

### 例3: 複数の上流サーバーを統合

```json
{
  "mcpServers": {
    "aegis-gateway": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/server.js"
      ],
      "env": {
        "PORT": "3000",
        "UPSTREAM_SERVERS": "gmail:ws://localhost:8080,gdrive:ws://localhost:8081,slack:ws://localhost:8082",
        "LOG_LEVEL": "info",
        "LOG_FILE_PATH": "/Users/username/aegis-logs/aegis.log"
      }
    }
  }
}
```

### 例4: カスタムポリシーディレクトリを指定

```json
{
  "mcpServers": {
    "aegis-custom": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/server.js"
      ],
      "env": {
        "PORT": "3000",
        "POLICY_DIR": "/Users/username/custom-policies",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 動作確認

### 1. サーバー起動確認

Claude Desktopを起動後、ターミナルで以下を実行：

```bash
# ヘルスチェック
curl http://localhost:3000/health

# 期待される応答
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "upstreamServers": []
}
```

### 2. ポリシー確認

```bash
# ポリシー一覧
curl http://localhost:3000/policies

# 期待される応答
{
  "policies": [
    "customer-data-policy",
    "email-access-policy",
    "file-system-policy"
  ]
}
```

### 3. Claude Desktopでの確認

Claude Desktopで以下のようなコマンドを実行して、MCPサーバーが認識されているか確認：

```
/mcp list-servers
```

## トラブルシューティング

### よくある問題

#### 1. サーバーが起動しない

**原因**: パスが間違っている
```json
// ❌ 間違い
"args": ["aegis-policy-engine/dist/server.js"]

// ✅ 正しい（絶対パス）
"args": ["/Users/username/aegis-policy-engine/dist/server.js"]
```

#### 2. APIキーエラー

**原因**: 環境変数が設定されていない
```bash
# シェルで環境変数を確認
echo $OPENAI_API_KEY

# 設定されていない場合は設定
export OPENAI_API_KEY="sk-..."
# または
export ANTHROPIC_API_KEY="sk-ant-..."

# 永続化する場合は ~/.zshrc または ~/.bashrc に追加
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.zshrc
```

#### 3. ポート競合

**原因**: 既に使用中のポート
```json
// 別のポートを指定
"env": {
  "PORT": "3001"  // 3000が使用中の場合
}
```

#### 4. ビルドされていない

**原因**: TypeScriptがコンパイルされていない
```bash
# プロジェクトディレクトリで実行
cd /path/to/aegis-policy-engine
npm run build
```

### デバッグモード

問題の詳細を確認するには、デバッグモードを有効にします：

```json
{
  "mcpServers": {
    "aegis-debug": {
      "command": "node",
      "args": [
        "/path/to/aegis-policy-engine/dist/server.js",
        "--debug"
      ],
      "env": {
        "LOG_LEVEL": "debug",
        "NODE_ENV": "development"
      }
    }
  }
}
```

### ログの確認

ログファイルを指定して詳細を確認：

```json
"env": {
  "LOG_FILE_PATH": "/Users/username/aegis-logs/debug.log",
  "LOG_LEVEL": "debug"
}
```

## ベストプラクティス

1. **APIキーの管理**
   - セキュリティのため、APIキーは必ず環境変数で管理
   - `claude_desktop_config.json`には絶対に記載しない
   - シェルの設定ファイル（`~/.zshrc`など）で設定
   - macOSのキーチェーンやパスワードマネージャーの活用も検討

2. **ポート管理**
   - 開発環境と本番環境で異なるポートを使用
   - ファイアウォール設定を確認

3. **ログ設定**
   - 本番環境では`info`レベル
   - デバッグ時のみ`debug`レベル

4. **キャッシュ設定**
   - 頻繁にアクセスされるポリシーはキャッシュを有効化
   - TTLは用途に応じて調整

5. **監視**
   - ヘルスチェックエンドポイントを定期的に確認
   - ログファイルのローテーション設定

## 上流MCPサーバーの設定

AEGIS MCPプロキシは、他のMCPサーバーへのリクエストを中継し、ポリシー制御を適用します。

### 自動設定（Claude Desktop統合）

stdioトランスポートを使用する場合、AEGISは`claude_desktop_config.json`から自動的に他のMCPサーバー設定を読み込みます：

1. **設定ファイルの場所**：
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **動作**：
   - AEGISは設定ファイル内のすべてのMCPサーバー（`aegis-proxy`自身を除く）を自動的に起動
   - 各サーバーへのリクエストはポリシー判定を経て転送
   - リソースURIのプレフィックスで適切なサーバーにルーティング

### 設定方法

#### 1. 環境変数による設定

`.env`ファイルまたは環境変数で設定：

```bash
# Config経由で設定（全体設定）
# stdioトランスポート用の設定（コマンドで起動）
UPSTREAM_SERVERS_STDIO=gmail:node gmail-mcp.js,gdrive:node gdrive-mcp.js

# HTTPトランスポート用の設定（HTTPエンドポイント）
UPSTREAM_SERVERS_HTTP=gmail:http://localhost:8081,gdrive:http://localhost:8082
```

#### 2. 設定フォーマット

- `name:url`形式で指定
- 複数サーバーはカンマ区切り
- stdioの場合: `name:command args`形式（例: `gmail:node gmail-mcp.js`）
- HTTPの場合: `name:url`形式（例: `gmail:http://localhost:8081`）

#### 3. 動的追加（実行時）

MCPプロキシ起動後、APIで上流サーバーを追加することも可能：

```bash
# 今後実装予定
curl -X POST http://localhost:3000/upstream-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "new-service",
    "url": "ws://new-service:8080/mcp"
  }'
```

### 構成例

```yaml
# docker-compose.yml
services:
  aegis:
    image: aegis-policy-engine:latest
    environment:
      - MCP_UPSTREAM_SERVERS=gmail:ws://gmail:8080/mcp,gdrive:ws://gdrive:8080/mcp
    depends_on:
      - gmail-mcp
      - gdrive-mcp

  gmail-mcp:
    image: gmail-mcp-server:latest
    ports:
      - "8081:8080"

  gdrive-mcp:
    image: gdrive-mcp-server:latest
    ports:
      - "8082:8080"
```

## 次のステップ

1. [自然言語ポリシー記述ガイド](./policy-writing-guide.md) - 効果的なポリシーの書き方
2. [APIリファレンス](./api-reference.md) - 詳細なAPI仕様
3. [ガバナンス運用ガイド](./governance-guide.md) - 運用のベストプラクティス