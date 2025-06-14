import { ObligationExecutor, ObligationResult, AuditLogConfig } from '../types';
import { DecisionContext, PolicyDecision } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 監査ログ義務エグゼキューター
 * アクセスログや監査証跡を記録
 */
export class AuditLoggerExecutor implements ObligationExecutor {
  public readonly name = 'AuditLogger';
  public readonly supportedTypes = [
    'audit-log',
    'access-log',
    'security-log',
    'compliance-log'
  ];

  private logger: Logger;
  private config: AuditLoggerConfig;
  private logQueue: AuditLogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger();
    this.config = {
      destination: 'file',
      format: 'json',
      logPath: path.join(process.cwd(), 'logs', 'audit'),
      flushIntervalMs: 5000,
      maxQueueSize: 100,
      includeFullContext: false,
      encryptLogs: false
    };
  }

  async initialize(config: AuditLoggerConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    // ログディレクトリの作成
    if (this.config.destination === 'file') {
      await this.ensureLogDirectory();
    }

    // 定期フラッシュの開始
    this.startFlushInterval();

    this.logger.info('AuditLoggerエグゼキューター初期化完了', this.config);
  }

  canExecute(obligation: string): boolean {
    const lowerObligation = obligation.toLowerCase();
    return (
      lowerObligation.includes('ログ記録') ||
      lowerObligation.includes('監査') ||
      lowerObligation.includes('log') ||
      lowerObligation.includes('audit') ||
      lowerObligation.includes('アクセスログ')
    );
  }

  async execute(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationResult> {
    try {
      const logEntry = this.createLogEntry(obligation, context, decision);
      
      // 暗号化が有効な場合
      if (this.config.encryptLogs) {
        logEntry.data = this.encryptData(logEntry.data);
        logEntry.encrypted = true;
      }

      // キューに追加
      this.logQueue.push(logEntry);

      // キューサイズが限界に達したら即座にフラッシュ
      if (this.logQueue.length >= this.config.maxQueueSize) {
        await this.flush();
      }

      return {
        success: true,
        executedAt: new Date(),
        metadata: {
          logId: logEntry.id,
          destination: this.config.destination
        }
      };

    } catch (error) {
      this.logger.error('監査ログ記録エラー', error);
      return {
        success: false,
        executedAt: new Date(),
        error: `監査ログ記録失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
        retryable: true
      };
    }
  }

  private createLogEntry(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): AuditLogEntry {
    const severity = this.determineSeverity(obligation, decision);
    
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      severity,
      obligation,
      data: {
        agent: context.agent,
        action: context.action,
        resource: context.resource,
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        purpose: context.purpose
      }
    };

    // フルコンテキストを含める場合
    if (this.config.includeFullContext) {
      entry.data.fullContext = {
        ...context,
        environment: { ...context.environment }
      };
    }

    // 特定の義務タイプに応じた追加情報
    if (obligation.includes('機密アクセス')) {
      entry.data.sensitivityLevel = context.environment?.sensitivityLevel;
      entry.data.dataClassification = context.environment?.dataClassification;
    }

    if (obligation.includes('セキュリティ')) {
      entry.data.clientIP = context.environment?.clientIP;
      entry.data.sessionId = context.environment?.sessionId;
      entry.data.authMethod = context.environment?.authMethod;
    }

    return entry;
  }

  private determineSeverity(
    obligation: string,
    decision: PolicyDecision
  ): 'info' | 'warning' | 'error' | 'critical' {
    if (obligation.includes('機密') || obligation.includes('critical')) {
      return 'critical';
    }
    if (decision.decision === 'DENY') {
      return 'warning';
    }
    if (obligation.includes('セキュリティ') || obligation.includes('security')) {
      return 'warning';
    }
    return 'info';
  }

  private encryptData(data: any): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      this.config.encryptionKey || 'default-key',
      'salt',
      32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    });
  }

  private async flush(): Promise<void> {
    if (this.logQueue.length === 0) {
      return;
    }

    const logsToFlush = [...this.logQueue];
    this.logQueue = [];

    try {
      switch (this.config.destination) {
        case 'file':
          await this.writeToFile(logsToFlush);
          break;
        case 'database':
          await this.writeToDatabase(logsToFlush);
          break;
        case 'siem':
          await this.sendToSIEM(logsToFlush);
          break;
        case 'cloud':
          await this.sendToCloudLogging(logsToFlush);
          break;
      }
    } catch (error) {
      this.logger.error('ログフラッシュエラー', error);
      // エラー時はキューに戻す
      this.logQueue = [...logsToFlush, ...this.logQueue];
    }
  }

  private async writeToFile(logs: AuditLogEntry[]): Promise<void> {
    const fileName = this.getLogFileName();
    const filePath = path.join(this.config.logPath, fileName);
    
    let content = '';
    switch (this.config.format) {
      case 'json':
        content = logs.map(log => JSON.stringify(log)).join('\n') + '\n';
        break;
      case 'csv':
        content = this.formatAsCSV(logs);
        break;
      case 'syslog':
        content = this.formatAsSyslog(logs);
        break;
    }

    await fs.appendFile(filePath, content, 'utf8');
  }

  private getLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const extension = this.config.format === 'csv' ? 'csv' : 'log';
    return `audit-${dateStr}.${extension}`;
  }

  private formatAsCSV(logs: AuditLogEntry[]): string {
    const headers = [
      'timestamp', 'id', 'severity', 'obligation',
      'agent', 'action', 'resource', 'decision', 'reason'
    ];
    
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.id,
      log.severity,
      log.obligation,
      log.data.agent,
      log.data.action,
      log.data.resource,
      log.data.decision,
      log.data.reason
    ]);

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n') + '\n';
  }

  private formatAsSyslog(logs: AuditLogEntry[]): string {
    return logs.map(log => {
      const facility = 16; // local0
      const severity = this.getSyslogSeverity(log.severity);
      const priority = facility * 8 + severity;
      
      return `<${priority}>${log.timestamp.toISOString()} ${process.env.HOSTNAME || 'aegis'} aegis-audit[${process.pid}]: ${JSON.stringify(log.data)}`;
    }).join('\n') + '\n';
  }

  private getSyslogSeverity(severity: string): number {
    const severityMap: Record<string, number> = {
      'critical': 2,
      'error': 3,
      'warning': 4,
      'info': 6
    };
    return severityMap[severity] || 6;
  }

  private async writeToDatabase(logs: AuditLogEntry[]): Promise<void> {
    // TODO: データベース実装
    this.logger.info(`データベースに${logs.length}件のログを書き込み`);
  }

  private async sendToSIEM(logs: AuditLogEntry[]): Promise<void> {
    // TODO: SIEM連携実装
    this.logger.info(`SIEMに${logs.length}件のログを送信`);
  }

  private async sendToCloudLogging(logs: AuditLogEntry[]): Promise<void> {
    // TODO: クラウドロギング実装
    this.logger.info(`クラウドに${logs.length}件のログを送信`);
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.logPath, { recursive: true });
    } catch (error) {
      this.logger.error('ログディレクトリ作成エラー', error);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, this.config.flushIntervalMs);
  }

  async cleanup(): Promise<void> {
    // 最後のフラッシュ
    await this.flush();
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    this.logger.info('AuditLoggerエグゼキュータークリーンアップ完了');
  }
}

interface AuditLoggerConfig extends AuditLogConfig {
  logPath: string;
  flushIntervalMs: number;
  maxQueueSize: number;
  encryptionKey?: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
  obligation: string;
  data: any;
  encrypted?: boolean;
}