# ODRL ハイブリッドポリシーエンジン テスト実行ガイド

## 🚀 今すぐテストを実行する

### 1. 最も簡単なテスト（動作確認）

```bash
# デモを実行して、ODRLがAIの厳格さ問題をどう解決するか確認
npm run test:odrl:demo
```

このデモでは以下を実演します：
- AI が「unknown agent type」や「after hours」で拒否するケース
- ODRL ルールによる適切な判定
- パフォーマンスの改善

### 2. 基本的なテスト実行

```bash
# ODRLのユニットテストを実行
npm run test:odrl

# より詳しいテストを実行
npm run test:odrl:all
```

### 3. パフォーマンステスト

```bash
# ODRL vs AI のパフォーマンス比較
npm run test:odrl:performance
```

期待される結果：
- ODRL は AI より 50倍以上高速
- ハイブリッドアプローチでも 5倍以上高速

### 4. 統合テストでサーバー起動

```bash
# ビルドしてからサーバー起動
npm run build
npm run start:mcp:http
```

別のターミナルで API をテスト：

```bash
# 自然言語ポリシーの変換テスト
curl -X POST http://localhost:8080/odrl/convert \
  -H "Content-Type: application/json" \
  -d '{"text": "営業時間内（9時から18時まで）のみアクセスを許可"}'

# ポリシーによる判定テスト
curl -X POST http://localhost:8080/odrl/test \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "agent": "test-agent",
      "action": "resource:access",
      "resource": "test-file",
      "time": "2024-01-01T10:00:00Z"
    }
  }'
```

## 📊 テスト結果の見方

### デモ実行時の出力例

```
🎯 ODRL Hybrid Policy Engine Demo

📋 Scenario: Research agent at 8PM
----------------------------------------------------------

🤖 AI-only decision: DENY
   Reason: AI strict mode: After business hours, External IP address

🔄 Hybrid decision: PERMIT
   Reason: ODRL rule matched: Permission for research agent type
   Engine used: ODRL

✨ ODRL improved the decision from DENY to PERMIT
```

### パフォーマンステストの出力例

```
⚡ Performance Metrics:
┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Engine              │ Avg (ms) │ Min (ms) │ Max (ms) │ Total (s)│
├─────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ ODRL-only           │     0.82 │        0 │       12 │     0.08 │
│ AI-only             │    52.34 │       50 │       65 │     5.23 │
│ Hybrid (ODRL+AI)    │     8.76 │        0 │       58 │     0.88 │
│ Hybrid + Cache      │     3.21 │        0 │       51 │     0.32 │
└─────────────────────┴──────────┴──────────┴──────────┴──────────┘
```

## 🛠️ トラブルシューティング

### エラーが発生する場合

1. **TypeScript エラー**
   ```bash
   npm run build
   ```

2. **テストタイムアウト**
   ```bash
   # タイムアウトを延長
   npm run test:odrl -- --testTimeout=10000
   ```

3. **ポート競合**
   ```bash
   # 別のポートで起動
   PORT=3000 npm run start:mcp:http
   ```

## 📝 次のステップ

1. **自分のポリシーを追加**
   - `examples/odrl-demo.ts` を参考に
   - 自然言語で記述可能

2. **A2A との統合テスト**
   ```bash
   cd a2a
   npm test
   ```

3. **実際の MCP エージェントでテスト**
   - Claude Desktop の設定を更新
   - AEGIS プロキシ経由でアクセス

## 💡 重要なポイント

- **ODRL は AI の厳格さを解決**: 「unknown agent」や「after hours」での不当な拒否を防ぐ
- **高速**: ルールベース判定は AI より 50倍以上高速
- **後方互換性**: 既存の自然言語ポリシーも自動変換で対応
- **ハイブリッド**: 単純なケースは ODRL、複雑なケースは AI で判定