# Tasks: 監査・レポート機能の強化

**Feature Branch**: `001-csv-json-pdf`
**Input**: Design documents from `/specs/001-csv-json-pdf/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory ✓
   → Tech stack: TypeScript, Node.js, SQLite, Express, Jest
   → Structure: src/audit/{storage,export}, src/api, tests/
2. Load design documents ✓
   → data-model.md: 4 entities (AuditEntry, AuditFilter, ExportRequest, StatisticsSummary)
   → contracts/: 3 API contracts (storage, export, dashboard)
   → research.md: better-sqlite3, pdfkit, csv-writer decisions
3. Generate tasks by category ✓
   → Setup: 3 tasks
   → Tests: 11 tasks (contract tests, integration tests)
   → Core: 16 tasks (types, storage, export, API, auth middleware)
   → Integration: 4 tasks (DB integration, dashboard)
   → Polish: 5 tasks (unit tests, performance, docs)
4. Apply task rules ✓
   → Parallel tasks marked [P] (different files)
   → Sequential tasks (same file modifications)
   → TDD order enforced
5. Number tasks sequentially (T001-T039) ✓
6. Generate dependency graph ✓
7. Parallel execution examples ✓
8. Validation ✓
   → All contracts have tests ✓
   → All entities have type definitions ✓
   → Tests before implementation ✓
9. Return: SUCCESS (tasks ready for execution) ✓
```

---

## Phase 3.1: Setup & Dependencies

### T001: プロジェクト依存関係の追加
**File**: `package.json`
**Description**: 新規依存関係を追加
```bash
npm install better-sqlite3 pdfkit csv-writer canvas chart.js
npm install --save-dev @types/better-sqlite3 @types/pdfkit
```
**Dependencies**: None
**Test**: `npm list` で依存関係確認

### T002: データディレクトリの作成
**Files**: `data/`, `data/exports/`
**Description**: データベースとエクスポートファイル用ディレクトリを作成
```bash
mkdir -p data data/exports
```
**Dependencies**: None

### T003 [P]: TypeScript型定義ファイルの作成
**File**: `src/types/audit-types.ts`
**Description**: 監査関連の型定義を統合
- `AuditEntry`, `DecisionContext`, `PolicyDecision` (既存型を再エクスポート)
- `AuditFilter` (新規)
- `ExportRequest`, `ExportStatus` (新規)
- `StatisticsSummary`, `PolicyStats`, `AgentStats` (新規)
**Dependencies**: T001
**Test**: `tsc --noEmit` でコンパイルエラーなし

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL**: これらのテストは実装前に書かれ、必ず失敗しなければならない

### T004 [P]: AuditDatabaseテストの作成
**File**: `tests/audit/storage/audit-database.test.ts`
**Description**: SQLiteデータベース管理のテスト
- データベース初期化テスト
- スキーママイグレーションテスト
- WALモード有効化テスト
- トランザクション処理テスト
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T005 [P]: AuditRepositoryテストの作成
**File**: `tests/audit/storage/audit-repository.test.ts`
**Description**: リポジトリパターンのテスト
- `insert()`: 監査ログ挿入
- `findById()`: ID検索
- `findByFilter()`: フィルタ検索（ページネーション含む）
- `getStatistics()`: 統計サマリー生成
- `batchInsert()`: バッチ挿入
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T006 [P]: CSVExporterテストの作成
**File**: `tests/audit/export/csv-exporter.test.ts`
**Description**: CSVエクスポート機能のテスト
- ヘッダー行生成
- データ行フォーマット
- ストリーミング出力
- 大量データ（10万件）処理
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T007 [P]: JSONExporterテストの作成
**File**: `tests/audit/export/json-exporter.test.ts`
**Description**: JSONエクスポート機能のテスト
- JSON配列形式出力
- ストリーミング出力
- 大量データ処理
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T008 [P]: PDFExporterテストの作成
**File**: `tests/audit/export/pdf-exporter.test.ts`
**Description**: PDFエクスポート機能のテスト
- ヘッダー・フッター生成
- チャート画像埋め込み
- テーブルレイアウト
- 統計サマリーページ生成
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T009 [P]: ExportManagerテストの作成
**File**: `tests/audit/export/export-manager.test.ts`
**Description**: エクスポート管理のテスト
- `createExportRequest()`: リクエスト作成
- `getExportStatus()`: ステータス取得
- `processExportQueue()`: キュー処理
- エラーハンドリング
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T010 [P]: Audit Storage API契約テストの作成
**File**: `tests/api/audit-storage-api.test.ts`
**Description**: ストレージAPIのリクエスト/レスポンススキーマ検証
- `GET /api/audit/logs`: クエリパラメータバリデーション
- `POST /api/audit/logs`: リクエストボディバリデーション
- `GET /api/audit/logs/:id`: パスパラメータバリデーション
- `DELETE /api/audit/logs/:id`: 認可チェック
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T011 [P]: Audit Export API契約テストの作成
**File**: `tests/api/audit-export-api.test.ts`
**Description**: エクスポートAPIの契約テスト
- `POST /api/audit/export`: エクスポートリクエスト作成
- `GET /api/audit/export/:requestId`: ステータス取得
- `GET /api/audit/export/:requestId/download`: ファイルダウンロード
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T012 [P]: Audit Dashboard API契約テストの作成
**File**: `tests/api/audit-dashboard-api.test.ts`
**Description**: ダッシュボードAPIの契約テスト
- `GET /api/audit/statistics`: 統計サマリー取得
- `GET /api/audit/statistics/policies`: ポリシー別統計
- `GET /api/audit/statistics/agents`: エージェント別統計
- `GET /api/audit/filters/available`: 利用可能フィルタ値
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T013 [P]: 統合テスト: ログ永続化とフィルタリング
**File**: `tests/integration/audit-persistence.test.ts`
**Description**: エンドツーエンドの永続化・検索フロー
- ログ生成 → DB保存 → フィルタ検索 → 結果検証
- 日付範囲フィルタ
- エージェントIDフィルタ
- キーワード検索
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

### T014 [P]: 統合テスト: エクスポート機能
**File**: `tests/integration/audit-export.test.ts`
**Description**: 全エクスポート形式のエンドツーエンドテスト
- CSV/JSON/PDFエクスポートリクエスト作成
- 非同期処理完了待機
- ファイル生成検証
- フィルタ条件反映検証
**Dependencies**: T003
**Expected**: 全テスト失敗（実装前）

---

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### T015: AuditDatabaseの実装
**File**: `src/audit/storage/audit-database.ts`
**Description**: SQLiteデータベース管理クラス
- `initialize()`: DB初期化、スキーマ作成
- `getConnection()`: コネクション取得
- `runMigrations()`: マイグレーション実行
- WALモード設定、パフォーマンス最適化
**Dependencies**: T004 (テスト失敗確認)
**Test**: `npm test -- audit-database.test.ts` → 全テスト成功

### T016: マイグレーションスクリプトの作成
**File**: `src/audit/storage/migrations/001_initial_schema.ts`
**Description**: 初期スキーママイグレーション
- `audit_entries` テーブル作成
- `export_requests` テーブル作成
- インデックス作成
**Dependencies**: T015
**Test**: マイグレーション実行後、スキーマ確認

### T017: AuditRepositoryの実装
**File**: `src/audit/storage/audit-repository.ts`
**Description**: リポジトリパターン実装
- `insert(entry)`: 単一挿入
- `batchInsert(entries)`: バッチ挿入
- `findById(id)`: ID検索
- `findByFilter(filter)`: フィルタ検索（SQLインジェクション対策）
- `getStatistics(start, end)`: 統計サマリー生成
**Dependencies**: T005 (テスト失敗確認), T015
**Test**: `npm test -- audit-repository.test.ts` → 全テスト成功

### T018 [P]: CSVExporterの実装
**File**: `src/audit/export/csv-exporter.ts`
**Description**: CSV生成クラス
- `export(entries, outputPath)`: CSVファイル生成
- ストリーミングAPI使用（csv-writer）
- ヘッダー行、データ行フォーマット
**Dependencies**: T006 (テスト失敗確認)
**Test**: `npm test -- csv-exporter.test.ts` → 全テスト成功

### T019 [P]: JSONExporterの実装
**File**: `src/audit/export/json-exporter.ts`
**Description**: JSON生成クラス
- `export(entries, outputPath)`: JSONファイル生成
- ストリーミングAPI使用（JSONStream）
**Dependencies**: T007 (テスト失敗確認)
**Test**: `npm test -- json-exporter.test.ts` → 全テスト成功

### T020 [P]: PDFExporterの実装
**File**: `src/audit/export/pdf-exporter.ts`
**Description**: PDF生成クラス
- `export(entries, statistics, outputPath)`: PDFレポート生成
- チャート画像生成（canvas + chart.js）
- pdfkit でレイアウト作成
**Dependencies**: T008 (テスト失敗確認)
**Test**: `npm test -- pdf-exporter.test.ts` → 全テスト成功

### T021: ExportManagerの実装
**File**: `src/audit/export/export-manager.ts`
**Description**: エクスポート統合管理
- `createExportRequest(format, filters)`: リクエスト作成
- `getExportStatus(requestId)`: ステータス取得
- `processExportQueue()`: 非同期キュー処理
- エクスポーターのファクトリーパターン
**Dependencies**: T009 (テスト失敗確認), T018, T019, T020
**Test**: `npm test -- export-manager.test.ts` → 全テスト成功

### T022: Audit Storage APIの実装
**File**: `src/api/audit-storage-api.ts`
**Description**: ストレージAPIエンドポイント
- `GET /api/audit/logs`: フィルタリング検索
- `POST /api/audit/logs`: ログ作成
- `GET /api/audit/logs/:id`: ID検索
- `DELETE /api/audit/logs/:id`: ログ削除（管理者のみ）
- バリデーション、エラーハンドリング
**Dependencies**: T010 (テスト失敗確認), T017
**Test**: `npm test -- audit-storage-api.test.ts` → 全テスト成功

### T023: Audit Export APIの実装
**File**: `src/api/audit-export-api.ts`
**Description**: エクスポートAPIエンドポイント
- `POST /api/audit/export`: エクスポートリクエスト作成
- `GET /api/audit/export/:requestId`: ステータス取得
- `GET /api/audit/export/:requestId/download`: ファイルダウンロード
- `GET /api/audit/export/list`: リクエスト一覧
**Dependencies**: T011 (テスト失敗確認), T021
**Test**: `npm test -- audit-export-api.test.ts` → 全テスト成功

### T024: Audit Statistics APIの拡張
**File**: `src/api/audit-statistics-api.ts`
**Description**: 既存の統計APIを拡張
- `GET /api/audit/statistics`: 統計サマリー（データベースから取得）
- `GET /api/audit/statistics/policies`: ポリシー別統計
- `GET /api/audit/statistics/agents`: エージェント別統計
- `GET /api/audit/filters/available`: 利用可能フィルタ値
**Dependencies**: T012 (テスト失敗確認), T017
**Test**: `npm test -- audit-dashboard-api.test.ts` → 全テスト成功

### T024a: 権限チェックミドルウェアの実装
**File**: `src/api/audit-auth-middleware.ts`
**Description**: 監査API用の認証・認可ミドルウェア
- ロールベースアクセス制御（RBAC）実装
- 削除操作（DELETE）は管理者ロールのみ許可
- 読み取り操作は監査担当者以上のロール許可
- 認可失敗時は403 Forbiddenを返却
- 既存のポリシーエンジンとの統合
**Dependencies**: T022, T023, T024
**Test**: 権限なしユーザーのアクセス拒否を確認

---

## Phase 3.4: Integration & Enhancement

### T025: AdvancedAuditSystemへのDB永続化統合
**File**: `src/audit/advanced-audit-system.ts`
**Description**: 既存の監査システムにDB永続化を統合
- `recordAuditEntry()`にリポジトリ永続化を追加
- `migrateExistingLogs()`: 既存インメモリログの一括移行
- 後方互換性維持
**Dependencies**: T017
**Test**: 既存テスト + 新規永続化テスト

### T026: MCPプロキシへのAPI統合
**File**: `src/mcp/http-proxy.ts`, `src/server.ts`
**Description**: HTTPサーバーに新規APIエンドポイントを追加
- Storage API ルート登録
- Export API ルート登録
- Statistics API ルート登録
**Dependencies**: T022, T023, T024
**Test**: サーバー起動後、`curl` でエンドポイント確認

### T027: ダッシュボードHTMLの強化
**File**: `src/web/audit-dashboard-enhanced.html`
**Description**: 既存ダッシュボードにエクスポート機能を追加
- フィルタUIの追加（日付範囲、エージェント、ポリシー）
- エクスポートボタン（CSV/JSON/PDF）
- ステータス表示、ダウンロードリンク
- JavaScript でAPI呼び出し
**Dependencies**: T026
**Test**: ブラウザで手動テスト

### T028: 環境変数設定の追加
**File**: `.env.example`, `src/utils/config.ts`
**Description**: データベースパス等の設定を追加
- `AUDIT_DB_PATH`: データベースファイルパス（デフォルト: `data/audit.db`）
- `EXPORT_DIR`: エクスポートファイル出力先（デフォルト: `data/exports`）
- `EXPORT_TTL`: エクスポートファイルの保持期間（デフォルト: 7日）
**Dependencies**: None
**Test**: 環境変数読み込みテスト

---

## Phase 3.5: Polish & Validation

### T029 [P]: AuditFilterバリデーションユニットテストの作成
**File**: `tests/unit/audit-filter-validation.test.ts`
**Description**: フィルタバリデーションロジックのユニットテスト
- 日付範囲チェック（start <= end）
- キーワード長制限
- confidence範囲チェック
- SQLインジェクション対策確認
**Dependencies**: T017
**Test**: `npm test -- audit-filter-validation.test.ts`

### T030 [P]: パフォーマンステスト: 大量データクエリ
**File**: `tests/performance/audit-query-performance.test.ts`
**Description**: 10万件データでのクエリパフォーマンステスト
- 10万件挿入
- フィルタ検索（< 5秒）
- 統計サマリー生成（< 10秒）
**Dependencies**: T017
**Test**: `npm test -- audit-query-performance.test.ts`

### T031 [P]: パフォーマンステスト: エクスポート処理
**File**: `tests/performance/audit-export-performance.test.ts`
**Description**: 10万件データでのエクスポートパフォーマンステスト
- CSV: < 20秒
- JSON: < 25秒
- PDF: < 30秒
- メモリ使用量: < 500MB
**Dependencies**: T021
**Test**: `npm test -- audit-export-performance.test.ts`

### T032: 統合テストの実行と検証
**Files**: `tests/integration/*.test.ts`
**Description**: 全統合テストを実行し、エンドツーエンドフローを検証
- T013: ログ永続化とフィルタリング
- T014: エクスポート機能
**Dependencies**: T013, T014, T025
**Test**: `npm run test:e2e`

### T033: READMEの更新
**File**: `README.md`
**Description**: 監査・レポート機能の使用方法を追記
- セットアップ手順
- API使用例
- ダッシュボードアクセス方法
**Dependencies**: T027
**Test**: ドキュメント確認

### T034 [P]: API仕様ドキュメントの生成
**File**: `docs/api/audit-apis.md`
**Description**: OpenAPI仕様から自動生成、またはマークダウン手動作成
- Storage API仕様
- Export API仕様
- Dashboard API仕様
**Dependencies**: T022, T023, T024
**Test**: ドキュメント確認

### T035: Quickstartガイドの実行
**File**: `specs/001-csv-json-pdf/quickstart.md`
**Description**: クイックスタートガイドの全コマンドを実際に実行して動作確認
**Dependencies**: T026, T027
**Test**: 全コマンド実行成功

### T036: コードの重複排除とリファクタリング
**Files**: `src/audit/**/*.ts`
**Description**: 実装中の重複コードを抽出し、共通ユーティリティに移動
- 日付フォーマット関数
- バリデーション関数
- エラーハンドリングヘルパー
**Dependencies**: T025
**Test**: 既存テスト全パス

### T037: ESLint・Prettierの実行
**Files**: `src/**/*.ts`, `tests/**/*.ts`
**Description**: コードスタイルの統一
```bash
npm run lint
npm run format
```
**Dependencies**: All implementation tasks
**Test**: `npm run lint` エラーなし

### T038: 全テストスイートの実行
**Files**: All test files
**Description**: 全テスト（ユニット、統合、E2E、パフォーマンス）を実行
```bash
npm test
npm run test:e2e
```
**Dependencies**: All tasks
**Test**: 全テスト成功、カバレッジ > 80%

---

## Dependencies Graph

```
Setup Layer:
T001 → T002, T003

Test Layer (TDD - must fail first):
T003 → T004, T005, T006, T007, T008, T009 [P]
T003 → T010, T011, T012 [P]
T003 → T013, T014 [P]

Core Implementation:
T004 → T015 → T016 → T017
T005 → T017
T006 → T018 [P]
T007 → T019 [P]
T008 → T020 [P]
T009, T018, T019, T020 → T021

API Layer:
T010, T017 → T022
T011, T021 → T023
T012, T017 → T024
T022, T023, T024 → T024a

Integration:
T017 → T025
T024a → T026 → T027
T028 (independent)

Polish:
T017 → T029, T030 [P]
T021 → T031 [P]
T013, T014, T025 → T032
T027 → T033
T022, T023, T024 → T034 [P]
T026, T027 → T035
T025 → T036
All implementation → T037 → T038
```

---

## Parallel Execution Examples

### Example 1: Test Creation (Phase 3.2)
```bash
# Launch T004-T012 in parallel (all different files):
Task: "Create AuditDatabase test in tests/audit/storage/audit-database.test.ts"
Task: "Create AuditRepository test in tests/audit/storage/audit-repository.test.ts"
Task: "Create CSVExporter test in tests/audit/export/csv-exporter.test.ts"
Task: "Create JSONExporter test in tests/audit/export/json-exporter.test.ts"
Task: "Create PDFExporter test in tests/audit/export/pdf-exporter.test.ts"
Task: "Create ExportManager test in tests/audit/export/export-manager.test.ts"
Task: "Create Storage API contract test in tests/api/audit-storage-api.test.ts"
Task: "Create Export API contract test in tests/api/audit-export-api.test.ts"
Task: "Create Dashboard API contract test in tests/api/audit-dashboard-api.test.ts"
```

### Example 2: Exporter Implementation (Phase 3.3)
```bash
# Launch T018-T020 in parallel (independent modules):
Task: "Implement CSVExporter in src/audit/export/csv-exporter.ts"
Task: "Implement JSONExporter in src/audit/export/json-exporter.ts"
Task: "Implement PDFExporter in src/audit/export/pdf-exporter.ts"
```

### Example 3: Performance Tests (Phase 3.5)
```bash
# Launch T030-T031 in parallel:
Task: "Create query performance test in tests/performance/audit-query-performance.test.ts"
Task: "Create export performance test in tests/performance/audit-export-performance.test.ts"
```

---

## Validation Checklist

**GATE**: Checked before marking tasks complete

- [x] All contracts have corresponding tests (T010-T012)
- [x] All entities have type definitions (T003)
- [x] All tests come before implementation (Phase 3.2 → 3.3)
- [x] Parallel tasks truly independent (different files, no shared state)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Dependencies properly tracked
- [x] TDD cycle enforced (tests fail → implement → tests pass)

---

## Notes

- **[P] tasks**: Different files, no dependencies → can run in parallel
- **TDD mandatory**: Verify tests fail before implementing
- **Commit after each task**: Maintain clean git history
- **Performance targets**:
  - Query: 10万件 < 5秒
  - Export: 10万件 < 30秒
  - Memory: < 500MB
- **Security**: SQLインジェクション対策、入力サニタイゼーション必須

---

**Total Tasks**: 39
**Estimated Duration**: 3-4 days (with parallel execution)
**Test Coverage Goal**: > 80%

---

**Last Updated**: 2025-10-03
