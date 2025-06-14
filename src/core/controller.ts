// ============================================================================
// AEGIS - メインコントローラー（統合版）
// ============================================================================

import type { 
  DecisionContext, 
  AccessControlResult, 
  NaturalLanguagePolicyDefinition,
  ControllerStatistics,
  DecisionHistoryEntry,
  AEGISConfig
} from '../types/index.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
// Removed old WebSocket proxy import
import { Logger } from '../utils/logger.js';
import { SAMPLE_POLICIES } from '../../policies/sample-policies.js';
import { 
  ContextCollector,
  TimeBasedEnricher,
  AgentInfoEnricher,
  ResourceClassifierEnricher,
  SecurityInfoEnricher
} from '../context/index.js';
import { PolicyAdministrator } from '../policies/administrator.js';

export class AEGISController {
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  // Removed old WebSocket proxy reference
  private contextCollector: ContextCollector;
  private policyAdmin: PolicyAdministrator;
  
  // ポリシー管理
  private policies = new Map<string, NaturalLanguagePolicyDefinition>();
  
  // 履歴管理
  private decisionHistory: DecisionHistoryEntry[] = [];
  
  constructor(config: AEGISConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    // AI判定エンジン初期化
    this.judgmentEngine = new AIJudgmentEngine(config.llm);
    
    // MCPプロキシ初期化は削除（MCP標準実装を使用）
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // ポリシー管理者初期化
    this.policyAdmin = new PolicyAdministrator();
    
    // デフォルトポリシー設定
    this.setupDefaultPolicies();
  }

  // コンテキストエンリッチャーのセットアップ
  private setupContextEnrichers(): void {
    // 時間ベース情報エンリッチャー
    this.contextCollector.registerEnricher(new TimeBasedEnricher({
      start: 9,
      end: 18,
      timezone: 'Asia/Tokyo'
    }));

    // エージェント情報エンリッチャー
    this.contextCollector.registerEnricher(new AgentInfoEnricher());

    // リソース分類エンリッチャー
    this.contextCollector.registerEnricher(new ResourceClassifierEnricher());

    // セキュリティ情報エンリッチャー
    this.contextCollector.registerEnricher(new SecurityInfoEnricher());

    this.logger.info('Context enrichers registered successfully');
  }

  // メインのアクセス制御メソッド
  async controlAccess(
    agentId: string,
    action: string,
    resource: string,
    purpose?: string,
    additionalContext?: Record<string, any>
  ): Promise<AccessControlResult> {
    
    const startTime = Date.now();
    
    try {
      // 1. 基本コンテキスト構築
      const baseContext: DecisionContext = {
        agent: agentId,
        action: action,
        resource: resource,
        purpose: purpose,
        time: new Date(),
        location: additionalContext?.location,
        environment: additionalContext || {}
      };

      // 2. コンテキスト拡張（PIP呼び出し）
      const enrichedContext = await this.contextCollector.enrichContext(baseContext);

      // 3. 適用ポリシー選択
      const applicablePolicy = this.selectApplicablePolicy(enrichedContext.resource);
      
      // 4. AI判定実行
      const decision = await this.judgmentEngine.makeDecision(
        applicablePolicy.policy,
        enrichedContext,
        enrichedContext.environment
      );

      // 5. 結果構築
      const result: AccessControlResult = {
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        riskLevel: decision.riskLevel,
        constraints: decision.constraints || [],
        obligations: decision.obligations || [],
        monitoringRequirements: decision.monitoringRequirements || [],
        validityPeriod: decision.validityPeriod,
        processingTime: Date.now() - startTime,
        policyUsed: applicablePolicy.name,
        context: enrichedContext
      };

      // 6. 履歴記録
      this.recordDecisionHistory(enrichedContext, decision, applicablePolicy.name);

      // 7. ログ記録
      this.logger.decision(agentId, decision.decision, resource, decision.reason);

      return result;

    } catch (error) {
      this.logger.error('Access control error', {
        agentId,
        action,
        resource,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        decision: "DENY",
        reason: `システムエラーによりアクセスを拒否: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.0,
        riskLevel: "CRITICAL",
        constraints: ["システム管理者による確認が必要"],
        obligations: ["エラー詳細の報告"],
        monitoringRequirements: ["システムエラーとして記録"],
        processingTime: Date.now() - startTime,
        policyUsed: "error-policy",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ポリシー管理
  async addPolicy(name: string, policy: string, metadata?: any): Promise<string> {
    const policyDefinition: NaturalLanguagePolicyDefinition = {
      name: name,
      description: metadata?.description || `Policy for ${name}`,
      policy: policy,
      examples: metadata?.examples || [],
      metadata: {
        id: `policy-${Date.now()}`,
        name: name,
        description: metadata?.description || `Policy for ${name}`,
        version: "1.0.0",
        createdAt: new Date(),
        createdBy: metadata?.createdBy || "system",
        lastModified: new Date(),
        lastModifiedBy: metadata?.createdBy || "system",
        tags: metadata?.tags || [],
        status: "active"
      }
    };
    
    this.policies.set(name, policyDefinition);
    
    // MCPプロキシへの追加は削除（MCP標準実装で管理）
    
    this.logger.info(`Policy added: ${name}`);
    return policyDefinition.metadata.id;
  }

  // 適用ポリシー選択
  private selectApplicablePolicy(resource: string): { name: string; policy: string } {
    const lowerResource = resource.toLowerCase();
    
    if (lowerResource.includes('customer') || lowerResource.includes('personal')) {
      const policy = this.policies.get('customer-data-policy');
      return { name: 'customer-data-policy', policy: policy?.policy || '' };
    } else if (lowerResource.includes('email') || lowerResource.includes('gmail')) {
      const policy = this.policies.get('email-access-policy');
      return { name: 'email-access-policy', policy: policy?.policy || '' };
    } else if (lowerResource.includes('file') || lowerResource.includes('document')) {
      const policy = this.policies.get('file-system-policy');
      return { name: 'file-system-policy', policy: policy?.policy || '' };
    } else if (lowerResource.includes('delete') || lowerResource.includes('modify')) {
      const policy = this.policies.get('critical-operations-policy');
      return { name: 'critical-operations-policy', policy: policy?.policy || '' };
    } else {
      const policy = this.policies.get('default-policy');
      return { name: 'default-policy', policy: policy?.policy || '' };
    }
  }

  // デフォルトポリシー設定
  private setupDefaultPolicies(): void {
    Object.entries(SAMPLE_POLICIES).forEach(([key, policyData]) => {
      this.addPolicy(key, policyData.policy, {
        description: policyData.description,
        tags: policyData.tags,
        createdBy: 'system'
      });
    });
    
    this.logger.info('Default policies loaded successfully');
  }

  // 履歴記録
  private recordDecisionHistory(
    context: DecisionContext,
    decision: any,
    policyUsed: string
  ): void {
    this.decisionHistory.push({
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      context: context,
      decision: decision,
      policyUsed: policyUsed
    });

    // 履歴サイズ制限（設定値または最新1000件保持）
    const historyLimit = this.config.monitoring?.decisionHistoryLimit || 1000;
    if (this.decisionHistory.length > historyLimit) {
      this.decisionHistory = this.decisionHistory.slice(-historyLimit);
    }
  }

  // 統計情報取得
  getStatistics(): ControllerStatistics {
    const total = this.decisionHistory.length;
    const permitted = this.decisionHistory.filter(h => h.decision.decision === 'PERMIT').length;
    const denied = this.decisionHistory.filter(h => h.decision.decision === 'DENY').length;
    const indeterminate = this.decisionHistory.filter(h => h.decision.decision === 'INDETERMINATE').length;

    // 平均処理時間を計算
    const avgProcessingTime = total > 0
      ? this.decisionHistory.reduce((sum, h) => {
          const processingTime = (h.decision as any).processingTime || 0;
          return sum + processingTime;
        }, 0) / total
      : 0;

    return {
      totalDecisions: total,
      permitRate: total > 0 ? permitted / total : 0,
      denyRate: total > 0 ? denied / total : 0,
      permitCount: permitted,
      denyCount: denied,
      indeterminateCount: indeterminate,
      averageConfidence: total > 0 
        ? this.decisionHistory.reduce((sum, h) => sum + h.decision.confidence, 0) / total 
        : 0,
      averageProcessingTime: avgProcessingTime,
      topAgents: this.getTopAgents(),
      topResources: this.getTopResources(),
      riskDistribution: this.getRiskDistribution()
    };
  }

  private getTopAgents(): Array<{ agent: string; count: number }> {
    const agentCounts = new Map<string, number>();
    this.decisionHistory.forEach(h => {
      agentCounts.set(h.context.agent, (agentCounts.get(h.context.agent) || 0) + 1);
    });
    
    return Array.from(agentCounts.entries())
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTopResources(): Array<{ resource: string; count: number }> {
    const resourceCounts = new Map<string, number>();
    this.decisionHistory.forEach(h => {
      resourceCounts.set(h.context.resource, (resourceCounts.get(h.context.resource) || 0) + 1);
    });
    
    return Array.from(resourceCounts.entries())
      .map(([resource, count]) => ({ resource, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getRiskDistribution(): Record<string, number> {
    const distribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    this.decisionHistory.forEach(h => {
      const risk = h.decision.riskLevel || 'MEDIUM';
      distribution[risk] = (distribution[risk] || 0) + 1;
    });
    return distribution;
  }

  // ポリシー一覧取得
  listPolicies(): NaturalLanguagePolicyDefinition[] {
    return Array.from(this.policies.values());
  }

  // 判定履歴取得
  getDecisionHistory(filter?: {
    agent?: string;
    resource?: string;
    decision?: string;
    limit?: number;
  }): DecisionHistoryEntry[] {
    let filtered = this.decisionHistory;

    if (filter?.agent) {
      filtered = filtered.filter(entry => entry.context.agent === filter.agent);
    }
    if (filter?.resource) {
      filtered = filtered.filter(entry => entry.context.resource.includes(filter.resource!));
    }
    if (filter?.decision) {
      filtered = filtered.filter(entry => entry.decision.decision === filter.decision);
    }

    const limit = filter?.limit || 100;
    return filtered.slice(-limit);
  }

  // システム起動
  async start(): Promise<void> {
    try {
      // MCPプロキシサーバー起動は削除（MCP標準実装は別途起動）
      
      this.logger.info('🛡️ AEGIS Controller started successfully');
      this.logger.info(`📊 Loaded ${this.policies.size} policies`);
      this.logger.info(`🤖 AI Engine: ${this.config.llm.provider} (${this.config.llm.model})`);
      
    } catch (error) {
      this.logger.error('Failed to start AEGIS Controller', error);
      throw error;
    }
  }

  // ポリシー更新
  async updatePolicy(policyId: string, newPolicy: string): Promise<void> {
    const policyMeta = this.policies.get(policyId);
    if (!policyMeta) {
      throw new Error(`Policy ${policyId} not found`);
    }
    
    // ポリシー管理システムで更新
    await this.policyAdmin.updatePolicy(policyId, newPolicy, 'system');
    
    // 内部キャッシュを更新
    policyMeta.policy = newPolicy;
    policyMeta.metadata.lastModified = new Date();
    policyMeta.metadata.lastModifiedBy = 'system';
    
    this.logger.info(`Policy ${policyId} updated`);
  }

  // カスタムエンリッチャー追加
  addContextEnricher(enricher: any): void {
    this.contextCollector.registerEnricher(enricher);
    this.logger.info(`Added custom enricher: ${enricher.name}`);
  }

  // キャッシュクリア
  clearCache(): void {
    this.judgmentEngine.clearCache();
    this.logger.info('Decision cache cleared');
  }

  // システム停止
  async stop(): Promise<void> {
    try {
      // MCPプロキシサーバー停止は削除（MCP標準実装は別途停止）
      this.logger.info('🛑 AEGIS Controller stopped');
    } catch (error) {
      this.logger.error('Error stopping AEGIS Controller', error);
      throw error;
    }
  }
}