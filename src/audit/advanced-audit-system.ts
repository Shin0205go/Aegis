// ============================================================================
// AEGIS - Advanced Audit System
// 高度な監査・レポート機能の実装
// ============================================================================

import { Logger } from '../utils/logger.js';
import { DecisionContext, PolicyDecision } from '../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = new Logger('advanced-audit');

export interface AuditEntry {
  id: string;
  timestamp: Date;
  context: DecisionContext;
  decision: PolicyDecision;
  policyUsed: string;
  processingTime: number;
  outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
  metadata?: Record<string, any>;
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  timeRange: DateRange;
  summary: {
    totalRequests: number;
    allowedRequests: number;
    deniedRequests: number;
    errorRequests: number;
    complianceRate: number;
  };
  policyBreakdowns: PolicyBreakdown[];
  riskAssessment: RiskAssessment;
  recommendations: string[];
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PolicyBreakdown {
  policyName: string;
  requestCount: number;
  allowRate: number;
  avgProcessingTime: number;
  topViolations: string[];
}

export interface RiskAssessment {
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: RiskFactor[];
  mitigationSuggestions: string[];
}

export interface RiskFactor {
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  count: number;
}

export interface AnomalyReport {
  anomalyId: string;
  detectedAt: Date;
  type: 'UNUSUAL_ACCESS_PATTERN' | 'SUSPICIOUS_AGENT' | 'POLICY_VIOLATION_SPIKE' | 'RESOURCE_ABUSE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedResources: string[];
  suggestedActions: string[];
  relatedEntries: AuditEntry[];
}

export interface PatternAnalysis {
  analysisId: string;
  generatedAt: Date;
  timeRange: DateRange;
  accessPatterns: AccessPattern[];
  agentBehaviorProfiles: AgentProfile[];
  resourceUsageStats: ResourceUsage[];
}

export interface AccessPattern {
  pattern: string;
  frequency: number;
  timeDistribution: Record<string, number>; // hour -> count
  riskScore: number;
}

export interface AgentProfile {
  agentId: string;
  totalRequests: number;
  successRate: number;
  preferredResources: string[];
  riskScore: number;
  behaviorChanges: string[];
}

export interface ResourceUsage {
  resourcePattern: string;
  accessCount: number;
  uniqueAgents: number;
  avgAccessTime: number;
  riskScore: number;
}

export class AdvancedAuditSystem {
  private auditLogPath: string;
  private auditEntries: Map<string, AuditEntry> = new Map();
  
  constructor() {
    this.auditLogPath = path.join(process.cwd(), 'logs', 'audit');
    this.initializeAuditSystem();
  }

  private async initializeAuditSystem(): Promise<void> {
    try {
      // 監査ログディレクトリを作成
      await fs.mkdir(this.auditLogPath, { recursive: true });
      
      // 既存の監査ログを読み込み
      await this.loadExistingAuditLogs();
      
      logger.info('Advanced Audit System initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Advanced Audit System', error);
    }
  }

  private async loadExistingAuditLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.auditLogPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const filePath = path.join(this.auditLogPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const entries: AuditEntry[] = JSON.parse(content);
        
        entries.forEach(entry => {
          entry.timestamp = new Date(entry.timestamp); // JSONから復元
          this.auditEntries.set(entry.id, entry);
        });
      }
      
      logger.info(`Loaded ${this.auditEntries.size} existing audit entries`);
    } catch (error) {
      logger.warn('Failed to load existing audit logs', error);
    }
  }

  /**
   * 監査エントリを記録
   */
  async recordAuditEntry(
    context: DecisionContext,
    decision: PolicyDecision,
    policyUsed: string,
    processingTime: number,
    outcome: 'SUCCESS' | 'FAILURE' | 'ERROR',
    metadata?: Record<string, any>
  ): Promise<void> {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      context,
      decision,
      policyUsed,
      processingTime,
      outcome,
      metadata
    };

    // メモリに保存
    this.auditEntries.set(entry.id, entry);

    // ディスクに永続化（日次ファイル）
    await this.persistAuditEntry(entry);

    logger.debug('Audit entry recorded', { entryId: entry.id, outcome });
  }

  private async persistAuditEntry(entry: AuditEntry): Promise<void> {
    try {
      const dateStr = entry.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      const fileName = `audit_${dateStr}.json`;
      const filePath = path.join(this.auditLogPath, fileName);

      // 既存ファイルがあれば読み込み、なければ空配列
      let entries: AuditEntry[] = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        entries = JSON.parse(content);
      } catch (error) {
        // ファイルが存在しない場合は空配列のまま
      }

      // エントリを追加
      entries.push(entry);

      // ファイルに書き込み
      await fs.writeFile(filePath, JSON.stringify(entries, null, 2));
    } catch (error) {
      logger.error('Failed to persist audit entry', error);
    }
  }

  /**
   * コンプライアンスレポート生成
   */
  async generateComplianceReport(timeRange: DateRange): Promise<ComplianceReport> {
    const entries = this.getEntriesInRange(timeRange);
    
    const summary = this.calculateSummary(entries);
    const policyBreakdowns = this.calculatePolicyBreakdowns(entries);
    const riskAssessment = this.assessRisk(entries);
    const recommendations = this.generateRecommendations(entries, riskAssessment);

    const report: ComplianceReport = {
      reportId: `compliance_${Date.now()}`,
      generatedAt: new Date(),
      timeRange,
      summary,
      policyBreakdowns,
      riskAssessment,
      recommendations
    };

    // レポートを保存（コメントアウト - ダッシュボードからの頻繁な呼び出しのため）
    // await this.saveReport(report, 'compliance');

    logger.info('Compliance report generated', { 
      reportId: report.reportId, 
      totalRequests: summary.totalRequests 
    });

    return report;
  }

  private getEntriesInRange(timeRange: DateRange): AuditEntry[] {
    return Array.from(this.auditEntries.values()).filter(entry => 
      entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
    );
  }

  private calculateSummary(entries: AuditEntry[]): ComplianceReport['summary'] {
    const total = entries.length;
    const allowed = entries.filter(e => e.decision.decision === 'PERMIT').length;
    const denied = entries.filter(e => e.decision.decision === 'DENY').length;
    const errors = entries.filter(e => e.outcome === 'ERROR').length;

    return {
      totalRequests: total,
      allowedRequests: allowed,
      deniedRequests: denied,
      errorRequests: errors,
      complianceRate: total > 0 ? ((allowed + denied) / total) * 100 : 100
    };
  }

  private calculatePolicyBreakdowns(entries: AuditEntry[]): PolicyBreakdown[] {
    const policyGroups = new Map<string, AuditEntry[]>();
    
    entries.forEach(entry => {
      const policy = entry.policyUsed;
      if (!policyGroups.has(policy)) {
        policyGroups.set(policy, []);
      }
      policyGroups.get(policy)!.push(entry);
    });

    return Array.from(policyGroups.entries()).map(([policyName, policyEntries]) => {
      const allowed = policyEntries.filter(e => e.decision.decision === 'PERMIT').length;
      const avgProcessingTime = policyEntries.reduce((sum, e) => sum + e.processingTime, 0) / policyEntries.length;
      
      const violations = policyEntries
        .filter(e => e.decision.decision === 'DENY')
        .map(e => e.decision.reason)
        .reduce((acc, reason) => {
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const topViolations = Object.entries(violations)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => `${reason} (${count}回)`);

      return {
        policyName,
        requestCount: policyEntries.length,
        allowRate: policyEntries.length > 0 ? (allowed / policyEntries.length) * 100 : 0,
        avgProcessingTime,
        topViolations
      };
    });
  }

  private assessRisk(entries: AuditEntry[]): RiskAssessment {
    const riskFactors: RiskFactor[] = [];

    // 拒否率のリスク評価
    const deniedCount = entries.filter(e => e.decision.decision === 'DENY').length;
    const denyRate = entries.length > 0 ? deniedCount / entries.length : 0;
    
    if (denyRate > 0.3) {
      riskFactors.push({
        category: 'HIGH_DENIAL_RATE',
        severity: 'HIGH',
        description: `拒否率が${(denyRate * 100).toFixed(1)}%と高い`,
        count: deniedCount
      });
    }

    // エラー率のリスク評価
    const errorCount = entries.filter(e => e.outcome === 'ERROR').length;
    const errorRate = entries.length > 0 ? errorCount / entries.length : 0;
    
    if (errorRate > 0.1) {
      riskFactors.push({
        category: 'HIGH_ERROR_RATE',
        severity: 'MEDIUM',
        description: `エラー率が${(errorRate * 100).toFixed(1)}%`,
        count: errorCount
      });
    }

    // 全体的なリスクレベル決定
    const maxSeverity = riskFactors.reduce((max, factor) => {
      const severityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      return Math.max(max, severityLevels[factor.severity]);
    }, 0);

    const overallRiskLevel = 
      maxSeverity >= 4 ? 'CRITICAL' :
      maxSeverity >= 3 ? 'HIGH' :
      maxSeverity >= 2 ? 'MEDIUM' : 'LOW';

    return {
      overallRiskLevel,
      riskFactors,
      mitigationSuggestions: this.generateMitigationSuggestions(riskFactors)
    };
  }

  private generateMitigationSuggestions(riskFactors: RiskFactor[]): string[] {
    const suggestions: string[] = [];

    riskFactors.forEach(factor => {
      switch (factor.category) {
        case 'HIGH_DENIAL_RATE':
          suggestions.push('ポリシーの見直しを検討してください');
          suggestions.push('拒否理由の詳細分析を実施してください');
          break;
        case 'HIGH_ERROR_RATE':
          suggestions.push('システムの安定性を確認してください');
          suggestions.push('エラーログの詳細調査を実施してください');
          break;
      }
    });

    return [...new Set(suggestions)]; // 重複除去
  }

  private generateRecommendations(entries: AuditEntry[], riskAssessment: RiskAssessment): string[] {
    const recommendations: string[] = [];

    if (entries.length === 0) {
      recommendations.push('監査データが不足しています。システムの利用状況を確認してください。');
      return recommendations;
    }

    // リスクベースの推奨事項
    if (riskAssessment.overallRiskLevel === 'HIGH' || riskAssessment.overallRiskLevel === 'CRITICAL') {
      recommendations.push('緊急: 高リスクが検出されました。即座の対応が必要です。');
    }

    // 一般的な推奨事項
    recommendations.push('定期的な監査レポートの確認を継続してください。');
    
    if (riskAssessment.riskFactors.length === 0) {
      recommendations.push('現在のセキュリティ態勢は良好です。現状の運用を継続してください。');
    }

    return recommendations;
  }

  private async saveReport(report: ComplianceReport | AnomalyReport | PatternAnalysis, type: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${type}_report_${timestamp}.json`;
      const reportsDir = path.join(this.auditLogPath, 'reports');
      
      await fs.mkdir(reportsDir, { recursive: true });
      
      const filePath = path.join(reportsDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2));
      
      logger.info(`${type} report saved`, { filePath });
    } catch (error) {
      logger.error(`Failed to save ${type} report`, error);
    }
  }

  /**
   * 異常アクセス検知
   */
  async detectAnomalousAccess(threshold: number = 0.1): Promise<AnomalyReport[]> {
    const reports: AnomalyReport[] = [];
    const recentEntries = this.getRecentEntries(24); // 直近24時間

    // 異常なアクセスパターンを検知
    const patterns = this.analyzeAccessPatterns(recentEntries);
    
    patterns.forEach(pattern => {
      if (pattern.riskScore > threshold) {
        reports.push({
          anomalyId: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          detectedAt: new Date(),
          type: 'UNUSUAL_ACCESS_PATTERN',
          severity: pattern.riskScore > 0.8 ? 'CRITICAL' : pattern.riskScore > 0.5 ? 'HIGH' : 'MEDIUM',
          description: `異常なアクセスパターンを検知: ${pattern.pattern}`,
          affectedResources: [pattern.pattern],
          suggestedActions: ['詳細調査の実施', 'アクセス制限の検討'],
          relatedEntries: recentEntries.filter(e => e.context.resource.includes(pattern.pattern))
        });
      }
    });

    logger.info('Anomaly detection completed', { anomaliesFound: reports.length });
    return reports;
  }

  private getRecentEntries(hours: number): AuditEntry[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return Array.from(this.auditEntries.values()).filter(entry => 
      entry.timestamp >= cutoff
    );
  }

  private analyzeAccessPatterns(entries: AuditEntry[]): AccessPattern[] {
    const patterns = new Map<string, { count: number, hours: Record<string, number> }>();

    entries.forEach(entry => {
      const resource = entry.context.resource;
      const hour = entry.timestamp.getHours().toString();

      if (!patterns.has(resource)) {
        patterns.set(resource, { count: 0, hours: {} });
      }

      const pattern = patterns.get(resource)!;
      pattern.count++;
      pattern.hours[hour] = (pattern.hours[hour] || 0) + 1;
    });

    return Array.from(patterns.entries()).map(([resource, data]) => ({
      pattern: resource,
      frequency: data.count,
      timeDistribution: data.hours,
      riskScore: this.calculatePatternRiskScore(data)
    }));
  }

  private calculatePatternRiskScore(data: { count: number, hours: Record<string, number> }): number {
    // 時間分布の偏りを計算（異常な時間帯のアクセスを検知）
    const hours = Object.keys(data.hours).map(Number);
    const nightTimeAccess = hours.filter(h => h < 6 || h > 22).length;
    const nightTimeRatio = nightTimeAccess / hours.length;

    // アクセス頻度の異常性
    const avgFrequency = 10; // 想定される平均アクセス数
    const frequencyRatio = Math.min(data.count / avgFrequency, 2.0);

    // 総合リスクスコア
    return (nightTimeRatio * 0.6 + (frequencyRatio - 1) * 0.4);
  }

  /**
   * アクセスパターン分析
   */
  async createAccessPatternAnalysis(timeRange?: DateRange): Promise<PatternAnalysis> {
    const entries = timeRange ? 
      this.getEntriesInRange(timeRange) : 
      this.getRecentEntries(7 * 24); // デフォルトは直近1週間

    const accessPatterns = this.analyzeAccessPatterns(entries);
    const agentBehaviorProfiles = this.analyzeAgentBehavior(entries);
    const resourceUsageStats = this.analyzeResourceUsage(entries);

    const analysis: PatternAnalysis = {
      analysisId: `pattern_${Date.now()}`,
      generatedAt: new Date(),
      timeRange: timeRange || {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      },
      accessPatterns,
      agentBehaviorProfiles,
      resourceUsageStats
    };

    await this.saveReport(analysis, 'pattern');

    logger.info('Access pattern analysis completed', { 
      analysisId: analysis.analysisId,
      patterns: accessPatterns.length,
      agents: agentBehaviorProfiles.length
    });

    return analysis;
  }

  private analyzeAgentBehavior(entries: AuditEntry[]): AgentProfile[] {
    const agentData = new Map<string, AuditEntry[]>();

    entries.forEach(entry => {
      const agent = entry.context.agent;
      if (!agentData.has(agent)) {
        agentData.set(agent, []);
      }
      agentData.get(agent)!.push(entry);
    });

    return Array.from(agentData.entries()).map(([agentId, agentEntries]) => {
      const totalRequests = agentEntries.length;
      const successfulRequests = agentEntries.filter(e => e.decision.decision === 'PERMIT').length;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

      const resourceCounts = new Map<string, number>();
      agentEntries.forEach(entry => {
        const resource = entry.context.resource;
        resourceCounts.set(resource, (resourceCounts.get(resource) || 0) + 1);
      });

      const preferredResources = Array.from(resourceCounts.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([resource]) => resource);

      return {
        agentId,
        totalRequests,
        successRate,
        preferredResources,
        riskScore: this.calculateAgentRiskScore(agentEntries),
        behaviorChanges: [] // TODO: 実装時系列分析
      };
    });
  }

  private calculateAgentRiskScore(entries: AuditEntry[]): number {
    const denialRate = entries.filter(e => e.decision.decision === 'DENY').length / entries.length;
    const errorRate = entries.filter(e => e.outcome === 'ERROR').length / entries.length;
    
    return Math.min(denialRate * 0.7 + errorRate * 0.3, 1.0);
  }

  private analyzeResourceUsage(entries: AuditEntry[]): ResourceUsage[] {
    const resourceData = new Map<string, { entries: AuditEntry[], agents: Set<string> }>();

    entries.forEach(entry => {
      const resource = entry.context.resource;
      if (!resourceData.has(resource)) {
        resourceData.set(resource, { entries: [], agents: new Set() });
      }
      
      const data = resourceData.get(resource)!;
      data.entries.push(entry);
      data.agents.add(entry.context.agent);
    });

    return Array.from(resourceData.entries()).map(([resource, data]) => {
      const avgAccessTime = data.entries.reduce((sum, e) => sum + e.processingTime, 0) / data.entries.length;
      
      return {
        resourcePattern: resource,
        accessCount: data.entries.length,
        uniqueAgents: data.agents.size,
        avgAccessTime,
        riskScore: this.calculateResourceRiskScore(data.entries)
      };
    });
  }

  private calculateResourceRiskScore(entries: AuditEntry[]): number {
    const denialRate = entries.filter(e => e.decision.decision === 'DENY').length / entries.length;
    const highProcessingTime = entries.filter(e => e.processingTime > 5000).length / entries.length;
    
    return Math.min(denialRate * 0.8 + highProcessingTime * 0.2, 1.0);
  }

  /**
   * 監査データのエクスポート
   */
  async exportAuditLogs(format: 'JSON' | 'CSV' | 'PDF', timeRange?: DateRange): Promise<Buffer> {
    const entries = timeRange ? 
      this.getEntriesInRange(timeRange) : 
      Array.from(this.auditEntries.values());

    switch (format) {
      case 'JSON':
        return Buffer.from(JSON.stringify(entries, null, 2));
      
      case 'CSV':
        return this.exportToCSV(entries);
      
      case 'PDF':
        // PDF生成は複雑なため、現時点ではプレースホルダー
        throw new Error('PDF export not yet implemented');
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private exportToCSV(entries: AuditEntry[]): Buffer {
    const headers = [
      'ID', 'Timestamp', 'Agent', 'Action', 'Resource', 'Decision', 
      'Reason', 'Confidence', 'Policy', 'ProcessingTime', 'Outcome'
    ].join(',');

    const rows = entries.map(entry => [
      entry.id,
      entry.timestamp.toISOString(),
      entry.context.agent,
      entry.context.action,
      entry.context.resource,
      entry.decision.decision,
      `"${entry.decision.reason}"`,
      entry.decision.confidence,
      entry.policyUsed,
      entry.processingTime,
      entry.outcome
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    return Buffer.from(csv);
  }

  /**
   * システム統計情報取得
   */
  getSystemStats(): { totalEntries: number, oldestEntry?: Date, newestEntry?: Date } {
    const entries = Array.from(this.auditEntries.values());
    
    if (entries.length === 0) {
      return { totalEntries: 0 };
    }

    const timestamps = entries.map(e => e.timestamp);
    
    return {
      totalEntries: entries.length,
      oldestEntry: new Date(Math.min(...timestamps.map(t => t.getTime()))),
      newestEntry: new Date(Math.max(...timestamps.map(t => t.getTime())))
    };
  }

  /**
   * 監査エントリを直接取得（ダッシュボード用）
   */
  getAuditEntries(): AuditEntry[] {
    return Array.from(this.auditEntries.values());
  }

  /**
   * 時間範囲でエントリを取得（公開メソッド）
   */
  getEntriesInTimeRange(start: Date, end: Date): AuditEntry[] {
    return this.getEntriesInRange({ start, end });
  }
}