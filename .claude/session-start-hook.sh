#!/bin/bash

# ============================================================================
# AEGIS MCP Proxy - Claude Code Web版 SessionStart Hook
# ============================================================================

echo "🚀 AEGIS SessionStart Hook: Initializing..."

# Web環境かどうかを判定
if [ "$CLAUDE_CODE_REMOTE" = "true" ]; then
  echo "🌐 Web environment detected - Setting up AEGIS MCP Proxy"

  # 環境変数の設定（CLAUDE_ENV_FILEに記録してセッション全体で利用可能に）
  if [ -n "$CLAUDE_ENV_FILE" ]; then
    cat >> "$CLAUDE_ENV_FILE" << 'EOF'
# AEGIS MCP Proxy Configuration
export AEGIS_MCP_URL=http://localhost:8080
export MCP_TRANSPORT=http
export LLM_PROVIDER=anthropic
export LLM_MODEL=claude-opus-4-20250514
export AEGIS_LOG_LEVEL=info
export AEGIS_AI_THRESHOLD=0.7
export MCP_PROXY_PORT=8080
EOF
    echo "✅ Environment variables configured in $CLAUDE_ENV_FILE"
  else
    # フォールバック：直接エクスポート
    export AEGIS_MCP_URL=http://localhost:8080
    export MCP_TRANSPORT=http
    export LLM_PROVIDER=anthropic
    export LLM_MODEL=claude-opus-4-20250514
    export AEGIS_LOG_LEVEL=info
    export AEGIS_AI_THRESHOLD=0.7
    export MCP_PROXY_PORT=8080
    echo "✅ Environment variables exported directly"
  fi

  echo "📡 AEGIS MCP Proxy Configuration:"
  echo "   - URL: ${AEGIS_MCP_URL}/mcp/messages"
  echo "   - Model: ${LLM_MODEL}"
  echo "   - Log Level: ${AEGIS_LOG_LEVEL}"

  # MCP接続テスト（オプション）
  if command -v curl &> /dev/null; then
    echo ""
    echo "🔍 Testing AEGIS MCP connection..."
    HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "${AEGIS_MCP_URL}/health" 2>/dev/null || echo "000")

    if [ "$HEALTH_CHECK" = "200" ]; then
      echo "✅ AEGIS MCP Proxy is reachable and healthy"
    else
      echo "⚠️  AEGIS MCP Proxy not responding (HTTP $HEALTH_CHECK)"
      echo "   Make sure the proxy is running: npm run start:mcp"
    fi
  fi

else
  echo "🖥️  Local environment detected - Using local configuration"

  # ローカル環境用の設定
  export AEGIS_MCP_URL=http://localhost:8080
  export MCP_TRANSPORT=http
  export LLM_MODEL=claude-opus-4-20250514
  export AEGIS_LOG_LEVEL=debug

  echo "📍 Using local AEGIS MCP Proxy at: ${AEGIS_MCP_URL}"
fi

echo ""
echo "✨ AEGIS SessionStart Hook completed successfully"
echo ""
