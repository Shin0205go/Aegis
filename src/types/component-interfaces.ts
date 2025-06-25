// ============================================================================
// AEGIS - Component Interface Definitions
// Interfaces for various system components
// ============================================================================

import type { 
  DecisionContext, 
  PolicyDecision, 
  AccessControlResult,
  EnrichmentData,
  AuditEntry,
  AnomalyAlert
} from './index.js';
import type { LoadedPolicy } from './enforcement-types.js';

// ============================================================================
// Context Collector Interface
// ============================================================================
export interface IContextCollector {
  /**
   * Enrich the given context with additional information
   */
  enrichContext(context: DecisionContext): Promise<DecisionContext>;
  
  /**
   * Register a new enricher
   */
  registerEnricher(name: string, enricher: IContextEnricher): void;
}

export interface IContextEnricher {
  /**
   * Name of the enricher
   */
  name: string;
  
  /**
   * Enrich the context with additional data
   */
  enrich(context: DecisionContext): Promise<EnrichmentData>;
}

// ============================================================================
// Cache System Interface
// ============================================================================
export interface IIntelligentCacheSystem {
  /**
   * Get cached decision
   */
  get(
    context: DecisionContext, 
    policy: string, 
    environment: Record<string, any>
  ): Promise<PolicyDecision | null>;
  
  /**
   * Set cached decision
   */
  set(
    context: DecisionContext,
    policy: string,
    decision: PolicyDecision,
    environment: Record<string, any>
  ): Promise<void>;
  
  /**
   * Clear cache
   */
  clear(): Promise<void>;
  
  /**
   * Get cache statistics
   */
  getStats(): Promise<{
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    size: number;
    maxSize: number;
  }>;
}

// ============================================================================
// Policy Engine Interface
// ============================================================================
export interface IHybridPolicyEngine {
  /**
   * Make a policy decision
   */
  decide(context: DecisionContext, policy: string | null): Promise<PolicyDecision>;
  
  /**
   * Validate a policy
   */
  validatePolicy(policy: string): Promise<boolean>;
  
  /**
   * Get decision confidence threshold
   */
  getConfidenceThreshold(): number;
}

// ============================================================================
// Audit System Interface
// ============================================================================
export interface IAdvancedAuditSystem {
  /**
   * Record an audit entry
   */
  recordAuditEntry(
    context: DecisionContext,
    decision: PolicyDecision,
    policyUsed: string,
    processingTime: number,
    outcome: 'SUCCESS' | 'FAILURE' | 'ERROR',
    metadata?: Record<string, any>
  ): Promise<void>;
  
  /**
   * Query audit entries
   */
  queryEntries(filter: {
    startDate?: Date;
    endDate?: Date;
    agent?: string;
    resource?: string;
    decision?: string;
    limit?: number;
  }): Promise<AuditEntry[]>;
  
  /**
   * Generate compliance report
   */
  generateComplianceReport(params: {
    start: Date;
    end: Date;
    includeDetails?: boolean;
  }): Promise<any>;
}

// ============================================================================
// Anomaly Detector Interface
// ============================================================================
export interface IRealTimeAnomalyDetector {
  /**
   * Analyze a decision for anomalies
   */
  analyzeDecision(
    context: DecisionContext,
    result: AccessControlResult,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  /**
   * Get recent anomalies
   */
  getRecentAnomalies(limit?: number): Promise<AnomalyAlert[]>;
  
  /**
   * Register anomaly handler
   */
  registerAnomalyHandler(
    handler: (alert: AnomalyAlert) => Promise<void>
  ): void;
}

// ============================================================================
// Policy Loader Interface
// ============================================================================
export interface IPolicyLoader {
  /**
   * Get active policies
   */
  getActivePolicies(): LoadedPolicy[];
  
  /**
   * Format policy for AI processing
   */
  formatPolicyForAI(policy: LoadedPolicy): string;
  
  /**
   * Load policy by name
   */
  loadPolicy(name: string): Promise<LoadedPolicy | null>;
  
  /**
   * Reload all policies
   */
  reloadPolicies(): Promise<void>;
}

// ============================================================================
// Constraint Processor Interface
// ============================================================================
export interface IConstraintProcessor {
  /**
   * Name of the processor
   */
  name: string;
  
  /**
   * Check if this processor can handle the constraint
   */
  canHandle(constraint: string): boolean;
  
  /**
   * Apply the constraint
   */
  apply(data: any, constraint: string, context?: DecisionContext): Promise<any>;
}

// ============================================================================
// Obligation Executor Interface
// ============================================================================
export interface IObligationExecutor {
  /**
   * Name of the executor
   */
  name: string;
  
  /**
   * Check if this executor can handle the obligation
   */
  canHandle(obligation: string): boolean;
  
  /**
   * Execute the obligation
   */
  execute(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<void>;
}

// ============================================================================
// Error Handler Interface
// ============================================================================
export interface IErrorHandler {
  /**
   * Handle error with context
   */
  handleError(
    error: Error,
    context?: {
      component: string;
      operation: string;
      details?: Record<string, any>;
    }
  ): void;
  
  /**
   * Create standardized error response
   */
  createErrorResponse(
    error: Error,
    requestId?: string | number
  ): any;
}

// ============================================================================
// MCP Proxy Base Interface
// ============================================================================
export interface IMCPProxy {
  /**
   * Start the proxy server
   */
  start(): Promise<void>;
  
  /**
   * Stop the proxy server
   */
  stop(): Promise<void>;
  
  /**
   * Get proxy status
   */
  getStatus(): {
    running: boolean;
    transport: string;
    upstreamServers: number;
    requestsProcessed: number;
  };
}