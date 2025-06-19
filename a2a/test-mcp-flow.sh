#!/bin/bash

# Complete MCP flow test with proper headers
echo "=== Testing MCP Streamable HTTP Flow ==="
echo ""

# Step 1: Initialize session
echo "1. Initializing MCP session..."
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Agent-ID: test-agent" \
  -H "X-Agent-Type: test" \
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
  }')

echo "Response: $RESPONSE"
echo ""

# Extract session ID from response headers (if in stateful mode)
# For now, let's proceed without session ID

# Step 2: Test SSE connection
echo "2. Establishing SSE connection (press Ctrl+C to stop)..."
echo ""

curl -N \
  -H "Accept: text/event-stream" \
  -H "Cache-Control: no-cache" \
  -H "X-Agent-ID: test-agent" \
  http://localhost:8080/mcp/messages