#!/bin/bash

# AEGIS起動スクリプト（ダッシュボード付き）

# 環境変数を読み込む
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# ANTHROPIC_API_KEYが設定されているか確認
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ Error: ANTHROPIC_API_KEY is not set"
    echo "Please set the environment variable:"
    echo "  export ANTHROPIC_API_KEY=your-api-key"
    exit 1
fi

echo "✅ Starting AEGIS with Anthropic API and Dashboard..."
echo "Provider: $LLM_PROVIDER"
echo "Model: $LLM_MODEL"

# APIサーバー（ダッシュボード）をバックグラウンドで起動
echo "🌐 Starting API server (Dashboard) on http://localhost:3000"
node dist/src/api/server.js &
API_PID=$!
echo "API server PID: $API_PID"

# 少し待機してAPIサーバーが起動するのを待つ
sleep 2

# MCPサーバーを起動（stdio経由でClaude Desktopと通信）
echo "🚀 Starting MCP server..."
node dist/src/mcp-server.js

# スクリプト終了時にAPIサーバーも停止
trap "kill $API_PID 2>/dev/null" EXIT