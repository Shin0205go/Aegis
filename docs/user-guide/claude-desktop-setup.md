# Claude Desktop 統合ガイド

AEGISをClaude Desktopと統合することで、すべてのMCPツールに自然言語ポリシー制御を適用できます。

## 📋 前提条件

- AEGISのインストールが完了していること（[導入ガイド](./getting-started.md)参照）
- Claude Desktopがインストールされていること
- 環境変数（APIキー）が設定されていること

## 🔧 設定手順

### 1. Claude Desktop設定ファイルの場所を確認

設定ファイルの場所はOSによって異なります：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 2. AEGIS設定の追加

`claude_desktop_config.json` を編集し、以下の設定を追加します：

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

**重要な点**：
- `/path/to/aegis-policy-engine` を実際のAEGISインストールパスに置き換えてください
- `mcp-launcher.js` を使用すると、Web UIも同時に起動されます

### 3. 既存のMCPサーバー設定の移行

既にClaude Desktopで他のMCPサーバーを使用している場合、それらの設定を `aegis-mcp-config.json` に移動します：

```json
// aegis-mcp-config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/username"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

### 4. Claude Desktopの再起動

設定を反映させるため、Claude Desktopを完全に終了してから再起動します。

## ✅ 動作確認

### 1. ツールの確認

Claude Desktopで以下のツールが利用可能になっていることを確認：

#### 設定ベースのツール
```
filesystem__read_file          - ファイル読み取り
filesystem__write_file         - ファイル作成・上書き
filesystem__list_directory     - ディレクトリ一覧
```

#### Claude Code内蔵ツール
```
Agent     - 再帰的なタスク実行
Bash      - シェルコマンド実行
Edit      - ファイル編集
Read      - ファイル読み取り
Write     - ファイル書き込み
```

### 2. ポリシー制御の確認

簡単なテストでポリシー制御が動作していることを確認：

```
「README.mdファイルを読んでください」
→ 許可される（読み取りは低リスク）

「システムファイルを削除してください」
→ 拒否される（削除は高リスク）
```

### 3. Web UIの確認

ブラウザで http://localhost:3000 にアクセスし、以下を確認：

- リクエストダッシュボードに実行履歴が表示される
- ポリシー違反があれば拒否理由が表示される

## 🔍 トラブルシューティング

### ツールが表示されない

**原因**: パスが間違っている、またはビルドされていない

**解決方法**:
```bash
# 絶対パスを確認
pwd  # 現在のディレクトリを表示

# ビルドを実行
npm run build

# Claude Desktopを再起動
```

### "Command not found: node" エラー

**原因**: nodeコマンドがPATHに含まれていない

**解決方法**:
```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "/usr/local/bin/node",  // 絶対パスを指定
      "args": [
        "/path/to/aegis-policy-engine/mcp-launcher.js"
      ]
    }
  }
}
```

nodeの場所を確認：
```bash
which node
```

### APIキーエラー

**原因**: 環境変数が設定されていない

**解決方法**:

1. システム環境変数に設定：
   ```bash
   # ~/.zshrc または ~/.bashrc に追加
   export ANTHROPIC_API_KEY="sk-ant-..."
   ```

2. または、設定ファイルで直接指定：
   ```json
   {
     "mcpServers": {
       "aegis-proxy": {
         "command": "node",
         "args": ["/path/to/aegis-policy-engine/mcp-launcher.js"],
         "env": {
           "ANTHROPIC_API_KEY": "sk-ant-..."
         }
       }
     }
   }
   ```

### ポート競合エラー

**原因**: ポート3000が既に使用されている

**解決方法**:
```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["/path/to/aegis-policy-engine/mcp-launcher.js"],
      "env": {
        "PORT": "3001"  // 別のポートを指定
      }
    }
  }
}
```

## 📝 高度な設定

### ログレベルの調整

デバッグ時：
```json
"env": {
  "LOG_LEVEL": "debug"
}
```

本番環境：
```json
"env": {
  "LOG_LEVEL": "error"
}
```

### 特定のツールの除外

ポリシー制御から除外したいツールがある場合、`aegis-mcp-config.json` で設定：

```json
{
  "proxySettings": {
    "policyControl": {
      "defaultEnabled": true,
      "exceptions": ["TodoRead", "TodoWrite", "LS"]
    }
  }
}
```

### カスタムポリシーディレクトリ

```json
"env": {
  "POLICY_DIR": "/path/to/custom-policies"
}
```

## 💡 ベストプラクティス

1. **定期的なログ確認**
   - `logs/audit/` ディレクトリで監査ログを確認
   - 異常なアクセスパターンがないかチェック

2. **ポリシーの段階的適用**
   - 最初は緩めのポリシーから始める
   - 使用パターンを理解してから厳格化

3. **バックアップ**
   - 設定ファイルとポリシーファイルの定期バックアップ
   - 変更前の設定を保存

## 📚 次のステップ

- [Web UI使用方法](./web-ui.md) - 管理画面の詳細な使い方
- [ポリシー記述ガイド](./policy-writing.md) - 効果的なポリシーの作成
- [実践的な使用例](./examples.md) - 実際のユースケース