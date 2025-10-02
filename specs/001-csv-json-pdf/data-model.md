# Data Model: 監査・レポート機能の強化

**Feature**: 001-csv-json-pdf
**Date**: 2025-10-03

## Overview

監査ログのデータベース永続化、フィルタリング、エクスポート機能に必要なデータモデルを定義します。既存の `AuditEntry` 型を拡張し、新規に `AuditFilter`、`ExportRequest`、`ExportStatus` を追加します。

## Entity Definitions

### 1. AuditEntry (既存型の拡張)

**Purpose**: ポリシー判定の詳細記録

**Fields**:
```typescript
interface AuditEntry {
  id: string;                    // UUID v4
  timestamp: Date;               // ISO 8601形式
  context: DecisionContext;      // 判定コンテキスト
  decision: PolicyDecision;      // 判定結果
  policyUsed: string;            // 使用されたポリシー名
  processingTime: number;        // 処理時間（ミリ秒）
  outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
  metadata?: Record<string, any>; // 追加メタデータ
}

interface DecisionContext {
  agent: string;
  action: string;
  resource: string;
  purpose?: string;
  time: Date;
  location?: string;
  environment: Record<string, any>;
}

interface PolicyDecision {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;            // 0-1
  constraints?: string[];
  obligations?: string[];
  metadata?: any;
}
```

**Validation Rules**:
- `id`: UUID v4形式必須
- `timestamp`: 過去日時、未来日時は不可
- `processingTime`: 0以上の整数
- `decision.confidence`: 0.0〜1.0の範囲
- `outcome`: enum値のみ許可

**Database Schema** (SQLite):
```sql
CREATE TABLE audit_entries (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  policy_used TEXT NOT NULL,
  decision TEXT NOT NULL,
  outcome TEXT NOT NULL,
  processing_time INTEGER NOT NULL,
  confidence REAL,
  context_json TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_timestamp ON audit_entries(timestamp DESC);
CREATE INDEX idx_agent_policy ON audit_entries(agent, policy_used);
CREATE INDEX idx_decision ON audit_entries(decision);
CREATE INDEX idx_outcome ON audit_entries(outcome);
```

### 2. AuditFilter (新規)

**Purpose**: 監査ログ検索・フィルタリングの条件

**Fields**:
```typescript
interface AuditFilter {
  dateRange?: {
    start: Date;
    end: Date;
  };
  agentIds?: string[];           // エージェントIDリスト
  policyNames?: string[];        // ポリシー名リスト
  decisions?: ('PERMIT' | 'DENY' | 'INDETERMINATE')[];
  outcomes?: ('SUCCESS' | 'FAILURE' | 'ERROR')[];
  keywords?: string;             // 全文検索キーワード
  minConfidence?: number;        // 最小信頼度
  maxConfidence?: number;        // 最大信頼度
  limit?: number;                // 最大取得件数
  offset?: number;               // オフセット
  orderBy?: 'timestamp' | 'processingTime' | 'confidence';
  orderDir?: 'ASC' | 'DESC';
}
```

**Validation Rules**:
- `dateRange.start <= dateRange.end`
- `keywords`: 最大1000文字、特殊文字エスケープ
- `minConfidence`, `maxConfidence`: 0.0〜1.0
- `limit`: 1〜10000（デフォルト100）
- `offset`: 0以上
- `orderBy`: enum値のみ
- `orderDir`: 'ASC' or 'DESC'

**Default Values**:
```typescript
const DEFAULT_FILTER: Partial<AuditFilter> = {
  limit: 100,
  offset: 0,
  orderBy: 'timestamp',
  orderDir: 'DESC'
};
```

### 3. ExportRequest (新規)

**Purpose**: エクスポートリクエストの追跡

**Fields**:
```typescript
interface ExportRequest {
  requestId: string;             // UUID v4
  format: 'csv' | 'json' | 'pdf';
  filters: AuditFilter;          // 適用フィルタ
  requestedAt: Date;             // リクエスト日時
  requestedBy?: string;          // リクエスト元ユーザー/エージェント
  status: ExportStatus;
  downloadUrl?: string;          // 完了後のダウンロードURL
  error?: string;                // エラーメッセージ
  metadata?: {
    totalRecords?: number;       // エクスポート対象レコード数
    fileSizeBytes?: number;      // ファイルサイズ
    processingTimeMs?: number;   // 処理時間
  };
}

type ExportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
```

**Validation Rules**:
- `format`: 'csv', 'json', 'pdf' のみ
- `status`: ExportStatus enum値のみ
- `downloadUrl`: 完了時のみ設定、有効なURL形式

**State Transitions**:
```
PENDING → PROCESSING → COMPLETED
                     → FAILED
```

**Database Schema**:
```sql
CREATE TABLE export_requests (
  request_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  requested_by TEXT,
  status TEXT NOT NULL,
  download_url TEXT,
  error TEXT,
  metadata_json TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_requested_at ON export_requests(requested_at DESC);
CREATE INDEX idx_status ON export_requests(status);
```

### 4. StatisticsSummary (既存の強化)

**Purpose**: 監査ログの集計統計

**Fields**:
```typescript
interface StatisticsSummary {
  timeRange: {
    start: Date;
    end: Date;
  };
  totalRequests: number;
  permitCount: number;
  denyCount: number;
  indeterminateCount: number;
  successCount: number;
  failureCount: number;
  errorCount: number;
  avgProcessingTime: number;     // ミリ秒
  avgConfidence: number;
  policyBreakdown: PolicyStats[];
  agentBreakdown: AgentStats[];
  hourlyDistribution: Record<string, number>; // "00"-"23" → count
  riskDistribution: {
    low: number;                 // confidence >= 0.8
    medium: number;              // 0.5 <= confidence < 0.8
    high: number;                // confidence < 0.5
  };
}

interface PolicyStats {
  policyName: string;
  requestCount: number;
  permitRate: number;            // 0-1
  avgProcessingTime: number;
}

interface AgentStats {
  agentId: string;
  requestCount: number;
  successRate: number;           // 0-1
  avgConfidence: number;
}
```

**Computed Fields**:
- `permitRate = permitCount / totalRequests`
- `denyRate = denyCount / totalRequests`
- `successRate = successCount / totalRequests`

## Entity Relationships

```
AuditEntry ──1:N──> ExportRequest
  │
  └──aggregated by──> StatisticsSummary

ExportRequest ──applies──> AuditFilter
```

**Relationship Details**:
- 1つのエクスポートリクエストは複数の監査エントリを含む（フィルタ条件による）
- StatisticsSummaryは監査エントリの集計結果
- ExportRequestはフィルタ条件を適用

## Data Access Patterns

### 1. 最新ログ取得
```typescript
repository.findLatest(limit: number): Promise<AuditEntry[]>
```

### 2. フィルタリング検索
```typescript
repository.findByFilter(filter: AuditFilter): Promise<{
  entries: AuditEntry[];
  total: number;
}>
```

### 3. 統計サマリー生成
```typescript
repository.getStatistics(
  startDate: Date,
  endDate: Date
): Promise<StatisticsSummary>
```

### 4. エクスポートリクエスト作成
```typescript
exportManager.createExportRequest(
  format: 'csv' | 'json' | 'pdf',
  filters: AuditFilter
): Promise<ExportRequest>
```

## Performance Considerations

### Indexing Strategy
- **Primary Indexes**: `timestamp`, `agent`, `policy_used`, `decision`
- **Composite Index**: `(agent, policy_used)` for policy breakdown queries
- **Full-Text Search**: SQLite FTS5 for `keywords` search

### Query Optimization
- **Cursor-based Pagination**: `timestamp` ベースのカーソルで効率的なページング
- **Materialized Views**: 統計サマリーの事前計算（hourly/daily）
- **Query Cache**: 頻繁な統計クエリのキャッシング（TTL: 5分）

### Data Lifecycle
- **Retention Policy**: デフォルト90日間保持
- **Archival**: 90日以上経過したログは別テーブルに移動
- **Deletion**: 365日以上経過したログは自動削除

## Migration Strategy

### Initial Migration
既存のインメモリログをデータベースに一括インポート：
```typescript
async migrateExistingLogs(
  existingEntries: AuditEntry[]
): Promise<void> {
  const db = await this.database.getConnection();
  const stmt = db.prepare(INSERT_AUDIT_ENTRY_SQL);

  db.transaction(() => {
    for (const entry of existingEntries) {
      stmt.run(this.toDbRow(entry));
    }
  })();
}
```

### Schema Versioning
```typescript
const SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  up: (db: Database) => void;
  down: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(CREATE_AUDIT_ENTRIES_TABLE);
      db.exec(CREATE_EXPORT_REQUESTS_TABLE);
    },
    down: (db) => {
      db.exec('DROP TABLE audit_entries');
      db.exec('DROP TABLE export_requests');
    }
  }
];
```

## Security & Privacy

- **Data Encryption**: SQLite暗号化拡張（将来的に検討）
- **PII Handling**: 個人情報を含むフィールドはマスキング可能
- **Access Control**: 既存のポリシーエンジンと統合
- **Audit Trail**: エクスポートリクエスト自体も監査対象

## Type Definitions File

全型定義は `src/types/audit-types.ts` に統合：
```typescript
// src/types/audit-types.ts
export {
  AuditEntry,
  DecisionContext,
  PolicyDecision,
  AuditFilter,
  ExportRequest,
  ExportStatus,
  StatisticsSummary,
  PolicyStats,
  AgentStats
};
```
