#!/bin/bash

# ログ出力
echo "AEGIS wrapper starting..." >&2
echo "Waiting for system initialization..." >&2

# 少し待機（上流サーバーの準備時間を確保）
sleep 3

echo "Starting AEGIS MCP server..." >&2

# AEGISを起動
exec /Users/shingo/.nvm/versions/node/v20.12.2/bin/node /Users/shingo/Develop/aegis-policy-engine/dist/src/mcp-server.js "$@"