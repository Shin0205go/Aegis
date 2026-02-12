#!/bin/bash
#
# 自律改善ループ - AEGIS Policy Engine
# Claude Codeが自動でテスト実行 → エラー分析 → コード修正 → コミット → プッシュ
#

set -e

# ログディレクトリ
mkdir -p agent_logs

# ループカウンター
LOOP=0

echo "🤖 Starting AEGIS Self-Improvement Loop"
echo "   Running infinitely (Ctrl+C to stop)"
echo ""

while true; do
  LOOP=$((LOOP + 1))
  COMMIT=$(git rev-parse --short=6 HEAD)
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  LOGFILE="agent_logs/loop_${LOOP}_${COMMIT}_${TIMESTAMP}.log"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔄 Loop #$LOOP (commit: $COMMIT)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # プロンプトファイル作成（前回のログを含む）
  cat > /tmp/aegis_prompt.md << 'PROMPT'
# AEGIS Policy Engine 自己改善エージェント

## あなたの役割

AEGIS Policy Engineプロジェクトのコード品質を向上させてください。

## タスク

1. **テスト実行**: `npm run test` でテストスイートを実行
2. **エラー分析**: 失敗したテストやビルドエラーを分析
3. **コード修正**:
   - エラー原因を特定してソースコードを読む
   - `Edit`ツールで修正
   - `npm run build` でビルド確認
   - `npm run test` で修正を検証
4. **Git管理**:
   - 修正内容を明確なコミットメッセージでコミット
   - 変更をプッシュ
5. **終了**: 修正完了したら `/exit` で終了

## 重要

- エラーが発生しても**諦めずに修正**してください
- 修正後は必ず `npm run build` と `npm run test` を実行
- 修正内容は明確なコミットメッセージでGit保存
- テストが全て通るまで繰り返し修正

## プロジェクト情報

- 言語: TypeScript
- ビルドコマンド: `npm run build`
- テストコマンド: `npm run test`
- プロジェクト: AI Governance & Policy Enforcement System

PROMPT

  # 前回のログがあれば追加（エラー部分のみ、サイズ制限付き）
  PREV_LOG=$(ls -t agent_logs/loop_*.log 2>/dev/null | head -1)
  if [ ! -z "$PREV_LOG" ] && [ -f "$PREV_LOG" ]; then
    # ログファイルのサイズチェック（100KB以上なら要約のみ）
    LOG_SIZE=$(wc -c < "$PREV_LOG" 2>/dev/null || echo 0)
    if [ "$LOG_SIZE" -lt 102400 ]; then
      # 小さいログは全体を追加
      echo "" >> /tmp/aegis_prompt.md
      echo "## 前回のループ結果（参考）" >> /tmp/aegis_prompt.md
      echo "" >> /tmp/aegis_prompt.md
      echo '```' >> /tmp/aegis_prompt.md
      tail -50 "$PREV_LOG" >> /tmp/aegis_prompt.md
      echo '```' >> /tmp/aegis_prompt.md
    else
      # 大きいログはエラーのみ抽出（最大30行）
      ERRORS=$(grep -E "error|Error|ERROR|Failed|FAILED|Exception" "$PREV_LOG" 2>/dev/null | tail -30 || echo "No errors found")
      if [ ! -z "$ERRORS" ]; then
        echo "" >> /tmp/aegis_prompt.md
        echo "## 前回のループエラー概要" >> /tmp/aegis_prompt.md
        echo "" >> /tmp/aegis_prompt.md
        echo '```' >> /tmp/aegis_prompt.md
        echo "$ERRORS" >> /tmp/aegis_prompt.md
        echo '```' >> /tmp/aegis_prompt.md
      fi
    fi
  fi

  # Claude Code実行
  echo "▶️  Starting Claude Code..."
  echo "   Log: $LOGFILE"

  # Run Claude with timeout (20 minutes)
  # stream-json でリアルタイム出力
  (cat /tmp/aegis_prompt.md | claude --dangerously-skip-permissions \
    --print \
    --verbose \
    --output-format stream-json \
    --model sonnet) > "$LOGFILE" 2>&1 &
  CLAUDE_PID=$!

  # Wait up to 1200 seconds (20 minutes)
  EXIT_CODE=0
  for i in {1..1200}; do
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      wait $CLAUDE_PID
      EXIT_CODE=$?
      break
    fi
    sleep 1
  done

  # Kill if still running
  if kill -0 $CLAUDE_PID 2>/dev/null; then
    echo "" >> "$LOGFILE"
    echo "⏱️  Timeout reached (20 minutes), stopping..." >> "$LOGFILE"
    # Kill the subshell and all its children
    pkill -P $CLAUDE_PID 2>/dev/null || true
    kill $CLAUDE_PID 2>/dev/null || true
    wait $CLAUDE_PID 2>/dev/null || true
    EXIT_CODE=124
  fi

  echo ""
  if [ ${EXIT_CODE:-0} -eq 0 ]; then
    echo "✅ Completed successfully"
  elif [ ${EXIT_CODE:-0} -eq 124 ]; then
    echo "⏱️  Timeout (20 minutes) - moving to next loop"
  else
    echo "❌ Exited with code ${EXIT_CODE:-0}"
  fi

  # エラー数カウント
  ERROR_COUNT=$(grep -c "Error\|Failed\|Exception" "$LOGFILE" 2>/dev/null || true)
  TOOL_COUNT=$(grep -c "\"type\":\"tool\"" "$LOGFILE" 2>/dev/null || true)

  echo "📊 Stats:"
  echo "   - Tools used: $TOOL_COUNT"
  echo "   - Errors: $ERROR_COUNT"
  echo "   - Log: $LOGFILE"

  # Git変更チェック（新しいコミットがあるか）
  NEW_COMMIT=$(git rev-parse --short=6 HEAD)
  if [ "$NEW_COMMIT" != "$COMMIT" ]; then
    echo "🔧 Code improvements detected (new commit: $NEW_COMMIT)"

    # 自動プッシュ
    echo "📤 Pushing to remote..."
    if git push 2>&1 | tee -a "$LOGFILE"; then
      echo "✅ Pushed successfully"
    else
      echo "⚠️  Push failed (continuing anyway)"
    fi
  fi

  echo ""
  echo "⏳ Waiting 10 seconds before next loop..."
  sleep 10
done

echo ""
echo "🏁 Self-improvement loop stopped"
echo "📊 Completed $LOOP loops"
echo "📁 Logs saved in: agent_logs/"
