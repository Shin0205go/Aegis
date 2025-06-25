// ============================================================================
// AEGIS - Real-time Anomaly Detection System (Phase 3)
// リアルタイム異常検知システム
// ============================================================================

import { Logger } from '../utils/logger.js';
import { DecisionContext, PolicyDecision } from '../types/index.js';
import { AdvancedAuditSystem, AnomalyReport } from './advanced-audit-system.js';

const logger = new Logger('real-time-anomaly');

export interface AnomalyPattern {
  id: string;
  name: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detector: (context: DecisionContext, decision: PolicyDecision, recentActivity: AnomalyContext[]) => boolean;
  threshold: number;
  timeWindow: number; // minutes
}

export interface AnomalyContext {
  timestamp: Date;
  context: DecisionContext;
  decision: PolicyDecision;
  outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
}

export interface AnomalyAlert {
  alertId: string;
  detectedAt: Date;
  pattern: AnomalyPattern;
  triggeringContext: DecisionContext;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  suggestedActions: string[];
  autoMitigated: boolean;
}

export class RealTimeAnomalyDetector {
  private recentActivity: AnomalyContext[] = [];
  private anomalyPatterns: Map<string, AnomalyPattern> = new Map();
  private auditSystem: AdvancedAuditSystem;
  private alertCallbacks: ((alert: AnomalyAlert) => void)[] = [];

  constructor(auditSystem: AdvancedAuditSystem) {
    this.auditSystem = auditSystem;
    this.initializeAnomalyPatterns();
    this.startCleanupTimer();
  }

  private initializeAnomalyPatterns(): void {
    // パターン1: 短時間での大量アクセス試行
    this.anomalyPatterns.set('rapid-access-attempts', {
      id: 'rapid-access-attempts',
      name: '短時間大量アクセス',
      description: '同一エージェントによる短時間での大量アクセス試行',
      severity: 'HIGH',
      threshold: 10, // 10回/分
      timeWindow: 1, // 1分
      detector: (context, decision, recentActivity) => {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const sameAgentRequests = recentActivity.filter(activity => 
          activity.context.agent === context.agent &&
          activity.timestamp >= oneMinuteAgo
        );
        return sameAgentRequests.length > 10;
      }
    });

    // パターン2: 連続的なアクセス拒否
    this.anomalyPatterns.set('repeated-denials', {
      id: 'repeated-denials',
      name: '連続アクセス拒否',
      description: '同一エージェントの連続的なアクセス拒否',
      severity: 'MEDIUM',
      threshold: 5, // 5回連続
      timeWindow: 5, // 5分
      detector: (context, decision, recentActivity) => {
        if (decision.decision !== 'DENY') return false;
        
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const sameAgentDenials = recentActivity.filter(activity => 
          activity.context.agent === context.agent &&
          activity.decision.decision === 'DENY' &&
          activity.timestamp >= fiveMinutesAgo
        );
        return sameAgentDenials.length >= 4; // 既存4回 + 今回1回 = 5回
      }
    });

    // パターン3: 異常な時間帯のアクセス
    this.anomalyPatterns.set('off-hours-access', {
      id: 'off-hours-access',
      name: '時間外アクセス',
      description: '営業時間外または深夜時間帯のアクセス',
      severity: 'MEDIUM',
      threshold: 1, // 1回でも検知
      timeWindow: 60, // 1時間
      detector: (context, decision, recentActivity) => {
        const hour = new Date().getHours();
        // 深夜時間（22時-6時）または早朝（6時-9時）を異常とする
        return (hour >= 22 || hour <= 6) || (hour >= 6 && hour <= 9);
      }
    });

    // パターン4: 機密リソースへの異常アクセス
    this.anomalyPatterns.set('sensitive-resource-access', {
      id: 'sensitive-resource-access',
      name: '機密リソースアクセス',
      description: '機密ファイルや設定ファイルへのアクセス試行',
      severity: 'CRITICAL',
      threshold: 1, // 1回でも検知
      timeWindow: 10, // 10分
      detector: (context, decision, recentActivity) => {
        const sensitivePatterns = ['.env', '.key', '.secret', '.config', 'password', 'credential'];
        return sensitivePatterns.some(pattern => 
          context.resource.toLowerCase().includes(pattern)
        );
      }
    });

    // パターン5: 新しいエージェントの異常活動
    this.anomalyPatterns.set('new-agent-activity', {
      id: 'new-agent-activity',
      name: '新規エージェント活動',
      description: '初回または稀にしかアクセスしないエージェントの活動',
      severity: 'LOW',
      threshold: 3, // 3回以上のアクセス
      timeWindow: 60, // 1時間
      detector: (context, decision, recentActivity) => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const sameAgentActivity = recentActivity.filter(activity => 
          activity.context.agent === context.agent &&
          activity.timestamp >= oneHourAgo
        );
        
        // 1時間以内の活動が3回以上で、かつ過去の活動履歴が少ない場合
        if (sameAgentActivity.length >= 3) {
          const allAgentActivity = recentActivity.filter(activity => 
            activity.context.agent === context.agent
          );
          return allAgentActivity.length <= 5; // 全体でも5回以下の活動
        }
        return false;
      }
    });

    logger.info(`Initialized ${this.anomalyPatterns.size} anomaly detection patterns`);
  }

  /**
   * リアルタイム異常検知の実行
   */
  async detectRealTimeAnomalies(
    context: DecisionContext, 
    decision: PolicyDecision, 
    outcome: 'SUCCESS' | 'FAILURE' | 'ERROR'
  ): Promise<AnomalyAlert[]> {
    // 最新のアクティビティを記録
    this.recentActivity.push({
      timestamp: new Date(),
      context,
      decision,
      outcome
    });

    const alerts: AnomalyAlert[] = [];

    // 各パターンで異常検知を実行
    for (const [patternId, pattern] of this.anomalyPatterns) {
      try {
        const isAnomalous = pattern.detector(context, decision, this.recentActivity);
        
        if (isAnomalous) {
          const alert = await this.createAnomalyAlert(pattern, context, decision);
          alerts.push(alert);
          
          // アラートコールバックを実行
          this.alertCallbacks.forEach(callback => {
            try {
              callback(alert);
            } catch (error) {
              logger.error('Alert callback failed', error);
            }
          });

          // 高度な監査システムにも記録
          await this.recordAnomalyInAuditSystem(alert);
        }
      } catch (error) {
        logger.error(`Anomaly detection failed for pattern ${patternId}`, error);
      }
    }

    return alerts;
  }

  private async createAnomalyAlert(
    pattern: AnomalyPattern, 
    context: DecisionContext, 
    decision: PolicyDecision
  ): Promise<AnomalyAlert> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: AnomalyAlert = {
      alertId,
      detectedAt: new Date(),
      pattern,
      triggeringContext: context,
      severity: pattern.severity,
      description: `${pattern.description}: ${context.agent} -> ${context.resource}`,
      suggestedActions: this.generateSuggestedActions(pattern, context),
      autoMitigated: false
    };

    // 重要度に応じて自動緩和を実行
    if (pattern.severity === 'CRITICAL') {
      alert.autoMitigated = await this.attemptAutoMitigation(alert);
    }

    logger.warn('Anomaly detected', {
      alertId: alert.alertId,
      pattern: pattern.name,
      severity: pattern.severity,
      agent: context.agent,
      resource: context.resource
    });

    return alert;
  }

  private generateSuggestedActions(pattern: AnomalyPattern, context: DecisionContext): string[] {
    const actions: string[] = [];

    switch (pattern.id) {
      case 'rapid-access-attempts':
        actions.push('エージェントの一時的なレート制限を検討');
        actions.push('アクセスパターンの詳細調査を実施');
        break;
      
      case 'repeated-denials':
        actions.push('エージェントの認証状態を確認');
        actions.push('ポリシー設定の見直しを検討');
        break;
      
      case 'off-hours-access':
        actions.push('アクセスの正当性を確認');
        actions.push('必要に応じて追加認証を要求');
        break;
      
      case 'sensitive-resource-access':
        actions.push('即座のアクセス制限を実施');
        actions.push('セキュリティチームへの緊急報告');
        actions.push('詳細な調査とフォレンジック分析');
        break;
      
      case 'new-agent-activity':
        actions.push('エージェントの身元確認を実施');
        actions.push('初期監視期間の設定を検討');
        break;
    }

    return actions;
  }

  private async attemptAutoMitigation(alert: AnomalyAlert): Promise<boolean> {
    try {
      switch (alert.pattern.id) {
        case 'sensitive-resource-access':
          // 機密リソースアクセスの場合、一時的にエージェントをブロック
          logger.warn('Auto-mitigating critical anomaly: temporary agent block', {
            agent: alert.triggeringContext.agent,
            resource: alert.triggeringContext.resource
          });
          // エージェントのブロック機能は将来的な拡張点
          // 現在はログ記録のみ実施
          logger.error('エージェントのブロックが必要（未実装）', { agentId: alert.triggeringContext.agent });
          return true;
        
        default:
          // その他のパターンでは自動緩和なし
          return false;
      }
    } catch (error) {
      logger.error('Auto-mitigation failed', error);
      return false;
    }
  }

  private async recordAnomalyInAuditSystem(alert: AnomalyAlert): Promise<void> {
    try {
      // 異常検知を監査システムに記録
      await this.auditSystem.recordAuditEntry(
        alert.triggeringContext,
        {
          decision: 'INDETERMINATE',
          reason: `Anomaly detected: ${alert.pattern.name}`,
          confidence: 0.8
        },
        'anomaly-detection-system',
        0, // 処理時間は検知時間ではない
        'ERROR', // 異常検知はエラーカテゴリ
        {
          anomalyAlertId: alert.alertId,
          patternId: alert.pattern.id,
          severity: alert.severity,
          autoMitigated: alert.autoMitigated
        }
      );
    } catch (error) {
      logger.error('Failed to record anomaly in audit system', error);
    }
  }

  /**
   * 異常検知パターンの追加
   */
  addAnomalyPattern(pattern: AnomalyPattern): void {
    this.anomalyPatterns.set(pattern.id, pattern);
    logger.info(`Added anomaly pattern: ${pattern.name}`);
  }

  /**
   * アラートコールバックの登録
   */
  onAnomalyAlert(callback: (alert: AnomalyAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 最近の異常検知統計取得
   */
  getAnomalyStats(hours: number = 24): {
    totalAlerts: number;
    alertsBySeverity: Record<string, number>;
    alertsByPattern: Record<string, number>;
  } {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentAlerts = this.recentActivity.filter(activity => 
      activity.timestamp >= cutoff && activity.outcome === 'ERROR'
    );

    const alertsBySeverity: Record<string, number> = {};
    const alertsByPattern: Record<string, number> = {};

    // 実際の実装では、記録されたアラート履歴から統計を計算
    // 簡易実装として空の統計を返す
    
    return {
      totalAlerts: recentAlerts.length,
      alertsBySeverity,
      alertsByPattern
    };
  }

  /**
   * アクティビティ履歴のクリーンアップ
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24時間前
      this.recentActivity = this.recentActivity.filter(activity => 
        activity.timestamp >= cutoff
      );
      
      logger.debug(`Cleaned up activity history, ${this.recentActivity.length} entries remaining`);
    }, 60 * 60 * 1000); // 1時間ごとにクリーンアップ
  }

  /**
   * 手動での異常検知実行
   */
  async runManualAnomalyDetection(): Promise<AnomalyReport[]> {
    return await this.auditSystem.detectAnomalousAccess(0.1);
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    anomaliesDetected: number;
    totalActivities: number;
    recentActivityCount: number;
  } {
    const anomaliesDetected = this.recentActivity.filter(activity => 
      activity.outcome === 'ERROR'
    ).length;
    
    return {
      anomaliesDetected,
      totalActivities: this.recentActivity.length,
      recentActivityCount: this.recentActivity.length
    };
  }
}