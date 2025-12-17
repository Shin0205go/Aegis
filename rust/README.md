# 🛡️ Aegis MCP Server (Rust Edition)

**Version 2.0 - AI-Native Data Space Connector**

Lightweight Rust implementation of the Aegis MCP server for edge devices and embedded systems.

## 🎯 Features

- **Lightweight**: Single binary, no JVM required
- **Fast**: Rust performance for edge deployment
- **MCP Protocol**: Full Model Context Protocol support
- **Natural Language Policies**: AI-powered policy checking
- **Edge-Ready**: Designed for vehicle and IoT deployment

## 🚀 Quick Start

### Prerequisites

- Rust 1.70+ (installed)
- Claude Desktop

### Build

```bash
cargo build --release
```

### Test Locally

```bash
# Build the project
cargo build

# Run the server (it will listen on stdin/stdout)
cargo run
```

You can send JSON-RPC messages via stdin to test:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | cargo run
```

### Connect to Claude Desktop

1. **Build the release version:**
   ```bash
   cargo build --release
   ```

2. **Copy the configuration:**
   ```bash
   # The binary will be at: target/release/aegis-mcp
   # Update the path in aegis-mcp-config.json if needed
   ```

3. **Configure Claude Desktop:**

   Edit your Claude Desktop config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   Add this configuration:
   ```json
   {
     "mcpServers": {
       "aegis-rust": {
         "command": "/full/path/to/Aegis/rust/target/release/aegis-mcp",
         "env": {
           "RUST_LOG": "aegis_mcp=info"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**

5. **Test the tools:**
   - Ask Claude: "Use the hello_world tool to greet me"
   - Ask Claude: "Check this policy: 'Only allow read access during business hours' for resource 'customer-data'"

## 🛠️ Available Tools

### 1. `hello_world`
Simple greeting tool to verify the connection.

**Parameters:**
- `name` (string): Name to greet

**Example:**
```json
{
  "name": "hello_world",
  "arguments": {
    "name": "Alice"
  }
}
```

### 2. `check_policy`
Mock implementation of natural language policy checking.

**Parameters:**
- `policy` (string): Natural language policy description
- `resource` (string): Resource to check against

**Example:**
```json
{
  "name": "check_policy",
  "arguments": {
    "policy": "Only allow read access during business hours",
    "resource": "customer-data"
  }
}
```

## 📊 Architecture

```
┌─────────────────────────────────────┐
│     Claude Desktop (AI Agent)       │
└─────────────┬───────────────────────┘
              │ MCP Protocol
              │ (stdio/JSON-RPC)
              ▼
┌─────────────────────────────────────┐
│   Aegis MCP Server (Rust Binary)   │
│  ┌─────────────────────────────┐   │
│  │  MCP Request Handler        │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  Policy Checker (Mock)      │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  Tool Implementations       │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## 🔧 Development

### Project Structure

```
rust/
├── Cargo.toml              # Dependencies
├── src/
│   └── main.rs             # MCP Server implementation
├── aegis-mcp-config.json   # Claude Desktop config example
└── README.md               # This file
```

### Dependencies

- **tokio**: Async runtime
- **serde**: Serialization framework
- **serde_json**: JSON support
- **anyhow**: Error handling
- **tracing**: Logging framework
- **rusqlite**: SQLite support (for future features)

### Logging

The server uses `tracing` for logging. Set the `RUST_LOG` environment variable:

```bash
# Debug level (verbose)
RUST_LOG=aegis_mcp=debug cargo run

# Info level (default)
RUST_LOG=aegis_mcp=info cargo run

# Warning level (quiet)
RUST_LOG=aegis_mcp=warn cargo run
```

Logs are written to stderr to avoid interfering with the MCP protocol on stdout.

## 📋 Roadmap

### ✅ Phase 1: MVP (Current)
- [x] Basic MCP protocol implementation
- [x] Hello World tool
- [x] Mock policy checking
- [x] Claude Desktop integration

### 🔄 Phase 2: Protocol Awareness
- [ ] ODRL/JSON-LD generation
- [ ] Natural language → ODRL translation
- [ ] SQLite data filtering

### 🚀 Phase 3: Connectivity
- [ ] HTTP server mode
- [ ] DSP (Dataspace Protocol) client
- [ ] P2P communication with other connectors
- [ ] CAN Bus integration (vehicle data)

## 🤝 Contributing

This is part of the larger Aegis project. See the main project documentation at `/docs/architecture/design_v2.md`.

## 📄 License

See LICENSE file in the project root.

## 🔗 Related

- Main Project: [Aegis TypeScript Implementation](../)
- Architecture: [Design v2.0](../docs/architecture/design_v2.md)
- MCP Protocol: https://modelcontextprotocol.io/
