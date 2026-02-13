/**
 * Contract: Test Helper Functions
 * Feature: Test Stability Improvements
 * Purpose: Define interfaces for test infrastructure helpers
 */

// ============================================================================
// Test Server Context
// ============================================================================

export interface TestServerContext {
  /** HTTP server instance */
  server: any; // MCPHttpPolicyProxy or similar

  /** Dynamically allocated port number (OS-assigned) */
  port: number;

  /** Full URL for test requests (e.g., http://localhost:${port}) */
  baseUrl: string;

  /** Server readiness flag */
  isReady: boolean;

  /** Mock logger instance */
  logger?: any;
}

export interface TestServerOptions {
  /** Optional port (default: 0 for dynamic allocation) */
  port?: number;

  /** Optional timeout for server readiness (default: 5000ms) */
  readyTimeout?: number;

  /** Optional mock logger */
  logger?: any;
}

/**
 * Creates a test server with dynamic port allocation
 *
 * @param options - Server configuration options
 * @returns Promise<TestServerContext> - Server context with allocated port
 *
 * Contract:
 * - MUST allocate unique port if options.port not specified
 * - MUST return port number > 1024 (non-privileged)
 * - MUST set isReady to true when server accepts connections
 * - MUST reject if server fails to start within readyTimeout
 */
export declare function createTestServer(
  options?: TestServerOptions
): Promise<TestServerContext>;

/**
 * Waits for server to become ready
 *
 * @param server - Server instance to check
 * @param timeout - Maximum wait time in milliseconds (default: 5000)
 * @returns Promise<void> - Resolves when server ready, rejects on timeout
 *
 * Contract:
 * - MUST poll server health endpoint
 * - MUST resolve when server responds successfully
 * - MUST reject with timeout error if server not ready within timeout
 */
export declare function waitForReady(
  server: any,
  timeout?: number
): Promise<void>;

// ============================================================================
// Test Server Manager
// ============================================================================

export interface TestServerManager {
  /** Array of managed server contexts */
  servers: TestServerContext[];

  /** Create and register a new test server */
  createServer(options?: TestServerOptions): Promise<TestServerContext>;

  /** Stop a specific server */
  stopServer(context: TestServerContext): Promise<void>;

  /** Stop all managed servers */
  stopAll(): Promise<void>;

  /** Get server by port number */
  getServer(port: number): TestServerContext | undefined;
}

/**
 * Creates a test server manager for multi-server tests
 *
 * @returns TestServerManager - Manager instance
 *
 * Contract:
 * - MUST track all created servers
 * - MUST allow parallel server creation
 * - MUST ensure unique ports for each server
 * - MUST cleanup all servers on stopAll()
 */
export declare function createTestServerManager(): TestServerManager;

// ============================================================================
// Test Execution Metrics
// ============================================================================

export interface TestExecutionMetrics {
  /** Test start timestamp */
  startTime: number;

  /** Test end timestamp */
  endTime: number;

  /** Array of individual request durations (ms) */
  responseTimes: number[];

  /** Number of successful operations */
  successCount: number;

  /** Number of failed operations */
  errorCount: number;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;
}

export interface CalculatedMetrics extends TestExecutionMetrics {
  /** Total test duration (ms) */
  duration: number;

  /** Average response time (ms) */
  avgResponseTime: number;

  /** 95th percentile response time (ms) */
  p95ResponseTime: number;

  /** 99th percentile response time (ms) */
  p99ResponseTime: number;

  /** Throughput (requests/second) */
  throughput: number;

  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Calculates derived metrics from raw test metrics
 *
 * @param metrics - Raw test execution metrics
 * @returns CalculatedMetrics - Metrics with calculated properties
 *
 * Contract:
 * - MUST sort responseTimes for percentile calculations
 * - MUST return 0 for metrics if no data available
 * - MUST handle edge cases (empty arrays, division by zero)
 * - throughput MUST be in requests/second
 * - errorRate MUST be between 0 and 1
 */
export declare function calculateMetrics(
  metrics: TestExecutionMetrics
): CalculatedMetrics;

// ============================================================================
// Rate Limiter Test Utilities
// ============================================================================

export interface RateLimiterTestContext {
  /** Time window in milliseconds */
  windowSize: number;

  /** Maximum requests allowed in window */
  limit: number;

  /** Array of request timestamps (sliding window) */
  requestTimestamps: number[];

  /** Current simulated or real time */
  currentTime: number;
}

/**
 * Calculates effective rate in requests per minute
 *
 * @param allowedRequests - Number of requests allowed through
 * @param durationMs - Actual elapsed time in milliseconds
 * @returns number - Effective rate (requests/minute)
 *
 * Contract:
 * - MUST calculate: (allowedRequests / durationMs) * 60000
 * - MUST handle edge case where durationMs is 0
 * - MUST return finite number (no Infinity)
 */
export declare function calculateEffectiveRate(
  allowedRequests: number,
  durationMs: number
): number;

/**
 * Validates rate limiter behavior against expected limits
 *
 * @param context - Rate limiter test context
 * @param tolerance - Acceptable deviation (default: 0.1 for ±10%)
 * @returns boolean - True if within tolerance
 *
 * Contract:
 * - MUST prune old timestamps before validation
 * - MUST account for sliding window behavior
 * - MUST allow tolerance for timing variability
 */
export declare function validateRateLimit(
  context: RateLimiterTestContext,
  tolerance?: number
): boolean;

// ============================================================================
// Stdio Output Utilities
// ============================================================================

export interface StdioOutput {
  /** Array of stdout lines */
  stdout: string[];

  /** Array of stderr lines */
  stderr: string[];

  /** Process exit code (null if running) */
  exitCode: number | null;

  /** Flag for emoji presence */
  hasEmoji: boolean;
}

export interface StdioMatchOptions {
  /** Case-insensitive matching */
  caseInsensitive?: boolean;

  /** Allow partial matches */
  partial?: boolean;

  /** Strip ANSI color codes before matching */
  stripAnsi?: boolean;

  /** Ignore emoji differences */
  ignoreEmoji?: boolean;
}

/**
 * Performs semantic matching on stdio output
 *
 * @param output - Captured stdio output
 * @param expected - Expected string or regex pattern
 * @param options - Matching options
 * @returns boolean - True if match found
 *
 * Contract:
 * - MUST search both stdout and stderr if not specified
 * - MUST normalize output based on options before matching
 * - MUST handle both string and regex patterns
 * - ignoreEmoji MUST strip all emoji before comparison
 */
export declare function matchStdioOutput(
  output: StdioOutput,
  expected: string | RegExp,
  options?: StdioMatchOptions
): boolean;

/**
 * Normalizes stdio output for robust comparisons
 *
 * @param text - Raw stdio text
 * @param options - Normalization options
 * @returns string - Normalized text
 *
 * Contract:
 * - stripAnsi MUST remove all ANSI escape sequences
 * - ignoreEmoji MUST remove all Unicode emoji characters
 * - caseInsensitive MUST convert to lowercase
 * - MUST preserve word boundaries and spacing
 */
export declare function normalizeStdioOutput(
  text: string,
  options?: StdioMatchOptions
): string;

// ============================================================================
// Test Cleanup Utilities
// ============================================================================

export interface TestCleanupContext {
  /** Array of server instances to cleanup */
  servers: any[];

  /** Array of Jest mock functions to reset */
  mocks: jest.Mock[];

  /** Array of timer IDs to clear */
  timers: number[];

  /** Array of file handles to close */
  fileHandles: any[];

  /** Register a resource for cleanup */
  register(type: 'server' | 'mock' | 'timer' | 'file', resource: any): void;

  /** Execute all cleanup operations */
  cleanup(): Promise<void>;

  /** Reset cleanup context */
  reset(): void;
}

/**
 * Creates a test cleanup context for resource management
 *
 * @returns TestCleanupContext - Cleanup context instance
 *
 * Contract:
 * - MUST track all registered resources
 * - cleanup() MUST stop all servers
 * - cleanup() MUST clear all mocks via jest.clearAllMocks()
 * - cleanup() MUST clear all timers via clearTimeout/clearInterval
 * - cleanup() MUST close all file handles
 * - cleanup() MUST handle errors gracefully (log but don't throw)
 * - reset() MUST clear all tracked resources
 */
export declare function createCleanupContext(): TestCleanupContext;

// ============================================================================
// Test Timeout Utilities
// ============================================================================

export type TestCategory = 'unit' | 'integration' | 'e2e' | 'performance';

export const TEST_TIMEOUTS: Record<TestCategory, number> = {
  unit: 5000,         // 5 seconds
  integration: 30000, // 30 seconds
  e2e: 60000,         // 60 seconds
  performance: 120000 // 120 seconds
};

/**
 * Sets Jest timeout for a test category
 *
 * @param category - Test category
 *
 * Contract:
 * - MUST call jest.setTimeout() with category-specific timeout
 * - MUST be called in beforeEach() or beforeAll()
 */
export declare function setTestTimeout(category: TestCategory): void;

/**
 * Resets Jest timeout to default
 *
 * Contract:
 * - MUST reset to default timeout (30000ms)
 * - SHOULD be called in afterEach() or afterAll()
 */
export declare function resetTestTimeout(): void;

// ============================================================================
// Contract Tests (To Be Implemented)
// ============================================================================

/**
 * These contract tests MUST be implemented and MUST fail initially:
 *
 * 1. test-server.contract.test.ts
 *    - createTestServer returns unique ports
 *    - waitForReady resolves when server ready
 *    - waitForReady rejects on timeout
 *    - TestServerManager tracks multiple servers
 *    - TestServerManager.stopAll() cleans up all servers
 *
 * 2. metrics.contract.test.ts
 *    - calculateMetrics handles empty responseTimes
 *    - calculateMetrics sorts for percentile calculations
 *    - calculateMetrics calculates throughput correctly
 *    - calculateMetrics handles division by zero
 *
 * 3. rate-limiter.contract.test.ts
 *    - calculateEffectiveRate uses correct formula
 *    - calculateEffectiveRate handles zero duration
 *    - validateRateLimit prunes old timestamps
 *    - validateRateLimit allows tolerance
 *
 * 4. stdio.contract.test.ts
 *    - matchStdioOutput handles regex patterns
 *    - matchStdioOutput case-insensitive matching
 *    - normalizeStdioOutput strips ANSI codes
 *    - normalizeStdioOutput removes emoji
 *
 * 5. cleanup.contract.test.ts
 *    - createCleanupContext tracks resources
 *    - cleanup() stops all servers
 *    - cleanup() clears all mocks
 *    - cleanup() handles errors gracefully
 */
