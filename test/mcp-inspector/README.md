# MCP Inspector テスト

このディレクトリには、MCP Inspector を使用して AEGIS Policy Engine をテストするためのファイルが含まれています。

## ファイル構成

- `mcp-inspector-config.json` - MCP Inspector 設定ファイル
- `test-with-inspector.sh` - テスト実行スクリプト
- `test-scenarios/` - テストシナリオ（JSON-RPC リクエスト例）

## 使用方法

### 1. テストスクリプトの実行

```bash
cd test/mcp-inspector
./test-with-inspector.sh
```

### 2. 直接実行（プロジェクトルートから）

```bash
npx @modelcontextprotocol/inspector --config test/mcp-inspector/mcp-inspector-config.json
```

### 3. カスタム設定での実行

環境変数を設定して実行：

```bash
ANTHROPIC_API_KEY=your-key AEGIS_LOG_LEVEL=debug ./test-with-inspector.sh
```

## テストシナリオ

`test-scenarios/` ディレクトリ内のファイルを参照してください。

詳細なドキュメントは [MCP Inspector セットアップガイド](../../docs/guides/mcp-inspector-setup.md) を参照してください。