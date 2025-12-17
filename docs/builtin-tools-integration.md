# AEGIS Built-in Tools Integration

## 概要

AEGIS Built-in Tools MCPサーバーは、Claude Codeのビルトインツール（Bash、Read、Write、Edit、Glob、Grep）をMCPプロトコルで提供し、AEGISポリシー制御下に置くためのサーバーです。

これにより、すべてのビルトインツール呼び出しがAEGISのポリシーエンジンを通過し、セキュリティポリシーに基づいて制御されます。

## アーキテクチャ

```
AIエージェント (Claude Desktop/Claude Code)
        ↓ MCP Request (tools/call)
AEGIS MCPプロキシ
  ├─ PolicyDecisionPoint (AI判定)
  ├─ EnforcementSystem (制約・義務)
  └─ ContextCollector (コンテキスト収集)
        ↓
Built-in Tools MCPサーバー
  ├─ bash: コマンド実行
  ├─ read_file: ファイル読み取り
  ├─ write_file: ファイル書き込み
  ├─ edit_file: ファイル編集
  ├─ glob: ファイル検索
  └─ grep: テキスト検索
        ↓
システムリソース（ファイルシステム、プロセス）
```

## 提供ツール

### 1. bash - コマンド実行
**機能**: Bashコマンドを実行し、結果を返します

**パラメータ**:
- `command` (required): 実行するBashコマンド
- `timeout` (optional): タイムアウト時間（ミリ秒、デフォルト: 30000）
- `workingDir` (optional): 作業ディレクトリ

**セキュリティ制約**:
- 危険なコマンド（`rm -rf /`、`mkfs`、`dd`等）は検出してブロック
- 実行時間制限（最大5分）
- 環境変数の制限
- コマンド出力サイズ制限（10MB）

**使用例**:
```json
{
  "name": "bash",
  "arguments": {
    "command": "ls -la /home/user/project",
    "timeout": 30000
  }
}
```

### 2. read_file - ファイル読み取り
**機能**: ファイルの内容を読み取ります

**パラメータ**:
- `path` (required): ファイルの絶対パス
- `offset` (optional): 開始行番号（0始まり）
- `limit` (optional): 読み取る行数
- `encoding` (optional): エンコーディング（デフォルト: utf-8）

**セキュリティ制約**:
- ファイルサイズ制限（100MB）
- 行番号付きで出力（Claude Codeの Read tool と同じ形式）

**使用例**:
```json
{
  "name": "read_file",
  "arguments": {
    "path": "/home/user/project/src/index.ts",
    "offset": 0,
    "limit": 100
  }
}
```

### 3. write_file - ファイル書き込み
**機能**: ファイルを作成または上書きします

**パラメータ**:
- `path` (required): ファイルの絶対パス
- `content` (required): 書き込む内容
- `createBackup` (optional): バックアップ作成（デフォルト: false）
- `encoding` (optional): エンコーディング（デフォルト: utf-8）

**セキュリティ制約**:
- 危険なディレクトリ（`/etc`、`/sys`、`/proc`、`/dev`）への書き込み禁止
- ディレクトリの自動作成
- オプションでバックアップ作成

**使用例**:
```json
{
  "name": "write_file",
  "arguments": {
    "path": "/home/user/project/output.txt",
    "content": "Hello, World!",
    "createBackup": true
  }
}
```

### 4. edit_file - ファイル編集
**機能**: ファイル内の文字列を置換します

**パラメータ**:
- `path` (required): ファイルの絶対パス
- `oldString` (required): 置換元の文字列
- `newString` (required): 置換先の文字列
- `replaceAll` (optional): すべての出現箇所を置換（デフォルト: false）

**セキュリティ制約**:
- 置換対象が存在しない場合はエラー
- 置換前の文字列が一意でない場合の警告

**使用例**:
```json
{
  "name": "edit_file",
  "arguments": {
    "path": "/home/user/project/config.json",
    "oldString": "\"port\": 3000",
    "newString": "\"port\": 8080",
    "replaceAll": false
  }
}
```

### 5. glob - ファイル検索（パターンマッチング）
**機能**: Globパターンに一致するファイルを検索します

**パラメータ**:
- `pattern` (required): Globパターン（例: `**/*.ts`、`src/**/*.json`）
- `cwd` (optional): 検索開始ディレクトリ
- `maxResults` (optional): 最大結果数（デフォルト: 1000）

**セキュリティ制約**:
- 除外ディレクトリ（`node_modules`、`.git`等）の自動スキップ
- 結果数制限

**使用例**:
```json
{
  "name": "glob",
  "arguments": {
    "pattern": "src/**/*.ts",
    "cwd": "/home/user/project",
    "maxResults": 1000
  }
}
```

### 6. grep - テキスト検索
**機能**: ファイル内のテキストを正規表現で検索します

**パラメータ**:
- `pattern` (required): 検索パターン（正規表現）
- `path` (optional): 検索パス（ファイルまたはディレクトリ）
- `glob` (optional): ファイルパターンフィルタ（例: `*.ts`、`*.json`）
- `caseInsensitive` (optional): 大文字小文字を区別しない（デフォルト: false）
- `contextLines` (optional): コンテキスト行数（デフォルト: 0）
- `maxResults` (optional): 最大結果数（デフォルト: 100）

**セキュリティ制約**:
- ファイルサイズ制限（10MB）
- テキストファイルのみ検索
- バイナリファイルの自動除外

**使用例**:
```json
{
  "name": "grep",
  "arguments": {
    "pattern": "function.*execute",
    "path": "/home/user/project/src",
    "glob": "*.ts",
    "caseInsensitive": true,
    "contextLines": 3,
    "maxResults": 100
  }
}
```

## セットアップ

### 1. ビルド
```bash
cd /home/user/Aegis
npm install
npm run build
```

### 2. 設定ファイルの作成
`aegis-mcp-config.json`を作成：

```json
{
  "mcpServers": {
    "aegis-builtin-tools": {
      "command": "node",
      "args": [
        "/home/user/Aegis/dist/src/mcp/builtin-tools-server.js"
      ],
      "transport": "stdio",
      "description": "AEGIS Built-in Tools Server"
    }
  }
}
```

### 3. ポリシーの確認
`policies/builtin-tools-policy.json`が存在することを確認してください。このポリシーには以下の制御が含まれています：

- **Bashコマンド制限**: 危険なコマンドの禁止、監査必須コマンドの指定
- **ファイル操作制限**: システムディレクトリへの書き込み禁止、機密ファイルの読み取り制限
- **検索制限**: システムディレクトリの包括的検索制限、結果数制限
- **監査義務**: すべてのツール呼び出しの記録、セキュリティアラートの通知

### 4. AEGIS MCPプロキシの起動
```bash
# stdioモード（Claude Desktop統合）
npm run start:mcp:stdio

# HTTPモード（Web UI付き）
npm run start:mcp:http
```

### 5. Claude Codeからの使用
Claude Code/Claude Desktopが起動すると、自動的にBuilt-in Tools MCPサーバーが利用可能になります。

すべてのツール呼び出しは、AEGIS MCPプロキシを経由し、ポリシー判定が行われます。

## ポリシー制御の動作

### 許可される操作
- 通常の開発作業に必要なコマンド（`git`、`npm`、`node`等）
- ユーザーホームディレクトリ内のファイル読み書き
- プロジェクトディレクトリ内の検索
- 情報取得コマンド（`ls`、`cat`、`grep`、`find`）

### 拒否される操作
- システム破壊コマンド（`rm -rf /`、`mkfs`）
- 権限昇格（`sudo`、`su`）
- システムディレクトリへの書き込み（`/etc`、`/sys`）
- 機密ファイルへのアクセス（`.env`、`.key`、`id_rsa`）

### 監査ログ記録
すべてのツール呼び出しは以下の情報とともに記録されます：
- 実行時刻
- エージェント名
- ツール名とパラメータ
- 実行結果（成功/失敗）
- ポリシー判定結果（PERMIT/DENY）
- 実行時間

### セキュリティアラート
以下の場合、管理者に通知されます：
- 危険なコマンドの試行
- システムディレクトリへの書き込み試行
- 機密ファイルへのアクセス試行
- 異常な頻度のツール使用

## トラブルシューティング

### ツールが利用できない
1. Built-in Tools MCPサーバーがビルドされているか確認
   ```bash
   ls -la /home/user/Aegis/dist/src/mcp/builtin-tools-server.js
   ```

2. AEGIS MCPプロキシが正常に起動しているか確認
   ```bash
   # ログを確認
   tail -f aegis-proxy.log
   ```

3. 設定ファイル（`aegis-mcp-config.json`）が正しいパスにあるか確認

### ポリシー判定がDENYになる
1. ポリシーファイル（`policies/builtin-tools-policy.json`）を確認
2. 監査ログで拒否理由を確認
   ```bash
   # 監査ログの確認
   grep "DENY" logs/audit-*.log
   ```

3. ポリシーを調整するか、特定の操作に対して例外を追加

### パフォーマンスが遅い
1. キャッシュが有効になっているか確認
2. AI判定のタイムアウト設定を調整
   ```bash
   export AEGIS_AI_THRESHOLD=0.7  # 信頼度閾値
   ```

3. バッチ判定を有効化

## 参考

- [AEGIS Architecture](../docs/architecture.md)
- [MCP Integration Guide](../docs/developer-guide/mcp-integration.md)
- [Policy Management](../docs/admin-guide/policy-management.md)
