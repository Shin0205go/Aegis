# Data Model: Test Stability Improvements

**Feature**: Test Stability Improvements
**Date**: 2026-02-13
**Branch**: 002-test-stability-improvements

## Overview

This feature focuses on test infrastructure improvements rather than production data models. The "entities" are test infrastructure components and their runtime state.

---

## Entity 1: Test Server Context

**Description**: Represents the runtime state of a test server instance.

**Attributes**:
- `server`: HTTP server instance (MCPHttpPolicyProxy or similar)
- `port`: Dynamically allocated port number (OS-assigned)
- `baseUrl`: Full URL for test requests (e.g., `http://localhost:${port}`)
- `isReady`: Boolean flag indicating server readiness
- `logger`: Mock logger instance (for capturing logs)

**State Lifecycle**:
1. **Created**: Server instance created with port 0 (dynamic)
2. **Starting**: `server.start()` called, waiting for ready
3. **Ready**: Server listening, `isReady = true`
4. **Cleanup**: `server.stop()` called, resources released

**Relationships**:
- Managed by `TestServerManager` (one-to-many)
- Used by integration and E2E tests

**Validation Rules**:
- Port must be > 1024 (non-privileged) after allocation
- `baseUrl` must be reachable within timeout period
- Server must respond to health checks before marked ready

---

## Entity 2: Test Execution Metrics

**Description**: Tracks performance metrics during test execution.

**Attributes**:
- `startTime`: Test start timestamp (performance.now())
- `endTime`: Test end timestamp (performance.now())
- `responseTimes`: Array of individual request durations
- `successCount`: Number of successful operations
- `errorCount`: Number of failed operations
- `cacheHitRate`: Percentage of cache hits (0-1)

**Calculated Properties**:
- `duration`: `endTime - startTime`
- `avgResponseTime`: Mean of `responseTimes`
- `p95ResponseTime`: 95th percentile of `responseTimes`
- `p99ResponseTime`: 99th percentile of `responseTimes`
- `throughput`: `totalRequests / (duration / 1000)` (requests/second)
- `errorRate`: `errorCount / totalRequests`

**Validation Rules**:
- `startTime` must be before `endTime`
- `responseTimes` must all be non-negative
- `cacheHitRate` must be between 0 and 1
- Percentile calculations require sorted array

---

## Entity 3: Rate Limiter Test State

**Description**: Models the sliding window rate limiter's state for testing.

**Attributes**:
- `windowSize`: Time window in milliseconds (e.g., 60000 for 1 minute)
- `limit`: Maximum requests allowed in window (e.g., 1000)
- `requestTimestamps`: Array of timestamps (sliding window)
- `currentTime`: Simulated or real current time

**Behavior**:
- **Add Request**: `requestTimestamps.push(currentTime)`
- **Prune Old**: Remove timestamps < `currentTime - windowSize`
- **Check Limit**: `requestTimestamps.length <= limit`

**Test Assertions**:
- Effective rate = `(allowed requests / actual duration) * 60` (per minute)
- Tolerance = ±10% due to timing variability

**Validation Rules**:
- `requestTimestamps` must be sorted ascending
- All timestamps must be within `currentTime - windowSize`
- `limit` must be positive integer

---

## Entity 4: Test Cleanup Context

**Description**: Manages cleanup operations for test isolation.

**Attributes**:
- `servers`: Array of server instances to cleanup
- `mocks`: Array of Jest mock functions to reset
- `timers`: Array of timer IDs to clear
- `fileHandles`: Array of file handles to close

**Operations**:
- **Register**: Add resource for cleanup
- **Cleanup**: Iterate and cleanup all resources
- **Reset**: Clear all registered resources

**Lifecycle**:
1. **beforeEach**: Create new cleanup context
2. **Test Execution**: Register resources as created
3. **afterEach**: Execute cleanup operations
4. **Verify**: Ensure all resources released

**Validation Rules**:
- All servers must be stopped before context disposal
- All mocks must call `jest.clearAllMocks()`
- No resource leaks (verify with resource tracking)

---

## Entity 5: Stdio Router Output

**Description**: Represents captured stdio output for validation.

**Attributes**:
- `stdout`: Array of stdout lines
- `stderr`: Array of stderr lines
- `exitCode`: Process exit code (null if running)
- `hasEmoji`: Boolean flag for emoji detection

**Validation Patterns**:
- **Exact Match**: `output.includes(exactString)`
- **Regex Match**: `output.match(/pattern/i)`
- **Semantic Match**: `output.toLowerCase().includes('keyword')`
- **Not Contains**: `!output.includes(unexpectedString)`

**Normalization**:
- Strip ANSI color codes if needed
- Handle emoji presence gracefully
- Case-insensitive matching for semantic checks

**Validation Rules**:
- Must capture both stdout and stderr separately
- Lines must preserve order
- Exit code only valid after process termination

---

## Entity Relationships

```
TestServerManager
  ├── manages → TestServerContext (1:N)
  │   └── used by → Integration Tests
  │
TestExecutionMetrics
  └── tracks → Test Runs (1:1)

RateLimiterTestState
  └── validates → Rate Limiter Behavior (1:1)

TestCleanupContext
  ├── manages → TestServerContext (1:N)
  ├── manages → Jest Mocks (1:N)
  └── manages → Stdio Processes (1:N)

StdioRouterOutput
  └── captured from → Stdio Processes (1:1)
```

---

## State Transitions

### Test Server Lifecycle
```
[Created] →(start)→ [Starting] →(ready)→ [Ready] →(stop)→ [Stopped]
                         ↓ timeout
                    [Error]
```

### Test Execution Flow
```
[Setup] →(beforeEach)→ [Clean State]
  ↓
[Execute Test] →(collect metrics)→ [Metrics Captured]
  ↓
[Cleanup] →(afterEach)→ [Resources Released]
```

### Rate Limiter Window
```
[Window Start]
  ↓ (requests arrive)
[Accumulate Timestamps]
  ↓ (time passes)
[Prune Old Timestamps] →(check limit)→ [Allow/Deny]
```

---

## Validation Summary

| Entity | Key Validation | Failure Consequence |
|--------|----------------|---------------------|
| TestServerContext | Port uniqueness | EADDRINUSE error |
| TestExecutionMetrics | Sorted response times | Incorrect percentiles |
| RateLimiterTestState | Timestamp pruning | Rate limit bypass |
| TestCleanupContext | Complete cleanup | Resource leaks, cascading failures |
| StdioRouterOutput | Semantic matching | False negatives on output checks |

---

## Next Steps

This data model informs:
1. **Contracts**: Test helper function signatures (Phase 1)
2. **Tasks**: Implementation of improved test infrastructure (Phase 2)
3. **Validation**: Test assertions based on these entities (Phase 3)

No production database or persistent storage required - all entities are in-memory test state.
