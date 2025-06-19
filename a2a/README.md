# Agent-to-Agent (A2A) Integration with AEGIS

This directory contains a demonstration of Google's Agent-to-Agent (A2A) Protocol integrated with AEGIS policy control.

## 🔄 MCP統合アーキテクチャ

A2AエージェントはMCPクライアントとして動作し、AEGIS MCPプロキシ経由でツールにアクセスします：

```
A2Aエージェント → AEGIS MCPプロキシ → MCPツール
                    ↓
                ポリシー制御
```

## 🎯 Overview

The A2A protocol enables horizontal communication between AI agents, allowing them to delegate tasks, share capabilities, and collaborate. This implementation shows how AEGIS can provide policy control for agent interactions, implementing the "show all tools but control execution" pattern discussed earlier.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Demo Client                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ A2A Requests
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Coordinator Agent (Port 8000)                   │
│  - Orchestrates multi-agent workflows                        │
│  - Monitors agent health                                     │
│  - Applies AEGIS delegation policies                         │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────────┐    ┌────────────────────────────┐
│  Research Agent (8001)   │    │   Writing Agent (8002)     │
│  - Gathers information   │    │   - Creates content        │
│  - Fact checking         │    │   - Can delegate research  │
│  - Summarization         │    │   - Translation            │
└──────────────────────────┘    └────────────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
         ┌────────────────────────────────────┐
         │     AEGIS Policy Enforcer          │
         │  - Permission checks               │
         │  - Constraint application          │
         │  - Obligation execution            │
         │  - Audit logging                   │
         └────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd a2a
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Run the Demo

**MCP統合デモ（実際のAEGIS使用）:**
```bash
# 先にAEGISを起動（HTTPトランスポート）
cd .. && npm run start:mcp:http

# 別ターミナルでMCPデモを実行
cd a2a && npm run demo:mcp
```

MCP統合デモでは：
- A2AエージェントがMCPツールを使用
- AEGIS MCPプロキシ経由でポリシー制御
- 実際のファイルアクセスやツール実行

## 📁 Project Structure

```
a2a/
├── src/
│   ├── types/
│   │   └── a2a-protocol.ts         # A2A protocol type definitions
│   ├── core/
│   │   └── a2a-agent.ts            # Base A2A agent implementation
│   ├── agents/
│   │   ├── mcp-enabled-agent.ts   # MCP-enabled base agent
│   │   ├── mcp-research-agent.ts  # MCP research agent
│   │   ├── mcp-writing-agent.ts   # MCP writing agent
│   │   └── coordinator-agent.ts   # Orchestration agent
│   └── examples/
│       ├── coordinator.ts          # Coordinator startup
│       └── mcp-demo-scenario.ts   # MCP integration demo
├── docs/
│   ├── architecture.md            # Correct architecture design
│   ├── a2a-integration.md        # Technical documentation
│   └── mcp-integration-summary.md # Integration summary
├── package.json
├── tsconfig.json
└── README.md
```

## 🎭 Demo Scenarios

### Scenario 1: Direct Research Request
- Client sends research request directly to Research Agent
- AEGIS evaluates permission to accept task
- Research Agent processes and returns results

### Scenario 2: Direct Writing Request  
- Client sends writing request to Writing Agent
- Policy check for content creation
- Results show applied constraints

### Scenario 3: Coordinated Workflow
- Client requests research + writing through Coordinator
- Coordinator checks delegation policies
- Orchestrates multi-step workflow
- Shows delegation chain in action

### Scenario 4: Policy Denial
- Demonstrates policy rejection for unauthorized requests
- Shows "urgent" task denial for untrusted agents
- Illustrates security controls

### Scenario 5: Deep Delegation
- Tests delegation chain depth limits
- Shows policy control across multiple hops
- Demonstrates trust propagation

## 🔧 Key Features

### 1. **Transparent Policy Control**
```typescript
// Agents see all available capabilities
const agentCard = await getAgentCard();
console.log(agentCard.capabilities); // Shows all capabilities

// But execution is controlled by policy
const result = await sendTask(params); // May be denied by AEGIS
```

### 2. **Dynamic Permissions**
- Permissions evaluated at runtime based on:
  - Agent trust scores
  - Delegation chain depth
  - Time of day
  - Task priority
  - Historical behavior

### 3. **Constraint Application**
- Rate limiting
- Data anonymization
- Enhanced audit logging
- Time-based restrictions

### 4. **Obligation Execution**
- Admin notifications
- Detailed logging
- Scheduled data deletion
- Compliance reporting

## 🛠️ Running Individual Agents

Coordinator agent for testing:

```bash
npm run start:coordinator
```

Note: MCP-enabled agents are started automatically by the demo scenario.

## 📡 API Endpoints

Each agent exposes:
- `POST /rpc` - JSON-RPC 2.0 endpoint
- `GET /tasks/subscribe` - SSE for task updates
- `GET /health` - Health check
- `GET /agent/card` - Agent capabilities

## 🔍 Testing Policy Integration

### Test Research Agent with MCP Tools
```bash
curl -X POST http://localhost:8101/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/send",
    "params": {
      "prompt": "Research AEGIS policy system from documentation files",
      "policyContext": {
        "requesterAgent": "test-client",
        "permissions": ["read", "mcp-tools"]
      }
    },
    "id": 1
  }'
```

### Test Writing Agent with File Creation
```bash
curl -X POST http://localhost:8102/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/send",
    "params": {
      "prompt": "Write an article about AEGIS MCP integration",
      "policyContext": {
        "requesterAgent": "test-client",
        "permissions": ["write", "mcp-tools"]
      }
    },
    "id": 2
  }'
```

### Test Coordinator Agent for Multi-Agent Workflow
```bash
curl -X POST http://localhost:8100/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/send",
    "params": {
      "prompt": "Research and write about A2A protocols",
      "policyContext": {
        "requesterAgent": "trusted-client",
        "delegationChain": []
      }
    },
    "id": 3
  }'
```

## 🔐 Policy Configuration

The demo uses simulated policies including:

1. **Delegation Depth Limit**: Max 3 levels
2. **Priority-Based Access**: Urgent tasks require special permission
3. **Time-Based Restrictions**: Enhanced monitoring outside business hours
4. **Trust Score Evaluation**: Low trust agents are denied

In production, these would connect to the actual AEGIS policy engine.

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm test

# Integration test with real AEGIS
npm run test:real-aegis

# Simple policy test
npm run test:simple
```

### Testing Individual Components
```bash
# Test MCP client directly
npx tsx src/examples/test-mcp-client-direct.ts

# Test SSE streaming
npx tsx src/examples/test-sse-session-flow.ts

# Test tools listing
npx tsx src/examples/test-tools-list.ts
```

## 🚧 Future Enhancements

- [x] Real AEGIS policy engine integration (completed)
- [x] MCP tool integration via AEGIS proxy (completed)
- [ ] WebSocket support for real-time updates
- [ ] Agent discovery protocol
- [ ] Capability negotiation
- [ ] Result caching and sharing
- [ ] Multi-language agent support
- [ ] Performance metrics dashboard

## 📚 Learn More

- [A2A Protocol Specification](https://github.com/Google/a2a-protocol)
- [AEGIS Documentation](../docs/)
- [MCP vs A2A Comparison](../docs/introduction.md#mcp-vs-a2a)

## 🤝 Contributing

See the main [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details.