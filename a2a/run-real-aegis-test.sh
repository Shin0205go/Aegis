#!/bin/bash

# 実際のAEGISプロキシサーバーを使用したA2Aテスト実行スクリプト

echo "🚀 実際のAEGISプロキシサーバーを使用したA2Aテストを準備中..."

# カラー出力の設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 環境変数のチェック
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}❌ エラー: OPENAI_API_KEY が設定されていません${NC}"
    echo "以下のコマンドでAPIキーを設定してください:"
    echo "export OPENAI_API_KEY='your-api-key-here'"
    exit 1
fi

# ディレクトリの確認
A2A_DIR="/Users/shingo/Develop/aegis-policy-engine/a2a"
AEGIS_DIR="/Users/shingo/Develop/aegis-policy-engine"

if [ ! -d "$A2A_DIR" ]; then
    echo -e "${RED}❌ エラー: A2Aディレクトリが見つかりません: $A2A_DIR${NC}"
    exit 1
fi

if [ ! -d "$AEGIS_DIR" ]; then
    echo -e "${RED}❌ エラー: AEGISディレクトリが見つかりません: $AEGIS_DIR${NC}"
    exit 1
fi

cd "$A2A_DIR"

# 依存関係の確認
echo "📦 依存関係を確認中..."
if [ ! -d "node_modules" ]; then
    echo "📥 依存関係をインストール中..."
    npm install
fi

# TypeScriptのビルド
echo "🔨 TypeScriptをビルド中..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ビルドに失敗しました${NC}"
    exit 1
fi

# stdioモードではポートを使用しないため、このステップは不要
echo "🛑 stdioモードでAEGISプロキシを起動します"

# ログディレクトリの作成
mkdir -p "$AEGIS_DIR/logs"

# テストの実行
echo -e "\n${GREEN}🚀 実際のAEGISプロキシサーバーを使用したA2Aテストを開始します${NC}\n"

node dist/examples/real-aegis-test.js

# 終了コードを保存
TEST_EXIT_CODE=$?

# テスト結果の表示
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "\n${GREEN}✅ テストが正常に完了しました${NC}"
else
    echo -e "\n${RED}❌ テストが失敗しました (終了コード: $TEST_EXIT_CODE)${NC}"
fi

# ログファイルの確認
LOG_FILE="$AEGIS_DIR/logs/aegis-test.log"
if [ -f "$LOG_FILE" ]; then
    echo -e "\n${YELLOW}📋 AEGISサーバーログ (最後の20行):${NC}"
    tail -20 "$LOG_FILE"
fi

# 監査ログの確認
AUDIT_LOG=$(ls -t "$AEGIS_DIR/logs/audit/audit_"*.json 2>/dev/null | head -1)
if [ ! -z "$AUDIT_LOG" ]; then
    echo -e "\n${YELLOW}📊 監査ログエントリ数:${NC}"
    cat "$AUDIT_LOG" | jq '. | length' 2>/dev/null || echo "監査ログの解析に失敗しました"
fi

exit $TEST_EXIT_CODE