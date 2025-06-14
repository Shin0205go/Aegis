import { PolicyDecision, DecisionContext } from '../types';
import { Logger } from '../utils/logger';

const logger = new Logger();

export class ConstraintExecutor {
  applyConstraint(constraint: string, data: any): any {
    if (constraint.includes('個人情報を匿名化')) {
      return this.anonymizePersonalInfo(data);
    }
    
    if (constraint.startsWith('フィールド制限:')) {
      const fields = constraint.split(':')[1].trim().split(',');
      return this.restrictFields(data, fields);
    }
    
    if (constraint.startsWith('レコード数制限:')) {
      const limit = parseInt(constraint.split(':')[1].trim());
      return this.limitRecords(data, limit);
    }
    
    if (constraint.startsWith('データサイズ制限:')) {
      const limitStr = constraint.split(':')[1].trim();
      const limitBytes = this.parseSize(limitStr);
      return this.limitDataSize(data, limitBytes);
    }
    
    return data;
  }

  async applyTimeConstraint(constraint: string, process: () => Promise<any>): Promise<any> {
    if (constraint.startsWith('実行時間制限:')) {
      const limitStr = constraint.split(':')[1].trim();
      const limitMs = this.parseTime(limitStr);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), limitMs)
      );
      
      try {
        return await Promise.race([process(), timeoutPromise]);
      } catch (error) {
        return {
          error: 'TIMEOUT',
          message: `実行時間制限 (${limitMs}ms) を超過しました`,
          limit: limitMs
        };
      }
    }
    
    return process();
  }

  private anonymizePersonalInfo(data: any): any {
    if (typeof data !== 'object' || data === null) return data;
    
    const result = Array.isArray(data) ? [...data] : { ...data };
    
    const sensitiveFields = ['name', 'email', 'phone', 'address', 'creditCard', 'ssn'];
    
    if (Array.isArray(result)) {
      return result.map(item => this.anonymizePersonalInfo(item));
    }
    
    for (const key in result) {
      if (sensitiveFields.includes(key)) {
        if (key === 'email' && typeof result[key] === 'string') {
          const [, domain] = result[key].split('@');
          result[key] = `****@${domain || 'example.com'}`;
        } else {
          result[key] = '[REDACTED]';
        }
      } else if (typeof result[key] === 'object') {
        result[key] = this.anonymizePersonalInfo(result[key]);
      }
    }
    
    return result;
  }

  private restrictFields(data: any, allowedFields: string[]): any {
    if (typeof data !== 'object' || data === null) return data;
    
    // 配列の場合は各要素に対して制限を適用
    if (Array.isArray(data)) {
      return data.map(item => this.restrictFields(item, allowedFields));
    }
    
    const result: any = {};
    
    // オブジェクト全体の構造を保持しつつ、許可されたフィールドのみを処理
    for (const key in data) {
      if (Array.isArray(data[key])) {
        // ネストした配列の場合（例：users配列）
        result[key] = data[key].map((item: any) => {
          if (typeof item === 'object' && item !== null) {
            const filteredItem: any = {};
            for (const field of allowedFields) {
              if (field in item) {
                filteredItem[field] = item[field];
              }
            }
            return filteredItem;
          }
          return item;
        });
      } else if (allowedFields.includes(key)) {
        result[key] = data[key];
      }
    }
    
    return result;
  }

  private limitRecords(data: any, limit: number): any {
    // 一般的な配列を含むプロパティを処理
    const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
    
    if (arrayKeys.length > 0) {
      const result = { ...data };
      
      arrayKeys.forEach(key => {
        const array = data[key];
        if (array.length > limit) {
          result[key] = array.slice(0, limit);
          result._truncated = true;
          result._originalCount = array.length;
        }
      });
      
      return result;
    }
    
    return data;
  }

  private limitDataSize(data: any, limitBytes: number): any {
    const dataStr = JSON.stringify(data);
    if (dataStr.length <= limitBytes) return data;
    
    if (typeof data === 'string') {
      return data.substring(0, limitBytes - 12) + '[TRUNCATED]';
    }
    
    if (data.content && typeof data.content === 'string') {
      return {
        ...data,
        content: data.content.substring(0, limitBytes - 12) + '[TRUNCATED]',
        _truncated: true,
        _originalSize: data.content.length
      };
    }
    
    return data;
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/(\d+)\s*(KB|MB|GB)?/i);
    if (!match) return 1024;
    
    const value = parseInt(match[1]);
    const unit = match[2]?.toUpperCase();
    
    switch (unit) {
      case 'KB': return value * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'GB': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private parseTime(timeStr: string): number {
    const match = timeStr.match(/(\d+)\s*(秒|分|時間)?/);
    if (!match) return 1000;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case '秒': return value * 1000;
      case '分': return value * 60 * 1000;
      case '時間': return value * 60 * 60 * 1000;
      default: return value * 1000;
    }
  }
}

export class ObligationExecutor {
  private auditLogger: any;
  private notificationService: any;
  private scheduler: any;
  private reportGenerator: any;

  async executeObligation(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<void> {
    try {
      if (obligation.includes('アクセスログ記録')) {
        await this.logAccess(context, decision);
      } else if (obligation.includes('機密アクセス詳細ログ')) {
        await this.logSensitiveAccess(context, decision);
      } else if (obligation.includes('管理者への通知')) {
        await this.notifyAdmins(context, decision);
      } else if (obligation.includes('データ所有者への通知')) {
        await this.notifyDataOwner(context, decision);
      } else if (obligation.includes('削除スケジュール設定')) {
        await this.scheduleDeletion(obligation, context);
      } else if (obligation.includes('レポート生成')) {
        await this.generateReport(context, decision);
      }
    } catch (error) {
      logger.error(`義務実行エラー: ${obligation}`, error);
    }
  }

  async executeObligations(
    obligations: string[],
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<void> {
    const promises = obligations.map(obligation =>
      this.executeObligation(obligation, context, decision)
    );
    
    await Promise.allSettled(promises);
  }

  private async logAccess(context: DecisionContext, decision: PolicyDecision): Promise<void> {
    await this.auditLogger?.log({
      timestamp: new Date(),
      agent: context.agent,
      action: context.action,
      resource: context.resource,
      decision: decision.decision,
      reason: decision.reason,
      purpose: context.purpose,
      clientIP: context.environment?.clientIP,
      sessionId: context.environment?.sessionId
    });
  }

  private async logSensitiveAccess(context: DecisionContext, decision: PolicyDecision): Promise<void> {
    await this.auditLogger?.log({
      level: 'critical',
      timestamp: new Date(),
      agent: context.agent,
      action: context.action,
      resource: context.resource,
      decision: decision.decision,
      reason: decision.reason,
      sensitivityLevel: context.environment?.resourceSensitivity,
      dataClassification: context.environment?.dataClassification,
      additionalContext: context.environment
    });
  }

  private async notifyAdmins(context: DecisionContext, decision: PolicyDecision): Promise<void> {
    await this.notificationService?.send({
      to: 'admin@example.com',
      subject: `高リスクアクセス検出: ${context.agent}`,
      body: `エージェント ${context.agent} が ${context.resource} に対して ${context.action} を実行しました。`,
      priority: 'high'
    });
  }

  private async notifyDataOwner(context: DecisionContext, decision: PolicyDecision): Promise<void> {
    const ownerEmail = context.environment?.ownerEmail || 'owner@example.com';
    
    await this.notificationService?.send({
      to: ownerEmail,
      subject: `データアクセス通知: ${context.resource}`,
      body: `エージェント ${context.agent} があなたのデータにアクセスしました。`,
      priority: 'normal'
    });
  }

  private async scheduleDeletion(obligation: string, context: DecisionContext): Promise<void> {
    const match = obligation.match(/(\d+)日後/);
    const days = match ? parseInt(match[1]) : 30;
    
    const scheduledDate = new Date(context.time);
    scheduledDate.setDate(scheduledDate.getDate() + days);
    
    await this.scheduler?.schedule({
      jobType: 'delete-resource',
      resource: context.resource,
      scheduledAt: scheduledDate,
      metadata: {
        reason: 'ポリシーによる自動削除',
        createdBy: context.agent,
        createdAt: new Date()
      }
    });
  }

  private async generateReport(context: DecisionContext, decision: PolicyDecision): Promise<void> {
    await this.reportGenerator?.generate({
      type: 'access-report',
      context: context,
      format: context.environment?.reportFormat || 'pdf',
      includeDetails: true
    });
  }
}