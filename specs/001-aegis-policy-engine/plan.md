# Implementation Plan: AEGIS Policy Engine

**Branch**: `001-aegis-policy-engine` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-aegis-policy-engine/spec.md`

## Execution Flow (/plan command scope)
```
1. ✅ Load feature spec from Input path
2. ✅ Fill Technical Context (existing TypeScript codebase)
3. ✅ Fill Constitution Check (default constitution template)
4. ✅ Evaluate Constitution Check - passed with test-first principle
5. → Execute Phase 0 → research.md (current step)
6. → Execute Phase 1 → contracts, data-model.md, quickstart.md
7. → Re-evaluate Constitution Check
8. → Plan Phase 2 → Task generation approach
9. → STOP - Ready for /tasks command
```

## Summary
AEGIS Policy Engine is an AI-powered natural language policy enforcement system for MCP (Model Context Protocol) servers. It acts as a transparent proxy that intercepts MCP requests, evaluates them against natural language policies using AI judgment, and enforces access controls with constraints and obligations. The system enables administrators to write policies in plain language (e.g., "hide customer salary data from external agents") and automatically enforces these rules across all MCP tool interactions.

**Current Status**: 73% test coverage (583/802 tests passing), targeting 95% coverage goal.

## Technical Context
**Language/Version**: TypeScript 5.x with Node.js
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@anthropic-ai/sdk` - Claude AI for policy judgment (default: claude-opus-4-20250514)
- Express - HTTP transport layer
- Jest - Testing framework
- `ts-jest` - TypeScript testing integration

**Storage**: File-based JSON storage (policies-store/)
**Testing**: Jest with ts-jest, comprehensive test suites in test/ directory
**Target Platform**: Node.js server (stdio and HTTP transport modes)
**Project Type**: Single TypeScript project with comprehensive test coverage
**Performance Goals**:
- 95% test coverage
- Sub-100ms median policy decision latency (target from stress tests)
- Support 1000 requests/minute rate limiting

**Constraints**:
- Must work transparently as MCP proxy
- Support both stdio (Claude Desktop) and HTTP transports
- No external notifications/email (mock implementations only)
- Real AI judgment using Claude Opus 4

**Scale/Scope**:
- MVP with 12 upstream MCP tools currently integrated
- EnforcementSystem fully integrated with constraint processors and obligation executors
- Core architecture complete (PEP, PDP, PIP, PAP)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Test-First Principle**: ✅ PASS
- Existing codebase has 802 tests (73% passing)
- Test files located in test/ directory following standard structure
- Goal: Fix failing tests to reach 95% pass rate

**Library-First Principle**: ✅ PASS
- Modular architecture with clear separation (PEP, PDP, PIP, PAP)
- Each component independently testable

**Code Organization**: ✅ PASS
- Standard TypeScript project structure
- src/ for source code, test/ for tests
- No "Phase" terminology in code

**Quality Standards**: ⚠️ NEEDS WORK
- Current: 73% test pass rate (583/802)
- Target: 95% test pass rate
- Main issues: StdioRouter tests, stress tests, AI retry logic

## Project Structure

### Documentation (this feature)
```
specs/001-aegis-policy-engine/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (in progress)
├── research.md          # Phase 0 output (to be created)
├── data-model.md        # Phase 1 output (to be created)
├── quickstart.md        # Phase 1 output (to be created)
├── contracts/           # Phase 1 output (to be created)
└── tasks.md             # Phase 2 output (/tasks command)
```

### Source Code (existing repository root)
```
aegis-policy-engine/
├── src/
│   ├── ai/                    # AI Judgment Engine (PDP)
│   │   ├── judgment-engine.ts
│   │   └── providers/         # LLM provider implementations
│   ├── enforcement/           # Constraint & Obligation processors
│   │   ├── constraints/
│   │   │   ├── data-anonymizer.ts
│   │   │   ├── rate-limiter.ts
│   │   │   └── geo-restrictor.ts
│   │   └── obligations/
│   │       ├── audit-logger.ts
│   │       ├── notifier.ts
│   │       └── data-lifecycle.ts
│   ├── mcp/                   # MCP Proxy (PEP)
│   │   ├── http-proxy.ts
│   │   ├── stdio-router.ts
│   │   └── policy-enforcer.ts
│   ├── pip/                   # Policy Information Point
│   │   ├── context-enricher.ts
│   │   └── enrichers/
│   ├── policy/                # Policy Management (PAP)
│   │   ├── policy-manager.ts
│   │   └── policy-store.ts
│   └── config/                # Configuration
│
├── test/                      # Test suites
│   ├── ai/                    # AI engine tests
│   ├── enforcement/           # Enforcement tests
│   ├── mcp/                   # MCP proxy tests
│   ├── pip/                   # PIP tests
│   ├── policy/                # Policy management tests
│   ├── e2e/                   # End-to-end tests
│   ├── integration/           # Integration tests
│   └── performance/           # Performance/stress tests
│
├── policies-store/            # File-based policy storage
│   └── history/              # Policy version history
│
├── scripts/                   # Build and deployment scripts
├── deployment/                # Deployment configurations
├── docs/                      # Documentation
└── .specify/                  # Spec-driven development artifacts
```

**Structure Decision**: Single TypeScript project with comprehensive modular architecture. The existing structure follows XACML-inspired IDS pattern (PEP/PDP/PIP/PAP) adapted for natural language policies and MCP protocol.

## Phase 0: Outline & Research

### Research Tasks

Based on the current codebase analysis and failing tests, the key areas requiring research and fixes are:

1. **AI Retry Logic Research**
   - Current issue: `judgment-engine-comprehensive.test.ts` failing on retry behavior
   - Expected: PERMIT after 3 retries
   - Actual: INDETERMINATE
   - Research: Exponential backoff implementation and transient failure detection

2. **StdioRouter Startup Sequence**
   - Current issue: Server startup message detection not matching expected log
   - Expected: "Successfully started upstream server: test-server"
   - Actual: Multiple startup messages with emoji prefixes
   - Research: MCP stdio protocol startup handshake patterns

3. **Performance Test Timeout Issues**
   - Current issue: Stress tests exceeding 60s timeout
   - Tests: Load testing, rate limiting performance
   - Research: Jest timeout configuration for long-running performance tests

4. **Rate Limiter Accuracy**
   - Current issue: Effective rate 12000/min vs expected 1100/min (10% tolerance of 1000/min)
   - Research: Time window management and sliding window vs fixed window algorithms

5. **MCP E2E Connection Management**
   - Current issue: "Connection closed" errors in e2e tests
   - Research: Proper MCP client lifecycle management and stdio transport cleanup

6. **Port Conflict Resolution**
   - Current issue: EADDRINUSE on port 3000 during parallel test execution
   - Research: Dynamic port allocation for test isolation

### Research Output Structure
All findings will be documented in `research.md` with:
- **Decision**: The chosen solution/fix
- **Rationale**: Why this approach solves the issue
- **Alternatives Considered**: Other approaches evaluated
- **Implementation Notes**: Key details for execution

**Output**: research.md with test fix strategies

## Phase 1: Design & Contracts

### Data Model (existing entities to document)
The system already has well-defined entities that need to be documented in `data-model.md`:

1. **Policy Entity**
   - Fields: id, name, description, policy text, version, metadata, status
   - Validation: Natural language clarity, AI interpretability
   - State transitions: draft → active → deprecated

2. **Decision Context Entity**
   - Fields: agent, action, resource, purpose, timestamp, location, environment, risk score
   - Enrichment: PIP adds time/location/agent/resource classification
   - Validation: Required fields present

3. **Policy Decision Entity**
   - Fields: decision (PERMIT/DENY/INDETERMINATE), confidence, reason, constraints, obligations, metadata
   - Validation: Confidence threshold (0.7 default)
   - Relationships: Links to policy and context

4. **Constraint Configuration**
   - Types: DataAnonymizer, RateLimiter, GeoRestrictor
   - Parameters: Type-specific configuration
   - Processing: ConstraintProcessorManager coordination

5. **Obligation Configuration**
   - Types: AuditLogger, Notifier, DataLifecycle
   - Execution timing: Pre/post enforcement
   - Processing: ObligationExecutorManager coordination

### API Contracts (existing interfaces to document)
The system has established MCP protocol contracts and internal APIs:

1. **MCP Proxy Interface** (PEP)
   - `resources/read` - Resource access with policy enforcement
   - `resources/list` - Resource listing with filtering
   - `tools/call` - Tool execution with policy checks
   - `tools/list` - Tool discovery

2. **Policy Management API** (PAP)
   - `createPolicy` - Create new natural language policy
   - `updatePolicy` - Update existing policy
   - `deletePolicy` - Remove policy
   - `getPolicy` - Retrieve policy by ID
   - `listPolicies` - Query policies with filters
   - `exportPolicy` / `importPolicy` - Backup/restore

3. **Decision Engine API** (PDP)
   - `makeDecision` - Evaluate single request
   - `makeBatchDecision` - Evaluate multiple requests
   - Internal: Policy selection, prompt construction, AI invocation

4. **Context Enrichment API** (PIP)
   - `enrichContext` - Add environmental information
   - Individual enrichers: TimeContext, AgentInfo, ResourceClassifier

### Contract Tests (to be created)
Generate contract test files in `/contracts/`:
- `mcp-proxy-contract.test.ts` - Verify MCP protocol compliance
- `policy-api-contract.test.ts` - Verify PAP API schemas
- `decision-engine-contract.test.ts` - Verify PDP response format
- `enforcement-contract.test.ts` - Verify constraint/obligation interfaces

### Quickstart Validation (to be created)
Create `quickstart.md` with:
1. Setup: Environment variables, dependencies
2. Basic policy creation example
3. Test MCP request with policy enforcement
4. Verify constraint application
5. Check audit logs

### Agent Context Update
Update CLAUDE.md with:
- Current test fix priorities
- Key architectural decisions from research
- Updated component interaction patterns

**Output**: data-model.md, /contracts/*.test.ts, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. **Test Fix Tasks** (Priority 1):
   - Fix AI retry logic in judgment-engine-comprehensive.test.ts
   - Fix StdioRouter startup message detection
   - Fix performance test timeouts (configure Jest properly)
   - Fix rate limiter accuracy calculation
   - Fix MCP e2e connection cleanup
   - Fix port conflict in parallel test execution

2. **Contract Test Tasks** (Priority 2):
   - Create MCP proxy contract tests
   - Create Policy API contract tests
   - Create Decision engine contract tests
   - Create Enforcement contract tests

3. **Documentation Tasks** (Priority 3):
   - Document data model in data-model.md
   - Create quickstart.md with working examples
   - Update CLAUDE.md with test fix notes

**Ordering Strategy**:
- **Phase 1**: Fix critical failing tests (AI retry, StdioRouter, timeouts) - [Sequential]
- **Phase 2**: Fix performance and accuracy issues (rate limiter, e2e cleanup) - [Parallel OK]
- **Phase 3**: Add contract tests for regression prevention - [Parallel OK]
- **Phase 4**: Documentation and quickstart guide - [Parallel OK]

**Estimated Output**: 15-20 numbered, dependency-ordered tasks in tasks.md

**Success Criteria**: 95% test pass rate (760+ of 802 tests passing)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md, fix failing tests)
**Phase 5**: Validation (run npm test, verify 95% pass rate, performance benchmarks)

## Complexity Tracking
*No constitutional violations - existing architecture is sound*

The current implementation follows all architectural principles:
- Test-first approach (comprehensive test suite exists)
- Modular library design (PEP/PDP/PIP/PAP separation)
- No "Phase" terminology in code (uses proper IDS terminology)

The focus is on **fixing existing tests**, not adding complexity.

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete - research.md created with test failure analysis
- [x] Phase 1: Design complete - data-model.md and quickstart.md created
- [x] Phase 2: Task planning complete - strategy documented above
- [x] Phase 3: Tasks generated - tasks.md created with 10 prioritized tasks
- [ ] Phase 4: Implementation - Ready to execute T001-T010
- [ ] Phase 5: Validation - Verify 95% test pass rate

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS (no new violations)
- [x] All NEEDS CLARIFICATION resolved (using existing codebase context)
- [x] Complexity deviations documented (none needed)

**Deliverables Created**:
- ✅ `/specs/001-aegis-policy-engine/spec.md` - Feature specification (50 requirements)
- ✅ `/specs/001-aegis-policy-engine/plan.md` - This implementation plan
- ✅ `/specs/001-aegis-policy-engine/research.md` - Test failure analysis (6 categories)
- ✅ `/specs/001-aegis-policy-engine/data-model.md` - Complete entity documentation (7 entities)
- ✅ `/specs/001-aegis-policy-engine/quickstart.md` - Setup and validation guide
- ✅ `/specs/001-aegis-policy-engine/tasks.md` - 10 prioritized implementation tasks

**Ready for**: Task execution - Begin with T001-T003 (quick wins, can run in parallel)

---
*Based on existing AEGIS codebase and CLAUDE.md architecture documentation*
