# 🤖 Claude Code Integration Guide

## Using Claude Code as Aegis Policy Judgment Engine

This guide shows how to use **Claude Code as the AI judgment engine** for Aegis policy decisions, eliminating the need for external API keys.

---

## 🎯 Concept

```
User Request
    ↓
Aegis Proxy (TypeScript)
    ↓ "Need policy decision"
    ↓ Instead of calling Anthropic/OpenAI API
Claude Code's check_policy tool
    ↓ Claude Code analyzes policy
    ↓ Returns PERMIT/DENY decision
Aegis Proxy applies decision
    ↓
Upstream MCP Servers
```

**Benefits:**
- ✅ No API key required
- ✅ Full natural language policy support
- ✅ Claude Code's reasoning powers as judgment engine
- ✅ Cost-free operation

---

## 🚀 Quick Setup

### 1. Build Rust Aegis MCP Server

```bash
cd /home/user/Aegis/rust
cargo build --release
```

### 2. Configure Claude Code

The Rust Aegis server is already configured in your Claude Code config:

**File:** `/home/user/.config/claude/config.json`
```json
{
  "mcpServers": {
    "aegis-rust": {
      "command": "/home/user/Aegis/rust/target/debug/aegis-mcp",
      "env": {
        "RUST_LOG": "aegis_mcp=info"
      }
    }
  }
}
```

### 3. Restart Claude Code

Restart your Claude Code session to load the new MCP server.

---

## 📝 Using the check_policy Tool

### Tool Signature

```typescript
check_policy({
  policy: string,        // Natural language policy
  agent: string,         // Who is requesting access
  action: string,        // What they want to do
  resource: string,      // What they want to access
  context?: object       // Additional context
})
```

### Example Usage

**Scenario:** Check if delete operation is allowed

```
Please use the check_policy tool to evaluate this request:

Policy: "Only allow read access during business hours (9:00-18:00). Delete operations are prohibited."

Request:
- Agent: claude-code
- Action: delete
- Resource: /important/data.txt
- Context: { time: "2025-12-17T19:00:00Z", purpose: "cleanup" }
```

**Claude Code will:**
1. Call the `check_policy` tool
2. Receive a formatted policy evaluation request
3. Analyze the policy and context
4. Return a structured JSON decision

**Expected Response:**
```json
{
  "decision": "DENY",
  "reason": "Two violations: (1) Delete operations prohibited, (2) Outside business hours",
  "confidence": 0.95,
  "constraints": [],
  "obligations": ["log_violation"]
}
```

---

## 🎬 Demo Scenarios

### Scenario 1: File Access During Business Hours

```
Use check_policy to evaluate:

Policy: "Allow file read/write during business hours (9-18).
         System files (/etc, /sys) are always prohibited."

Request:
- Agent: "data-analyst"
- Action: "read"
- Resource: "/home/user/data/report.csv"
- Context: { "time": "2025-12-17T14:00:00Z", "purpose": "analysis" }
```

### Scenario 2: Sensitive Data Access

```
Use check_policy to evaluate:

Policy: "Customer PII can only be accessed by authorized personnel
         with valid business purpose. All access must be logged.
         External contractors are prohibited."

Request:
- Agent: "contractor-bob"
- Action: "read"
- Resource: "/db/customers/personal_info"
- Context: { "department": "external", "purpose": "audit" }
```

### Scenario 3: After-Hours Emergency Access

```
Use check_policy to evaluate:

Policy: "After hours access (18:00-08:00) requires emergency
         justification and manager approval.
         All after-hours access triggers alerts."

Request:
- Agent: "sre-alice"
- Action: "write"
- Resource: "/var/log/application.log"
- Context: {
    "time": "2025-12-17T22:30:00Z",
    "emergency": true,
    "approved_by": "manager@example.com",
    "incident_id": "INC-2025-001"
  }
```

---

## 🔧 Advanced: Integrating with TypeScript Aegis

For a fully automated system, you can modify TypeScript Aegis to call the Rust MCP tool:

### Architecture

```
TypeScript Aegis Proxy
  ↓
PolicyDecisionPoint
  ↓ Instead of HTTP API call
MCP Client → Rust Aegis check_policy tool
  ↓ Tool returns to Claude Code
Claude Code analyzes and responds
  ↓ Response parsed
Aegis applies decision
```

### Implementation Steps (Future)

1. Add MCP client to TypeScript Aegis
2. Create `MCPToolLLM` provider class
3. Configure to use `aegis-rust` server
4. Parse tool response into `PolicyDecision`

**Note:** This is planned for Phase 2. Current setup (manual tool usage) is fully functional.

---

## 💡 Best Practices

### 1. Policy Writing

Write policies in clear, natural language:

**Good:**
```
Allow read access during business hours (9-18).
Delete operations require manager approval.
System directories are always prohibited.
```

**Avoid:**
```
if (time > 9 && time < 18) { allow_read = true; }
```

### 2. Context Information

Provide relevant context:
```javascript
{
  "time": "2025-12-17T14:00:00Z",
  "user_department": "engineering",
  "data_classification": "confidential",
  "purpose": "debugging production issue",
  "incident_id": "INC-123"
}
```

### 3. Interpreting Decisions

Always check:
- `decision`: PERMIT/DENY/INDETERMINATE
- `reason`: Understand why
- `confidence`: How certain (0.0-1.0)
- `obligations`: What must be done (logging, notifications)

---

## 🧪 Testing Your Setup

### Test 1: Basic Connection

```
List available MCP tools
```

Expected: Should see `hello_world` and `check_policy` from `aegis-rust`

### Test 2: Simple Policy Check

```
Use hello_world tool to verify connection to aegis-rust server
```

Expected: Greeting message

### Test 3: Policy Evaluation

```
Use check_policy with a simple policy:
- Policy: "Deny all delete operations"
- Action: "delete"
- Resource: "test.txt"
```

Expected: Structured policy evaluation request

---

## 🐛 Troubleshooting

### Tool Not Available

**Problem:** `check_policy` tool not showing up

**Solution:**
1. Check MCP server is running: `ps aux | grep aegis-mcp`
2. Verify config path is correct
3. Restart Claude Code session
4. Check logs: `RUST_LOG=debug /home/user/Aegis/rust/target/debug/aegis-mcp`

### Invalid Response Format

**Problem:** Tool returns unexpected format

**Solution:**
1. Ensure using latest Rust build: `cd rust && cargo build`
2. Check tool input matches schema
3. Verify all required fields are provided

---

## 📊 Performance Notes

- **Cold start:** ~100ms (Rust binary startup)
- **Policy check:** ~1-2s (Claude Code reasoning time)
- **Memory:** ~10MB (Rust server footprint)

Compare to:
- External API: ~500ms-2s + API costs
- Java-based solutions: ~500MB+ memory

---

## 🎓 Learning Path

1. **Start Simple:** Use `check_policy` manually for single decisions
2. **Add Context:** Include time, user info, classification
3. **Complex Policies:** Multi-condition rules with constraints
4. **Automate:** Integrate with applications (Phase 2)
5. **Scale:** Deploy to edge devices (Rust advantage)

---

## 📚 Related Documentation

- [Aegis v2.0 Design](../architecture/design_v2.md)
- [Rust MCP Server README](../../rust/README.md)
- [Natural Language Policy Architecture](../../CLAUDE.md)

---

## 🎉 Next Steps

Now that you have Claude Code as your judgment engine:

1. **Try the demo scenarios** above
2. **Write your own policies** in natural language
3. **Test edge cases** (ambiguous requests)
4. **Share feedback** on what works/doesn't

You now have a **zero-cost, AI-powered policy engine** running locally! 🛡️
