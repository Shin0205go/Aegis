// ============================================================================
// AEGIS - 監査・レポート機能の型定義
// ============================================================================

import { DecisionContext, PolicyDecision } from './index.js';

// ============================================================================
// 監査ログエントリ
// ============================================================================

export interface AuditEntry {
  id: string;                    // UUID v4
  timestamp: Date;               // ISO 8601形式
  context: DecisionContext;      // 判定コンテキスト
  decision: PolicyDecision;      // 判定結果
  policyUsed: string;            // 使用されたポリシー名
  processingTime: number;        // 処理時間（ミリ秒）
  outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
  metadata?: Record<string, any>; // 追加メタデータ
}

// ============================================================================
// 監査フィルタ
// ============================================================================

export interface AuditFilter {
  dateRange?: {
    start: Date;
    end: Date;
  };
  agentIds?: string[];           // エージェントIDリスト
  policyNames?: string[];        // ポリシー名リスト
  decisions?: ('PERMIT' | 'DENY' | 'INDETERMINATE')[];
  outcomes?: ('SUCCESS' | 'FAILURE' | 'ERROR')[];
  keywords?: string;             // 全文検索キーワード
  minConfidence?: number;        // 最小信頼度 (0-1)
  maxConfidence?: number;        // 最大信頼度 (0-1)
  limit?: number;                // 最大取得件数
  offset?: number;               // オフセット
  orderBy?: 'timestamp' | 'processingTime' | 'confidence';
  orderDir?: 'ASC' | 'DESC';
}

// ============================================================================
// エクスポートリクエスト
// ============================================================================

export type ExportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ExportFormat = 'csv' | 'json' | 'pdf';

export interface ExportRequest {
  requestId: string;             // UUID v4
  format: ExportFormat;
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

// ============================================================================
// 統計サマリー
// ============================================================================

export interface StatisticsSummary {
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
  avgConfidence: number;         // 0-1
  policyBreakdown: PolicyStats[];
  agentBreakdown: AgentStats[];
  hourlyDistribution: Record<string, number>; // "00"-"23" → count
  riskDistribution: {
    low: number;                 // confidence >= 0.8
    medium: number;              // 0.5 <= confidence < 0.8
    high: number;                // confidence < 0.5
  };
}

export interface PolicyStats {
  policyName: string;
  requestCount: number;
  permitRate: number;            // 0-1
  avgProcessingTime: number;     // ミリ秒
}

export interface AgentStats {
  agentId: string;
  requestCount: number;
  successRate: number;           // 0-1
  avgConfidence: number;         // 0-1
}

// ============================================================================
// API レスポンス型
// ============================================================================

export interface AuditLogsResponse {
  entries: AuditEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ExportRequestResponse {
  requestId: string;
  status: ExportStatus;
  message: string;
  estimatedCompletionTime?: Date;
}

export interface AvailableFilters {
  agentIds: string[];
  policyNames: string[];
  dateRange: {
    min: Date;
    max: Date;
  };
}

// ============================================================================
// データベース行型（SQLite用）
// ============================================================================

export interface AuditEntryRow {
  id: string;
  timestamp: number;             // Unix timestamp
  agent: string;
  action: string;
  resource: string;
  policy_used: string;
  decision: string;
  outcome: string;
  processing_time: number;
  confidence: number | null;
  context_json: string;          // JSON文字列
  decision_json: string;         // JSON文字列
  metadata_json: string | null;  // JSON文字列
  created_at: number;            // Unix timestamp
}

export interface ExportRequestRow {
  request_id: string;
  format: string;
  filters_json: string;          // JSON文字列
  requested_at: number;          // Unix timestamp
  requested_by: string | null;
  status: string;
  download_url: string | null;
  error: string | null;
  metadata_json: string | null;  // JSON文字列
  created_at: number;            // Unix timestamp
}

// ============================================================================
// エクスポーター設定
// ============================================================================

export interface ExporterConfig {
  outputPath: string;
  timeout?: number;              // ミリ秒
  chunkSize?: number;            // バッチサイズ
}

export interface CSVExporterConfig extends ExporterConfig {
  includeHeaders?: boolean;
  delimiter?: string;
}

export interface PDFExporterConfig extends ExporterConfig {
  includeCharts?: boolean;
  includeSummary?: boolean;
  pageSize?: 'A4' | 'Letter';
}
