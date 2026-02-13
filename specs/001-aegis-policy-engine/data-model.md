# Data Model: AEGIS Policy Engine

**Date**: 2026-02-13
**Status**: Design Complete

## Overview

This document describes the core data entities used in the AEGIS Policy Engine. These entities represent the domain model for natural language policy enforcement in MCP (Model Context Protocol) environments.

---

## Core Entities

### 1. Policy

Represents an access control rule written in natural language.

**Attributes**:
- `id`: string (UUID) - Unique identifier
- `name`: string - Human-readable policy name
- `description`: string - Policy purpose and scope
- `policy`: string - Natural language policy text
- `version`: string - Semantic version (e.g., "1.0.0")
- `priority`: number - Selection priority (higher = more specific)
- `metadata`: PolicyMetadata - Additional policy information
- `status`: "draft" | "active" | "deprecated" - Lifecycle status

**PolicyMetadata Structure**:
```typescript
{
  createdAt: Date,
  createdBy: string,
  lastModified: Date,
  lastModifiedBy: string,
  tags: string[],
  applicableContexts?: {
    agents?: string[],
    resources?: string[],
    actions?: string[]
  }
}
```

**Validation Rules**:
- `id` must be valid UUID
- `name` must be unique within system
- `policy` text must be at least 10 characters
- `version` must follow semver format
- `status` transitions: draft → active → deprecated (one-way)

**State Transitions**:
```
[draft] --validate--> [active] --deprecate--> [deprecated]
          ↑             |
          |--update-----|
```

**Storage**:
- Current: `policies-store/policy-{id}.json`
- History: `policies-store/history/policy-{id}.json` (version array)

---

### 2. Decision Context

Information collected about an access request.

**Attributes**:
- `agent`: string - Agent identifier (e.g., "claude-desktop")
- `action`: string - Requested action (e.g., "tools/call", "resources/read")
- `resource`: string - Target resource URI
- `purpose`?: string - Optional access purpose
- `time`: Date - Request timestamp
- `location`?: string - Optional geographic location
- `environment`: Record<string, any> - Additional context data

**Environment Fields** (populated by PIP):
```typescript
{
  // Time context
  isBusinessHours: boolean,
  dayOfWeek: string,
  timeZone: string,

  // Agent information
  agentType: "internal" | "external" | "unknown",
  agentClearance?: number,
  agentCreatedAt?: Date,

  // Resource classification
  resourceType: string,
  sensitivityLevel: "public" | "internal" | "confidential" | "restricted",
  resourceOwner?: string,
  resourceTags?: string[],

  // Security context
  riskScore: number, // 0-1
  connectionType?: "vpn" | "direct",
  ipAddress?: string,

  // Additional enrichments
  [key: string]: any
}
```

**Validation Rules**:
- `agent`, `action`, `resource`, `time` are required
- `time` must be valid Date
- `riskScore` must be between 0 and 1
- `environment` may contain custom enricher data

**Lifecycle**:
- Created: At request interception (PEP)
- Enriched: By PIP context enrichers
- Used: By PDP for policy decision
- Logged: In audit trail

---

### 3. Policy Decision

The result of evaluating a request against policies.

**Attributes**:
- `decision`: "PERMIT" | "DENY" | "INDETERMINATE"
- `reason`: string - Detailed explanation of decision
- `confidence`: number - AI confidence score (0-1)
- `constraints`?: string[] - Constraints to apply if PERMIT
- `obligations`?: string[] - Obligations to execute
- `metadata`: DecisionMetadata - Additional decision information

**DecisionMetadata Structure**:
```typescript
{
  policyId: string,           // Which policy was applied
  policyName: string,         // Policy name for logging
  selectionReason: string,    // Why this policy was chosen
  processingTime: number,     // Decision time in ms
  cacheHit: boolean,          // Was result from cache
  timestamp: Date,            // When decision was made
  model?: string,             // AI model used (e.g., "claude-opus-4")
  promptTokens?: number,      // LLM input tokens
  completionTokens?: number   // LLM output tokens
}
```

**Decision Logic**:
```
IF confidence >= threshold (default 0.7):
  USE decision from AI
ELSE:
  SET decision = INDETERMINATE
  LOG low confidence warning

IF decision = INDETERMINATE:
  DEFAULT to DENY
  LOG indeterminate decision
```

**Validation Rules**:
- `decision` must be one of three valid values
- `confidence` must be 0-1
- `reason` must be non-empty string
- If `decision` is PERMIT, may have constraints/obligations
- If `decision` is DENY, typically no constraints

---

### 4. Constraint Configuration

A restriction to apply to permitted access.

**Types & Parameters**:

#### DataAnonymizer
```typescript
{
  type: "anonymize",
  method: "mask" | "tokenize" | "hash",
  fields?: string[],      // Specific fields to anonymize
  maskChar?: string,      // For mask method (default: "*")
  preserveLength?: boolean // For tokenization
}
```

#### RateLimiter
```typescript
{
  type: "rate-limit",
  limit: number,          // Max requests
  windowMs: number,       // Time window in milliseconds
  perAgent: boolean,      // Per-agent vs global
  algorithm: "sliding-window" | "fixed-window"
}
```

#### GeoRestrictor
```typescript
{
  type: "geo-restrict",
  allowedCountries?: string[],    // ISO country codes
  blockedCountries?: string[],    // ISO country codes
  allowedRegions?: string[],      // Geographic regions
  requireVPN?: boolean
}
```

**Processing**:
- Managed by `ConstraintProcessorManager`
- Applied in sequence (order matters)
- Each processor can modify request/response
- Failure in constraint processing → DENY decision

---

### 5. Obligation Configuration

An action to execute based on policy decision.

**Types & Parameters**:

#### AuditLogger
```typescript
{
  type: "audit-log",
  level: "basic" | "detailed" | "full",
  encryption: boolean,
  format: "json" | "text" | "structured",
  destination?: string    // File path or log endpoint
}
```

#### Notifier
```typescript
{
  type: "notify",
  channel: "log" | "email" | "webhook",
  recipients?: string[],
  template?: string,
  onDecision: "DENY" | "PERMIT" | "ALL"
}
```

#### DataLifecycle
```typescript
{
  type: "lifecycle",
  action: "delete" | "archive" | "retain",
  after: number,          // Duration in milliseconds
  verify: boolean         // Verify completion
}
```

**Execution Timing**:
- **Pre-enforcement**: Before proxying to upstream (e.g., audit log start)
- **Post-enforcement**: After upstream response (e.g., audit log completion)
- **Async**: Background execution (e.g., notifications, lifecycle)

**Processing**:
- Managed by `ObligationExecutorManager`
- Non-blocking for async obligations
- Failures logged but don't block request
- Each executor is idempotent

---

### 6. Audit Log Entry

Immutable record of a policy decision and enforcement.

**Attributes**:
```typescript
{
  id: string,                   // UUID
  timestamp: Date,
  context: DecisionContext,     // Full request context
  decision: PolicyDecision,     // Decision details
  policySnapshot: {             // Policy at decision time
    id: string,
    version: string,
    policy: string
  },
  enforcement: {
    constraintsApplied: ConstraintResult[],
    obligationsExecuted: ObligationResult[],
    upstreamResponse?: any,
    duration: number            // Total processing time
  },
  encrypted: boolean,           // Is sensitive data encrypted
  signature?: string            // Optional integrity signature
}
```

**Storage**:
- Append-only file or database
- Encrypted for sensitive data
- Indexed by timestamp, agent, resource
- Retention policy configurable

**Usage**:
- Compliance audits
- Security investigation
- Metrics and analytics
- Policy refinement

---

### 7. MCP Tool

A capability exposed through upstream MCP servers.

**Attributes**:
```typescript
{
  name: string,                 // Tool name
  serverPrefix: string,         // Server identifier (e.g., "filesystem")
  fullName: string,             // Prefixed name (e.g., "filesystem__read_file")
  schema: {
    inputSchema: JSONSchema,    // Tool input parameters
    description: string,        // What the tool does
    examples?: any[]
  },
  policyApplicable: boolean,    // Can policies control this tool
  riskLevel: "low" | "medium" | "high" // Risk classification
}
```

**Tool Classification**:
- **High Risk**: delete, execute, admin, system modification
- **Medium Risk**: write, update, send, external API calls
- **Low Risk**: read, list, search, get

**Usage**:
- Tool discovery and routing
- Policy applicability determination
- Risk-based policy selection
- Audit trail enrichment

---

## Entity Relationships

```
┌──────────┐     applies to    ┌─────────────────┐
│  Policy  │────────────────────│ DecisionContext │
└────┬─────┘                    └────────┬────────┘
     │                                   │
     │ produces                          │
     │                                   │
     ▼                                   ▼
┌─────────────────┐            ┌──────────────────┐
│ PolicyDecision  │◄───────────│  PIP Enrichers   │
└────────┬────────┘  enriches  └──────────────────┘
         │
         │ triggers
         ├──────────────────┬─────────────────┐
         ▼                  ▼                 ▼
┌──────────────┐   ┌────────────────┐   ┌──────────────┐
│ Constraints  │   │  Obligations   │   │  Audit Log   │
└──────────────┘   └────────────────┘   └──────────────┘
         │                  │                    │
         │                  │                    │
         └──────────────────┴────────────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │ Enforcement    │
                   │ (PEP Execution)│
                   └────────────────┘
```

---

## Data Flow

### 1. Request Flow
```
MCP Request → DecisionContext (created)
            → PIP (enrichment) → Context (enriched)
            → Policy (selected) + Context → PDP
            → PolicyDecision (created)
```

### 2. Enforcement Flow
```
PolicyDecision (PERMIT) → Constraints (applied)
                        → Obligations (pre)
                        → Upstream Proxy
                        → Obligations (post)
                        → Audit Log (created)
```

### 3. Policy Management Flow
```
Natural Language → Policy (draft)
                 → Validation
                 → Policy (active)
                 → Version History (saved)
```

---

## Storage Considerations

### File-Based Storage (Current MVP)
- **Policies**: JSON files in `policies-store/`
- **History**: JSON arrays in `policies-store/history/`
- **Audit Logs**: Append-only JSON lines (one per file or consolidated)

### Future Database Migration
When scaling beyond MVP:
- **PostgreSQL**: Structured entities, JSONB for flexibility
- **Timescale**: Time-series for audit logs
- **Redis**: Decision caching, rate limit counters

---

## Validation & Integrity

### Policy Validation
- Natural language clarity check (AI pre-validation)
- Metadata completeness
- Version consistency
- Status transition rules

### Decision Integrity
- Confidence threshold enforcement
- Required fields validation
- Constraint/obligation compatibility
- Audit trail completeness

### Data Consistency
- Policy-decision linking
- Version history accuracy
- Audit log immutability
- Constraint-obligation coordination

---

**Data Model Status**: COMPLETE
**Next Phase**: Create API contracts and test specifications
