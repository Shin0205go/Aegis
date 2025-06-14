import { ContextEnricher } from '../collector';
import { DecisionContext } from '../../types';

/**
 * エージェント情報エンリッチャー
 * 
 * エージェントの種別、部署、クリアランスレベル、作成日などの情報を追加
 */
export class AgentInfoEnricher implements ContextEnricher {
  name = 'agent-info';

  // エージェント情報のモックデータベース
  private agentDatabase: Map<string, AgentInfo> = new Map([
    ['customer-support-agent', {
      id: 'customer-support-agent',
      type: 'support',
      department: 'customer-service',
      clearanceLevel: 2,
      createdAt: new Date('2024-01-15'),
      lastActivity: new Date(),
      permissions: ['read-customer-data', 'create-tickets'],
      tags: ['production', 'verified'],
      riskScore: 0.2,
      isExternal: false,
      supervisor: 'support-manager',
      location: 'tokyo-office'
    }],
    ['sales-agent', {
      id: 'sales-agent',
      type: 'sales',
      department: 'sales',
      clearanceLevel: 3,
      createdAt: new Date('2024-02-01'),
      lastActivity: new Date(),
      permissions: ['read-customer-data', 'read-financial-data', 'create-proposals'],
      tags: ['production', 'verified', 'high-value'],
      riskScore: 0.3,
      isExternal: false,
      supervisor: 'sales-director',
      location: 'osaka-office'
    }],
    ['external-contractor', {
      id: 'external-contractor',
      type: 'contractor',
      department: 'external',
      clearanceLevel: 1,
      createdAt: new Date('2024-06-01'),
      lastActivity: new Date(),
      permissions: ['read-public-data'],
      tags: ['external', 'limited-access'],
      riskScore: 0.8,
      isExternal: true,
      supervisor: 'contract-manager',
      location: 'remote'
    }],
    ['admin-agent', {
      id: 'admin-agent',
      type: 'admin',
      department: 'it',
      clearanceLevel: 5,
      createdAt: new Date('2023-01-01'),
      lastActivity: new Date(),
      permissions: ['*'],
      tags: ['production', 'verified', 'admin', 'privileged'],
      riskScore: 0.1,
      isExternal: false,
      supervisor: 'cto',
      location: 'tokyo-hq'
    }]
  ]);

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    const agentId = context.agent;
    const agentInfo = this.agentDatabase.get(agentId) || this.createDefaultAgentInfo(agentId);

    // エージェントの稼働期間を計算
    const now = new Date();
    const ageDays = Math.floor((now.getTime() - agentInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const inactiveDays = Math.floor((now.getTime() - agentInfo.lastActivity.getTime()) / (1000 * 60 * 60 * 24));

    // エージェントの信頼度スコアを計算
    const trustScore = this.calculateTrustScore(agentInfo, ageDays, inactiveDays);

    // エージェントのアクティビティステータス
    const activityStatus = this.getActivityStatus(inactiveDays);

    // エージェントのクリアランス判定
    const hasHighClearance = agentInfo.clearanceLevel >= 3;
    const hasAdminPrivileges = agentInfo.permissions.includes('*') || agentInfo.type === 'admin';

    return {
      [this.name]: {
        agentId: agentInfo.id,
        agentType: agentInfo.type,
        department: agentInfo.department,
        clearanceLevel: agentInfo.clearanceLevel,
        clearanceName: this.getClearanceName(agentInfo.clearanceLevel),
        isExternal: agentInfo.isExternal,
        createdAt: agentInfo.createdAt.toISOString(),
        lastActivity: agentInfo.lastActivity.toISOString(),
        ageDays,
        inactiveDays,
        activityStatus,
        permissions: agentInfo.permissions,
        tags: agentInfo.tags,
        riskScore: agentInfo.riskScore,
        trustScore,
        hasHighClearance,
        hasAdminPrivileges,
        supervisor: agentInfo.supervisor,
        location: agentInfo.location,
        isNewAgent: ageDays < 30,
        isInactive: inactiveDays > 30,
        requiresSupervision: agentInfo.riskScore > 0.5 || agentInfo.isExternal
      }
    };
  }

  private createDefaultAgentInfo(agentId: string): AgentInfo {
    // 未知のエージェントのデフォルト情報
    return {
      id: agentId,
      type: 'unknown',
      department: 'unknown',
      clearanceLevel: 0,
      createdAt: new Date(),
      lastActivity: new Date(),
      permissions: [],
      tags: ['unverified'],
      riskScore: 1.0, // 最高リスク
      isExternal: true, // 安全側に倒す
      supervisor: 'security-team',
      location: 'unknown'
    };
  }

  private calculateTrustScore(agentInfo: AgentInfo, ageDays: number, inactiveDays: number): number {
    let score = 1.0;

    // リスクスコアから基本信頼度を計算
    score -= agentInfo.riskScore;

    // エージェントの年齢による補正（古いほど信頼度が高い）
    if (ageDays > 365) score += 0.2;
    else if (ageDays > 180) score += 0.1;
    else if (ageDays < 30) score -= 0.2;

    // 非アクティブ期間による減点
    if (inactiveDays > 90) score -= 0.3;
    else if (inactiveDays > 30) score -= 0.1;

    // 外部エージェントの減点
    if (agentInfo.isExternal) score -= 0.2;

    // クリアランスレベルによる加点
    score += agentInfo.clearanceLevel * 0.1;

    // タグによる補正
    if (agentInfo.tags.includes('verified')) score += 0.1;
    if (agentInfo.tags.includes('admin')) score += 0.2;
    if (agentInfo.tags.includes('high-value')) score += 0.1;

    // 0.0〜1.0の範囲に収める
    return Math.max(0, Math.min(1, score));
  }

  private getActivityStatus(inactiveDays: number): string {
    if (inactiveDays === 0) return 'active-today';
    if (inactiveDays <= 1) return 'active-yesterday';
    if (inactiveDays <= 7) return 'active-this-week';
    if (inactiveDays <= 30) return 'active-this-month';
    if (inactiveDays <= 90) return 'inactive-recent';
    return 'inactive-long';
  }

  private getClearanceName(level: number): string {
    const clearanceNames = [
      'none',        // 0
      'basic',       // 1
      'standard',    // 2
      'elevated',    // 3
      'high',        // 4
      'top-secret'   // 5
    ];
    return clearanceNames[level] || 'unknown';
  }

  /**
   * エージェント情報を更新
   */
  updateAgentInfo(agentId: string, info: Partial<AgentInfo>): void {
    const existing = this.agentDatabase.get(agentId);
    if (existing) {
      this.agentDatabase.set(agentId, { ...existing, ...info });
    } else {
      this.agentDatabase.set(agentId, {
        ...this.createDefaultAgentInfo(agentId),
        ...info
      });
    }
  }

  /**
   * エージェント情報を削除
   */
  removeAgentInfo(agentId: string): void {
    this.agentDatabase.delete(agentId);
  }
}

interface AgentInfo {
  id: string;
  type: string;
  department: string;
  clearanceLevel: number;
  createdAt: Date;
  lastActivity: Date;
  permissions: string[];
  tags: string[];
  riskScore: number;
  isExternal: boolean;
  supervisor: string;
  location: string;
}