# Quickstart: 監査・レポート機能の強化

**Feature**: 001-csv-json-pdf
**Date**: 2025-10-03

## 🚀 クイックスタートガイド

このガイドでは、監査・レポート機能の基本的な使用方法を説明します。

## 前提条件

- Node.js 20.x以上
- TypeScript 5.x
- AEGIS Policy Engine がビルド済み

## セットアップ

### 1. 依存関係のインストール

```bash
npm install better-sqlite3 pdfkit csv-writer canvas chart.js
npm install --save-dev @types/better-sqlite3 @types/pdfkit
```

### 2. データベース初期化

```bash
# プロジェクトルートで実行
mkdir -p data
node dist/src/audit/storage/audit-database.js --init
```

### 3. サーバー起動

```bash
npm run build
npm run start:mcp:http
```

サーバーは `http://localhost:3000` で起動します。

## 基本的な使用例

### 1. 監査ログの検索

```bash
# 最新100件を取得
curl http://localhost:3000/api/audit/logs?limit=100

# 日付範囲でフィルタリング
curl "http://localhost:3000/api/audit/logs?startDate=2025-10-01T00:00:00Z&endDate=2025-10-03T23:59:59Z"

# エージェントIDでフィルタリング
curl "http://localhost:3000/api/audit/logs?agentIds=claude-desktop,mcp-client"

# 決定結果でフィルタリング
curl "http://localhost:3000/api/audit/logs?decisions=DENY"

# キーワード検索
curl "http://localhost:3000/api/audit/logs?keywords=customer%20data"
```

### 2. 統計サマリーの取得

```bash
# 期間指定の統計サマリー
curl "http://localhost:3000/api/audit/statistics?startDate=2025-10-01T00:00:00Z&endDate=2025-10-03T23:59:59Z"

# ポリシー別統計
curl "http://localhost:3000/api/audit/statistics/policies?startDate=2025-10-01T00:00:00Z&endDate=2025-10-03T23:59:59Z&limit=10"

# エージェント別統計
curl "http://localhost:3000/api/audit/statistics/agents?startDate=2025-10-01T00:00:00Z&endDate=2025-10-03T23:59:59Z&limit=10"
```

### 3. エクスポート機能

#### CSV エクスポート

```bash
# エクスポートリクエストの作成
curl -X POST http://localhost:3000/api/audit/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv",
    "filters": {
      "dateRange": {
        "start": "2025-10-01T00:00:00Z",
        "end": "2025-10-03T23:59:59Z"
      },
      "decisions": ["PERMIT", "DENY"]
    },
    "requestedBy": "admin"
  }'

# レスポンス例
# {
#   "requestId": "550e8400-e29b-41d4-a716-446655440000",
#   "status": "PENDING",
#   "message": "Export request created successfully"
# }

# ステータス確認
curl http://localhost:3000/api/audit/export/550e8400-e29b-41d4-a716-446655440000

# ダウンロード（完了後）
curl http://localhost:3000/api/audit/export/550e8400-e29b-41d4-a716-446655440000/download \
  -o audit-export.csv
```

#### JSON エクスポート

```bash
curl -X POST http://localhost:3000/api/audit/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "filters": {
      "dateRange": {
        "start": "2025-10-01T00:00:00Z",
        "end": "2025-10-03T23:59:59Z"
      }
    }
  }'
```

#### PDF レポートエクスポート

```bash
curl -X POST http://localhost:3000/api/audit/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "pdf",
    "filters": {
      "dateRange": {
        "start": "2025-10-01T00:00:00Z",
        "end": "2025-10-03T23:59:59Z"
      }
    },
    "requestedBy": "security-team"
  }'

# ダウンロード
curl http://localhost:3000/api/audit/export/{requestId}/download \
  -o audit-report.pdf
```

### 4. ダッシュボード表示

ブラウザで以下にアクセス：

```
http://localhost:3000/audit-dashboard-enhanced.html
```

ダッシュボードでは以下の機能が利用可能：
- リアルタイム統計サマリー
- 時間別・ポリシー別・エージェント別の分布チャート
- フィルタリング・検索機能
- CSV/JSON/PDFエクスポート

## プログラマティックな使用

### TypeScript/Node.js での使用例

```typescript
import { AuditRepository } from './src/audit/storage/audit-repository';
import { ExportManager } from './src/audit/export/export-manager';
import { AuditFilter } from './src/types/audit-types';

// リポジトリの初期化
const repository = new AuditRepository();

// 監査ログの検索
const filter: AuditFilter = {
  dateRange: {
    start: new Date('2025-10-01'),
    end: new Date('2025-10-03')
  },
  decisions: ['PERMIT', 'DENY'],
  limit: 100,
  offset: 0
};

const { entries, total } = await repository.findByFilter(filter);
console.log(`Found ${total} entries, showing ${entries.length}`);

// 統計サマリーの取得
const statistics = await repository.getStatistics(
  new Date('2025-10-01'),
  new Date('2025-10-03')
);

console.log(`Total requests: ${statistics.totalRequests}`);
console.log(`Permit rate: ${(statistics.permitCount / statistics.totalRequests * 100).toFixed(2)}%`);

// エクスポートの実行
const exportManager = new ExportManager();
const exportRequest = await exportManager.createExportRequest('csv', filter);
console.log(`Export request created: ${exportRequest.requestId}`);

// エクスポート完了待機（ポーリング）
let status = await exportManager.getExportStatus(exportRequest.requestId);
while (status.status === 'PENDING' || status.status === 'PROCESSING') {
  await new Promise(resolve => setTimeout(resolve, 1000));
  status = await exportManager.getExportStatus(exportRequest.requestId);
}

if (status.status === 'COMPLETED') {
  console.log(`Export completed: ${status.downloadUrl}`);
} else {
  console.error(`Export failed: ${status.error}`);
}
```

## テスト実行

### ユニットテスト

```bash
npm test -- src/audit/storage/audit-repository.test.ts
npm test -- src/audit/export/csv-exporter.test.ts
```

### 統合テスト

```bash
npm run test:e2e -- test/audit/export-integration.test.ts
```

### パフォーマンステスト

```bash
# 10万件のログを生成してパフォーマンステスト
node dist/test/performance/audit-load-test.js --records 100000
```

## トラブルシューティング

### データベースエラー

```bash
# データベースファイルの確認
ls -lh data/audit.db

# データベースの再初期化（注意：全データ削除）
rm data/audit.db
node dist/src/audit/storage/audit-database.js --init
```

### エクスポートタイムアウト

大量データのエクスポートがタイムアウトする場合：

```typescript
// タイムアウト時間の延長
const exportManager = new ExportManager({
  timeout: 300000 // 5分
});
```

### メモリ不足

```bash
# Node.js ヒープサイズの増加
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## 次のステップ

- [data-model.md](./data-model.md) - データモデルの詳細
- [contracts/](./contracts/) - API仕様の詳細
- [plan.md](./plan.md) - 実装計画の全体像

## サポート

問題が発生した場合は、以下を確認：
1. ログファイル: `logs/audit-system.log`
2. データベースファイル: `data/audit.db`
3. エクスポートファイル: `data/exports/`

---

**Last Updated**: 2025-10-03
