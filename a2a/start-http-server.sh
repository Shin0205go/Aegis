#!/bin/bash

# Start AEGIS MCP Proxy Server with HTTP transport
echo "Starting AEGIS MCP Proxy Server (HTTP transport)..."
echo ""

cd /Users/shingo/Develop/aegis-policy-engine

# Build if needed
if [ ! -d "dist" ]; then
    echo "Building project..."
    npm run build
fi

# Start with HTTP transport
echo "Starting server on port 8080..."
node dist/src/mcp-server.js --transport http --port 8080