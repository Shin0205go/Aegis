
# Implementation Plan: Test Stability Improvements

**Branch**: `002-test-stability-improvements` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/shingo/Develop/aegis-policy-engine/specs/002-test-stability-improvements/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Improve AEGIS Policy Engine test suite stability and reliability to achieve 95%+ pass rate (760+/802 tests). Address port conflicts, timeout issues, and test assertion accuracy problems identified in current test failures.

**Current Status**: 585/802 tests passing (73%)
**Target**: 760+/802 tests passing (95%+)
**Gap**: 175 tests requiring fixes

## Technical Context
**Language/Version**: TypeScript with Node.js 18+
**Primary Dependencies**: Jest 29.7.0, ts-jest 29.1.1, @modelcontextprotocol/sdk, @anthropic-ai/sdk
**Storage**: N/A (test infrastructure improvements)
**Testing**: Jest with ts-jest, supertest for HTTP, custom test helpers
**Target Platform**: Node.js (Linux/macOS/Windows)
**Project Type**: single (TypeScript project with src/ and test/ structure)
**Performance Goals**: 95%+ test pass rate, <120s for performance tests, <30s for integration tests
**Constraints**: Dynamic port allocation to prevent EADDRINUSE, accurate sliding window rate limiter tests
**Scale/Scope**: 802 total tests across 59 test files, comprehensive unit/integration/E2E/performance coverage

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Constitution Status**: Template constitution (not customized for this project)

**Analysis**: This feature focuses on test infrastructure improvements (test-first principles alignment). No new production code or libraries. Changes are limited to:
- Test helper utilities (test/helpers/)
- Test assertion fixes
- Test configuration adjustments

**Gate Result**: ✅ PASS - Test infrastructure improvements align with test-first principles and do not introduce architectural complexity

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
test/
├── helpers/                    # Test utility helpers
│   └── test-server.ts          # Dynamic port allocation utilities
└── setup.ts                    # Global test setup

src/test/                       # Main test directory (59 test files)
├── ai/                         # AI judgment engine tests
├── context/                    # Context enrichment tests
├── core/                       # Core system tests
│   ├── constraints/
│   └── obligations/
├── e2e/                        # End-to-end tests
│   ├── setup.ts
│   ├── mcp-proxy-integration.test.ts
│   └── policy-lifecycle.test.ts
├── enforcement/                # Enforcement system tests
├── integration/                # Integration tests
├── mcp/                        # MCP proxy tests
│   ├── stdio-router.test.ts    # Stdio router tests (needs fixes)
│   └── *-extended.test.ts
├── performance/                # Performance & stress tests
│   └── stress-test.test.ts     # Load testing (needs timeout fixes)
└── utils/                      # Utility tests

jest.config.js                  # Main Jest configuration
jest.config.e2e.js              # E2E Jest configuration
tsconfig.test.json              # Test TypeScript configuration
```

**Structure Decision**: Single TypeScript project with dedicated test/ and src/test/ directories. Test helpers in test/helpers/, main tests in src/test/ with category-based subdirectories. No source code changes required - only test infrastructure improvements.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract function → contract test task [P]
  - test-server.contract.test.ts → 5 test cases
  - metrics.contract.test.ts → 4 test cases
  - rate-limiter.contract.test.ts → 4 test cases
  - stdio.contract.test.ts → 4 test cases
  - cleanup.contract.test.ts → 4 test cases
- Each failing test → implementation task to fix
- Integration tasks to apply fixes across test suite

**Ordering Strategy**:
- TDD order: Contract tests first (failing), then implementations
- Dependency order: Helper utilities before test fixes before quickstart validation
- Mark [P] for parallel execution where tests are independent
- Sequential for integration tasks affecting multiple test files

**Task Categories**:
1. **Contract Tests** (5 files × ~4 tests each = ~20 tasks) - Write failing tests
2. **Helper Implementations** (5 helper modules = ~5 tasks) - Make contract tests pass
3. **Test Fixes** (Apply fixes to existing test files = ~10 tasks) - Fix 175+ failing tests
4. **Validation** (Quickstart steps = ~6 tasks) - Verify improvements
5. **Documentation** (Update docs = ~2 tasks) - Record changes

**Estimated Output**: 40-45 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command) - 37 tasks created
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none - no deviations)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*
