# Tasks: Test Stability Improvements

**Input**: Design documents from `/Users/shingo/Develop/aegis-policy-engine/specs/002-test-stability-improvements/`
**Prerequisites**: plan.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Feature Branch**: `002-test-stability-improvements`
**Goal**: Achieve 95%+ test pass rate (760+/802 tests) from current 73% (585/802 tests)
**Gap**: 175 tests requiring fixes

---

## Execution Flow (main)
```
1. Load plan.md from feature directory ✓
   → Tech stack: TypeScript, Jest 29.7.0, ts-jest, Node.js 18+
   → Structure: Single project (src/, test/, src/test/)
2. Load optional design documents ✓
   → data-model.md: 5 entities (TestServerContext, TestExecutionMetrics, etc.)
   → contracts/: test-helpers.contract.ts (5 contract modules)
   → research.md: 7 research areas with solutions
   → quickstart.md: 6 validation steps
3. Generate tasks by category:
   → Setup: Project structure verification, dependencies
   → Tests: Contract tests (5 modules × ~4 tests = 20 tasks)
   → Core: Helper implementations (5 modules = 5 tasks)
   → Integration: Apply fixes to existing tests (~10 tasks)
   → Polish: Validation, documentation
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...) ✓
6. Generate dependency graph ✓
7. Create parallel execution examples ✓
8. Validate task completeness:
   → All contracts have tests? ✓
   → All test fixes identified? ✓
   → Validation steps covered? ✓
9. Return: SUCCESS (tasks ready for execution) ✓
```

---

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

---

## Phase 3.1: Setup & Verification

- [x] **T001** Verify project structure matches plan.md specifications
  - Check test/helpers/, src/test/, jest.config.js exist ✓
  - Verify current test status: 585/802 passing (from previous run) ✓
  - Document baseline metrics for comparison ✓

- [x] **T002** Install/verify dependencies for test infrastructure
  - Ensure Jest 29.7.0, ts-jest 29.4.0 installed ✓
  - Verify supertest, @types/jest available ✓
  - Check Node.js version >= 18 (v20.19.0) ✓

- [ ] **T003** [P] Configure test categorization environment variables
  - Add `RUN_PERFORMANCE_TESTS` flag support in package.json scripts
  - Add `RUN_E2E_TESTS` flag support
  - Document usage in README or test documentation

---

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests - Test Server Module

- [ ] **T004** [P] Contract test for `createTestServer()` in `test/contract/test-server.contract.test.ts`
  - Test: Returns unique ports for parallel calls
  - Test: Port > 1024 (non-privileged)
  - Test: `isReady` becomes true when server listening
  - Test: Rejects on server start failure

- [ ] **T005** [P] Contract test for `waitForReady()` in `test/contract/test-server.contract.test.ts`
  - Test: Resolves when server responds to health check
  - Test: Rejects with timeout error after timeout period
  - Test: Polls server endpoint correctly

- [ ] **T006** [P] Contract test for `TestServerManager` in `test/contract/test-server.contract.test.ts`
  - Test: Tracks all created servers
  - Test: `stopAll()` stops all managed servers
  - Test: `getServer(port)` returns correct server context
  - Test: Allows parallel server creation without port conflicts

### Contract Tests - Metrics Module

- [ ] **T007** [P] Contract test for `calculateMetrics()` in `test/contract/metrics.contract.test.ts`
  - Test: Handles empty `responseTimes` array (returns 0 for metrics)
  - Test: Sorts `responseTimes` before percentile calculations
  - Test: Calculates throughput correctly: `totalRequests / (duration / 1000)`
  - Test: Handles division by zero (duration = 0)
  - Test: p95/p99 calculations use correct array indices

### Contract Tests - Rate Limiter Module

- [ ] **T008** [P] Contract test for `calculateEffectiveRate()` in `test/contract/rate-limiter.contract.test.ts`
  - Test: Uses formula `(allowedRequests / durationMs) * 60000`
  - Test: Handles zero duration (returns 0 or Infinity, document behavior)
  - Test: Returns finite number (no Infinity)
  - Test: Calculates requests per minute correctly

- [ ] **T009** [P] Contract test for `validateRateLimit()` in `test/contract/rate-limiter.contract.test.ts`
  - Test: Prunes old timestamps before validation
  - Test: Respects sliding window behavior (not fixed window)
  - Test: Allows tolerance for timing variability (±10% default)
  - Test: Correctly identifies violations vs. compliance

### Contract Tests - Stdio Module

- [ ] **T010** [P] Contract test for `matchStdioOutput()` in `test/contract/stdio.contract.test.ts`
  - Test: Handles regex patterns correctly
  - Test: Case-insensitive matching with option
  - Test: Searches both stdout and stderr
  - Test: Partial matching with option

- [ ] **T011** [P] Contract test for `normalizeStdioOutput()` in `test/contract/stdio.contract.test.ts`
  - Test: Strips ANSI escape sequences with `stripAnsi` option
  - Test: Removes emoji with `ignoreEmoji` option
  - Test: Converts to lowercase with `caseInsensitive` option
  - Test: Preserves word boundaries and spacing

### Contract Tests - Cleanup Module

- [ ] **T012** [P] Contract test for `createCleanupContext()` in `test/contract/cleanup.contract.test.ts`
  - Test: Tracks registered resources (servers, mocks, timers, files)
  - Test: `cleanup()` stops all servers
  - Test: `cleanup()` calls `jest.clearAllMocks()` on all mocks
  - Test: `cleanup()` clears all timers
  - Test: `cleanup()` handles errors gracefully (logs but doesn't throw)
  - Test: `reset()` clears all tracked resources

---

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Test Helper Implementations

- [ ] **T013** [P] Implement `createTestServer()` and `waitForReady()` in `test/helpers/test-server.ts`
  - Enhance existing implementation with port 0 (dynamic allocation)
  - Add health check polling for `waitForReady()`
  - Ensure `baseUrl` constructed correctly
  - Make T004 and T005 contract tests pass

- [ ] **T014** [P] Implement `TestServerManager` class in `test/helpers/test-server.ts`
  - Add server tracking array
  - Implement `createServer()`, `stopServer()`, `stopAll()`
  - Implement `getServer(port)` lookup
  - Make T006 contract tests pass

- [ ] **T015** [P] Implement metrics calculation utilities in `test/helpers/metrics.ts`
  - Create new file with `calculateMetrics()` function
  - Implement sorting for percentile calculations
  - Handle edge cases (empty arrays, division by zero)
  - Make T007 contract tests pass

- [ ] **T016** [P] Implement rate limiter test utilities in `test/helpers/rate-limiter.ts`
  - Create new file with `calculateEffectiveRate()` function
  - Implement `validateRateLimit()` with sliding window logic
  - Add timestamp pruning logic
  - Make T008 and T009 contract tests pass

- [ ] **T017** [P] Implement stdio output utilities in `test/helpers/stdio.ts`
  - Create new file with `matchStdioOutput()` function
  - Implement `normalizeStdioOutput()` with ANSI/emoji stripping
  - Support regex and string matching
  - Make T010 and T011 contract tests pass

- [ ] **T018** [P] Implement cleanup context utilities in `test/helpers/cleanup.ts`
  - Create new file with `createCleanupContext()` function
  - Implement resource tracking and cleanup logic
  - Add graceful error handling
  - Make T012 contract tests pass

---

## Phase 3.4: Integration - Apply Fixes to Existing Tests

### Port Conflict Fixes

- [ ] **T019** Update HTTP proxy tests to use dynamic port allocation
  - Files: `src/test/mcp/mcp-http-proxy.test.ts`, `src/test/mcp/mcp-http-proxy-extended.test.ts`
  - Replace hardcoded ports with `createTestServer()`
  - Add proper cleanup in `afterEach()` hooks
  - Estimated impact: ~50 tests fixed

- [ ] **T020** Update E2E tests to use `TestServerManager`
  - Files: `src/test/e2e/mcp-proxy-integration.test.ts`, `src/test/e2e/policy-lifecycle.test.ts`
  - Use `TestServerManager.createServer()` for multiple server instances
  - Ensure `stopAll()` called in `afterAll()`
  - Estimated impact: ~20 tests fixed

### Timeout Fixes

- [ ] **T021** Optimize performance stress test in `src/test/performance/stress-test.test.ts`
  - Add `jest.setTimeout(120000)` in `beforeEach()` for load testing suite
  - Optimize tight loops (reduce logging overhead)
  - Consider conditional skip: `if (!process.env.RUN_PERFORMANCE_TESTS) { it.skip(...) }`
  - Add reset timeout in `afterEach()`
  - Estimated impact: 1 test fixed

- [ ] **T022** Split long-running performance tests into focused tests
  - Extract burst traffic test into separate file if needed
  - Ensure each test completes in <120s
  - Document usage of `RUN_PERFORMANCE_TESTS=true` flag
  - Estimated impact: Improved test suite performance

### Rate Limiter Test Fixes

- [ ] **T023** Fix rate limiter precision test assertions in `src/test/performance/stress-test.test.ts`
  - Locate test: "should enforce rate limits without significant overhead"
  - Replace incorrect formula with `calculateEffectiveRate()` from helpers
  - Capture actual start/end timestamps
  - Use formula: `(result.allowed / actualDuration) * 60` (requests/minute)
  - Add tolerance: ±10% for timing variability
  - Estimated impact: 1 test fixed

### Stdio Router Fixes

- [ ] **T024** Update stdio router tests to use semantic matching in `src/test/mcp/stdio-router.test.ts`
  - Replace exact string matching `.toBe()` with `.toContain()` or regex
  - Use `matchStdioOutput()` helper for non-deterministic output
  - Handle emoji presence in startup messages
  - Example: `expect(output).toContain('Stdio router initialized')` instead of exact match
  - Estimated impact: ~5-10 tests fixed

### Cleanup & Resource Leak Fixes

- [ ] **T025** Audit and add missing cleanup hooks across test suite
  - Search for tests without `afterEach()` or `afterAll()` cleanup
  - Add `TestCleanupContext` usage where appropriate
  - Ensure mock reset with `jest.clearAllMocks()`
  - Verify timer cleanup
  - Files to check: All test files in `src/test/` subdirectories
  - Estimated impact: ~10-20 tests fixed

- [ ] **T026** Add resource tracking to integration tests
  - Use `createCleanupContext()` in integration test setup
  - Register servers, mocks, timers for automatic cleanup
  - Ensure no resource leaks between tests
  - Files: `src/test/integration/*.test.ts`
  - Estimated impact: ~10 tests fixed

### Test Configuration Fixes

- [ ] **T027** Update Jest timeout configuration per test category
  - Add timeout utility imports to test files
  - Use `setTestTimeout('performance')` for performance tests
  - Use `setTestTimeout('e2e')` for E2E tests
  - Keep unit/integration at default 30s
  - Add timeout reset in cleanup hooks
  - Estimated impact: Prevent future timeout issues

---

## Phase 3.5: Polish & Validation

### Validation (From quickstart.md)

- [ ] **T028** [P] Validate dynamic port allocation (Quickstart Step 1)
  - Run HTTP proxy tests in parallel: `npm run test -- --testPathPattern="mcp-http-proxy" --runInBand=false &`
  - Verify 0 EADDRINUSE errors
  - Document results

- [ ] **T029** [P] Validate performance test timeout handling (Quickstart Step 2)
  - Run: `RUN_PERFORMANCE_TESTS=true npm run test -- --testPathPattern="stress-test"`
  - Verify no timeout errors or clear skip messages
  - Document execution time

- [ ] **T030** [P] Validate rate limiter test accuracy (Quickstart Step 3)
  - Run: `npm run test -- --testPathPattern="rate-limit"`
  - Verify no "Expected: <= 1100, Received: 12000" errors
  - Confirm correct formula usage

- [ ] **T031** [P] Validate stdio router output matching (Quickstart Step 4)
  - Run: `npm run test -- --testPathPattern="stdio-router"`
  - Verify semantic matching works with emojis
  - Confirm no exact string match failures

- [ ] **T032** [P] Validate test cleanup (Quickstart Step 5)
  - Run: `npm run test`
  - Check for "MaxListenersExceededWarning": Should be 0
  - Check for open handles warnings: Should be 0
  - Optional: Run `lsof -p $(pgrep node)` after tests

- [ ] **T033** Validate overall test pass rate (Quickstart Step 6)
  - Run: `npm run test`
  - Count passed tests: Should be >= 760/802 (95%+)
  - Calculate pass rate: `(passed / 802) * 100`
  - Document final pass rate
  - **SUCCESS CRITERIA**: >= 95% pass rate

### Documentation & Cleanup

- [ ] **T034** [P] Update test documentation in README.md or docs/
  - Document new test helper utilities in `test/helpers/`
  - Explain `RUN_PERFORMANCE_TESTS` and `RUN_E2E_TESTS` flags
  - Add troubleshooting section from quickstart.md
  - Document test timeout settings

- [ ] **T035** [P] Update CLAUDE.md with test patterns (if not already done by script)
  - Verify `.specify/scripts/bash/update-agent-context.sh claude` was run
  - Confirm test infrastructure improvements documented
  - Add examples of using new test helpers

- [ ] **T036** Create summary report of test stability improvements
  - Document before/after metrics (585/802 → 760+/802)
  - List all test fixes applied
  - Note remaining failures (if any) and potential solutions
  - Save to `specs/002-test-stability-improvements/implementation-report.md`

- [ ] **T037** Clean up and commit all changes
  - Run final test suite: `npm run test`
  - Run build: `npm run build`
  - Commit with message: "feat: test stability improvements - 95%+ pass rate"
  - Push to branch: `002-test-stability-improvements`

---

## Dependencies

### Setup Dependencies
- T001 blocks all other tasks (baseline verification)
- T002 blocks all implementation tasks
- T003 can run in parallel with contract tests

### Test-First Dependencies (TDD)
- **Contract Tests (T004-T012) MUST complete before implementations (T013-T018)**
- T004, T005, T006 block T013, T014
- T007 blocks T015
- T008, T009 block T016
- T010, T011 block T017
- T012 blocks T018

### Implementation Dependencies
- T013 blocks T019, T020 (test fixes need dynamic port helpers)
- T014 blocks T020 (E2E needs TestServerManager)
- T015 blocks T023 (rate limiter fix needs metrics helpers)
- T017 blocks T024 (stdio fix needs stdio helpers)
- T018 blocks T025, T026 (cleanup fixes need cleanup helpers)

### Integration Dependencies
- T019-T027 (all test fixes) block validation tasks (T028-T033)
- T033 (overall pass rate) blocks documentation (T034-T037)

### Phase Dependencies
- Phase 3.1 (Setup) before Phase 3.2 (Contract Tests)
- Phase 3.2 (Contract Tests) before Phase 3.3 (Implementation)
- Phase 3.3 (Implementation) before Phase 3.4 (Integration Fixes)
- Phase 3.4 (Integration Fixes) before Phase 3.5 (Validation)

---

## Parallel Execution Examples

### Contract Tests (After T001-T003 complete)
```bash
# Launch T004-T012 together (all contract tests):
# These can all run in parallel as they create different test files
npm run test -- --testPathPattern="contract"
```

Or with Task agent:
```
Task: "Contract test for createTestServer() in test/contract/test-server.contract.test.ts"
Task: "Contract test for calculateMetrics() in test/contract/metrics.contract.test.ts"
Task: "Contract test for calculateEffectiveRate() in test/contract/rate-limiter.contract.test.ts"
Task: "Contract test for matchStdioOutput() in test/contract/stdio.contract.test.ts"
Task: "Contract test for createCleanupContext() in test/contract/cleanup.contract.test.ts"
```

### Helper Implementations (After contract tests fail)
```bash
# Launch T013-T018 together (all helper implementations):
# These create different files in test/helpers/
```

Or with Task agent:
```
Task: "Implement createTestServer() and waitForReady() in test/helpers/test-server.ts"
Task: "Implement metrics calculation utilities in test/helpers/metrics.ts"
Task: "Implement rate limiter test utilities in test/helpers/rate-limiter.ts"
Task: "Implement stdio output utilities in test/helpers/stdio.ts"
Task: "Implement cleanup context utilities in test/helpers/cleanup.ts"
```

### Validation Tasks (After all fixes applied)
```bash
# Launch T028-T032 together (validation steps):
# These are independent verification steps
```

Or with Task agent:
```
Task: "Validate dynamic port allocation (Quickstart Step 1)"
Task: "Validate performance test timeout handling (Quickstart Step 2)"
Task: "Validate rate limiter test accuracy (Quickstart Step 3)"
Task: "Validate stdio router output matching (Quickstart Step 4)"
Task: "Validate test cleanup (Quickstart Step 5)"
```

### Documentation Tasks (After validation passes)
```bash
# Launch T034-T035 together (documentation):
```

Or with Task agent:
```
Task: "Update test documentation in README.md or docs/"
Task: "Update CLAUDE.md with test patterns"
```

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe for parallel execution
- **Sequential tasks**: Same file modifications or dependencies - must run in order
- **Verify tests fail**: Before implementing T013-T018, run contract tests and confirm failures
- **Commit frequently**: After each major milestone (contract tests, implementations, fixes)
- **Estimated total impact**: 117-132 tests fixed (from research.md) + potential additional fixes from cleanup = **175+ tests fixed** to reach 760+/802 target

---

## Validation Checklist
*GATE: Checked before marking complete*

- [x] All contracts have corresponding tests (T004-T012)
- [x] All helper modules have implementation tasks (T013-T018)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (different files marked [P])
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Quickstart validation steps covered (T028-T033)
- [x] Documentation tasks included (T034-T037)
- [x] Success criteria defined (95%+ pass rate in T033)

---

## Task Execution Status

**Total Tasks**: 37
**Completed**: 0
**In Progress**: 0
**Blocked**: 0
**Not Started**: 37

**Next Action**: Begin Phase 3.1 with T001 (verify project structure)
