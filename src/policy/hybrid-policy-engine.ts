/**
 * Hybrid Policy Engine
 * Combines ODRL rule-based evaluation with AI judgment
 */

import { ODRLEvaluator } from '../odrl/evaluator';
import { ODRLParser } from '../odrl/parser';
import { 
  ODRLPolicy, 
  AEGISPolicy, 
  EvaluationContext,
  PolicyDecision as ODRLDecision 
} from '../odrl/types';
import { defaultPolicySet } from '../odrl/sample-policies';
import { PolicyDecision, DecisionContext } from '../types';
import { logger } from '../utils/logger';
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { PolicyFormatDetector, PolicyFormat } from './policy-detector';

export interface HybridPolicyConfig {
  useODRL: boolean;
  useAI: boolean;
  odrlPolicies?: AEGISPolicy[];
  aiThreshold?: number; // Confidence threshold for AI decisions
  cacheEnabled?: boolean;
  cacheTTL?: number;
  autoDetectFormat?: boolean; // 自動形式検出を有効化
}

export class HybridPolicyEngine {
  private odrlEvaluator: ODRLEvaluator;
  private aiEngine: AIJudgmentEngine;
  private odrlPolicies: AEGISPolicy[];
  private config: HybridPolicyConfig;
  private decisionCache: Map<string, { decision: PolicyDecision; timestamp: number }>;

  constructor(
    aiEngine: AIJudgmentEngine,
    config: HybridPolicyConfig = {
      useODRL: true,
      useAI: true,
      aiThreshold: 0.8,
      cacheEnabled: true,
      cacheTTL: 300000 // 5 minutes
    }
  ) {
    this.odrlEvaluator = new ODRLEvaluator();
    this.aiEngine = aiEngine;
    this.config = config;
    this.odrlPolicies = config.odrlPolicies || defaultPolicySet;
    this.decisionCache = new Map();
    
    logger.info('Hybrid Policy Engine initialized', {
      odrlEnabled: config.useODRL,
      aiEnabled: config.useAI,
      policiesLoaded: this.odrlPolicies.length
    });
  }

  /**
   * Make a policy decision using hybrid approach
   */
  async decide(
    context: DecisionContext,
    policyText?: string | object
  ): Promise<PolicyDecision> {
    const startTime = Date.now();
    
    // Check cache
    const cacheKey = this.getCacheKey(context);
    const cached = this.getCachedDecision(cacheKey);
    if (cached) {
      logger.debug('Returning cached decision', { cacheKey });
      return cached;
    }

    try {
      // Auto-detect policy format if enabled
      let useODRL = this.config.useODRL;
      let useAI = this.config.useAI;
      
      if (this.config.autoDetectFormat && policyText) {
        const detection = PolicyFormatDetector.detect(policyText);
        logger.info('Policy format auto-detected', {
          format: detection.format,
          confidence: detection.confidence,
          indicators: detection.indicators
        });
        
        // Override config based on detection
        if (detection.confidence > 0.7) {
          if (detection.format === 'ODRL') {
            useODRL = true;
            useAI = false;
          } else if (detection.format === 'NATURAL_LANGUAGE') {
            useODRL = false;
            useAI = true;
          }
        }
      }

      // Step 1: Try ODRL evaluation first (fast, deterministic)
      if (useODRL) {
        const odrlContext = this.convertToODRLContext(context);
        const odrlDecision = await this.evaluateODRL(odrlContext);
        
        // If ODRL gives a clear decision, use it
        if (odrlDecision && this.isDefinitiveDecision(odrlDecision)) {
          const decision = this.convertFromODRLDecision(odrlDecision, context);
          logger.info('ODRL decision made', {
            decision: decision.decision,
            reason: decision.reason,
            evaluationTime: Date.now() - startTime
          });
          
          this.cacheDecision(cacheKey, decision);
          return decision;
        }
      }

      // Step 2: Fall back to AI for complex cases
      if (useAI && this.aiEngine) {
        // AIエンジンには文字列形式のポリシーのみ渡す
        let aiPolicyText: string | undefined;
        if (typeof policyText === 'string') {
          aiPolicyText = policyText;
        } else if (policyText && typeof policyText === 'object') {
          // ODRLオブジェクトの場合、naturalLanguageSourceを優先的に使用
          const odrlPolicy = policyText as any;
          if (odrlPolicy.naturalLanguageSource) {
            aiPolicyText = odrlPolicy.naturalLanguageSource;
            logger.debug('Using naturalLanguageSource for AI judgment');
          } else {
            // naturalLanguageSourceがない場合は、ODRLをJSON文字列化（フォールバック）
            aiPolicyText = JSON.stringify(policyText, null, 2);
            logger.debug('Falling back to JSON stringified ODRL for AI judgment');
          }
        }
        const aiDecision = await this.aiEngine.judge(context, aiPolicyText);
        
        // If AI confidence is high enough, use it
        if (aiDecision.confidence >= (this.config.aiThreshold || 0.8)) {
          logger.info('AI decision made', {
            decision: aiDecision.decision,
            confidence: aiDecision.confidence,
            evaluationTime: Date.now() - startTime
          });
          
          // Add metadata for AI engine
          const enhancedDecision = {
            ...aiDecision,
            metadata: {
              ...aiDecision.metadata,
              engine: 'AI',
              evaluationTime: Date.now() - startTime
            }
          };
          
          this.cacheDecision(cacheKey, enhancedDecision);
          return enhancedDecision;
        }
      }

      // Step 3: If both uncertain, combine insights
      let combineAIText: string | undefined;
      if (typeof policyText === 'string') {
        combineAIText = policyText;
      } else if (policyText && typeof policyText === 'object') {
        const odrlPolicy = policyText as any;
        combineAIText = odrlPolicy.naturalLanguageSource || JSON.stringify(policyText, null, 2);
      }
      return this.combineDecisions(context, combineAIText);
      
    } catch (error) {
      logger.error('Hybrid policy engine error', error);
      
      // Fail safe: deny on error
      return {
        decision: 'DENY',
        reason: 'Policy evaluation failed',
        confidence: 1.0,
        constraints: [],
        obligations: [],
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          evaluationTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Convert DecisionContext to EvaluationContext for ODRL
   */
  private convertToODRLContext(context: DecisionContext): EvaluationContext {
    return {
      dateTime: context.time.toISOString(),
      
      agent: {
        id: context.agent,
        type: context.agentType || 'unknown',
        role: context.agentRole,
        clearanceLevel: context.clearanceLevel,
        trustScore: context.trustScore || 0.5
      },
      
      resource: {
        type: context.resource,
        id: context.resourceId,
        classification: context.resourceClassification || 'internal'
      },
      
      action: {
        type: context.action,
        mcpMethod: context.mcpMethod,
        mcpTool: context.mcpTool
      },
      
      environment: {
        ipAddress: context.ipAddress,
        location: context.location,
        emergency: context.emergency || false,
        delegationChain: context.delegationChain,
        sessionId: context.sessionId
      },
      
      extensions: context.metadata
    };
  }

  /**
   * Evaluate ODRL policies
   */
  private async evaluateODRL(context: EvaluationContext): Promise<ODRLDecision | null> {
    try {
      // Evaluate policy set
      const decision = this.odrlEvaluator.evaluateSet(this.odrlPolicies, context);
      return decision;
    } catch (error) {
      logger.error('ODRL evaluation error', error);
      return null;
    }
  }

  /**
   * Check if ODRL decision is definitive (not INDETERMINATE)
   */
  private isDefinitiveDecision(decision: ODRLDecision): boolean {
    return decision.decision !== 'INDETERMINATE' && 
           decision.decision !== 'NOT_APPLICABLE';
  }

  /**
   * Convert ODRL decision to AEGIS PolicyDecision
   */
  private convertFromODRLDecision(
    odrlDecision: ODRLDecision,
    originalContext: DecisionContext
  ): PolicyDecision {
    // Build reason from matched rules and constraints
    let reason = 'Decision based on ODRL policy';
    
    if (odrlDecision.matchedRules && odrlDecision.matchedRules.length > 0) {
      const ruleTypes = odrlDecision.matchedRules.map(r => r['@type'] || 'Rule');
      reason = `Matched ${ruleTypes.join(', ')}`;
    }
    
    if (odrlDecision.failedConstraints && odrlDecision.failedConstraints.length > 0) {
      const failures = odrlDecision.failedConstraints.map(c => c.reason).filter(Boolean);
      if (failures.length > 0) {
        reason += `. Failed: ${failures.join(', ')}`;
      }
    }

    return {
      decision: odrlDecision.decision === 'PERMIT' ? 'PERMIT' : 'DENY',
      reason,
      confidence: 1.0, // ODRL decisions are deterministic
      constraints: this.extractConstraints(odrlDecision),
      obligations: this.extractObligations(odrlDecision),
      metadata: {
        engine: 'ODRL',
        policyId: odrlDecision.policy?.uid ?? '',
        evaluationTime: odrlDecision.metadata?.evaluationTime ?? 0,
        matchedRules: odrlDecision.matchedRules?.length || 0
      }
    };
  }

  /**
   * Combine ODRL and AI insights when both are uncertain
   */
  private async combineDecisions(
    context: DecisionContext,
    policyText?: string
  ): Promise<PolicyDecision> {
    const odrlContext = this.convertToODRLContext(context);
    
    // Check if AI engine is available
    if (!this.aiEngine) {
      const odrlDecision = await this.evaluateODRL(odrlContext);
      let reason = 'ODRL-only decision (no AI engine)';
      if (odrlDecision?.matchedRules && odrlDecision.matchedRules.length > 0) {
        const ruleTypes = odrlDecision.matchedRules.map(r => r['@type'] || 'Rule');
        reason = `Matched ${ruleTypes.join(', ')} (no AI engine)`;
      }
      return {
        decision: odrlDecision?.decision === 'PERMIT' ? 'PERMIT' : 'DENY',
        reason,
        confidence: 1.0,
        constraints: this.extractConstraints(odrlDecision),
        obligations: this.extractObligations(odrlDecision),
        metadata: {
          engine: 'ODRL',
          odrlDecision: odrlDecision?.decision ?? 'INDETERMINATE'
        }
      };
    }
    
    const [odrlDecision, aiDecision] = await Promise.all([
      this.evaluateODRL(odrlContext),
      this.aiEngine.judge(context, policyText)
    ]);

    // Weight the decisions
    const odrlWeight = odrlDecision && odrlDecision.decision !== 'NOT_APPLICABLE' ? 0.4 : 0;
    const aiWeight = 1 - odrlWeight;

    // Combine confidence scores
    const combinedConfidence = 
      (odrlDecision ? 1.0 * odrlWeight : 0) +
      (aiDecision.confidence * aiWeight);

    // Decision logic: be conservative (deny if either denies)
    const finalDecision = 
      (odrlDecision?.decision === 'DENY' || aiDecision.decision === 'DENY') 
        ? 'DENY' 
        : 'PERMIT';

    return {
      decision: finalDecision,
      reason: `Hybrid decision: ODRL (${odrlDecision?.decision || 'N/A'}) + AI (${aiDecision.decision}, conf: ${aiDecision.confidence})`,
      confidence: combinedConfidence,
      constraints: [
        ...this.extractConstraints(odrlDecision),
        ...(aiDecision.constraints || [])
      ],
      obligations: [
        ...this.extractObligations(odrlDecision),
        ...(aiDecision.obligations || [])
      ],
      metadata: {
        engine: 'Hybrid',
        odrlDecision: odrlDecision?.decision ?? 'INDETERMINATE',
        aiDecision: aiDecision.decision,
        aiConfidence: aiDecision.confidence ?? 0
      }
    };
  }

  /**
   * Add an ODRL policy to the evaluator
   */
  async addODRLPolicy(policyId: string, policy: any): Promise<void> {
    if (!this.config.useODRL) {
      throw new Error('ODRL is not enabled');
    }
    
    await this.odrlEvaluator.addPolicy(policyId, policy);
    logger.info('ODRL policy added', { policyId });
    
    // Clear cache as policies have changed
    this.clearCache();
  }

  /**
   * Remove an ODRL policy from the evaluator
   */
  async removeODRLPolicy(policyId: string): Promise<boolean> {
    if (!this.config.useODRL) {
      throw new Error('ODRL is not enabled');
    }
    
    const removed = await this.odrlEvaluator.removePolicy(policyId);
    if (removed) {
      logger.info('ODRL policy removed', { policyId });
      this.clearCache();
    }
    
    return removed;
  }

  /**
   * List all ODRL policies
   */
  async listODRLPolicies(): Promise<Array<{ id: string; policy: any }>> {
    if (!this.config.useODRL) {
      return [];
    }
    
    return this.odrlEvaluator.listPolicies();
  }

  /**
   * Extract constraints from ODRL decision
   */
  private extractConstraints(decision: ODRLDecision | null): string[] {
    if (!decision || !decision.matchedRules) return [];
    
    const constraints: string[] = [];
    
    // Extract constraints from matched rules
    for (const rule of decision.matchedRules) {
      if (rule.constraint) {
        // Simplified - would need proper constraint interpretation
        constraints.push('Apply ODRL constraints');
      }
    }
    
    return constraints;
  }

  /**
   * Extract obligations from ODRL decision
   */
  private extractObligations(decision: ODRLDecision | null): string[] {
    if (!decision || !decision.obligations) return [];
    
    return decision.obligations.map(duty => {
      const action = Array.isArray(duty.action) ? duty.action[0] : duty.action;
      return `Execute: ${action.value}`;
    });
  }

  /**
   * Generate cache key for decision
   */
  private getCacheKey(context: DecisionContext): string {
    return `${context.agent}:${context.action}:${context.resource}:${context.agentType || ''}`;
  }

  /**
   * Get cached decision if valid
   */
  private getCachedDecision(key: string): PolicyDecision | null {
    if (!this.config.cacheEnabled) return null;
    
    const cached = this.decisionCache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > (this.config.cacheTTL || 300000)) {
      this.decisionCache.delete(key);
      return null;
    }
    
    return cached.decision;
  }

  /**
   * Cache a decision
   */
  private cacheDecision(key: string, decision: PolicyDecision): void {
    if (!this.config.cacheEnabled) return;
    
    this.decisionCache.set(key, {
      decision,
      timestamp: Date.now()
    });
    
    // Cleanup old entries
    if (this.decisionCache.size > 1000) {
      const entries = Array.from(this.decisionCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20%
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.decisionCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Add or update ODRL policies
   */
  addPolicy(policy: AEGISPolicy): void {
    try {
      // Validate policy
      ODRLParser.parseAEGIS(policy);
      
      // Add to policy set
      this.odrlPolicies.push(policy);
      
      // Clear cache as policies changed
      this.decisionCache.clear();
      
      logger.info('Added ODRL policy', { policyId: policy.uid });
    } catch (error) {
      logger.error('Failed to add ODRL policy', error);
      throw error;
    }
  }

  /**
   * Remove a policy by ID
   */
  removePolicy(policyId: string): boolean {
    const index = this.odrlPolicies.findIndex(p => p.uid === policyId);
    if (index >= 0) {
      this.odrlPolicies.splice(index, 1);
      this.decisionCache.clear();
      logger.info('Removed ODRL policy', { policyId });
      return true;
    }
    return false;
  }

  /**
   * Get current policies
   */
  getPolicies(): AEGISPolicy[] {
    return [...this.odrlPolicies];
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.decisionCache.clear();
    logger.info('Policy cache cleared');
  }
  
  /**
   * Get AI engine instance
   */
  getAIEngine(): AIJudgmentEngine | null {
    return this.config.useAI ? this.aiEngine : null;
  }
}