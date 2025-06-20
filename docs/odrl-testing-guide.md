# ODRL Hybrid Policy Engine テストガイド

## 概要

ODRL（Open Digital Rights Language）ベースのハイブリッドポリシーエンジンは、AIによる厳格すぎる判定の問題を解決するために実装されました。このガイドでは、実装されたテストスイートの実行方法と、各テストが検証する内容について説明します。

## テストの種類

### 1. ユニットテスト

個々のODRLコンポーネントの動作を検証します。

```bash
# ODRLパーサーのテスト
npm test src/odrl/__tests__/parser.test.ts

# ODRL評価エンジンのテスト  
npm test src/odrl/__tests__/evaluator.test.ts

# 自然言語変換のテスト
npm test src/odrl/__tests__/nl-converter.test.ts
```

### 2. 統合テスト

ODRLとAEGISシステムの統合を検証します。

```bash
# ハイブリッドポリシーエンジンのテスト
npm test src/odrl/__tests__/hybrid-policy-test.ts

# API統合テスト
npm test src/odrl/__tests__/integration.test.ts
```

### 3. パフォーマンステスト

ODRL vs AI判定の性能比較を実施します。

```bash
# パフォーマンスベンチマーク実行
npx ts-node src/odrl/__tests__/performance-benchmark.ts
```

## 主要なテストシナリオ

### 営業時間ポリシー

```typescript
// 営業時間内（9-18時）のアクセステスト
const context = {
  agent: 'test-agent',
  action: 'resource:access',
  resource: 'file:data.json',
  time: new Date('2024-01-01T10:00:00'), // 10:00 AM
  environment: {}
};

// 期待結果: PERMIT (ODRL判定)
```

### エージェント信頼度ポリシー

```typescript
// 信頼スコアによるアクセス制御
const context = {
  agent: 'research-agent',
  agentType: 'research',
  trustScore: 0.8, // 高信頼度
  action: 'resource:access',
  resource: 'confidential-data',
  resourceClassification: 'confidential',
  environment: {}
};

// 期待結果: PERMIT (信頼スコア >= 0.7)
```

### MCPツール実行ポリシー

```typescript
// エージェントタイプによるツール実行制御
const context = {
  agent: 'research-agent-1',
  agentType: 'research',
  action: 'execute',
  resource: 'tool:filesystem__read_file',
  mcpTool: 'filesystem__read_file',
  environment: {}
};

// 期待結果: PERMIT (研究エージェントは読み取り可能)
```

## テスト実行例

### 基本的なテスト実行

```bash
# すべてのODRLテストを実行
npm test -- --testPathPattern=odrl

# 特定のテストファイルを実行
npm test src/odrl/__tests__/integration.test.ts

# ウォッチモードで実行
npm test -- --watch src/odrl/__tests__/
```

### パフォーマンステストの結果例

```
🏃 ODRL Performance Benchmark
================================
Test contexts: 96
Iterations per engine: 100

⚡ Performance Metrics:
┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Engine              │ Avg (ms) │ Min (ms) │ Max (ms) │ Total (s)│
├─────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ ODRL-only           │     0.82 │        0 │       12 │     0.08 │
│ AI-only             │    52.34 │       50 │       65 │     5.23 │
│ Hybrid (ODRL+AI)    │     8.76 │        0 │       58 │     0.88 │
│ Hybrid + Cache      │     3.21 │        0 │       51 │     0.32 │
└─────────────────────┴──────────┴──────────┴──────────┴──────────┘

🔄 Performance vs AI-only baseline:
  • ODRL-only: 63.83x faster (98.4% improvement)
  • Hybrid (ODRL+AI): 5.97x faster (83.3% improvement)
  • Hybrid + Cache: 16.30x faster (93.9% improvement)
```

## ODRLポリシーのテスト方法

### 1. 自然言語からODRLへの変換テスト

```bash
# 変換APIをテスト
curl -X POST http://localhost:8080/odrl/convert \
  -H "Content-Type: application/json" \
  -d '{
    "text": "営業時間内（9時から18時まで）のみアクセスを許可"
  }'
```

### 2. ポリシー作成と検証

```bash
# 自然言語からポリシー作成
curl -X POST http://localhost:8080/odrl/policies \
  -H "Content-Type: application/json" \
  -d '{
    "naturalLanguage": "researchエージェントのみツール実行を許可",
    "metadata": {
      "description": "Research agent policy",
      "label": "Research Access"
    }
  }'

# ポリシー検証
curl -X POST http://localhost:8080/odrl/validate \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "@context": ["http://www.w3.org/ns/odrl/2/"],
      "@type": "Policy",
      "uid": "test:policy",
      "permission": [{
        "@type": "Permission",
        "action": {"value": "resource:access"}
      }]
    }
  }'
```

### 3. ポリシーテスト実行

```bash
# 特定のコンテキストでポリシーをテスト
curl -X POST http://localhost:8080/odrl/test \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "agent": "test-agent",
      "action": "resource:access",
      "resource": "test-resource",
      "time": "2024-01-01T10:00:00Z",
      "trustScore": 0.8,
      "environment": {}
    }
  }'
```

## トラブルシューティング

### テストが失敗する場合

1. **依存関係の確認**
   ```bash
   npm install
   npm run build
   ```

2. **タイムゾーンの問題**
   - テストは JST (Asia/Tokyo) タイムゾーンを想定
   - 必要に応じて環境変数を設定: `TZ=Asia/Tokyo npm test`

3. **ポート競合**
   - 統合テストはランダムポートを使用
   - それでも競合する場合は他のプロセスを確認

### デバッグモード

```bash
# 詳細なログを出力
DEBUG=aegis:* npm test

# 特定のテストのみ実行
npm test -- --testNamePattern="should PERMIT during business hours"
```

## パフォーマンス最適化のヒント

1. **キャッシュの活用**
   - 同じ判定が繰り返される場合は `cacheEnabled: true` を設定
   - キャッシュTTLは用途に応じて調整

2. **ODRL優先モード**
   - 単純なルールベース判定には `useAI: false` を設定
   - AI判定が不要な場合の高速化

3. **ポリシーの最適化**
   - 頻繁に評価されるポリシーは優先度を高く設定
   - 複雑な制約は必要最小限に

## 次のステップ

1. **カスタムポリシーの作成**
   - 実際のユースケースに基づいたポリシーを作成
   - 自然言語変換機能を活用

2. **監視とメトリクス**
   - 判定時間の監視
   - キャッシュヒット率の確認

3. **継続的な改善**
   - AI判定の閾値調整
   - ODRL評価ロジックの最適化