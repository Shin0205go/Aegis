// ============================================================================
// AEGIS - Audit Dashboard Data Provider
// 監査ダッシュボード用データプロバイダー
// ============================================================================

import { AdvancedAuditSystem, AuditEntry } from './advanced-audit-system.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('audit-dashboard');

export interface DashboardMetrics {
  realtime: RealtimeMetrics;
  historical: HistoricalMetrics;
  topMetrics: TopMetrics;
  alerts: Alert[];
}

export interface RealtimeMetrics {
  requestsPerMinute: number;
  activeAgents: number;
  averageResponseTime: number;
  currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  systemHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface HistoricalMetrics {
  hourly: TimeSeriesData[];
  daily: TimeSeriesData[];
  weekly: TimeSeriesData[];
}

export interface TimeSeriesData {
  timestamp: Date;
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  errorRequests: number;
  avgResponseTime: number;
}

export interface TopMetrics {
  mostAccessedResources: { resource: string; count: number; successRate?: number }[];
  mostUsedTools: { tool: string; count: number; successRate?: number }[];
  mostActiveAgents: { agent: string; count: number; successRate?: number; riskScore?: number }[];
  topDenialReasons: { reason: string; count: number }[];
  slowestOperations: { operation: string; avgTime: number }[];
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  message: string;
  acknowledged: boolean;
}

export class AuditDashboardDataProvider {
  private auditSystem: AdvancedAuditSystem;
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsCache: Map<string, { data: any; timestamp: Date }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1分間のキャッシュ

  constructor(auditSystem: AdvancedAuditSystem) {
    this.auditSystem = auditSystem;
    this.startMetricsCollection();
  }

  /**
   * ダッシュボード用メトリクスを取得
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [realtime, historical, topMetrics] = await Promise.all([
      this.getRealtimeMetrics(),
      this.getHistoricalMetrics(),
      this.getTopMetrics()
    ]);

    return {
      realtime,
      historical,
      topMetrics,
      alerts: Array.from(this.activeAlerts.values())
        .filter(alert => !alert.acknowledged)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    };
  }

  /**
   * リアルタイムメトリクスを取得
   */
  private async getRealtimeMetrics(): Promise<RealtimeMetrics> {
    const cacheKey = 'realtime-metrics';
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const entries = this.getEntriesInRange(oneMinuteAgo, now);

    const activeAgents = new Set(entries.map(e => e.context.agent)).size;
    const avgResponseTime = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.processingTime, 0) / entries.length
      : 0;

    const denialRate = entries.length > 0
      ? entries.filter(e => e.decision.decision === 'DENY').length / entries.length
      : 0;

    const currentRiskLevel = this.calculateRiskLevel(denialRate, entries);
    const systemHealth = this.assessSystemHealth(entries, avgResponseTime);

    const metrics: RealtimeMetrics = {
      requestsPerMinute: entries.length,
      activeAgents,
      averageResponseTime: Math.round(avgResponseTime),
      currentRiskLevel,
      systemHealth
    };

    this.setCachedData(cacheKey, metrics);
    return metrics;
  }

  /**
   * 履歴メトリクスを取得
   */
  private async getHistoricalMetrics(): Promise<HistoricalMetrics> {
    const cacheKey = 'historical-metrics';
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const now = new Date();
    
    const metrics: HistoricalMetrics = {
      hourly: await this.getTimeSeriesData(now, 24, 'hour'),
      daily: await this.getTimeSeriesData(now, 7, 'day'),
      weekly: await this.getTimeSeriesData(now, 4, 'week')
    };

    this.setCachedData(cacheKey, metrics);
    return metrics;
  }

  /**
   * 時系列データを生成
   */
  private async getTimeSeriesData(
    endTime: Date,
    periods: number,
    unit: 'hour' | 'day' | 'week'
  ): Promise<TimeSeriesData[]> {
    const data: TimeSeriesData[] = [];
    const unitMillis = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    };

    for (let i = 0; i < periods; i++) {
      const periodEnd = new Date(endTime.getTime() - i * unitMillis[unit]);
      const periodStart = new Date(periodEnd.getTime() - unitMillis[unit]);
      
      const entries = this.getEntriesInRange(periodStart, periodEnd);
      
      data.push({
        timestamp: periodEnd,
        totalRequests: entries.length,
        allowedRequests: entries.filter(e => e.decision.decision === 'PERMIT').length,
        deniedRequests: entries.filter(e => e.decision.decision === 'DENY').length,
        errorRequests: entries.filter(e => e.outcome === 'ERROR').length,
        avgResponseTime: entries.length > 0
          ? Math.round(entries.reduce((sum, e) => sum + e.processingTime, 0) / entries.length)
          : 0
      });
    }

    return data.reverse();
  }

  /**
   * トップメトリクスを取得
   */
  private async getTopMetrics(): Promise<TopMetrics> {
    const cacheKey = 'top-metrics';
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const entries = this.getEntriesInRange(last24Hours, new Date());

    const metrics: TopMetrics = {
      mostAccessedResources: this.getTopResources(entries, 10),
      mostUsedTools: this.getTopTools(entries, 10),
      mostActiveAgents: this.getTopAgents(entries, 10),
      topDenialReasons: this.getTopDenialReasons(entries, 10),
      slowestOperations: this.getSlowestOperations(entries, 10)
    };

    this.setCachedData(cacheKey, metrics);
    return metrics;
  }

  private getTopResources(entries: AuditEntry[], limit: number): { resource: string; count: number; successRate?: number }[] {
    const resourceStats = new Map<string, { total: number; allowed: number }>();
    
    entries.forEach(entry => {
      const resource = entry.context.resource;
      // ツール以外のリソースのみを集計
      if (!resource.startsWith('tool:')) {
        const stats = resourceStats.get(resource) || { total: 0, allowed: 0 };
        stats.total++;
        if (entry.decision.decision === 'PERMIT') {
          stats.allowed++;
        }
        resourceStats.set(resource, stats);
      }
    });

    return Array.from(resourceStats.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, limit)
      .map(([resource, stats]) => ({ 
        resource, 
        count: stats.total,
        successRate: stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0
      }));
  }
  
  private getTopTools(entries: AuditEntry[], limit: number): { tool: string; count: number; successRate?: number }[] {
    const toolStats = new Map<string, { total: number; allowed: number }>();
    
    entries.forEach(entry => {
      const resource = entry.context.resource;
      // ツールのみを集計
      if (resource.startsWith('tool:')) {
        const toolName = resource.substring(5); // 'tool:' プレフィックスを削除
        const stats = toolStats.get(toolName) || { total: 0, allowed: 0 };
        stats.total++;
        if (entry.decision.decision === 'PERMIT') {
          stats.allowed++;
        }
        toolStats.set(toolName, stats);
      }
    });

    return Array.from(toolStats.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, limit)
      .map(([tool, stats]) => ({ 
        tool, 
        count: stats.total,
        successRate: stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0
      }));
  }

  private getTopAgents(entries: AuditEntry[], limit: number): { agent: string; count: number; successRate?: number; riskScore?: number }[] {
    const agentStats = new Map<string, { total: number; allowed: number; denied: number; errors: number }>();
    
    entries.forEach(entry => {
      const agent = entry.context.agent;
      const stats = agentStats.get(agent) || { total: 0, allowed: 0, denied: 0, errors: 0 };
      stats.total++;
      
      if (entry.decision.decision === 'PERMIT') {
        stats.allowed++;
      } else if (entry.decision.decision === 'DENY') {
        stats.denied++;
      } else {
        stats.errors++;
      }
      
      agentStats.set(agent, stats);
    });

    return Array.from(agentStats.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, limit)
      .map(([agent, stats]) => ({ 
        agent, 
        count: stats.total,
        successRate: stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0,
        riskScore: this.calculateAgentRiskScore(stats)
      }));
  }
  
  private calculateAgentRiskScore(stats: { total: number; allowed: number; denied: number; errors: number }): number {
    // リスクスコア計算: 拒否率 * 0.7 + エラー率 * 0.3
    const denialRate = stats.total > 0 ? stats.denied / stats.total : 0;
    const errorRate = stats.total > 0 ? stats.errors / stats.total : 0;
    return Math.min((denialRate * 0.7 + errorRate * 0.3) * 100, 100);
  }

  private getTopDenialReasons(entries: AuditEntry[], limit: number): { reason: string; count: number }[] {
    const counts = new Map<string, number>();
    entries
      .filter(e => e.decision.decision === 'DENY')
      .forEach(entry => {
        const reason = entry.decision.reason;
        counts.set(reason, (counts.get(reason) || 0) + 1);
      });

    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }

  private getSlowestOperations(entries: AuditEntry[], limit: number): { operation: string; avgTime: number }[] {
    const operationTimes = new Map<string, { total: number; count: number }>();
    
    entries.forEach(entry => {
      const operation = `${entry.context.action}:${entry.context.resource}`;
      const existing = operationTimes.get(operation) || { total: 0, count: 0 };
      existing.total += entry.processingTime;
      existing.count++;
      operationTimes.set(operation, existing);
    });

    return Array.from(operationTimes.entries())
      .map(([operation, { total, count }]) => ({
        operation,
        avgTime: Math.round(total / count)
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  /**
   * リスクレベルを計算
   */
  private calculateRiskLevel(denialRate: number, entries: AuditEntry[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const errorRate = entries.length > 0
      ? entries.filter(e => e.outcome === 'ERROR').length / entries.length
      : 0;

    if (denialRate > 0.5 || errorRate > 0.2) return 'CRITICAL';
    if (denialRate > 0.3 || errorRate > 0.1) return 'HIGH';
    if (denialRate > 0.1 || errorRate > 0.05) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * システムヘルスを評価
   */
  private assessSystemHealth(entries: AuditEntry[], avgResponseTime: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    const errorRate = entries.length > 0
      ? entries.filter(e => e.outcome === 'ERROR').length / entries.length
      : 0;

    if (errorRate > 0.1 || avgResponseTime > 5000) return 'CRITICAL';
    if (errorRate > 0.05 || avgResponseTime > 2000) return 'WARNING';
    return 'HEALTHY';
  }

  /**
   * アラートを作成
   */
  createAlert(severity: Alert['severity'], type: string, message: string): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      severity,
      type,
      message,
      acknowledged: false
    };

    this.activeAlerts.set(alert.id, alert);
    logger.warn('Alert created', { alertId: alert.id, severity, type });

    // 古いアラートを削除（最大100件）
    if (this.activeAlerts.size > 100) {
      const oldestAlerts = Array.from(this.activeAlerts.entries())
        .sort(([, a], [, b]) => a.timestamp.getTime() - b.timestamp.getTime())
        .slice(0, this.activeAlerts.size - 100);
      
      oldestAlerts.forEach(([id]) => this.activeAlerts.delete(id));
    }
  }

  /**
   * アラートを確認済みにする
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      logger.info('Alert acknowledged', { alertId });
    }
  }

  /**
   * メトリクス収集を開始
   */
  private startMetricsCollection(): void {
    // 1分ごとに異常を検知
    setInterval(async () => {
      try {
        const metrics = await this.getRealtimeMetrics();
        
        if (metrics.currentRiskLevel === 'CRITICAL') {
          this.createAlert('CRITICAL', 'HIGH_RISK', 'システムのリスクレベルが危険域に達しています');
        }
        
        if (metrics.systemHealth === 'CRITICAL') {
          this.createAlert('HIGH', 'SYSTEM_HEALTH', 'システムヘルスが悪化しています');
        }

        if (metrics.requestsPerMinute > 1000) {
          this.createAlert('MEDIUM', 'HIGH_LOAD', 'リクエスト数が異常に多くなっています');
        }
      } catch (error) {
        logger.error('Failed to collect metrics', error);
      }
    }, 60 * 1000); // 1分ごと
  }

  /**
   * エントリを時間範囲で取得
   */
  private getEntriesInRange(start: Date, end: Date): AuditEntry[] {
    return this.auditSystem.getEntriesInTimeRange(start, end);
  }

  /**
   * キャッシュからデータを取得
   */
  private getCachedData(key: string): any {
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * キャッシュにデータを設定
   */
  private setCachedData(key: string, data: any): void {
    this.metricsCache.set(key, { data, timestamp: new Date() });
  }
}