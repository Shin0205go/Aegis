#!/bin/bash

# Test SSE connection to AEGIS proxy
echo "Testing SSE connection to AEGIS proxy..."
echo "Press Ctrl+C to stop"
echo ""

# Note: You need to first initialize a session via POST to get a session ID
# For testing, we'll try without session ID first (stateless mode)

curl -N \
  -H "Accept: text/event-stream" \
  -H "Cache-Control: no-cache" \
  http://localhost:8080/mcp/messages