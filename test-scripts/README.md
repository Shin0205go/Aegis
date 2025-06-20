# AEGIS 回帰テストクライアント

Bash権限なしで回帰テストを実行できるTypeScriptベースのテストクライアントです。

## 🎯 目的

GitHub ActionsなどでBash権限が制限されている環境でも、ODRLと自然言語ポリシーの統合後の回帰テストを実行できるようにします。

## 📁 ファイル構成

- **`regression-test-client.ts`** - メインのテストクライアント実装
- **`run-regression-tests.ts`** - テスト実行用のランナースクリプト
- **`minimal-test-example.ts`** - 最小限のテスト実行例

## 🚀 使用方法

### 1. 基本的な実行方法

```bash
# TypeScript実行環境（tsx）を使用
npx tsx test-scripts/run-regression-tests.ts
```

### 2. プログラム的な使用

```typescript
import { RegressionTestClient } from './regression-test-client';

const client = new RegressionTestClient();
await client.runAllTests();
```

### 3. 個別のテストスイート実行

```typescript
const client = new RegressionTestClient();

// 特定のテストスイートのみ実行
await client.testMCPProxyIntegration();
await client.testODRLIntegration();
```

## 🧪 テストスイート

### 1. MCPプロキシ統合テスト
- ツールルーティングの確認（12個のツール）
- HybridPolicyEngineの使用確認
- ODRL優先判定の動作確認

### 2. コアコントローラーテスト
- 基本的なアクセス制御フロー
- エラーハンドリング
- ポリシー選択ロジック

### 3. Phase 3 制約・義務システムテスト
- データ匿名化制約
- レート制限制約
- 監査ログ義務

### 4. ODRL統合テスト
- ODRL変換機能
- ハイブリッド判定（ODRL + AI）

## 📊 出力形式

テスト実行後、以下の形式でレポートが生成されます：

```markdown
# AEGIS 回帰テストレポート

実行日時: 2024-12-20T10:00:00.000Z

## MCPプロキシ統合テスト
- 総テスト数: 3
- 成功: 3
- 失敗: 0
- 実行時間: 245ms

...
```

レポートは `regression-test-report.md` として保存されます。

## ⚠️ 注意事項

1. **環境変数**: 実際のAI APIを使用する場合は、適切な環境変数を設定してください
   ```bash
   export OPENAI_API_KEY=your-api-key
   ```

2. **モックモード**: デフォルトではAI呼び出しをモック化しています

3. **依存関係**: 実行前に依存関係がインストールされている必要があります
   ```bash
   npm install
   ```

## 🔧 カスタマイズ

### 新しいテストの追加

```typescript
async testCustomFeature(): Promise<void> {
  const testFunctions = [
    async function testNewFeature() {
      // テストロジック
    }
  ];
  
  await this.runTestSuite('Custom Feature', testFunctions);
}
```

### テスト設定の変更

`createTestConfig()` メソッドを編集して、テスト用の設定をカスタマイズできます。

## 🐛 トラブルシューティング

### "Cannot find module" エラー
→ `npm install` を実行して依存関係をインストール

### "Permission denied" エラー
→ このテストクライアントはBash権限不要で動作します

### テストが失敗する
→ `minimal-test-example.ts` で基本的な動作を確認

## 📝 ライセンス

MIT