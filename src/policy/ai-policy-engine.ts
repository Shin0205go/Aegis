/**
 * AI Policy Engine
 * AI判定のみを使用するシンプルなポリシーエンジン
 */

import { PolicyDecision, DecisionContext } from '../types';
import { logger } from '../utils/logger';
import { AIJudgmentEngine } from '../ai/judgment-engine';

export interface AIPolicyConfig {
  aiThreshold?: number; // Confidence threshold for AI decisions
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export class AIPolicyEngine {
  private aiEngine: AIJudgmentEngine;
  private config: AIPolicyConfig;
  private decisionCache: Map<string, { decision: PolicyDecision; timestamp: number }>;

  constructor(
    aiEngine: AIJudgmentEngine,
    config: AIPolicyConfig = {
      aiThreshold: 0.7,
      cacheEnabled: true,
      cacheTTL: 300000 // 5 minutes
    }
  ) {
    this.aiEngine = aiEngine;
    this.config = config;
    this.decisionCache = new Map();
    
    logger.info('AI Policy Engine initialized', {
      aiEnabled: true,
      aiThreshold: config.aiThreshold,
      cacheEnabled: config.cacheEnabled
    });
  }

  /**
   * Make a policy decision using AI judgment
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
      // Execute AI judgment
      const aiDecision = await this.aiEngine.judge(context, policyText);
      
      // Add metadata for AI engine
      const enhancedDecision = {
        ...aiDecision,
        metadata: {
          ...aiDecision.metadata,
          engine: 'AI',
          evaluationTime: Date.now() - startTime
        }
      };
      
      logger.info('AI decision made', {
        decision: aiDecision.decision,
        confidence: aiDecision.confidence,
        evaluationTime: Date.now() - startTime
      });
      
      this.cacheDecision(cacheKey, enhancedDecision);
      return enhancedDecision;
      
    } catch (error) {
      logger.error('AI policy engine error', error);
      
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
   * Clear all caches
   */
  clearCache(): void {
    this.decisionCache.clear();
    logger.info('Policy cache cleared');
  }
  
  /**
   * Get AI engine instance
   */
  getAIEngine(): AIJudgmentEngine {
    return this.aiEngine;
  }
}