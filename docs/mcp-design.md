# AEGIS MCP統合・設計ガイド

## 📋 目次

1. [MCPプロキシ概要](#mcpプロキシ概要)
2. [ユニバーサルMCPプロキシ設計](#ユニバーサルmcpプロキシ設計)
3. [Claude Desktop設定](#claude-desktop設定)
4. [設定例](#設定例)
5. [動作確認](#動作確認)
6. [トラブルシューティング](#トラブルシューティング)

## MCPプロキシ概要

AEGISのMCPプロキシサーバーは、Claude DesktopなどのMCPクライアントと上流のMCPサーバー（Gmail、Google Driveなど）の間に立ち、自然言語ポリシーに基づいてアクセス制御を行います。

```
MCPクライアント → AEGIS MCPプロキシ → 上流MCPサーバー
(Claude Desktop等)                    (Gmail, GDrive等)
```

### サポートするトランスポート

AEGISは、MCP公式仕様に準拠した2つのトランスポートをサポート：
- **stdio**: 標準入出力を使用（推奨）
- **Streamable HTTP**: HTTPストリーミング（SSE対応）

## ユニバーサルMCPプロキシ設計

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    MCPクライアント                           │
│        (Claude Desktop/Claude Code/Cursor/VSCode等)         │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCPプロトコル
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              AEGIS MCPプロキシサーバー                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  設定ベース     │  │  自然言語      │  │ AI判定      │ │
│  │  MCPサーバー    │  │  ポリシー      │  │ エンジン    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │         ユニバーサルツール制御システム                   │ │
│  │  - すべてのツールを自然言語ポリシーで判定               │ │
│  │  - ツール名からリスクレベルを自動推定                   │ │
│  │  - 動的な制約・義務の適用                               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 主要な特徴

#### 1. ユニバーサルツール制御

従来のハードコーディングやパターンマッチングを廃止し、自然言語ポリシーによる動的な判定を採用：

```typescript
// tool-control-policy.ts
export const TOOL_CONTROL_POLICY = {
  name: 'mcp-tool-control-policy',
  policy: `
MCPツール制御ポリシー：

【リスク判定基準】
高リスク（厳格な制御）:
- bash, shell, exec, cmd, powershell を含むツール
- system, os, process を含むツール
- delete, remove, destroy を含むツール
- admin, root, sudo を含むツール
- agent（再帰的実行）を含むツール

中リスク（標準制御）:
- write, create, update, modify, edit を含むツール
- move, rename, copy を含むツール
- config, setting を含むツール

低リスク（最小限の制御）:
- read, get, list, search, find を含むツール
- view, show, display を含むツール
- info, status, stat を含むツール
- todo, task, note を含むツール
`
};
```

#### 2. 自然言語による柔軟な判定

AIがツール名とコンテキストから動的にリスクを判定：

```typescript
// 判定例
{
  tool: "bash",
  decision: "DENY",
  reason: "ツール名がbashであり、高リスクツールに該当するため",
  constraints: ["実行内容の詳細ログ記録が必須", "危険なパラメータのブロック"]
}

{
  tool: "filesystem__read_file", 
  decision: "PERMIT",
  reason: "リソースがファイルの読み取りであり、低リスクツール",
  obligations: ["基本的なアクセスログの記録"]
}
```

#### 3. シンプルな設定

複雑な設定ファイルは不要。既存のMCPサーバー設定のみ：

```json
// aegis-mcp-config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

#### 4. 個別ポリシーとの連携

特定のクライアント向けポリシーで、ツール制御ポリシーを参照：

```typescript
// claude-desktop-policy.ts
export const CLAUDE_DESKTOP_POLICY = {
  name: 'claude-desktop-policy',
  policy: `
【ツール実行ポリシー】
- ファイルシステムの書き込み系操作（write_file, edit_file等）は禁止
- ファイルシステムの読み取り系操作は許可
- その他のツールは、tool-control-policyに従って判定
`
};
```

### 実装のポイント

#### 1. ツール名の正規化

すべてのツールはプロキシ内で`tool:`プレフィックスを持つ：

```typescript
// 例：
// filesystem__read_file → tool:filesystem__read_file
// Bash → tool:Bash
// TodoRead → tool:TodoRead
```

#### 2. リスクレベルの自動判定

AIがツール名から自動的にリスクを判定し、適切な制約・義務を適用：

- **高リスク**: 詳細ログ、パラメータ検証、監査レポート
- **中リスク**: 実行ログ、大量操作警告
- **低リスク**: 基本的なアクセスログ

#### 3. 動的な拡張性

新しいツールが追加されても、ポリシーの更新だけで対応可能：

```typescript
// 新しいツールが追加されても自動的に判定
"tool:new_dangerous_tool" → 高リスク（"dangerous"を含む）
"tool:safe_viewer" → 低リスク（"view"を含む）
```

## Claude Desktop設定

### 1. AEGISサーバーの起動

```bash
# 環境変数の設定
export ANTHROPIC_API_KEY="your-api-key"
# または
export OPENAI_API_KEY="your-api-key"

# MCP公式仕様版のサーバー起動
# stdioトランスポート（デフォルト、推奨）
npm run start:mcp

# または HTTPトランスポート
npm run start:mcp:http
```

### 2. claude_desktop_config.json の設定

#### 基本的な設定（stdioトランスポート、MCP推奨）

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": [
        "/path/to/aegis-policy-engine/mcp-launcher.js"
      ],
      "cwd": "/path/to/aegis-policy-engine",
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**ポイント**: 
- `mcp-launcher.js`を使用すると、Web UIも自動起動されます
- AEGISは`claude_desktop_config.json`から他のMCPサーバー設定を自動的に読み込み、ポリシー制御を適用します

## 設定例

### 例1: OpenAI GPT-4を使用

```json
{
  "mcpServers": {
    "aegis-security": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "LLM_PROVIDER": "openai",
        "LLM_MODEL": "gpt-4-turbo-preview",
        "LOG_LEVEL": "info",
        "CACHE_ENABLED": "true",
        "CACHE_TTL": "3600"
      }
    }
  }
}
```

### 例2: Anthropic Claudeを使用

```json
{
  "mcpServers": {
    "aegis-security": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "LLM_MODEL": "claude-opus-4-20250514",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### 例3: カスタムポリシーディレクトリを指定

```json
{
  "mcpServers": {
    "aegis-custom": {
      "command": "node",
      "args": [
        "/Users/username/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "POLICY_DIR": "/Users/username/custom-policies",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 動作確認

### 1. サーバー起動確認

```bash
# ヘルスチェック
curl http://localhost:3000/health

# 期待される応答
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 2. Web UIへのアクセス

`mcp-launcher.js`を使用している場合：
- ホームページ: http://localhost:3000/
- 監査ダッシュボード: http://localhost:3000/audit-dashboard.html
- リクエストダッシュボード: http://localhost:3000/request-dashboard.html

### 3. Claude Desktopでの確認

Claude Desktopで以下のツールが利用可能になっているか確認：
- 設定ベースのMCPサーバーツール
- Claude Code内蔵ツール（Bash、Edit、Read等）
- 動的に発見されるサードパーティツール

## トラブルシューティング

### よくある問題

#### 1. サーバーが起動しない

**原因**: パスが間違っている
```json
// ❌ 間違い
"args": ["aegis-policy-engine/dist/src/mcp-server.js"]

// ✅ 正しい（絶対パス）
"args": ["/Users/username/aegis-policy-engine/dist/src/mcp-server.js"]
```

#### 2. APIキーエラー

**原因**: 環境変数が設定されていない
```bash
# シェルで環境変数を確認
echo $ANTHROPIC_API_KEY

# 設定されていない場合は設定
export ANTHROPIC_API_KEY="sk-ant-..."

# 永続化する場合は ~/.zshrc または ~/.bashrc に追加
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
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
        "/path/to/aegis-policy-engine/dist/src/mcp-server.js"
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

```bash
# mcp-launcher.jsを使用している場合
tail -f /path/to/aegis-policy-engine/logs/mcp-launcher.log

# 監査ログ
tail -f /path/to/aegis-policy-engine/logs/audit/audit_2025-06-19.json
```

## ベストプラクティス

1. **APIキーの管理**
   - セキュリティのため、APIキーは必ず環境変数で管理
   - `claude_desktop_config.json`には絶対に記載しない
   - シェルの設定ファイル（`~/.zshrc`など）で設定

2. **ログ設定**
   - 本番環境では`info`レベル
   - デバッグ時のみ`debug`レベル

3. **キャッシュ設定**
   - 頻繁にアクセスされるポリシーはキャッシュを有効化
   - TTLは用途に応じて調整

4. **監視**
   - Web UIで定期的に監査ログを確認
   - ログファイルのローテーション設定

5. **ポリシー管理**
   - 自然言語ポリシーは定期的にレビュー
   - 新しいツールが追加されたらポリシーを更新

## 利点のまとめ

1. **シンプル**: 複雑な設定ファイルやハードコーディング不要
2. **柔軟**: 自然言語による動的な判定
3. **ユニバーサル**: あらゆるMCPクライアントに対応
4. **安全**: AIによる適切なリスク判定と制御
5. **拡張可能**: 新しいツールも自動的に制御対象
6. **透明性**: Web UIで全てのアクセスを可視化

## 次のステップ

1. [自然言語ポリシー記述ガイド](./policy-writing-guide.md) - 効果的なポリシーの書き方
2. [APIリファレンス](./api-reference.md) - 詳細なAPI仕様
3. [ガバナンス運用ガイド](./governance-guide.md) - 運用のベストプラクティス