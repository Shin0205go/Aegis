// ============================================================================
// TypeScript Types for Policy Management UI
// ============================================================================

export interface Policy {
  id: string;
  name: string;
  policy: string;
  version: string;
  status: 'active' | 'draft' | 'deprecated';
  createdAt: string;
  lastModified: string;
  createdBy: string;
  lastModifiedBy: string;
  tags?: string[];
  description?: string;
}

export interface PolicyAnalysis {
  interpretation?: {
    type?: string;
    resources?: string[];
    timeRestrictions?: string;
    agentRestrictions?: string;
    constraints?: string[];
    obligations?: string[];
  };
  suggestions?: string[];
  warnings?: string[];
}

export interface TestRequest {
  agent: string;
  action: string;
  resource: string;
  time: string;
  purpose: string;
  environment?: Record<string, any>;
}

export interface TestResult {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;
  constraints?: string[];
  obligations?: string[];
}