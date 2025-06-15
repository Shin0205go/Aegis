#!/bin/bash

echo "🛡️ AEGIS MCP Proxy 起動スクリプト"
echo ""

# 環境変数の読み込み
if [ -f .env ]; then
    source .env
    echo "✅ 環境変数を読み込みました"
fi

# ポリシー確認
echo "📋 利用可能なポリシー:"
curl -s http://localhost:3000/api/policies 2>/dev/null | jq -r '.data[] | "  - \(.name) (\(.status))"' || echo "  （Web UIサーバーが起動していません）"

echo ""
echo "🚀 MCPプロキシサーバーを起動しています..."

# tsxで直接実行（ビルドエラーを回避）
export NODE_OPTIONS="--experimental-specifier-resolution=node"
npx tsx src/mcp-server.ts