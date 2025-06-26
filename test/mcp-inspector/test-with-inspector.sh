#!/bin/bash

# AEGIS Policy Engine - MCP Inspector テストスクリプト

echo "🚀 AEGIS Policy Engine MCP Inspector テストを開始します..."

# 環境変数チェック
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  警告: ANTHROPIC_API_KEY が設定されていません"
    echo "実際のAI判定を使用する場合は、環境変数を設定してください："
    echo "export ANTHROPIC_API_KEY=your-api-key"
    echo ""
fi

# ビルドチェック
if [ ! -d "dist" ]; then
    echo "📦 ビルドを実行します..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ ビルドに失敗しました"
        exit 1
    fi
fi

# MCP Inspector がインストールされているかチェック
if ! command -v npx &> /dev/null; then
    echo "❌ npx が見つかりません。Node.js をインストールしてください。"
    exit 1
fi

echo "✅ 準備完了！MCP Inspector を起動します..."
echo ""
echo "📝 テスト方法："
echo "1. tools/list でツール一覧を確認"
echo "2. tools/call で各ツールをテスト"
echo "3. ポリシー制御が正しく動作することを確認"
echo ""
echo "🔍 デバッグモードで起動する場合："
echo "AEGIS_LOG_LEVEL=debug $0"
echo ""

# プロジェクトルートに移動
cd ../..

# MCP Inspector を起動
npx @modelcontextprotocol/inspector node dist/src/mcp-server.js