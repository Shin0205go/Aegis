# AEGIS MCP Proxy SSE Testing Guide

## Problem Summary

The 406 (Not Acceptable) error occurs because the StreamableHTTPServerTransport requires specific `Accept` headers:

- **GET requests (SSE)**: Must include `Accept: text/event-stream`
- **POST requests (JSON-RPC)**: Must include `Accept: application/json, text/event-stream`

## Starting the Server

First, start the AEGIS MCP Proxy with HTTP transport:

```bash
# Option 1: Using npm scripts
cd /Users/shingo/Develop/aegis-policy-engine
npm run build
npm run start:mcp:http

# Option 2: Using the startup script
./a2a/start-http-server.sh

# Option 3: Direct command
node dist/src/mcp-server.js --transport http --port 8080
```

## Testing Methods

### 1. Basic SSE Test with curl

```bash
# Test SSE connection (stateless mode)
curl -N \
  -H "Accept: text/event-stream" \
  -H "Cache-Control: no-cache" \
  http://localhost:8080/mcp/messages
```

### 2. Complete MCP Flow Test

```bash
# Step 1: Initialize session
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Agent-ID: test-agent" \
  http://localhost:8080/mcp/messages \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "roots": {
          "listChanged": true
        }
      },
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'

# Note the mcp-session-id from response headers
# Then use it for SSE connection:

curl -N \
  -H "Accept: text/event-stream" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  http://localhost:8080/mcp/messages
```

### 3. Using the Test Scripts

```bash
# Simple SSE test
./a2a/test-sse.sh

# Complete flow test
./a2a/test-mcp-flow.sh

# Python test with sseclient
pip install requests sseclient-py
python ./a2a/test-mcp-sse.py

# Node.js test with EventSource
npm install eventsource
node ./a2a/test-sse-client.js
```

### 4. Testing with httpie (if installed)

```bash
# Initialize session
http POST localhost:8080/mcp/messages \
  Content-Type:application/json \
  Accept:"application/json, text/event-stream" \
  X-Agent-ID:test-agent \
  jsonrpc=2.0 \
  method=initialize \
  id=1 \
  params:='{
    "protocolVersion": "2024-11-05",
    "capabilities": {"roots": {"listChanged": true}},
    "clientInfo": {"name": "test-client", "version": "1.0.0"}
  }'

# SSE connection
http --stream GET localhost:8080/mcp/messages \
  Accept:text/event-stream \
  mcp-session-id:YOUR_SESSION_ID
```

## Expected Responses

### Successful SSE Connection
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
mcp-session-id: xxxxx-xxxx-xxxx-xxxx

event: message
id: 1
data: {"jsonrpc":"2.0","method":"notifications/resourceListChanged","params":{}}

event: message
id: 2
data: {"jsonrpc":"2.0","method":"notifications/toolListChanged","params":{}}
```

### Error Cases

1. **Missing Accept header**:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Acceptable: Client must accept text/event-stream"
  },
  "id": null
}
```

2. **Invalid session ID** (in stateful mode):
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Found: Invalid session ID"
  },
  "id": null
}
```

## Troubleshooting

1. **Server not running**: Make sure the server is started with `--transport http`
2. **Port already in use**: Check if port 8080 is available or use a different port
3. **API key missing**: Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable
4. **Session required**: The server is in stateful mode by default, requiring session initialization

## Advanced Testing

### Test with policy enforcement

```bash
# Test a tool call that should be denied
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Agent-ID: untrusted-agent" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  http://localhost:8080/mcp/messages \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "delete_file",
      "arguments": {
        "path": "/etc/passwd"
      }
    },
    "id": 2
  }'
```

### Monitor real-time notifications

The SSE connection will receive real-time notifications when:
- Resources are added/removed
- Tools are added/removed
- Policy decisions are made
- Audit events occur

## Server Configuration

The HTTP transport can be configured with:

```bash
# Environment variables
export MCP_PROXY_PORT=8080
export LOG_LEVEL=debug
export UPSTREAM_SERVERS_HTTP="gmail:http://localhost:8081,drive:http://localhost:8082"

# Or command line
node dist/src/mcp-server.js --transport http --port 9000 --debug
```