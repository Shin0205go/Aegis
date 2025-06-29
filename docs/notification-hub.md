# AEGIS 通知ハブ機能

## 概要

AEGIS は MCP クライアント間の `resources/listChanged` 通知を中継する通知ハブとして機能します。これにより、複数の AI エージェント（Claude Code、Gemini CLI など）が同じリソースにアクセスする際、リアルタイムでリソース変更を同期できます。

## アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │   Gemini CLI    │     │  Other Agents   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │    resources/listChanged notifications        │
         └───────────────────┬───────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  AEGIS Proxy   │
                    │ (Notification  │
                    │     Hub)        │
                    └───────┬────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
    │Filesystem│      │  Gmail    │     │  Drive    │
    │   MCP    │      │   MCP     │     │   MCP     │
    └──────────┘      └───────────┘     └───────────┘
```

## 主要機能

### 1. 通知の受信と処理

- 上流 MCP サーバーからの `$/notification` メッセージを検出
- `resources/listChanged` 通知を特別に処理
- 通知元サーバーの識別

### 2. キャッシュの無効化

- リソース変更通知を受けた際に内部キャッシュを自動的に無効化
- 次回のリソース要求時に最新データを取得

### 3. 通知のブロードキャスト

- 接続している全クライアントに通知を転送
- 無限ループ防止のため、送信元サーバーには再送信しない

### 4. 監査とロギング

- すべての通知ブロードキャストを監査ログに記録
- デバッグ用の詳細なログ出力

## 実装詳細

### StdioRouter の拡張

```typescript
// $/notification 形式の通知を処理
if (message.method === '$/notification' && message.params) {
  const notificationMethod = message.params.method;
  const notificationParams = message.params.params || {};
  
  if (notificationMethod === 'resources/listChanged') {
    this.emit('upstreamNotification', {
      serverName,
      notificationMethod,
      notificationParams
    });
  }
}
```

### 通知マネージャー

```typescript
private async handleUpstreamNotification(event: {
  serverName: string;
  notificationMethod: string;
  notificationParams: any;
}): Promise<void> {
  // キャッシュ無効化
  this.invalidateResourceCache(event.serverName);
  
  // クライアントへのブロードキャスト
  await this.broadcastNotificationToClients(
    event.notificationMethod,
    event.notificationParams,
    event.serverName // 送信元を除外
  );
}
```

### MCP Capabilities

```typescript
capabilities: {
  resources: {
    listChanged: true  // 通知サポートを宣言
  }
}
```

## 使用方法

### 1. AEGIS の起動

```bash
# ビルド
npm run build

# stdio モードで起動
MCP_TRANSPORT=stdio node dist/src/mcp-server.js --transport stdio
```

### 2. Claude Desktop での設定

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aegis": {
      "command": "node",
      "args": ["/path/to/aegis/dist/src/mcp-server.js", "--transport", "stdio"],
      "env": {
        "AEGIS_CONFIG_PATH": "/path/to/aegis-mcp-config.json"
      }
    }
  }
}
```

### 3. 動作確認

1. ファイルシステムで新しいファイルを作成
2. AEGIS ログで通知の受信を確認
3. 他のクライアントでリソースリストの更新を確認

## テスト

### ユニットテスト

```bash
npm test -- test/notification-hub.test.ts
```

### 統合テスト

```bash
npm run build
node test/integration/notification-hub-integration.js
```

## トラブルシューティング

### 通知が届かない場合

1. **ログレベルの確認**: `LOG_LEVEL=debug` で詳細ログを有効化
2. **上流サーバーの確認**: 上流 MCP サーバーが通知をサポートしているか確認
3. **ネットワークの確認**: ファイアウォールやプロキシの設定を確認

### 無限ループが発生する場合

- 送信元サーバーの識別が正しく行われているか確認
- `excludeServerName` パラメータが適切に設定されているか確認

## 今後の拡張

1. **より詳細な通知**: 具体的な変更内容（追加/削除/更新）を含む通知
2. **フィルタリング**: 特定のリソースタイプのみの通知購読
3. **バッチ処理**: 頻繁な通知のバッチ化
4. **永続化**: 通知履歴の保存と再生