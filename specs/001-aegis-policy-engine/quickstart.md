# Quickstart Guide: AEGIS Policy Engine

**Date**: 2026-02-13
**Goal**: Get AEGIS Policy Engine running with basic policy enforcement in under 10 minutes

## Prerequisites

- **Node.js**: v18+ installed
- **API Key**: Anthropic API key for Claude Opus 4 (or OpenAI API key)
- **Git**: To clone the repository
- **Claude Desktop** (optional): For MCP integration testing

---

## Setup Steps

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/Shin0205go/aegis-policy-engine.git
cd aegis-policy-engine

# Install dependencies
npm install

# Build TypeScript
npm run build
```

**Expected Output**:
```
✓ Dependencies installed successfully
✓ TypeScript compiled without errors
```

---

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

**Required Environment Variables**:
```bash
# AI Provider Configuration
ANTHROPIC_API_KEY=sk-ant-...              # Your Anthropic API key
LLM_PROVIDER=anthropic                     # or "openai"
LLM_MODEL=claude-opus-4-20250514          # Recommended model

# Optional Configuration
AEGIS_AI_THRESHOLD=0.7                    # Confidence threshold (0-1)
AEGIS_LOG_LEVEL=info                      # debug|info|warn|error
MCP_TRANSPORT=http                        # stdio|http
MCP_PROXY_PORT=3000                       # HTTP mode port
```

**Save and exit** the editor.

---

### 3. Create Your First Policy

Create a sample policy to test the system:

```bash
# Create policy using the CLI
node dist/src/cli/policy-cli.js create \
  --name "safe-file-access" \
  --description "Allow safe file read operations only" \
  --policy "Only allow reading files from /tmp directory. Deny all write, delete, or execute operations. Log all file access attempts."
```

**Expected Output**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "safe-file-access",
  "status": "active",
  "version": "1.0.0"
}
```

**Verify Policy Created**:
```bash
# List all policies
node dist/src/cli/policy-cli.js list

# Get specific policy
node dist/src/cli/policy-cli.js get --id 550e8400-e29b-41d4-a716-446655440000
```

---

### 4. Start the MCP Proxy Server

#### Option A: HTTP Mode (for testing)

```bash
# Start HTTP proxy on port 3000
node dist/src/mcp-server.js
```

**Expected Output**:
```
[AI Judgment] Initializing with provider: anthropic
[AI Judgment] Using Anthropic Claude API for real AI judgment
🚀 AEGIS MCP Proxy starting...
✅ 12 tools aggregated from upstream servers
🌐 HTTP server running on http://localhost:3000
📋 Health check: http://localhost:3000/health
```

#### Option B: stdio Mode (for Claude Desktop)

```bash
# Start stdio proxy
node scripts/mcp-launcher.js stdio
```

**Expected Output**:
```
[AI Judgment] Initializing with provider: anthropic
🚀 AEGIS MCP Proxy starting in stdio mode...
✅ Ready for MCP communication via stdio
```

---

### 5. Test Policy Enforcement

Open a new terminal while the server is running.

#### Test 1: Allowed File Read (PERMIT)

```bash
# Send MCP request to read allowed file
curl -X POST http://localhost:3000/mcp/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "filesystem__read_file",
      "arguments": {
        "path": "/tmp/test.txt"
      }
    }
  }'
```

**Expected Response**:
```json
{
  "decision": "PERMIT",
  "reason": "File read from /tmp directory is allowed by policy",
  "confidence": 0.95,
  "result": {
    "content": "file contents here..."
  }
}
```

#### Test 2: Denied File Write (DENY)

```bash
# Attempt to write file (should be denied)
curl -X POST http://localhost:3000/mcp/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "filesystem__write_file",
      "arguments": {
        "path": "/tmp/test.txt",
        "content": "new content"
      }
    }
  }'
```

**Expected Response**:
```json
{
  "decision": "DENY",
  "reason": "Write operations are explicitly denied by policy",
  "confidence": 0.98,
  "error": "Policy violation: Access denied"
}
```

#### Test 3: Outside Policy Scope (DENY)

```bash
# Attempt to read file outside /tmp
curl -X POST http://localhost:3000/mcp/messages \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "filesystem__read_file",
      "arguments": {
        "path": "/etc/passwd"
      }
    }
  }'
```

**Expected Response**:
```json
{
  "decision": "DENY",
  "reason": "File access outside /tmp directory is not permitted",
  "confidence": 0.92,
  "error": "Policy violation: Access denied"
}
```

---

### 6. Verify Audit Logs

Check that all access attempts were logged:

```bash
# View audit logs (location depends on configuration)
cat logs/audit-*.log | jq '.'

# Or use the CLI
node dist/src/cli/audit-cli.js list --limit 10
```

**Expected Output**:
```json
[
  {
    "timestamp": "2026-02-13T10:30:00.000Z",
    "agent": "test-client",
    "action": "tools/call",
    "resource": "filesystem__read_file",
    "decision": "PERMIT",
    "policyApplied": "safe-file-access"
  },
  {
    "timestamp": "2026-02-13T10:31:00.000Z",
    "agent": "test-client",
    "action": "tools/call",
    "resource": "filesystem__write_file",
    "decision": "DENY",
    "policyApplied": "safe-file-access"
  }
]
```

---

### 7. Claude Desktop Integration (Optional)

If you have Claude Desktop installed, configure it to use AEGIS as an MCP proxy:

**1. Update Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": [
        "/path/to/aegis-policy-engine/dist/src/mcp-server.js"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

**2. Restart Claude Desktop**

**3. Test in Claude Desktop**:
```
Can you read the file /tmp/test.txt?
```

Claude will use AEGIS proxy, which will enforce your policy before accessing the file.

---

## Common Issues

### Issue 1: "EADDRINUSE" Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
MCP_PROXY_PORT=3001 node dist/src/mcp-server.js
```

### Issue 2: "Missing API Key"

```bash
# Verify .env file exists and has API key
cat .env | grep ANTHROPIC_API_KEY

# Export directly if needed
export ANTHROPIC_API_KEY=sk-ant-...
node dist/src/mcp-server.js
```

### Issue 3: "Connection closed" in Tests

```bash
# Ensure server is fully started before testing
# Wait for "✅ Ready" message
# Then run tests in separate terminal
```

### Issue 4: Policy Not Found

```bash
# List all policies to verify ID
node dist/src/cli/policy-cli.js list

# Check policy store
ls -la policies-store/
```

---

## Next Steps

### Explore Advanced Features

1. **Add Constraints**:
   ```bash
   # Create policy with data anonymization
   node dist/src/cli/policy-cli.js create \
     --name "customer-data-policy" \
     --policy "Allow access to customer data but anonymize email addresses and phone numbers"
   ```

2. **Configure Rate Limiting**:
   ```bash
   # Policy with rate limiting
   node dist/src/cli/policy-cli.js create \
     --name "api-rate-limit" \
     --policy "Allow API calls but limit to 100 requests per minute per agent"
   ```

3. **Set Up After-Hours Policy**:
   ```bash
   # Time-based restrictions
   node dist/src/cli/policy-cli.js create \
     --name "after-hours-policy" \
     --policy "Outside business hours (18:00-08:00), only allow read operations and require manual approval for any modifications"
   ```

### Run the Test Suite

```bash
# Run all tests
npm test

# Run specific test category
npm test -- test/ai/
npm test -- test/mcp/
npm test -- test/e2e/

# Run with coverage
npm run test:coverage
```

### Monitor Performance

```bash
# View metrics
curl http://localhost:3000/api/audit/metrics | jq '.'

# Expected output:
{
  "totalDecisions": 150,
  "permitRate": 0.67,
  "denyRate": 0.33,
  "averageLatency": 45.2,
  "cacheHitRate": 0.80
}
```

---

## Success Criteria

✅ **You have successfully set up AEGIS if**:
1. Server starts without errors
2. At least one policy is active
3. File read from /tmp is PERMITTED
4. File write is DENIED
5. File read outside /tmp is DENIED
6. All attempts are logged in audit trail

🎉 **Congratulations!** You now have a working AI-powered policy enforcement system for your MCP tools.

---

## Learn More

- **Architecture**: See `CLAUDE.md` for detailed architecture
- **API Reference**: See `docs/api-reference.md`
- **Policy Writing Guide**: See `docs/policy-writing-guide.md`
- **Troubleshooting**: See `docs/troubleshooting.md`

---

**Quickstart Status**: COMPLETE
**Estimated Time**: 10-15 minutes
**Difficulty**: Beginner
