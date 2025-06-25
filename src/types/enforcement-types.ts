// ============================================================================
// Enforcement System Type Definitions
// ============================================================================

import type { DecisionContext, PolicyDecision } from './index.js';

// Content item structure
export interface ContentItem {
  text?: string;
  data?: string | Record<string, any>; // base64 or structured data
  uri?: string;
  mimeType?: string;
  metadata?: Record<string, any>;
}

// Data types that can be constrained
export type ConstrainableData = 
  | string 
  | Record<string, any>
  | Array<any>
  | {
      contents?: ContentItem[];
      [key: string]: any;
    };

// Processed data after constraints
export interface ConstrainedData {
  _truncated?: boolean;
  _originalCount?: number;
  _originalSize?: number;
  _constraints?: string[];
  _timeLimit?: number;
  [key: string]: any; // Allow original data fields
}

// Anonymization patterns
export interface AnonymizationPattern {
  regex: RegExp;
  replacement: string;
}

// Field filtering result
export interface FilteredObject {
  [key: string]: string | number | boolean | null | FilteredObject | FilteredObject[];
}

// Obligation execution context
export interface ObligationContext {
  decision: PolicyDecision;
  context: DecisionContext;
  request?: {
    method: string;
    params?: Record<string, any>;
    id?: string | number;
  };
}

// Alert creation parameters
export interface AlertParams {
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  type: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
}

// Anomaly detection alert
export interface AnomalyAlert {
  alertId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  pattern: {
    name: string;
    description?: string;
  };
  triggeringContext: DecisionContext;
  timestamp: Date;
  details?: Record<string, string | number | boolean | null>;
}

// Compliance report parameters
export interface ComplianceReportParams {
  start: Date;
  end: Date;
  includeDetails?: boolean;
}

// Access pattern analysis
export interface AccessPatternAnalysis {
  patterns: Array<{
    pattern: string;
    frequency: number;
    agents: string[];
    resources: string[];
  }>;
  anomalies: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
  timeRange: {
    start: Date;
    end: Date;
  };
}

// Dashboard metrics
export interface DashboardMetrics {
  totalRequests: number;
  permitRate: number;
  denyRate: number;
  activeAlerts: number;
  recentActivity: Array<{
    timestamp: Date;
    agent: string;
    action: string;
    decision: string;
  }>;
  systemHealth: {
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    components: Record<string, {
      status: string;
      message?: string;
    }>;
  };
}

// Policy loader types
export interface LoadedPolicy {
  name: string;
  content: string;
  metadata: {
    priority: number;
    status: 'active' | 'inactive' | 'draft';
    tags?: string[];
    createdAt?: Date;
    updatedAt?: Date;
  };
}

// Cache system types
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  contextHash: string;
}

export interface IntelligentCacheConfig {
  maxEntries: number;
  defaultTtl: number;
  confidenceThreshold: number;
  enableLRUEviction: boolean;
  enableIntelligentTtl: boolean;
  contextSensitivity: number;
  compressionEnabled: boolean;
}

export interface CacheFeatures {
  adaptiveTtl: boolean;
  contextualGrouping: boolean;
  predictivePreloading: boolean;
  patternRecognition: boolean;
}

// Batch judgment types
export interface BatchJudgmentConfig {
  maxBatchSize: number;
  batchTimeout: number;
  enableParallelProcessing: boolean;
  priorityQueuing: boolean;
}

export interface BatchRequest {
  id: string;
  context: DecisionContext;
  policy: string;
  priority?: number;
  timestamp: number;
}

export interface BatchResult {
  id: string;
  result: PolicyDecision;
  processingTime: number;
}

// Audit entry types
export interface AuditEntry {
  id: string;
  timestamp: Date;
  context: DecisionContext;
  decision: PolicyDecision;
  policyUsed: string;
  processingTime: number;
  outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
  metadata?: Record<string, string | number | boolean | null>;
}