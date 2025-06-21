/**
 * ODRL (Open Digital Rights Language) Type Definitions
 * Based on W3C ODRL Information Model 2.2
 */

// Base types
export type URI = string;
export type DateTime = string; // ISO 8601
export type Duration = string; // ISO 8601 Duration

// Core Classes
export interface ODRLPolicy {
  '@context'?: string | string[] | Record<string, any>;
  '@type': 'Policy' | 'Set' | 'Offer' | 'Agreement';
  uid: URI;
  profile?: URI;
  permission?: Rule[];
  prohibition?: Rule[];
  obligation?: Rule[];
  metadata?: PolicyMetadata;
}

export interface Rule {
  '@type'?: 'Permission' | 'Prohibition' | 'Obligation';
  uid?: URI;
  action: Action | Action[];
  target?: Asset | Asset[];
  assigner?: Party | Party[];
  assignee?: Party | Party[];
  constraint?: Constraint[];
  duty?: Duty[];
  remedy?: Duty[];
  metadata?: RuleMetadata;
}

export interface Asset {
  '@type'?: 'Asset';
  uid: URI;
  metadata?: AssetMetadata;
}

export interface Party {
  '@type'?: 'Party';
  uid: URI;
  metadata?: PartyMetadata;
}

export interface Action {
  '@type'?: 'Action';
  value: URI | string;
  refinement?: Constraint[];
}

// Constraint types
export interface Constraint {
  '@type'?: 'Constraint' | 'LogicalConstraint';
  uid?: URI;
  leftOperand?: LeftOperand;
  operator?: Operator;
  rightOperand?: any;
  rightOperandReference?: URI;
  unit?: string;
  dataType?: string;
  status?: string;
  // Logical constraints
  and?: Constraint | Constraint[];
  or?: Constraint | Constraint[];
  xone?: Constraint[];
}

export interface Duty {
  '@type': 'Duty';
  uid?: URI;
  action: Action | Action[];
  target?: Asset | Asset[];
  assigner?: Party | Party[];
  assignee?: Party | Party[];
  constraint?: Constraint[];
  consequence?: Duty[];
  metadata?: RuleMetadata;
}

// Operators
export type Operator = 
  | 'eq' | 'neq' | 'gt' | 'gteq' | 'lt' | 'lteq'
  | 'in' | 'hasPart' | 'isA' | 'isAllOf' | 'isAnyOf' | 'isNoneOf' | 'isPartOf';

// Left Operands (extensible)
export type LeftOperand = string;

// Common Left Operands for AEGIS
export const AEGISOperands = {
  // Temporal
  DATETIME: 'dateTime',
  TIME_OF_DAY: 'timeOfDay',
  DAY_OF_WEEK: 'dayOfWeek',
  
  // Agent properties
  AGENT_ID: 'aegis:agentId',
  AGENT_TYPE: 'aegis:agentType',
  AGENT_ROLE: 'aegis:agentRole',
  CLEARANCE_LEVEL: 'aegis:clearanceLevel',
  TRUST_SCORE: 'aegis:trustScore',
  
  // Resource properties
  RESOURCE_TYPE: 'aegis:resourceType',
  RESOURCE_CLASSIFICATION: 'aegis:resourceClassification',
  RESOURCE_OWNER: 'aegis:resourceOwner',
  
  // Context properties
  IP_ADDRESS: 'aegis:ipAddress',
  LOCATION: 'aegis:location',
  EMERGENCY_FLAG: 'aegis:emergency',
  DELEGATION_DEPTH: 'aegis:delegationDepth',
  
  // MCP specific
  MCP_TOOL: 'aegis:mcpTool',
  MCP_METHOD: 'aegis:mcpMethod',
  SESSION_ID: 'aegis:sessionId'
} as const;

// Metadata interfaces
export interface PolicyMetadata {
  created?: DateTime;
  creator?: string;
  modified?: DateTime;
  description?: string;
  label?: string;
  language?: string;
}

export interface RuleMetadata {
  label?: string;
  description?: string;
}

export interface AssetMetadata {
  label?: string;
  description?: string;
}

export interface PartyMetadata {
  label?: string;
  description?: string;
}

// AEGIS-specific extensions
export interface AEGISPolicy extends ODRLPolicy {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'];
  profile: 'https://aegis.example.com/odrl/profile';
  naturalLanguageSource?: string;
  version?: string;
  priority?: number;
  tags?: string[];
}

// Decision types
export interface PolicyDecision {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE' | 'NOT_APPLICABLE';
  policy?: ODRLPolicy;
  matchedRules?: Rule[];
  failedConstraints?: ConstraintEvaluation[];
  obligations?: Duty[];
  metadata?: {
    timestamp: DateTime;
    evaluationTime: number; // milliseconds
    policyId: URI;
  };
}

export interface ConstraintEvaluation {
  constraint: Constraint;
  result: boolean;
  actualValue?: any;
  reason?: string;
}

// Context for policy evaluation
export interface EvaluationContext {
  // Standard ODRL context
  dateTime: DateTime;
  
  // AEGIS-specific context
  agent: {
    id: string;
    type: string;
    role?: string;
    clearanceLevel?: string;
    trustScore?: number;
  };
  
  resource: {
    type: string;
    id?: string;
    classification?: string;
    owner?: string;
  };
  
  action: {
    type: string;
    mcpMethod?: string;
    mcpTool?: string;
  };
  
  environment: {
    ipAddress?: string;
    location?: string;
    emergency?: boolean;
    delegationChain?: string[];
    sessionId?: string;
  };
  
  // Extensible properties
  extensions?: Record<string, any>;
}