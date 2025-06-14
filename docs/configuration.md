# AEGIS Configuration Guide

## 環境変数とパス設定

### 推奨される設定方法

AEGISは環境に依存しない設定を推奨しています。

#### 1. Node.jsパスの設定

**推奨**: システムのPATHに`node`コマンドを配置
```bash
# 確認方法
which node
node --version  # v20以上であることを確認
```

**代替方法**: 環境変数を使用
```json
{
  "command": "${NODE_PATH:-node}",
  "args": ["${HOME}/aegis-policy-engine/dist/src/mcp-server.js"]
}
```

#### 2. ディレクトリパスの設定

常に環境変数を使用してください：
- `${HOME}` - ユーザーのホームディレクトリ
- `${PWD}` - 現在の作業ディレクトリ
- カスタム環境変数も利用可能

**悪い例**:
```json
{
  "args": ["/Users/shingo/Develop/project"]
}
```

**良い例**:
```json
{
  "args": ["${HOME}/Develop/project"]
}
```

### 設定ファイルの管理

#### 1. aegis-mcp-config.json

実際の設定ファイルは`.gitignore`に含まれています。
`aegis-mcp-config.example.json`をコピーして使用してください：

```bash
cp aegis-mcp-config.example.json aegis-mcp-config.json
# 必要に応じて編集
```

#### 2. Claude Desktop設定

Claude Desktopの設定も環境に応じて調整してください：

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["${HOME}/aegis-policy-engine/dist/src/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 環境変数の設定

#### 必須の環境変数

```bash
# .env ファイルまたはシェル設定
export OPENAI_API_KEY="your-api-key"
```

#### オプションの環境変数

```bash
# ログレベル
export AEGIS_LOG_LEVEL="info"  # debug, info, warn, error

# カスタムポート
export AEGIS_HTTP_PORT="8080"

# ポリシーディレクトリ
export AEGIS_POLICY_DIR="${HOME}/aegis-policies"
```

### プラットフォーム別の注意事項

#### macOS
- `~/.zshrc` または `~/.bash_profile` で環境変数を設定
- nvm使用時は適切なNode.jsバージョンを選択

#### Linux
- `~/.bashrc` または `~/.profile` で環境変数を設定
- システムのNode.jsを使用する場合は権限に注意

#### Windows
- PowerShellまたはコマンドプロンプトで環境変数を設定
- パス区切り文字に注意（`\` vs `/`）

### トラブルシューティング

#### Node.jsが見つからない
```bash
# PATHを確認
echo $PATH

# Node.jsの場所を特定
which node

# 直接パスを指定（最終手段）
export NODE_PATH="/usr/local/bin/node"
```

#### 権限エラー
```bash
# 実行権限を付与
chmod +x dist/src/mcp-server.js
```

#### 環境変数が展開されない
一部のシステムでは`${HOME}`が展開されない場合があります。
その場合は起動スクリプトを作成してください：

```bash
#!/bin/bash
# start-aegis.sh
node "$HOME/aegis-policy-engine/dist/src/mcp-server.js"
```