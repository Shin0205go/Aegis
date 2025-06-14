import { ObligationExecutor, ObligationResult, NotificationConfig } from '../types';
import { DecisionContext, PolicyDecision } from '../../../types';
import { Logger } from '../../../utils/logger';

/**
 * 通知義務エグゼキューター
 * 管理者や関係者への通知を実行
 */
export class NotifierExecutor implements ObligationExecutor {
  public readonly name = 'Notifier';
  public readonly supportedTypes = [
    'notification',
    'alert',
    'escalation',
    'report'
  ];

  private logger: Logger;
  private config: NotifierConfig;
  private notificationQueue: NotificationTask[] = [];
  private providers: Map<string, NotificationProvider> = new Map();

  constructor() {
    this.logger = new Logger();
    this.config = {
      retryAttempts: 3,
      retryDelayMs: 1000,
      queueTimeoutMs: 30000,
      providers: {}
    };

    // デフォルトプロバイダーの設定
    this.setupDefaultProviders();
  }

  async initialize(config: NotifierConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // プロバイダーの初期化
    await this.initializeProviders();
    
    this.logger.info('Notifierエグゼキューター初期化完了', this.config);
  }

  canExecute(obligation: string): boolean {
    const lowerObligation = obligation.toLowerCase();
    return (
      lowerObligation.includes('通知') ||
      lowerObligation.includes('notify') ||
      lowerObligation.includes('アラート') ||
      lowerObligation.includes('alert') ||
      lowerObligation.includes('エスカレーション')
    );
  }

  async execute(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationResult> {
    try {
      const notification = this.parseNotification(obligation, context, decision);
      
      // 通知タスクを作成
      const task: NotificationTask = {
        id: crypto.randomUUID ? crypto.randomUUID() : `notif-${Date.now()}`,
        notification,
        attempts: 0,
        createdAt: new Date()
      };

      // 通知を送信
      const result = await this.sendNotification(task);

      return {
        success: result.success,
        executedAt: new Date(),
        metadata: {
          notificationId: task.id,
          provider: result.provider,
          recipients: notification.recipients
        },
        error: result.error
      };

    } catch (error) {
      this.logger.error('通知実行エラー', error);
      return {
        success: false,
        executedAt: new Date(),
        error: `通知失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
        retryable: true
      };
    }
  }

  private parseNotification(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Notification {
    const notification: Notification = {
      type: this.determineNotificationType(obligation),
      priority: this.determinePriority(obligation, decision),
      recipients: this.determineRecipients(obligation, context),
      subject: this.generateSubject(obligation, context, decision),
      body: this.generateBody(obligation, context, decision),
      metadata: {
        obligation,
        contextId: context.environment?.sessionId,
        timestamp: new Date()
      }
    };

    // 特定の義務タイプに応じた追加設定
    if (obligation.includes('エスカレーション')) {
      notification.escalation = this.parseEscalation(obligation);
    }

    return notification;
  }

  private determineNotificationType(obligation: string): NotificationType {
    if (obligation.includes('email') || obligation.includes('メール')) {
      return 'email';
    }
    if (obligation.includes('slack')) {
      return 'slack';
    }
    if (obligation.includes('teams')) {
      return 'teams';
    }
    if (obligation.includes('sms')) {
      return 'sms';
    }
    if (obligation.includes('webhook')) {
      return 'webhook';
    }
    // デフォルト
    return 'email';
  }

  private determinePriority(
    obligation: string,
    decision: PolicyDecision
  ): 'low' | 'normal' | 'high' | 'urgent' {
    if (obligation.includes('緊急') || obligation.includes('urgent')) {
      return 'urgent';
    }
    if (obligation.includes('高リスク') || obligation.includes('high risk')) {
      return 'high';
    }
    if (decision.decision === 'DENY') {
      return 'high';
    }
    return 'normal';
  }

  private determineRecipients(
    obligation: string,
    context: DecisionContext
  ): string[] {
    const recipients: string[] = [];

    // 義務から受信者を抽出
    if (obligation.includes('管理者')) {
      recipients.push(...(this.config.adminEmails || ['admin@example.com']));
    }
    if (obligation.includes('データ所有者')) {
      const ownerEmail = context.environment?.dataOwnerEmail;
      if (ownerEmail) {
        recipients.push(ownerEmail);
      }
    }
    if (obligation.includes('セキュリティチーム')) {
      recipients.push(...(this.config.securityTeamEmails || ['security@example.com']));
    }

    // デフォルト受信者
    if (recipients.length === 0) {
      recipients.push(...(this.config.defaultRecipients || ['notify@example.com']));
    }

    return [...new Set(recipients)]; // 重複を除去
  }

  private generateSubject(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): string {
    const priority = this.determinePriority(obligation, decision);
    const prefix = priority === 'urgent' ? '[緊急] ' : priority === 'high' ? '[重要] ' : '';
    
    if (decision.decision === 'DENY') {
      return `${prefix}アクセス拒否: ${context.agent} - ${context.resource}`;
    }
    
    if (obligation.includes('機密')) {
      return `${prefix}機密データアクセス: ${context.agent} - ${context.resource}`;
    }
    
    return `${prefix}ポリシー通知: ${context.action} - ${context.resource}`;
  }

  private generateBody(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): string {
    const sections = [
      `## ポリシー判定結果`,
      ``,
      `**判定**: ${decision.decision}`,
      `**理由**: ${decision.reason}`,
      `**信頂度**: ${(decision.confidence * 100).toFixed(1)}%`,
      ``,
      `## アクセス詳細`,
      ``,
      `- **エージェント**: ${context.agent}`,
      `- **アクション**: ${context.action}`,
      `- **リソース**: ${context.resource}`,
      `- **目的**: ${context.purpose || '未指定'}`,
      `- **時刻**: ${context.time.toLocaleString()}`,
    ];

    if (context.environment?.clientIP) {
      sections.push(`- **IPアドレス**: ${context.environment.clientIP}`);
    }

    if (decision.constraints?.length) {
      sections.push(``, `## 適用された制約`, ``);
      decision.constraints.forEach(c => sections.push(`- ${c}`));
    }

    if (decision.obligations?.length) {
      sections.push(``, `## 実行された義務`, ``);
      decision.obligations.forEach(o => sections.push(`- ${o}`));
    }

    return sections.join('\n');
  }

  private parseEscalation(obligation: string): EscalationConfig {
    // エスカレーションレベルを解析
    const levels: EscalationLevel[] = [];
    
    if (obligation.includes('レベル1')) {
      levels.push({
        level: 1,
        recipients: this.config.level1Recipients || ['level1@example.com'],
        method: 'email',
        delayMinutes: 0
      });
    }
    
    if (obligation.includes('レベル2')) {
      levels.push({
        level: 2,
        recipients: this.config.level2Recipients || ['level2@example.com'],
        method: 'sms',
        delayMinutes: 15
      });
    }

    return {
      levels,
      initialDelayMinutes: 0
    };
  }

  private async sendNotification(task: NotificationTask): Promise<NotificationResult> {
    const { notification } = task;
    const provider = this.providers.get(notification.type);

    if (!provider) {
      return {
        success: false,
        error: `プロバイダーが見つかりません: ${notification.type}`
      };
    }

    try {
      // リトライロジック
      let lastError: Error | undefined;
      
      for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
        try {
          await provider.send(notification);
          return {
            success: true,
            provider: notification.type
          };
        } catch (error) {
          lastError = error as Error;
          task.attempts = attempt + 1;
          
          if (attempt < this.config.retryAttempts) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await this.delay(delay);
          }
        }
      }

      throw lastError || new Error('通知送信失敗');

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
        provider: notification.type
      };
    }
  }

  private setupDefaultProviders(): void {
    // Emailプロバイダー（モック）
    this.providers.set('email', {
      send: async (notification) => {
        this.logger.info('メール送信:', {
          to: notification.recipients,
          subject: notification.subject
        });
      }
    });

    // Slackプロバイダー（モック）
    this.providers.set('slack', {
      send: async (notification) => {
        this.logger.info('Slack送信:', {
          channel: notification.channel || '#alerts',
          text: notification.subject
        });
      }
    });

    // Webhookプロバイダー（モック）
    this.providers.set('webhook', {
      send: async (notification) => {
        this.logger.info('Webhook送信:', {
          url: notification.webhookUrl || this.config.defaultWebhookUrl,
          payload: {
            subject: notification.subject,
            body: notification.body,
            metadata: notification.metadata
          }
        });
      }
    });
  }

  private async initializeProviders(): Promise<void> {
    // 設定に基づいてプロバイダーを初期化
    for (const [type, config] of Object.entries(this.config.providers)) {
      if (config.enabled) {
        // 実際の実装ではここで各プロバイダーを設定
        this.logger.info(`プロバイダー初期化: ${type}`);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    // 未送信の通知を処理
    if (this.notificationQueue.length > 0) {
      this.logger.warn(`未送信通知: ${this.notificationQueue.length}件`);
    }
    
    this.logger.info('Notifierエグゼキュータークリーンアップ完了');
  }
}

interface NotifierConfig {
  retryAttempts: number;
  retryDelayMs: number;
  queueTimeoutMs: number;
  providers: Record<string, ProviderConfig>;
  adminEmails?: string[];
  securityTeamEmails?: string[];
  defaultRecipients?: string[];
  level1Recipients?: string[];
  level2Recipients?: string[];
  defaultWebhookUrl?: string;
}

interface ProviderConfig {
  enabled: boolean;
  config?: Record<string, any>;
}

interface Notification extends NotificationConfig {
  subject: string;
  body: string;
  metadata?: Record<string, any>;
  escalation?: EscalationConfig;
}

interface NotificationTask {
  id: string;
  notification: Notification;
  attempts: number;
  createdAt: Date;
}

interface NotificationResult {
  success: boolean;
  provider?: string;
  error?: string;
}

interface NotificationProvider {
  send(notification: Notification): Promise<void>;
}

type NotificationType = 'email' | 'slack' | 'webhook' | 'sms' | 'teams';

interface EscalationLevel {
  level: number;
  recipients: string[];
  method: 'email' | 'sms' | 'phone' | 'slack';
  delayMinutes: number;
}

interface EscalationConfig {
  levels: EscalationLevel[];
  initialDelayMinutes: number;
}