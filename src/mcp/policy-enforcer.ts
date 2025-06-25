// ============================================================================
// AEGIS - Policy Enforcer
// ポリシー判定処理を責務ごとに分離
// ============================================================================

import type { 
  DecisionContext, 
  AccessControlResult,
  PolicyDecision 
} from '../types/index.js';
import type {
  IContextCollector,
  IIntelligentCacheSystem,
  IHybridPolicyEngine,
  IAdvancedAuditSystem,
  IRealTimeAnomalyDetector,
  IPolicyLoader
} from '../types/component-interfaces.js';
import { Logger } from '../utils/logger.js';
import { TIMEOUTS, ERROR_MESSAGES } from '../constants/index.js';

export class PolicyEnforcer {
  constructor(
    private logger: Logger,
    private contextCollector: IContextCollector,
    private intelligentCacheSystem: IIntelligentCacheSystem | null,
    private hybridPolicyEngine: IHybridPolicyEngine,
    private advancedAuditSystem: IAdvancedAuditSystem,
    private realTimeAnomalyDetector: IRealTimeAnomalyDetector | null
  ) {}

  /**
   * ポリシー判定の実行（メインメソッド）
   */
  async enforcePolicy(
    action: string, 
    resource: string, 
    context: Record<string, any>,
    policyLoader?: IPolicyLoader
  ): Promise<AccessControlResult> {
    const startTime = Date.now();
    
    try {
      // 1. コンテキストの準備
      const enrichedContext = await this.prepareContext(action, resource, context);
      
      // 2. ポリシーの選択
      const policy = await this.selectPolicy(enrichedContext, policyLoader);
      
      // 3. キャッシュチェック
      const cachedResult = await this.checkCache(enrichedContext, policy);
      if (cachedResult) {
        await this.recordAudit(enrichedContext, cachedResult, 'cached-result', startTime);
        return {
          ...cachedResult,
          processingTime: Date.now() - startTime,
          policyUsed: policy || 'default-policy'
        } as AccessControlResult;
      }
      
      // 4. ポリシー判定の実行
      const decision = await this.executeDecision(enrichedContext, policy);
      
      // 5. 結果の処理
      const result = this.processResult(decision, startTime, policy);
      
      // 6. 監査とキャッシュ
      await this.postProcess(enrichedContext, result, policy);
      
      return result;
    } catch (error) {
      this.logger.error('Policy enforcement error:', error);
      throw error;
    }
  }

  /**
   * コンテキストの準備と拡張
   */
  private async prepareContext(
    action: string,
    resource: string,
    context: Record<string, any>
  ): Promise<DecisionContext> {
    const baseContext: DecisionContext = {
      agent: context.agent || 'mcp-client',
      action,
      resource,
      purpose: context.request?.params?.purpose || 'general-operation',
      time: new Date(),
      environment: {
        transport: context.transport || 'stdio',
        ...context
      }
    };
    
    return await this.contextCollector.enrichContext(baseContext);
  }

  /**
   * 適用するポリシーの選択
   */
  private async selectPolicy(
    context: DecisionContext,
    policyLoader?: IPolicyLoader
  ): Promise<string | null> {
    if (policyLoader) {
      const activePolicies = policyLoader.getActivePolicies();
      if (activePolicies.length > 0) {
        const selectedPolicy = activePolicies[0];
        this.logger.info(`Using policy: ${selectedPolicy.name} (priority: ${selectedPolicy.metadata.priority})`);
        return policyLoader.formatPolicyForAI(selectedPolicy);
      }
    }
    
    // デフォルトポリシーの選択ロジック
    return null;
  }

  /**
   * キャッシュからの結果取得
   */
  private async checkCache(
    context: DecisionContext,
    policy: string | null
  ): Promise<PolicyDecision | null> {
    if (!this.intelligentCacheSystem) return null;
    
    const cachedResult = await this.intelligentCacheSystem.get(
      context, 
      policy || '', 
      context.environment
    );
    
    if (cachedResult) {
      this.logger.debug('Using cached decision result', {
        action: context.action,
        resource: context.resource,
        decision: cachedResult.decision,
        confidence: cachedResult.confidence
      });
    }
    
    return cachedResult;
  }

  /**
   * ポリシー判定の実行
   */
  private async executeDecision(
    context: DecisionContext,
    policy: string | null
  ): Promise<PolicyDecision> {
    const timeoutPromise = new Promise<PolicyDecision>((_, reject) => {
      setTimeout(() => reject(new Error('Policy decision timeout')), TIMEOUTS.POLICY_DECISION);
    });
    
    const decisionPromise = this.hybridPolicyEngine.decide(context, policy);
    
    return await Promise.race([decisionPromise, timeoutPromise]);
  }

  /**
   * 判定結果の処理
   */
  private processResult(
    decision: PolicyDecision,
    startTime: number,
    policy: string | null
  ): AccessControlResult {
    return {
      ...decision,
      processingTime: Date.now() - startTime,
      policyUsed: policy ? 'custom-policy' : 'default-policy',
      context: undefined  // context is optional in AccessControlResult
    };
  }

  /**
   * 後処理（監査、キャッシュ、異常検知）
   */
  private async postProcess(
    context: DecisionContext,
    result: AccessControlResult,
    policy: string | null
  ): Promise<void> {
    // 並列実行可能な処理
    await Promise.all([
      this.recordAudit(context, result, policy || 'default', Date.now() - result.processingTime),
      this.updateCache(context, result, policy),
      this.detectAnomalies(context, result)
    ]);
  }

  /**
   * 監査ログの記録
   */
  private async recordAudit(
    context: DecisionContext,
    decision: PolicyDecision,
    policyName: string,
    startTime: number
  ): Promise<void> {
    try {
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await this.advancedAuditSystem.recordAuditEntry(
        context,
        decision,
        policyName,
        Date.now() - startTime,
        outcome,
        {
          requestType: context.action,
          resourcePath: context.resource,
          transport: context.environment?.transport || 'unknown'
        }
      );
    } catch (error) {
      this.logger.error('Failed to record audit entry', error);
    }
  }

  /**
   * キャッシュの更新
   */
  private async updateCache(
    context: DecisionContext,
    result: AccessControlResult,
    policy: string | null
  ): Promise<void> {
    if (!this.intelligentCacheSystem) return;
    
    try {
      await this.intelligentCacheSystem.set(
        context,
        policy || '',
        result,
        context.environment
      );
      
      this.logger.debug('Decision result cached', {
        action: context.action,
        resource: context.resource,
        decision: result.decision
      });
    } catch (error) {
      this.logger.error('Failed to cache decision result', error);
    }
  }

  /**
   * 異常検知
   */
  private async detectAnomalies(
    context: DecisionContext,
    result: AccessControlResult
  ): Promise<void> {
    if (!this.realTimeAnomalyDetector) return;
    
    try {
      await this.realTimeAnomalyDetector.analyzeDecision(
        context,
        result,
        {
          timestamp: new Date(),
          source: 'policy-enforcement'
        }
      );
    } catch (error) {
      this.logger.error('Failed to analyze decision for anomalies', error);
    }
  }
}