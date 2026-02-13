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

AEGIS Policy Engineプロジェクトを**仕様駆動開発（Spec-Driven Development）**で改善してください。

## 仕様駆動ワークフロー

### フェーズ1: 仕様確認・更新（初回または仕様変更時）

1. **仕様確認**: `.specify/features/`ディレクトリ内のspec.mdを確認
   - 既存のspec.mdがあれば内容を確認
   - なければSkillツールで`specify`を実行して作成

2. **実装計画**: Skillツールで`plan`を実行
   - spec.mdに基づいて実装計画（plan.md）を生成

3. **タスク分解**: Skillツールで`tasks`を実行
   - 実装タスク（tasks.md）に分解
   - 優先順位付けされたタスクリスト生成

4. **整合性分析**: Skillツールで`analyze`を実行
   - spec.md/plan.md/tasks.mdの整合性チェック

### フェーズ2: 実装と検証（毎回実行）

5. **実装実行**:
   - tasks.mdの未完了タスクを確認
   - Skillツールで`implement`を実行、または手動実装
   - テスト結果に基づいてコード修正

6. **テスト実行**: `npm run test` でテストスイート実行

7. **エラー分析**: 失敗したテストやビルドエラーを分析
   - エラー原因を特定してソースコードを読む
   - `Edit`ツールで修正
   - `npm run build` でビルド確認
   - `npm run test` で修正を検証

8. **Git管理**:
   - 修正内容を明確なコミットメッセージでコミット
   - 変更をプッシュ

9. **終了**: 修正完了したら `/exit` で終了

## Skillツール使用方法

仕様駆動開発のスキルを活用してください：

```
<invoke name="Skill">
<parameter name="skill">specify</parameter>
</invoke>

<invoke name="Skill">
<parameter name="skill">plan</parameter>
</invoke>

<invoke name="Skill">
<parameter name="skill">tasks</parameter>
</invoke>

<invoke name="Skill">
<parameter name="skill">analyze</parameter>
</invoke>

<invoke name="Skill">
<parameter name="skill">implement</parameter>
</invoke>
```

## 終了条件（ゴール）

このループは以下のいずれかを達成したら終了します：

1. **テスト通過率95%以上** - 現在のテスト結果から通過率を確認
2. **全タスク完了** - tasks.mdの未完了タスク（`- [ ]`）がゼロ

現在の状況を確認して、ゴールに向けて最適な作業を選択してください。

## 重要ガイドライン

- **仕様ファースト**: spec.mdがなければまず作成する
- **計画的実装**: tasks.mdに基づいて優先順位をつけて実装
- **整合性維持**: spec/plan/tasksの整合性を常に確認
- **ゴール意識**: テスト95%通過 または 全タスク完了を目指す
- エラーが発生しても**諦めずに修正**
- 修正後は必ず `npm run build` と `npm run test` を実行
- 修正内容は明確なコミットメッセージでGit保存

## プロジェクト情報

- 言語: TypeScript
- ビルドコマンド: `npm run build`
- テストコマンド: `npm run test`
- プロジェクト: AI Governance & Policy Enforcement System
- 仕様駆動開発: spec-driven-development

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

  # テスト通過率の計算
  TEST_OUTPUT=$(tail -100 "$LOGFILE" | grep "Tests:" | tail -1)
  if [ ! -z "$TEST_OUTPUT" ]; then
    PASSED=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
    TOTAL=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+' || echo "1")
    PASS_RATE=$((PASSED * 100 / TOTAL))
    echo "   - Test pass rate: ${PASS_RATE}% (${PASSED}/${TOTAL})"
  else
    PASS_RATE=0
    echo "   - Test pass rate: N/A"
  fi

  # タスク完了状態の確認
  TASKS_FILE=$(find .specify/features -name "tasks.md" 2>/dev/null | head -1)
  if [ -f "$TASKS_FILE" ]; then
    INCOMPLETE_TASKS=$(grep -c "^- \[ \]" "$TASKS_FILE" 2>/dev/null || echo "0")
    COMPLETED_TASKS=$(grep -c "^- \[x\]" "$TASKS_FILE" 2>/dev/null || echo "0")
    echo "   - Tasks: ${COMPLETED_TASKS} completed, ${INCOMPLETE_TASKS} remaining"
  else
    INCOMPLETE_TASKS=-1
    echo "   - Tasks: No tasks.md found"
  fi

  # 終了条件チェック
  if [ $PASS_RATE -ge 95 ]; then
    echo ""
    echo "🎯 SUCCESS: Test pass rate reached 95% (${PASS_RATE}%)"
    echo "🏁 Self-improvement goal achieved!"
    break
  elif [ $INCOMPLETE_TASKS -eq 0 ] && [ $INCOMPLETE_TASKS -ne -1 ]; then
    echo ""
    echo "✅ SUCCESS: All tasks completed!"
    echo "🏁 Self-improvement goal achieved!"
    break
  fi

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
