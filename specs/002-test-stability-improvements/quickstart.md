# Quickstart: Test Stability Improvements Validation

**Feature**: Test Stability Improvements
**Date**: 2026-02-13
**Branch**: 002-test-stability-improvements

## Purpose

This quickstart guide validates that test stability improvements are working correctly. Follow these steps in order to verify the feature implementation.

---

## Prerequisites

- AEGIS Policy Engine repository cloned
- Node.js 18+ installed
- Dependencies installed (`npm install`)
- Branch `002-test-stability-improvements` checked out

---

## Validation Steps

### Step 1: Verify Dynamic Port Allocation

**Purpose**: Confirm test servers use dynamic ports and avoid EADDRINUSE errors

```bash
# Run HTTP proxy tests multiple times in parallel
npm run test -- --testPathPattern="mcp-http-proxy" --runInBand=false &
npm run test -- --testPathPattern="mcp-http-proxy" --runInBand=false &
wait

# Expected: Both test runs complete successfully without port conflicts
# Success Criteria: No "EADDRINUSE" errors in output
```

**Manual Verification**:
1. Check test output for EADDRINUSE errors → Should be 0
2. Check test pass rate for mcp-http-proxy tests → Should be 100%

---

### Step 2: Verify Performance Test Timeout Handling

**Purpose**: Confirm performance tests complete within timeout or are conditionally skipped

```bash
# Run performance tests with explicit flag
RUN_PERFORMANCE_TESTS=true npm run test -- --testPathPattern="stress-test"

# Expected: Tests complete within 120 seconds OR are skipped with clear message
# Success Criteria: No timeout errors
```

**Manual Verification**:
1. If tests run: Check execution time → Should be < 120s
2. If tests skipped: Check skip reason → Should mention "RUN_PERFORMANCE_TESTS=true to enable"

---

### Step 3: Verify Rate Limiter Test Accuracy

**Purpose**: Confirm rate limiter tests use correct calculation formula

```bash
# Run rate limiter tests
npm run test -- --testPathPattern="rate-limit"

# Expected: Tests pass with accurate rate calculations
# Success Criteria: No "Expected: <= 1100, Received: 12000" errors
```

**Manual Verification**:
1. Check test output for rate calculation assertions → Should all pass
2. Verify effective rate calculation uses `(allowed / duration) * 60` formula

---

### Step 4: Verify Stdio Router Output Matching

**Purpose**: Confirm stdio router tests handle non-deterministic output (emojis, formatting)

```bash
# Run stdio router tests
npm run test -- --testPathPattern="stdio-router"

# Expected: Tests pass regardless of emoji presence in output
# Success Criteria: No exact string match failures on startup messages
```

**Manual Verification**:
1. Check test output → Should use `.toContain()` or regex matching
2. Verify no failures due to emoji differences in output

---

### Step 5: Verify Test Cleanup

**Purpose**: Confirm all tests properly cleanup resources

```bash
# Run full test suite with resource tracking
npm run test

# Expected: No resource leak warnings, all tests cleanup properly
# Success Criteria: Test suite completes without warnings
```

**Manual Verification**:
1. Check for "MaxListenersExceededWarning" → Should be 0
2. Check for open handles warnings → Should be 0
3. Run `lsof -p $(pgrep node)` after tests → Should show no leaked file handles

---

### Step 6: Verify Overall Test Pass Rate

**Purpose**: Confirm overall test stability improvement

```bash
# Run complete test suite
npm run test

# Expected: At least 95% pass rate (760+/802 tests)
# Success Criteria: Pass rate >= 95%
```

**Manual Verification**:
1. Count total tests → Should be 802
2. Count passed tests → Should be >= 760
3. Calculate pass rate: `(passed / total) * 100` → Should be >= 95%

---

## Success Criteria Summary

| Validation Step | Success Metric | Current Baseline | Target |
|-----------------|----------------|------------------|--------|
| Dynamic Ports | 0 EADDRINUSE errors | ~100+ errors | 0 errors |
| Performance Timeout | 0 timeout errors | 1 timeout error | 0 errors |
| Rate Limiter | Tests pass with correct formula | 1 test failure | 0 failures |
| Stdio Router | Semantic matching works | ~5-10 failures | 0 failures |
| Test Cleanup | 0 resource leak warnings | Unknown | 0 warnings |
| Overall Pass Rate | >= 95% tests passing | 73% (585/802) | 95% (760+/802) |

---

## Troubleshooting

### Issue: Port Conflicts Still Occur

**Symptoms**: EADDRINUSE errors in test output

**Diagnosis**:
```bash
# Check if tests use hardcoded ports
grep -r "listen(3000" src/test/
grep -r "port: 3000" src/test/
```

**Resolution**:
- Ensure all tests use `createTestServer()` from test/helpers/test-server.ts
- Verify no hardcoded ports in test setup

---

### Issue: Performance Tests Timeout

**Symptoms**: "Exceeded timeout of 120000 ms" error

**Diagnosis**:
```bash
# Check if jest.setTimeout() is set in test
grep -A5 "describe.*stress.*test" src/test/performance/stress-test.test.ts | grep "setTimeout"
```

**Resolution**:
- Ensure `jest.setTimeout(120000)` in beforeEach()
- Consider optimizing test (reduce concurrent users or requests per user)
- Check if `RUN_PERFORMANCE_TESTS` flag is being used correctly

---

### Issue: Rate Limiter Tests Fail

**Symptoms**: Expected rate much lower than actual rate

**Diagnosis**:
```typescript
// Check calculation formula in test
const effectiveRate = (result.allowed / requestsPerClient) * requestsPerClient * 60;
// This is WRONG - should use actual duration
```

**Resolution**:
```typescript
// Correct formula
const actualDuration = (endTime - startTime) / 1000; // seconds
const effectiveRate = (result.allowed / actualDuration) * 60; // per minute
```

---

### Issue: Stdio Router Tests Fail on Output

**Symptoms**: Test expects exact string, gets string with emoji

**Diagnosis**:
```typescript
// Check assertion pattern
expect(output).toBe('Stdio router initialized'); // WRONG - exact match
```

**Resolution**:
```typescript
// Use semantic matching
expect(output).toContain('Stdio router initialized'); // RIGHT
expect(output).toMatch(/stdio\s+router\s+initialized/i); // ALSO RIGHT
```

---

## Rollback Instructions

If validation fails and rollback is needed:

```bash
# Switch back to previous branch
git checkout 001-aegis-policy-engine

# Re-run tests to confirm baseline
npm run test

# Expected: 585/802 tests passing (73%)
```

---

## Next Steps

After successful validation:

1. **Commit changes** with descriptive message
2. **Update documentation** (README.md testing section if needed)
3. **Monitor CI/CD** for consistent test pass rate
4. **Investigate remaining failures** to push toward 100% pass rate

---

## Validation Checklist

- [ ] Step 1: Dynamic Port Allocation verified (0 EADDRINUSE errors)
- [ ] Step 2: Performance Test Timeout handling verified
- [ ] Step 3: Rate Limiter Test Accuracy verified
- [ ] Step 4: Stdio Router Output Matching verified
- [ ] Step 5: Test Cleanup verified (0 resource leaks)
- [ ] Step 6: Overall Pass Rate >= 95% verified
- [ ] All troubleshooting steps documented
- [ ] Rollback plan tested (if needed)

**Validation Date**: _______________
**Validated By**: _______________
**Pass Rate Achieved**: _____ / 802 (_____ %)
**Status**: ⬜ PASS ⬜ FAIL

---

**Note**: This quickstart assumes TDD approach - contract tests should already be written and failing. Implementation makes tests pass. If tests don't exist yet, create them first before implementing fixes.
