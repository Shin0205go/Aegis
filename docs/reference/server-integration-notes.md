# サーバー統合について

## 概要

2025年6月20日、AEGISのアーキテクチャを簡素化するため、以下の2つのサーバーを1つに統合しました：

1. **APIサーバー** (ポート3000) - `src/api/server.ts`
2. **MCPプロキシサーバー** (ポート8080) - `src/mcp/http-proxy.ts`

## 統合後のアーキテクチャ

### 統合サーバー (ポート8080)

`src/mcp/http-proxy.ts` に全機能を集約：

- **MCPプロキシ機能**
  - `/mcp/messages` - MCP通信エンドポイント
  - MCPリクエストのインターセプトとポリシー制御

- **Web UI配信**
  - `/` - 監査ダッシュボードへのリダイレクト
  - `/audit-dashboard.html` - 監査ダッシュボード
  - `/request-dashboard.html` - リクエストダッシュボード
  - 静的ファイル配信（`web/public/` と `public/`）

- **API機能**
  - `/api/policies/*` - ポリシー管理API（CRUD操作）
  - `/api/policies/analyze` - ポリシー分析API
  - `/api/policies/test` - ポリシーテストAPI
  - `/api/audit/*` - 監査データAPI
  - `/odrl/*` - ODRLポリシーAPI

- **その他**
  - `/health` - ヘルスチェック
  - `/policies` - レガシーポリシー管理（後方互換性）

## 移行による利点

1. **運用の簡素化**
   - 管理するサーバープロセスが1つに
   - ポート管理が単純化（8080のみ）
   - デプロイメントが容易に

2. **リソース効率**
   - メモリ使用量の削減
   - プロセス間通信の削除

3. **開発効率**
   - コードベースの簡素化
   - デバッグの容易化
   - テストの簡素化

## 使用方法

### 起動コマンド

```bash
# 統合サーバー起動（HTTP モード）
npm run start:mcp:http

# 開発モード
npm run dev:mcp:http

# Claude Desktop用（stdio モード）
node mcp-launcher.js
```

### アクセスURL

- Web UI: http://localhost:8080/
- ポリシー管理API: http://localhost:8080/api/policies
- 監査API: http://localhost:8080/api/audit
- MCPエンドポイント: http://localhost:8080/mcp/messages
- ODRLエンドポイント: http://localhost:8080/odrl

## 廃止されたコマンド

以下のコマンドは使用できなくなりました：

- `npm run start:api` - エラーメッセージを表示
- `npm run dev:api` - エラーメッセージを表示
- `npm run start:web` - エラーメッセージを表示
- `npm run dev:web` - エラーメッセージを表示

## 注意事項

1. **ポート変更**
   - Web UIのポートが3000から8080に変更されました
   - 既存のブックマークやスクリプトの更新が必要です

2. **設定変更**
   - `PORT` 環境変数は使用されません
   - `MCP_PROXY_HTTP_PORT` を使用してください（デフォルト: 8080）

3. **React開発サーバー**
   - `web/vite.config.ts` のプロキシ設定を更新済み
   - 開発時は localhost:3001 から localhost:8080 へプロキシ

## トラブルシューティング

### ポート競合

```bash
# 別のポートで起動
MCP_PROXY_HTTP_PORT=8081 npm run start:mcp:http
```

### 旧サーバーへのアクセス

旧APIサーバー（ポート3000）にアクセスしようとすると、廃止メッセージが表示されます。新しいURL（ポート8080）を使用してください。

## 今後の計画

- WebSocket対応の追加
- GraphQL APIの追加検討
- パフォーマンス最適化