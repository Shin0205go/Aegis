#!/bin/bash

echo "🛡️ AEGIS Policy Management UI 起動スクリプト"
echo ""

# バックエンドサーバー起動
echo "📡 バックエンドサーバーを起動しています..."
POLICY_UI_PORT=3000 npx tsx src/web/server.ts &
BACKEND_PID=$!
echo "   バックエンドサーバー起動 (PID: $BACKEND_PID)"
echo "   → http://localhost:3000"

# 少し待つ
sleep 2

# 動作確認
if curl -s http://localhost:3000/api/policies > /dev/null; then
    echo "   ✅ バックエンドサーバー正常動作"
else
    echo "   ❌ バックエンドサーバー起動失敗"
    exit 1
fi

echo ""
echo "📋 利用可能なAPI:"
echo "   - GET  /api/policies         - ポリシー一覧"
echo "   - POST /api/policies         - ポリシー作成"
echo "   - GET  /api/policies/:id     - ポリシー取得"
echo "   - PUT  /api/policies/:id     - ポリシー更新"
echo "   - POST /api/policies/analyze - ポリシー解析"
echo "   - POST /api/policies/test    - ポリシーテスト"

echo ""
echo "🌐 Webブラウザで http://localhost:3000 にアクセスしてください"
echo ""
echo "React UIを起動する場合は別ターミナルで："
echo "   cd web"
echo "   npm install"
echo "   npm run dev"
echo ""
echo "終了するには Ctrl+C を押してください"

# シグナルハンドリング
trap "echo ''; echo '🛑 サーバーを停止します...'; kill $BACKEND_PID 2>/dev/null; exit" INT TERM

# 待機
wait $BACKEND_PID