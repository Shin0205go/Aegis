import { ObligationExecutor, ObligationResult, DataLifecycleConfig } from '../types';
import { DecisionContext, PolicyDecision } from '../../../types';
import { Logger } from '../../../utils/logger';

/**
 * データライフサイクル義務エグゼキューター
 * データの保持期間、削除、アーカイブ等の管理
 */
export class DataLifecycleExecutor implements ObligationExecutor {
  public readonly name = 'DataLifecycle';
  public readonly supportedTypes = [
    'data-retention',
    'data-deletion',
    'data-archival',
    'data-export'
  ];

  private logger: Logger;
  private config: DataLifecycleExecutorConfig;
  private scheduleStore = new Map<string, ScheduledAction>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger();
    this.config = {
      defaultRetentionDays: 365,
      archivePath: '/archive',
      cleanupIntervalMs: 86400000, // 24時間
      notifyBeforeActionDays: 7
    };
  }

  async initialize(config: DataLifecycleExecutorConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // 既存のスケジュールをロード
    await this.loadScheduledActions();
    
    // 定期クリーンアップを開始
    this.startCleanupInterval();
    
    this.logger.info('DataLifecycleエグゼキューター初期化完了', this.config);
  }

  canExecute(obligation: string): boolean {
    const lowerObligation = obligation.toLowerCase();
    return (
      lowerObligation.includes('削除スケジュール') ||
      lowerObligation.includes('保持期間') ||
      lowerObligation.includes('retention') ||
      lowerObligation.includes('delete') ||
      lowerObligation.includes('アーカイブ') ||
      lowerObligation.includes('archive') ||
      lowerObligation.includes('データライフサイクル')
    );
  }

  async execute(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationResult> {
    try {
      const action = this.parseAction(obligation, context);
      
      // 即座に実行するアクション
      if (action.immediate) {
        await this.executeAction(action);
      } else {
        // スケジュールされたアクション
        await this.scheduleAction(action);
      }

      return {
        success: true,
        executedAt: new Date(),
        metadata: {
          actionId: action.id,
          actionType: action.type,
          scheduledFor: action.scheduledFor,
          resource: action.resource
        }
      };

    } catch (error) {
      this.logger.error('データライフサイクル実行エラー', error);
      return {
        success: false,
        executedAt: new Date(),
        error: `データライフサイクル処理失敗: ${error instanceof Error ? error.message : '不明なエラー'}`,
        retryable: true
      };
    }
  }

  private parseAction(
    obligation: string,
    context: DecisionContext
  ): ScheduledAction {
    const action: ScheduledAction = {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: this.determineActionType(obligation),
      resource: context.resource,
      createdAt: new Date(),
      createdBy: context.agent,
      immediate: false,
      metadata: {
        obligation,
        context: {
          agent: context.agent,
          action: context.action,
          purpose: context.purpose
        }
      }
    };

    // タイミングの解析
    const timing = this.parseTiming(obligation);
    if (timing.immediate) {
      action.immediate = true;
    } else {
      action.scheduledFor = timing.scheduledFor;
    }

    // アクション固有の設定
    switch (action.type) {
      case 'delete':
        action.config = {
          permanent: obligation.includes('完全削除'),
          notifyBeforeAction: !obligation.includes('通知不要')
        };
        break;
      case 'archive':
        action.config = {
          destination: this.config.archivePath,
          compress: obligation.includes('圧縮'),
          encrypt: obligation.includes('暗号化')
        };
        break;
      case 'anonymize':
        action.config = {
          method: obligation.includes('ハッシュ') ? 'hash' : 'redact',
          fields: this.parseFields(obligation)
        };
        break;
      case 'export':
        action.config = {
          format: this.parseFormat(obligation),
          destination: context.environment?.exportPath || '/exports'
        };
        break;
    }

    return action;
  }

  private determineActionType(obligation: string): ActionType {
    if (obligation.includes('削除') || obligation.includes('delete')) {
      return 'delete';
    }
    if (obligation.includes('アーカイブ') || obligation.includes('archive')) {
      return 'archive';
    }
    if (obligation.includes('匿名化') || obligation.includes('anonymize')) {
      return 'anonymize';
    }
    if (obligation.includes('エクスポート') || obligation.includes('export')) {
      return 'export';
    }
    return 'delete'; // デフォルト
  }

  private parseTiming(obligation: string): { immediate: boolean; scheduledFor?: Date } {
    // 即座に実行
    if (obligation.includes('即座') || obligation.includes('immediate')) {
      return { immediate: true };
    }

    // 期間指定の解析
    const patterns = [
      /(\d+)\s*日後/,
      /(\d+)\s*days?\s*(?:later|after)/i,
      /(\d+)\s*週間後/,
      /(\d+)\s*weeks?\s*(?:later|after)/i,
      /(\d+)\s*ヶ月後/,
      /(\d+)\s*months?\s*(?:later|after)/i
    ];

    for (const pattern of patterns) {
      const match = obligation.match(pattern);
      if (match) {
        const value = parseInt(match[1]);
        const scheduledFor = new Date();
        
        if (pattern.source.includes('日') || pattern.source.includes('day')) {
          scheduledFor.setDate(scheduledFor.getDate() + value);
        } else if (pattern.source.includes('週') || pattern.source.includes('week')) {
          scheduledFor.setDate(scheduledFor.getDate() + value * 7);
        } else if (pattern.source.includes('月') || pattern.source.includes('month')) {
          scheduledFor.setMonth(scheduledFor.getMonth() + value);
        }
        
        return { immediate: false, scheduledFor };
      }
    }

    // デフォルト: 設定された保持期間後
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + this.config.defaultRetentionDays);
    return { immediate: false, scheduledFor };
  }

  private parseFields(obligation: string): string[] {
    const match = obligation.match(/フィールド[：:](.*?)(?:、|$)/);
    if (match) {
      return match[1].split(',').map(f => f.trim());
    }
    return [];
  }

  private parseFormat(obligation: string): string {
    if (obligation.includes('csv') || obligation.includes('CSV')) {
      return 'csv';
    }
    if (obligation.includes('json') || obligation.includes('JSON')) {
      return 'json';
    }
    if (obligation.includes('xml') || obligation.includes('XML')) {
      return 'xml';
    }
    return 'json'; // デフォルト
  }

  private async scheduleAction(action: ScheduledAction): Promise<void> {
    this.scheduleStore.set(action.id, action);
    
    // 永続化
    await this.persistScheduledActions();
    
    this.logger.info(`アクションスケジュール登録: ${action.id}`, {
      type: action.type,
      resource: action.resource,
      scheduledFor: action.scheduledFor
    });

    // 通知が必要な場合
    if (action.config?.notifyBeforeAction && action.scheduledFor) {
      const notifyDate = new Date(action.scheduledFor);
      notifyDate.setDate(notifyDate.getDate() - this.config.notifyBeforeActionDays);
      
      if (notifyDate > new Date()) {
        // TODO: 通知スケジュールを設定
      }
    }
  }

  private async executeAction(action: ScheduledAction): Promise<void> {
    this.logger.info(`アクション実行: ${action.id}`, {
      type: action.type,
      resource: action.resource
    });

    switch (action.type) {
      case 'delete':
        await this.executeDelete(action);
        break;
      case 'archive':
        await this.executeArchive(action);
        break;
      case 'anonymize':
        await this.executeAnonymize(action);
        break;
      case 'export':
        await this.executeExport(action);
        break;
    }

    // 完了後はスケジュールから削除
    if (!action.immediate) {
      this.scheduleStore.delete(action.id);
      await this.persistScheduledActions();
    }
  }

  private async executeDelete(action: ScheduledAction): Promise<void> {
    // 実際の実装ではリソースを削除
    this.logger.info(`リソース削除: ${action.resource}`, {
      permanent: action.config?.permanent
    });
    
    // TODO: 実際の削除処理
  }

  private async executeArchive(action: ScheduledAction): Promise<void> {
    // 実際の実装ではリソースをアーカイブ
    this.logger.info(`リソースアーカイブ: ${action.resource}`, {
      destination: action.config?.destination,
      compress: action.config?.compress,
      encrypt: action.config?.encrypt
    });
    
    // TODO: 実際のアーカイブ処理
  }

  private async executeAnonymize(action: ScheduledAction): Promise<void> {
    // 実際の実装ではデータを匿名化
    this.logger.info(`データ匿名化: ${action.resource}`, {
      method: action.config?.method,
      fields: action.config?.fields
    });
    
    // TODO: 実際の匿名化処理
  }

  private async executeExport(action: ScheduledAction): Promise<void> {
    // 実際の実装ではデータをエクスポート
    this.logger.info(`データエクスポート: ${action.resource}`, {
      format: action.config?.format,
      destination: action.config?.destination
    });
    
    // TODO: 実際のエクスポート処理
  }

  private async loadScheduledActions(): Promise<void> {
    // TODO: 永続化されたスケジュールをロード
    this.logger.info('スケジュールされたアクションをロード');
  }

  private async persistScheduledActions(): Promise<void> {
    // TODO: スケジュールを永続化
    const actions = Array.from(this.scheduleStore.values());
    this.logger.info(`スケジュールを永続化: ${actions.length}件`);
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.checkScheduledActions();
    }, this.config.cleanupIntervalMs);
  }

  private async checkScheduledActions(): Promise<void> {
    const now = new Date();
    const actionsToExecute: ScheduledAction[] = [];

    for (const action of this.scheduleStore.values()) {
      if (action.scheduledFor && action.scheduledFor <= now) {
        actionsToExecute.push(action);
      }
    }

    for (const action of actionsToExecute) {
      try {
        await this.executeAction(action);
      } catch (error) {
        this.logger.error(`スケジュールアクション実行エラー: ${action.id}`, error);
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // スケジュールを永続化
    await this.persistScheduledActions();
    
    this.logger.info('DataLifecycleエグゼキュータークリーンアップ完了');
  }

  /**
   * スケジュールされたアクション一覧を取得
   */
  getScheduledActions(filter?: { resource?: string; type?: ActionType }): ScheduledAction[] {
    let actions = Array.from(this.scheduleStore.values());
    
    if (filter?.resource) {
      actions = actions.filter(a => a.resource === filter.resource);
    }
    if (filter?.type) {
      actions = actions.filter(a => a.type === filter.type);
    }
    
    return actions.sort((a, b) => {
      if (!a.scheduledFor || !b.scheduledFor) return 0;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }

  /**
   * アクションをキャンセル
   */
  async cancelAction(actionId: string): Promise<boolean> {
    if (this.scheduleStore.has(actionId)) {
      this.scheduleStore.delete(actionId);
      await this.persistScheduledActions();
      this.logger.info(`アクションキャンセル: ${actionId}`);
      return true;
    }
    return false;
  }
}

interface DataLifecycleExecutorConfig extends DataLifecycleConfig {
  defaultRetentionDays: number;
  archivePath: string;
  cleanupIntervalMs: number;
  notifyBeforeActionDays: number;
}

interface ScheduledAction {
  id: string;
  type: ActionType;
  resource: string;
  createdAt: Date;
  createdBy: string;
  scheduledFor?: Date;
  immediate: boolean;
  config?: any;
  metadata?: Record<string, any>;
}

type ActionType = 'delete' | 'archive' | 'anonymize' | 'export';