# ODRL Hybrid Policy Engine

## 概要

ODRL（Open Digital Rights Language）ベースのハイブリッドポリシーエンジンは、AIによる過度に厳格な判定の問題を解決するために実装されました。ルールベースの高速で確実な判定と、AIの柔軟性を組み合わせた革新的なアプローチです。

## 問題の背景

AIベースのポリシー判定では以下の問題が発生していました：

- **過度の厳格性**: 「unknown agent type」「after hours」「external IP」などの理由で正当なアクセスを拒否
- **パフォーマンス**: 各判定でAI APIを呼び出すため、レイテンシが高い
- **一貫性の欠如**: 同じ条件でも判定結果が変わる可能性
- **コスト**: 大量のAPI呼び出しによる費用

## ODRLハイブリッドアプローチ

### アーキテクチャ

```
リクエスト
    ↓
[ハイブリッドポリシーエンジン]
    ├─→ [ODRL評価エンジン] → 高速・確実な判定
    │         ↓
    │    ルールマッチ？
    │      Yes → 判定結果
    │      No  ↓
    └─→ [AI判定エンジン] → 複雑なケースの判定
              ↓
         最終判定結果
```

### 主要コンポーネント

1. **ODRLパーサー** (`parser.ts`)
   - W3C ODRL 2.2標準準拠
   - AEGIS拡張サポート

2. **ODRL評価エンジン** (`evaluator.ts`)
   - 高速なルールマッチング
   - 論理制約の評価

3. **自然言語→ODRL変換** (`nl-to-odrl-converter.ts`)
   - 日本語ポリシーのサポート
   - パターンベースの変換

4. **ハイブリッドポリシーエンジン** (`../policy/hybrid-policy-engine.ts`)
   - ODRL優先評価
   - AI フォールバック
   - キャッシング

## クイックスタート

### 1. デモの実行

```bash
# ODRLデモを実行（AI厳格性問題の解決を実演）
npm run test:odrl:demo
```

### 2. テストの実行

```bash
# クイックテスト（動作確認）
npm run test:odrl:quick

# 全テスト実行
npm run test:odrl:all

# パフォーマンステスト
npm run test:odrl:performance
```

### 3. サーバー起動とAPI利用

```bash
# AEGISサーバーを起動（ODRL対応）
npm run start:mcp:http
```

API エンドポイント:
- `POST /odrl/convert` - 自然言語→ODRL変換
- `POST /odrl/policies` - ポリシー作成
- `GET /odrl/policies` - ポリシー一覧
- `POST /odrl/test` - ポリシーテスト

## 使用例

### 自然言語ポリシーの追加

```typescript
// 自然言語でポリシーを定義
const nlPolicy = '営業時間内（9時から18時まで）のみアクセスを許可';

// APIで変換・追加
const response = await fetch('http://localhost:8080/odrl/policies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ naturalLanguage: nlPolicy })
});
```

### ODRL形式でのポリシー定義

```json
{
  "@context": ["http://www.w3.org/ns/odrl/2/", "https://aegis.example.com/odrl/"],
  "@type": "Policy",
  "uid": "business-hours-policy",
  "permission": [{
    "@type": "Permission",
    "action": { "value": "resource:access" },
    "constraint": [{
      "@type": "LogicalConstraint",
      "and": [
        {
          "@type": "Constraint",
          "leftOperand": "timeOfDay",
          "operator": "gteq",
          "rightOperand": "09:00:00"
        },
        {
          "@type": "Constraint",
          "leftOperand": "timeOfDay",
          "operator": "lteq",
          "rightOperand": "18:00:00"
        }
      ]
    }]
  }]
}
```

### ポリシーのテスト

```bash
# コンテキストに対してポリシーをテスト
curl -X POST http://localhost:8080/odrl/test \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "agent": "research-bot",
      "agentType": "research",
      "action": "resource:access",
      "resource": "file:data.json",
      "time": "2024-01-01T10:00:00Z",
      "trustScore": 0.8
    }
  }'
```

## パフォーマンス比較

実測値の例:

| エンジン | 平均応答時間 | AI比改善率 |
|---------|------------|-----------|
| ODRL-only | 0.82ms | 98.4% |
| AI-only | 52.34ms | - |
| Hybrid | 8.76ms | 83.3% |
| Hybrid+Cache | 3.21ms | 93.9% |

## AEGIS拡張

標準ODRLに以下の拡張を追加:

- `aegis:trustScore` - エージェント信頼スコア
- `aegis:agentType` - エージェントタイプ
- `aegis:emergency` - 緊急フラグ
- `aegis:resourceClassification` - リソース分類
- `aegis:delegationDepth` - 委譲深度

## トラブルシューティング

### テストが失敗する場合

1. ビルドを実行
   ```bash
   npm run build
   ```

2. 依存関係を更新
   ```bash
   npm install
   ```

3. タイムゾーンを確認（JSTを想定）
   ```bash
   TZ=Asia/Tokyo npm test
   ```

### デバッグ

```bash
# 詳細ログを有効化
DEBUG=aegis:* npm run test:odrl:demo
```

## 今後の拡張

- [ ] ODRL 2.2完全準拠
- [ ] ポリシーコンフリクト検出
- [ ] ビジュアルポリシーエディタ
- [ ] より高度な自然言語処理
- [ ] ポリシーのバージョニング強化