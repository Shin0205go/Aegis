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
import { PolicyConflictResolver, PolicyApplicabilityFilter } from '../policies/policy-resolver.js';
import { HybridPolicyEngine } from '../policy/hybrid-policy-engine.js';

export class AEGISController {
  private config: AEGISConfig;
  private logger: Logger;
  private judgmentEngine: AIJudgmentEngine;
  private hybridPolicyEngine: HybridPolicyEngine;
  // Removed old WebSocket proxy reference
  private contextCollector: ContextCollector;
  private policyAdmin: PolicyAdministrator;
  private policyResolver: PolicyConflictResolver;
  private policyFilter: PolicyApplicabilityFilter;
  
  // ポリシー管理
  private policies = new Map<string, NaturalLanguagePolicyDefinition>();
  
  // 履歴管理
  private decisionHistory: DecisionHistoryEntry[] = [];
  
  constructor(config: AEGISConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    // AI判定エンジン初期化
    this.judgmentEngine = new AIJudgmentEngine(config.llm);
    
    // ハイブリッドポリシーエンジン初期化
    this.hybridPolicyEngine = new HybridPolicyEngine(this.judgmentEngine, {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.7, // AI判定の信頼度閾値を下げる（現在の厳格すぎる問題に対処）
      cacheEnabled: true,
      cacheTTL: 300000 // 5分
    });
    
    // MCPプロキシ初期化は削除（MCP標準実装を使用）
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // ポリシー管理者初期化
    this.policyAdmin = new PolicyAdministrator();
    this.policyResolver = new PolicyConflictResolver();
    this.policyFilter = new PolicyApplicabilityFilter();
    
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

      // 3. 適用可能なポリシーを取得
      const allPolicies = await this.getAllActivePolicies();
      const applicablePolicies = this.policyFilter.filterApplicablePolicies(
        allPolicies, 
        enrichedContext
      );

      if (applicablePolicies.length === 0) {
        this.logger.warn('No applicable policies found for context');
        return {
          decision: 'INDETERMINATE',
          reason: 'No applicable policies found',
          confidence: 0,
          riskLevel: 'MEDIUM',
          constraints: [],
          obligations: ['Report missing policy coverage'],
          monitoringRequirements: [],
          processingTime: Date.now() - startTime,
          policyUsed: 'none',
          context: enrichedContext
        };
      }

      // 4. 各ポリシーで判定を実行
      const decisions = await Promise.all(
        applicablePolicies.map(async (policy) => {
          const decision = await this.hybridPolicyEngine.decide(
            enrichedContext,
            policy.policy
          );
          return { policy, decision };
        })
      );

      // 5. 競合解決戦略を選択
      const strategy = this.policyResolver.suggestStrategy(enrichedContext);
      
      // 6. 競合を解決
      const resolution = await this.policyResolver.resolveConflicts(decisions, strategy);

      // 7. 結果構築
      const result: AccessControlResult = {
        decision: resolution.finalDecision.decision,
        reason: resolution.finalDecision.reason,
        confidence: resolution.finalDecision.confidence,
        riskLevel: resolution.finalDecision.riskLevel,
        constraints: resolution.finalDecision.constraints || [],
        obligations: resolution.finalDecision.obligations || [],
        monitoringRequirements: resolution.finalDecision.monitoringRequirements || [],
        validityPeriod: resolution.finalDecision.validityPeriod,
        processingTime: Date.now() - startTime,
        policyUsed: resolution.appliedPolicies.map(p => p.policyName).join(', '),
        context: enrichedContext,
        conflictResolution: resolution.conflictDetails
      };

      // 8. 履歴記録
      this.recordDecisionHistory(
        enrichedContext, 
        resolution.finalDecision, 
        resolution.appliedPolicies.map(p => p.policyName).join(', ')
      );

      // 9. ログ記録
      this.logger.decision(agentId, resolution.finalDecision.decision, resource, resolution.finalDecision.reason);

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

    // 履歴サイズ制限（最新1000件保持）
    const historyLimit = 1000;
    if (this.decisionHistory.length > historyLimit) {
      this.decisionHistory = this.decisionHistory.slice(-historyLimit);
    }
  }

  // すべてのアクティブなポリシーを取得
  private async getAllActivePolicies(): Promise<NaturalLanguagePolicyDefinition[]> {
    const policies: NaturalLanguagePolicyDefinition[] = [];
    
    // メモリ内のポリシー
    for (const policy of this.policies.values()) {
      if (policy.metadata.status === 'active') {
        policies.push(policy);
      }
    }
    
    // 設定ファイルからのポリシー
    const configPolicies = this.policyAdmin.getActivePoliciesFromConfig();
    for (const configPolicy of configPolicies) {
      const policyDef: NaturalLanguagePolicyDefinition = {
        name: configPolicy.name,
        description: configPolicy.description || '',
        policy: this.policyAdmin.formatConfigPolicyForAI(configPolicy.id) || '',
        examples: [],
        metadata: {
          id: configPolicy.id,
          name: configPolicy.name,
          description: configPolicy.description || '',
          version: configPolicy.version,
          createdAt: new Date(configPolicy.metadata.createdAt),
          createdBy: configPolicy.metadata.createdBy,
          lastModified: new Date(configPolicy.metadata.createdAt),
          lastModifiedBy: configPolicy.metadata.createdBy,
          tags: configPolicy.metadata.tags || [],
          status: configPolicy.status as any,
          priority: configPolicy.metadata.priority
        }
      };
      policies.push(policyDef);
    }
    
    // PolicyAdministratorからのポリシー
    const adminPolicies = await this.policyAdmin.listPolicies({ status: 'active' });
    for (const metadata of adminPolicies) {
      const policyData = await this.policyAdmin.getPolicy(metadata.id);
      if (policyData) {
        const policyDef: NaturalLanguagePolicyDefinition = {
          name: metadata.name,
          description: metadata.description,
          policy: policyData.policy,
          examples: [],
          metadata: metadata
        };
        policies.push(policyDef);
      }
    }
    
    return policies;
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
    this.hybridPolicyEngine.clearCache();
    this.logger.info('Decision cache cleared');
  }

  // ODRL ポリシー管理
  addODRLPolicy(policyId: string, policy: any): void {
    this.hybridPolicyEngine.addODRLPolicy(policyId, policy);
    this.logger.info(`ODRL policy added: ${policyId}`);
  }

  removeODRLPolicy(policyId: string): boolean {
    const removed = this.hybridPolicyEngine.removeODRLPolicy(policyId);
    if (removed) {
      this.logger.info(`ODRL policy removed: ${policyId}`);
    } else {
      this.logger.warn(`ODRL policy not found: ${policyId}`);
    }
    return removed;
  }

  listODRLPolicies(): Array<{ id: string; name: string }> {
    return this.hybridPolicyEngine.listODRLPolicies();
  }

  // ハイブリッドエンジン統計情報
  getHybridEngineStats(): any {
    return this.hybridPolicyEngine.getStats();
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