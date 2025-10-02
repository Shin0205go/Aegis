# Research: 監査・レポート機能の強化

**Date**: 2025-10-03
**Feature**: 001-csv-json-pdf

## Research Tasks Summary

### 1. SQLite ベストプラクティス for Node.js

#### Decision: better-sqlite3
**Rationale**:
- **同期API**: より予測可能で、エラーハンドリングが容易
- **パフォーマンス**: 非同期の sqlite3 よりも2-5倍高速（ベンチマーク結果）
- **型安全性**: TypeScript型定義が充実
- **メモリ効率**: プリペアドステートメントの自動キャッシュ

**Alternatives Considered**:
- **sqlite3**: 非同期APIのみ。コールバック地獄のリスク
- **Prisma**: オーバーヘッドが大きく、シンプルな監査ログには過剰
- **TypeORM**: 設定が複雑で、軽量なSQLiteには不要

#### Decision: 大量データ最適化手法
**Rationale**:
- **インデックス戦略**: timestamp, agentId, policyName に複合インデックス
- **ページネーション**: LIMIT/OFFSET ではなく、cursor-based（timestampベース）
- **バッチ挿入**: トランザクション内で複数レコードを一括挿入
- **WALモード**: Write-Ahead Loggingで読み取りパフォーマンス向上
- **VACUUM定期実行**: 削除後のスペース再利用

**Best Practices**:
```sql
-- インデックス例
CREATE INDEX idx_timestamp ON audit_entries(timestamp DESC);
CREATE INDEX idx_agent_policy ON audit_entries(agentId, policyName);
CREATE INDEX idx_decision ON audit_entries(decision);

-- WALモード有効化
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB
```

### 2. PDF生成ライブラリ選定

#### Decision: pdfkit
**Rationale**:
- **軽量**: 依存関係が少なく、バンドルサイズ小
- **ストリーミング**: 大量データを逐次生成可能
- **カスタマイズ性**: レイアウト・フォント・画像を自由に制御
- **Node.js ネイティブ**: ブラウザ不要（puppeteer と異なる）

**Alternatives Considered**:
- **puppeteer**: 重量級（Chromiumバイナリ必要）、オーバーヘッド大
- **jsPDF**: ブラウザ向け、Node.jsでは制限あり
- **pdf-lib**: 既存PDF編集向け、新規作成には不向き

#### Decision: PDFチャート生成
**Rationale**:
- **canvas + chart.js**: サーバーサイドで canvas を使用しチャート画像生成
- **node-canvas**: Cairo ベースの canvas 実装
- **pdfkit 統合**: 生成した画像を PDF に埋め込み

**Implementation Strategy**:
```typescript
import { createCanvas } from 'canvas';
import Chart from 'chart.js/auto';

// チャート画像生成
const canvas = createCanvas(800, 400);
const chart = new Chart(canvas.getContext('2d'), config);
const imageBuffer = canvas.toBuffer('image/png');

// PDFに埋め込み
pdfDoc.image(imageBuffer, x, y, { width: 400 });
```

### 3. エクスポート性能最適化

#### Decision: ストリーミングエクスポート
**Rationale**:
- **メモリ効率**: 全データをメモリに保持せず、チャンク単位で処理
- **応答性**: 大量データでもタイムアウトしない
- **スケーラビリティ**: 100万件以上でも安定動作

**Implementation**:
- **CSV**: `csv-writer` のストリームAPI使用
- **JSON**: `JSONStream` でストリーミング出力
- **PDF**: `pdfkit` のストリームAPIで逐次生成

#### Decision: バックグラウンド処理
**Rationale**:
- **非同期ジョブ**: エクスポートリクエストをキューイング
- **ステータス追跡**: リクエストID でエクスポート進捗確認
- **ダウンロードURL**: 完了後にファイルパス返却

**Queue Strategy**:
- 当面はシンプルなインメモリキュー（`AsyncQueue`）
- 将来的には Redis/BullMQ に移行可能な設計

```typescript
class ExportQueue {
  private queue: ExportRequest[] = [];
  async enqueue(request: ExportRequest): Promise<string>;
  async processNext(): Promise<void>;
  async getStatus(requestId: string): Promise<ExportStatus>;
}
```

### 4. 既存システムとの統合

#### Decision: AdvancedAuditSystem 拡張ポイント
**Analysis**:
- **既存のインターフェース**: `AuditEntry`, `ComplianceReport` を再利用
- **拡張メソッド**: `persistToDatabase()`, `exportToFormat()` を追加
- **イベントハンドラ**: ログ生成時にデータベース永続化フックを追加

**Integration Points**:
```typescript
class AdvancedAuditSystem {
  private repository: AuditRepository; // NEW

  async recordAuditEntry(entry: AuditEntry): Promise<void> {
    // 既存: インメモリログ
    this.auditEntries.push(entry);

    // NEW: データベース永続化
    await this.repository.insert(entry);
  }
}
```

#### Decision: 既存フォーマットとの互換性
**Rationale**:
- **型定義の統一**: `src/types/audit-types.ts` で一元管理
- **マイグレーション**: 既存インメモリログを一括インポート機能
- **後方互換性**: 既存API（`getAuditEntries()`）はそのまま動作保証

**Migration Strategy**:
```typescript
async migrateExistingLogs(): Promise<void> {
  const existingLogs = this.auditEntries; // インメモリログ
  await this.repository.batchInsert(existingLogs);
  logger.info(`Migrated ${existingLogs.length} existing logs`);
}
```

## Technology Stack Summary

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Database | better-sqlite3 | ^9.0.0 | SQLite ORM |
| CSV | csv-writer | ^1.6.0 | CSV生成 |
| JSON | JSONStream | ^1.3.5 | JSON ストリーミング |
| PDF | pdfkit | ^0.14.0 | PDF生成 |
| Charts | chart.js | ^4.4.0 | チャート生成 |
| Canvas | canvas | ^2.11.2 | サーバーサイド canvas |

## Performance Targets

- **クエリ応答**: 10万件を5秒以内（インデックス最適化）
- **エクスポート**: 10万件を30秒以内（ストリーミング）
- **メモリ**: 500MB以下（チャンク処理）
- **同時実行**: 10ユーザーまで安定動作

## Security Considerations

- **SQLインジェクション対策**: プリペアドステートメント必須
- **パストラバーサル対策**: エクスポートファイル名のサニタイズ
- **認証・認可**: 既存のポリシーエンジンと統合
- **データ暗号化**: SQLite暗号化拡張（将来的に検討）

## Next Steps

- Phase 1: データモデル設計 → data-model.md
- Phase 1: API契約定義 → contracts/
- Phase 1: クイックスタートガイド → quickstart.md
