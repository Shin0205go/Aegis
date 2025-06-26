# Test Directory Structure

This directory contains all test-related files for the AEGIS Policy Engine.

## Directory Organization

```
test/
├── README.md           # This file
├── mcp-inspector/      # MCP Inspector integration tests
├── scripts/            # Test scripts and utilities
├── logs/               # Test execution logs (gitignored)
└── src/                # Unit and integration test source files
```

## Subdirectories

### `/mcp-inspector`
Contains MCP Inspector configuration and test scenarios for interactive testing.

### `/scripts`
Various test scripts for different components:
- `test-ai-timeout.js` - AI timeout testing
- `test-audit-features.js` - Audit system testing
- `test-policy-decisions.js` - Policy decision testing
- etc.

### `/logs`
Test execution logs. This directory is gitignored and created automatically when tests are run.

### `/src`
Source test files (*.test.ts) located in the main src/ directory following the convention of keeping tests close to the code they test.

## Running Tests

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:e2e
```

### MCP Inspector Tests
```bash
cd test/mcp-inspector
./test-with-inspector.sh
```

### Individual Test Scripts
```bash
node test/scripts/test-policy-decisions.js
```