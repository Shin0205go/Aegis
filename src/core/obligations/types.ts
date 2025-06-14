import { DecisionContext, PolicyDecision } from '../../types';

/**
 * 義務エグゼキューターのインターフェース
 */
export interface ObligationExecutor {
  /**
   * エグゼキューター名
   */
  name: string;

  /**
   * サポートする義務タイプ
   */
  supportedTypes: string[];

  /**
   * この義務を実行できるかチェック
   */
  canExecute(obligation: string): boolean;

  /**
   * 義務を実行
   */
  execute(
    obligation: string, 
    context: DecisionContext, 
    decision: PolicyDecision
  ): Promise<ObligationResult>;

  /**
   * 初期化
   */
  initialize?(config: any): Promise<void>;

  /**
   * クリーンアップ
   */
  cleanup?(): Promise<void>;
}

/**
 * 義務定義
 */
export interface ObligationDefinition {
  id: string;
  type: string;
  description?: string;
  parameters?: Record<string, any>;
  priority?: number;
  async?: boolean; // 非同期実行するか
  failureAction?: 'ignore' | 'retry' | 'escalate';
}

/**
 * 義務実行結果
 */
export interface ObligationResult {
  success: boolean;
  executedAt: Date;
  error?: string;
  metadata?: Record<string, any>;
  retryable?: boolean;
}

/**
 * 義務エグゼキューター設定
 */
export interface ObligationExecutorConfig {
  enabled: boolean;
  config?: Record<string, any>;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * 通知設定
 */
export interface NotificationConfig {
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'teams';
  recipients?: string[];
  webhookUrl?: string;
  channel?: string;
  template?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * 監査ログ設定
 */
export interface AuditLogConfig {
  destination: 'file' | 'database' | 'siem' | 'cloud';
  format: 'json' | 'csv' | 'syslog';
  includeFullContext?: boolean;
  encryptLogs?: boolean;
  retentionDays?: number;
}

/**
 * レポート生成設定
 */
export interface ReportConfig {
  type: 'access' | 'compliance' | 'security' | 'usage';
  format: 'pdf' | 'excel' | 'csv' | 'html';
  schedule?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  recipients?: string[];
  includeCharts?: boolean;
}

/**
 * データライフサイクル設定
 */
export interface DataLifecycleConfig {
  action: 'archive' | 'delete' | 'anonymize' | 'export';
  retentionPeriod?: number; // 日数
  archiveLocation?: string;
  notifyBeforeAction?: boolean;
  notifyDays?: number;
}

/**
 * エスカレーション設定
 */
export interface EscalationConfig {
  levels: EscalationLevel[];
  initialDelayMinutes?: number;
}

export interface EscalationLevel {
  level: number;
  recipients: string[];
  method: 'email' | 'sms' | 'phone' | 'slack';
  delayMinutes?: number;
  message?: string;
}