#!/bin/bash

# AEGIS起動スクリプト

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

echo "✅ Starting AEGIS with Anthropic API..."
echo "Provider: $LLM_PROVIDER"
echo "Model: $LLM_MODEL"

# HTTPモードで起動
node dist/src/mcp-server.js --transport http