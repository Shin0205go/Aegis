# Implementation Plan: 監査・レポート機能の強化

**Branch**: `001-csv-json-pdf` | **Date**: 2025-10-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-csv-json-pdf/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✓
2. Technical Context filled ✓
   → Project Type: Single (TypeScript/Node.js backend)
   → Structure Decision: src/ directory structure
3. Constitution Check: Template only (no custom constitution) ✓
4. Constitution evaluation: No violations (template only) ✓
   → Progress Tracking: Initial Constitution Check ✓
5. Phase 0 execution → research.md ✓
6. Phase 1 execution → contracts, data-model.md, quickstart.md, CLAUDE.md ✓
7. Re-evaluate Constitution Check: No new violations ✓
   → Progress Tracking: Post-Design Constitution Check ✓
8. Plan Phase 2 → Task generation approach described ✓
9. STOP - Ready for /tasks command ✓
```

## Summary
監査・レポート機能を強化し、監査ログのデータベース永続化、高度なダッシュボード、複数フォーマット（CSV、JSON、PDF）でのエクスポート、フィルタリング・検索機能、統計サマリー表示を実装する。既存の `AdvancedAuditSystem` を拡張し、SQLiteデータベースを使用した永続化層、RESTful API、強化されたWebダッシュボードを提供する。

## Technical Context
**Language/Version**: TypeScript 5.x / Node.js 20.x (ES2022)
**Primary Dependencies**: @modelcontextprotocol/sdk, @anthropic-ai/sdk, express, better-sqlite3, pdfkit, csv-writer
**Storage**: SQLite (軽量、ファイルベース、ゼロ設定) - 監査ログ永続化用
**Testing**: Jest (既存のテストフレームワーク)
**Target Platform**: Node.js server (Linux/macOS/Windows)
**Project Type**: Single backend application
**Performance Goals**:
  - 10万件以上のログを5秒以内にクエリ可能
  - エクスポート処理は10万件で30秒以内
  - ダッシュボード初期表示は2秒以内
**Constraints**:
  - 既存の監査システムとの互換性維持
  - メモリ使用量: 大量エクスポート時でも500MB以下
  - SQLインジェクション対策必須
**Scale/Scope**:
  - 100万件以上の監査ログを想定
  - 同時接続ユーザー: 10名程度（内部管理者向け）
  - ダッシュボードページ数: 約5ページ

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: プロジェクトにカスタム憲章が存在しないため、テンプレートのみ使用。

- ✅ **Library-First**: 監査ログストレージ、エクスポート機能を独立したモジュールとして実装
- ✅ **Test-First**: 全機能に対してJestテストを先行実装
- ✅ **Simplicity**: 必要最小限の依存関係（SQLite、express、pdfkit）
- ✅ **Observability**: 構造化ログ（既存のLoggerクラス利用）

## Project Structure

### Documentation (this feature)
```
specs/001-csv-json-pdf/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── audit-storage-api.yaml
│   ├── audit-export-api.yaml
│   └── audit-dashboard-api.yaml
└── tasks.md             # Phase 2 output (/tasks command)
```

### Source Code (repository root)
```
src/
├── audit/
│   ├── storage/                      # NEW: データベース永続化層
│   │   ├── audit-database.ts         # SQLiteデータベース管理
│   │   ├── audit-repository.ts       # リポジトリパターン
│   │   └── migrations/               # スキーママイグレーション
│   ├── export/                       # NEW: エクスポート機能
│   │   ├── csv-exporter.ts           # CSV生成
│   │   ├── json-exporter.ts          # JSON生成
│   │   ├── pdf-exporter.ts           # PDF生成（チャート含む）
│   │   └── export-manager.ts         # エクスポート統合管理
│   ├── advanced-audit-system.ts      # EXISTING: 既存システム
│   ├── audit-dashboard-data.ts       # EXISTING: ダッシュボードデータ
│   └── real-time-anomaly-detector.ts # EXISTING: 異常検知
├── api/
│   ├── audit-storage-api.ts          # NEW: ストレージAPI
│   ├── audit-export-api.ts           # NEW: エクスポートAPI
│   └── audit-statistics-api.ts       # EXISTING: 統計API（拡張）
├── web/
│   └── audit-dashboard-enhanced.html # EXISTING: ダッシュボード（強化）
└── types/
    └── audit-types.ts                # NEW: 型定義の統合

tests/
├── audit/
│   ├── storage/
│   │   ├── audit-database.test.ts
│   │   └── audit-repository.test.ts
│   └── export/
│       ├── csv-exporter.test.ts
│       ├── json-exporter.test.ts
│       └── pdf-exporter.test.ts
└── api/
    ├── audit-storage-api.test.ts
    └── audit-export-api.test.ts
```

**Structure Decision**: 既存のsrc/audit/構造を拡張。新規にstorage/とexport/サブディレクトリを追加し、責務を明確に分離。SQLiteデータベースファイルはプロジェクトルートの`data/audit.db`に配置。

## Phase 0: Outline & Research

### Unknowns and Research Tasks

1. **SQLite ベストプラクティス for Node.js**
   - Task: "better-sqlite3 vs sqlite3 パッケージの比較と選定"
   - Task: "大量データ（100万件以上）のSQLite性能最適化手法"

2. **PDF生成ライブラリ選定**
   - Task: "Node.js PDFライブラリ比較（pdfkit, puppeteer, jsPDF）"
   - Task: "PDFチャート生成の実装方法（Chart.js + Canvas）"

3. **エクスポート性能最適化**
   - Task: "大量データのストリーミングエクスポート手法"
   - Task: "バックグラウンド処理とキューイング戦略"

4. **既存システムとの統合**
   - Task: "AdvancedAuditSystem の拡張ポイント調査"
   - Task: "既存の監査エントリフォーマットとの互換性確保"

**Output**: [research.md](./research.md) - 技術選定と実装戦略の詳細

## Phase 1: Design & Contracts

### 1. Data Model (`data-model.md`)

**Entities**:

- **AuditEntry** (既存型の拡張)
  - id, timestamp, context, decision, policyUsed, processingTime, outcome, metadata

- **AuditFilter** (新規)
  - dateRange, agentIds, policyNames, decisions, riskLevels, keywords

- **ExportRequest** (新規)
  - requestId, format, filters, requestedAt, status, downloadUrl

- **StatisticsSummary** (既存の強化)
  - totalRequests, allowRate, denyRate, avgProcessingTime, riskDistribution, policyBreakdown

**Relationships**:
- AuditEntry 1:N ExportRequest (1つのエクスポートリクエストは複数のエントリを含む)

**Validation Rules**:
- dateRange: startDate <= endDate
- format: enum('csv', 'json', 'pdf')
- keywords: 最大長1000文字、SQLインジェクション対策

### 2. API Contracts

**Contract Files** (OpenAPI 3.0):
- `contracts/audit-storage-api.yaml`: GET /audit/logs, POST /audit/logs, DELETE /audit/logs/:id
- `contracts/audit-export-api.yaml`: POST /audit/export, GET /audit/export/:id
- `contracts/audit-dashboard-api.yaml`: GET /audit/statistics, GET /audit/filters

### 3. Contract Tests

**Test Files**:
- `tests/api/audit-storage-api.test.ts`: ストレージAPIのリクエスト/レスポンススキーマ検証
- `tests/api/audit-export-api.test.ts`: エクスポートAPIのフロー検証
- **初期状態**: 全テスト失敗（実装前）

### 4. Integration Test Scenarios

**From User Stories**:
1. ログ永続化と取得のエンドツーエンドテスト
2. フィルタリングとページネーションのテスト
3. CSV/JSON/PDFエクスポートの統合テスト
4. 大量データ（10万件）のパフォーマンステスト

### 5. Agent File Update

**Command**: `.specify/scripts/bash/update-agent-context.sh claude`

**Updates**:
- 新規技術: SQLite (better-sqlite3), pdfkit, csv-writer
- 最近の変更: 監査・レポート機能強化
- アーキテクチャノート: ストレージ層とエクスポート層の分離

**Output**:
- [data-model.md](./data-model.md)
- [contracts/](./contracts/)
- Contract test files (failing)
- [quickstart.md](./quickstart.md)
- CLAUDE.md (updated)

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Load `.specify/templates/tasks-template.md` as base
2. Generate tasks from Phase 1 design docs:
   - Each contract (3 files) → contract test task [P]
   - Each entity (4 entities) → type definition + validation task [P]
   - Each storage function → repository method + test task
   - Each export format (3 formats) → exporter implementation + test task [P]
   - Dashboard enhancement → UI update + API integration task
   - Performance optimization → index creation + query optimization task

**Ordering Strategy**:
1. **Foundation** (parallel):
   - Type definitions
   - Database schema creation
   - Contract tests
2. **Storage Layer** (sequential):
   - Repository implementation
   - Migration scripts
   - Storage API
3. **Export Layer** (parallel per format):
   - CSV exporter
   - JSON exporter
   - PDF exporter
4. **Integration**:
   - Export manager
   - Dashboard API integration
   - UI enhancement
5. **Testing & Optimization**:
   - Integration tests
   - Performance tests
   - Documentation

**Estimated Output**: 30-35 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following TDD principles)
**Phase 5**: Validation (run all tests, execute quickstart.md, performance benchmarking)

## Complexity Tracking

No constitution violations detected. All design choices align with simplicity and library-first principles.

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---
*Based on project template - No custom constitution found*
