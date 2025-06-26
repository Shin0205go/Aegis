#!/bin/bash

# AEGIS HTTP Mode Test Script

echo "🧪 Testing AEGIS Policy Engine in HTTP mode..."

# Set session ID
SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "📍 Session ID: $SESSION_ID"

# Base URL
BASE_URL="http://localhost:3000/mcp/messages"
HEADERS=(
  -H "Content-Type: application/json"
  -H "Accept: application/json, text/event-stream"
  -H "mcp-session-id: $SESSION_ID"
)

echo ""
echo "1️⃣ Initializing session..."
curl -s -X POST "$BASE_URL" "${HEADERS[@]}" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"1.0","capabilities":{"tools":{}},"clientInfo":{"name":"Test Client","version":"1.0"}},"id":0}' \
  | grep "data:" | sed 's/data: //' | jq '.'

echo ""
echo "2️⃣ Listing available tools..."
RESPONSE=$(curl -s -X POST "$BASE_URL" "${HEADERS[@]}" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' \
  | grep "data:" | sed 's/data: //')

if [ -n "$RESPONSE" ]; then
  echo "$RESPONSE" | jq -r '.result.tools[:5] | .[] | "  - " + .name + ": " + .description'
else
  echo "  ⚠️  No tools found or error in response"
fi

echo ""
echo "3️⃣ Testing policy enforcement..."
echo "  Attempting to read a sensitive file..."
curl -s -X POST "$BASE_URL" "${HEADERS[@]}" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"filesystem__read_file","arguments":{"path":"/customer/personal-data.csv"}},"id":2}' \
  | grep "data:" | sed 's/data: //' | jq '.'

echo ""
echo "✅ Test complete!"