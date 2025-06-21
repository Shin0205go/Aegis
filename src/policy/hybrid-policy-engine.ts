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

export interface HybridPolicyConfig {
  useODRL: boolean;
  useAI: boolean;
  odrlPolicies?: AEGISPolicy[];
  aiThreshold?: number; // Confidence threshold for AI decisions
  cacheEnabled?: boolean;
  cacheTTL?: number;
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
    policyText?: string
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
      // Step 1: Try ODRL evaluation first (fast, deterministic)
      if (this.config.useODRL) {
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
      if (this.config.useAI) {
        const aiDecision = await this.aiEngine.judge(context, policyText);
        
        // If AI confidence is high enough, use it
        if (aiDecision.confidence >= (this.config.aiThreshold || 0.8)) {
          logger.info('AI decision made', {
            decision: aiDecision.decision,
            confidence: aiDecision.confidence,
            evaluationTime: Date.now() - startTime
          });
          
          this.cacheDecision(cacheKey, aiDecision);
          return aiDecision;
        }
      }

      // Step 3: If both uncertain, combine insights
      return this.combineDecisions(context, policyText);
      
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
      dateTime: new Date().toISOString(),
      
      agent: {
        id: context.agent,
        type: context.agentType || 'unknown',
        role: context.environment?.agentRole,
        clearanceLevel: context.clearanceLevel,
        trustScore: context.trustScore || 0.5
      },
      
      resource: {
        type: context.resource,
        id: context.environment?.resourceId || context.resource,
        classification: context.environment?.resourceClassification || 'internal'
      },
      
      action: {
        type: context.action,
        mcpMethod: context.environment?.mcpMethod,
        mcpTool: context.environment?.mcpTool
      },
      
      environment: {
        ipAddress: context.environment?.ipAddress,
        location: context.location,
        emergency: context.environment?.emergency || false,
        delegationChain: context.environment?.delegationChain,
        sessionId: context.environment?.sessionId
      },
      
      extensions: context.environment?.metadata
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
    let reason = 'ODRL: ';
    
    if (odrlDecision.matchedRules && odrlDecision.matchedRules.length > 0) {
      const ruleTypes = odrlDecision.matchedRules.map(r => r['@type'] || 'Rule');
      reason += `Matched ${ruleTypes.join(', ')}`;
    } else if (odrlDecision.decision === 'NOT_APPLICABLE') {
      reason += 'No matching rules';
    } else {
      reason += 'Policy evaluation';
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
        policyId: odrlDecision.policy?.uid,
        evaluationTime: odrlDecision.metadata?.evaluationTime,
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
        odrlDecision: odrlDecision?.decision,
        aiDecision: aiDecision.decision,
        aiConfidence: aiDecision.confidence
      }
    };
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