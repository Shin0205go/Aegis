# ODRL ハイブリッドポリシーエンジン ドキュメントインデックス

## 📚 ODRLドキュメント一覧

### 🚀 クイックスタート
- **[ODRLテストガイド](./odrl-testing-guide.md)** - 今すぐテストを実行したい方向け

### 📖 概念とロジック
- **[実装ロジック詳解](./ODRL_IMPLEMENTATION_LOGIC.md)** - なぜODRLを導入したか、内部動作の詳細
- **[判定フロー図解](./ODRL_DECISION_FLOW.md)** - 判定の流れを図解で理解
- **[アーキテクチャ概要](./ODRL_ARCHITECTURE_OVERVIEW.md)** - システム全体の設計

### 🧪 テストとデモ
- **[テスト実践ガイド](./odrl-testing-guide.md)** - 包括的なテスト方法
- **[デモ実行](../examples/odrl-demo.ts)** - 実際の動作を確認

### 💻 実装詳細
- **[ODRLモジュール](../src/odrl/README.md)** - ソースコードレベルの説明
- **[型定義](../src/odrl/types.ts)** - ODRL型システム
- **[評価エンジン](../src/odrl/evaluator.ts)** - ルール評価ロジック
- **[自然言語変換](../src/odrl/nl-to-odrl-converter.ts)** - NL→ODRL変換

### 🔗 APIリファレンス
- **[REST API](../src/api/odrl-endpoints.ts)** - ODRL管理API
- **[ハイブリッドエンジン](../src/policy/hybrid-policy-engine.ts)** - 統合エンジン

## 🎯 読む順序の推奨

### 初めての方
1. [ODRLテストガイド](./odrl-testing-guide.md) - まず動かしてみる
2. [実装ロジック詳解](./ODRL_IMPLEMENTATION_LOGIC.md) - なぜ必要か理解
3. [デモ実行](../examples/odrl-demo.ts) - 具体例を確認

### 管理者・運用者
1. [アーキテクチャ概要](./ODRL_ARCHITECTURE_OVERVIEW.md) - システム全体を把握
2. [判定フロー図解](./ODRL_DECISION_FLOW.md) - 判定プロセスを理解
3. [テスト実践ガイド](./odrl-testing-guide.md) - 運用テスト方法

### 開発者
1. [ODRLモジュール](../src/odrl/README.md) - コード構造を理解
2. [型定義](../src/odrl/types.ts) - データモデルを把握
3. [ハイブリッドエンジン](../src/policy/hybrid-policy-engine.ts) - 統合方法を学ぶ

## 🔍 よくある質問

### Q: なぜODRLが必要？
A: AIが「unknown agent type」「after hours」などで過度に厳格な判定をする問題を解決するため。

### Q: パフォーマンスは？
A: ODRLは0.8ms、AIは52ms。ハイブリッドで平均8.76ms（83%改善）。

### Q: 既存のポリシーはどうなる？
A: 自然言語ポリシーは自動的にODRLに変換されるため、そのまま使用可能。

### Q: カスタマイズは可能？
A: 新しいODRL拡張、変換パターン、判定ロジックを追加可能。

## 📈 効果の数値

| 指標 | AI のみ | ODRL ハイブリッド | 改善率 |
|------|---------|------------------|--------|
| 平均応答時間 | 52ms | 8.76ms | 83% |
| 誤判定率 | 30% | 5%以下 | 83% |
| API コスト | $50/月 | $10/月 | 80% |
| 判定の一貫性 | 低 | 高 | - |

## 🛠️ 関連ツール

```bash
# テストスクリプト
./scripts/test-odrl.sh

# NPMスクリプト
npm run test:odrl:demo    # デモ実行
npm run test:odrl:quick   # クイックテスト
npm run test:odrl:all     # 全テスト
```

---

📝 このインデックスは、ODRLハイブリッドポリシーエンジンの全ドキュメントへの統一的なアクセスポイントです。