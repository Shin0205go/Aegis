# MCP Inspector でのテスト方法

## 概要

MCP Inspector を使用して AEGIS Policy Engine の動作をテストする方法を説明します。

## 前提条件

1. MCP Inspector がインストールされていること
2. AEGIS Policy Engine がビルドされていること (`npm run build`)
3. 環境変数が設定されていること

## セットアップ手順

### 1. 環境変数の設定

`.env` ファイルを作成し、必要な環境変数を設定します：

```bash
# LLM設定
ANTHROPIC_API_KEY=your-actual-api-key
AEGIS_AI_THRESHOLD=0.7

# トランスポート設定（stdioの場合は不要）
MCP_TRANSPORT=stdio
```

### 2. プロジェクトのビルド

```bash
npm run build
```

### 3. MCP Inspector での起動

#### 方法1: 直接実行

```bash
# プロジェクトルートで実行
npx @modelcontextprotocol/inspector node dist/src/mcp-server.js
```

#### 方法2: 設定ファイルを使用

`mcp-inspector-config.json` を使用：

```bash
npx @modelcontextprotocol/inspector --config mcp-inspector-config.json
```

## テストシナリオ

### 1. ツール一覧の確認

MCP Inspector で `tools/list` を実行すると、利用可能なツールが表示されます：

- `filesystem__*` - ファイルシステム操作
- `execution-server__*` - コマンド実行
- `artifacts` - アーティファクト管理
- `repl` - REPL実行
- `web_search` - Web検索
- `web_fetch` - Web取得

### 2. ポリシー制御のテスト

#### 営業時間外アクセステスト

1. システム時間を営業時間外に設定
2. ツールを実行
3. ポリシーによる制限を確認

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "filesystem__read_file",
    "arguments": {
      "path": "/sensitive/customer-data.csv"
    }
  },
  "id": 1
}
```

#### 高リスク操作のテスト

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "execution-server__execute_command",
    "arguments": {
      "command": "rm -rf /important/data"
    }
  },
  "id": 2
}
```

### 3. デバッグモード

詳細なログを確認するには、環境変数を設定：

```bash
AEGIS_LOG_LEVEL=debug npx @modelcontextprotocol/inspector node dist/src/mcp-server.js
```

## トラブルシューティング

### エラー: "Cannot find module"

ビルドが完了していることを確認：
```bash
npm run build
```

### エラー: "API key not found"

環境変数が正しく設定されていることを確認：
```bash
echo $ANTHROPIC_API_KEY
```

### ポリシーが適用されない

1. ポリシーファイルが `policies/` ディレクトリに存在することを確認
2. ログレベルを `debug` に設定して詳細を確認

## 高度な使用方法

### カスタムポリシーのテスト

1. `policies/` ディレクトリに新しいポリシーファイルを作成
2. MCP サーバーを再起動
3. MCP Inspector で新しいポリシーの動作を確認

### 制約・義務のテスト

制約と義務が適用されることを確認：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "filesystem__read_file",
    "arguments": {
      "path": "/customer/personal-info.json"
    }
  },
  "id": 3
}
```

期待される動作：
- データの匿名化（制約）
- アクセスログの記録（義務）

## 参考リンク

- [MCP Inspector ドキュメント](https://modelcontextprotocol.io/docs/tools/inspector)
- [AEGIS Policy Engine アーキテクチャ](../architecture.md)