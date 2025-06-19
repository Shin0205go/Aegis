# 開発者ガイド

AEGISを拡張・カスタマイズする開発者向けの技術的な詳細ガイドです。

## 📚 ガイド一覧

### 🏗️ アーキテクチャ

1. **[システムアーキテクチャ](./architecture.md)**
   - 全体設計思想
   - コンポーネント構成
   - データフロー
   - 技術スタック

2. **[MCP統合詳細](./mcp-integration.md)**
   - MCPプロトコルの実装
   - プロキシアーキテクチャ
   - ツール統合メカニズム

3. **[エージェントシステム](./agent-system.md)**
   - エージェント識別と管理
   - 認証・認可の仕組み
   - エージェントメタデータ

### 🛠️ 開発

4. **[API リファレンス](./api-reference.md)**
   - REST APIエンドポイント
   - リクエスト/レスポンス仕様
   - 認証方法
   - SDKの使用方法

5. **[開発環境・テスト](./development.md)**
   - 開発環境のセットアップ
   - テスト戦略
   - CI/CDパイプライン
   - コーディング規約

6. **[拡張・カスタマイズ](./extending.md)**
   - プラグインアーキテクチャ
   - カスタムポリシーエンジン
   - 新しいMCPツールの追加
   - Webhookとイベント

## 🎯 開発者向けクイックスタート

### 開発環境セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/youraccount/aegis-policy-engine.git
cd aegis-policy-engine

# 開発用依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# テストの実行
npm test

# TypeScriptの型チェック
npm run type-check
```

### 基本的なカスタマイズ例

```typescript
// カスタムポリシーエンジンの実装
import { PolicyEngine, PolicyDecision } from '@aegis/core';

class CustomPolicyEngine extends PolicyEngine {
  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    // カスタムロジックの実装
    if (context.agent.includes('trusted')) {
      return {
        decision: 'PERMIT',
        reason: 'Trusted agent',
        confidence: 1.0
      };
    }
    
    // デフォルトの評価にフォールバック
    return super.evaluate(context);
  }
}
```

## 📋 主要なインターフェース

### PolicyEngine インターフェース

```typescript
interface PolicyEngine {
  addPolicy(id: string, policy: string): void;
  removePolicy(id: string): void;
  evaluate(context: DecisionContext): Promise<PolicyDecision>;
}
```

### MCPProxy インターフェース

```typescript
interface MCPProxy {
  interceptRequest(request: MCPRequest): Promise<MCPResponse>;
  registerUpstream(name: string, config: UpstreamConfig): void;
  applyPolicy(request: MCPRequest): Promise<PolicyDecision>;
}
```

### AuditLogger インターフェース

```typescript
interface AuditLogger {
  log(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
  export(format: 'json' | 'csv'): Promise<Buffer>;
}
```

## 🔧 開発ツール

### 推奨される開発環境

- **IDE**: VSCode（推奨拡張機能付き）
- **Node.js**: v20以上
- **TypeScript**: v5以上
- **デバッガー**: Chrome DevTools または VSCode デバッガー

### 開発用スクリプト

```bash
# 開発サーバー（ホットリロード付き）
npm run dev

# 単体テスト
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e

# カバレッジレポート
npm run test:coverage

# リンター
npm run lint

# フォーマッター
npm run format

# 型チェック
npm run type-check
```

## 🏛️ アーキテクチャの原則

### 1. モジュラー設計
- 各コンポーネントは独立して開発・テスト可能
- 明確なインターフェースと責任分離
- 依存性注入によるテスタビリティ

### 2. 拡張性
- プラグインアーキテクチャ
- イベント駆動設計
- カスタムフックポイント

### 3. パフォーマンス
- 非同期処理の活用
- 効率的なキャッシング戦略
- バッチ処理の最適化

### 4. セキュリティ
- ゼロトラストアーキテクチャ
- 最小権限の原則
- 監査ログの完全性

## 💡 開発のベストプラクティス

### コーディング規約

```typescript
// ✅ 良い例：明確な型定義とエラーハンドリング
export async function evaluatePolicy(
  context: DecisionContext
): Promise<PolicyDecision> {
  try {
    validateContext(context);
    const decision = await policyEngine.evaluate(context);
    await auditLogger.log({ context, decision });
    return decision;
  } catch (error) {
    logger.error('Policy evaluation failed', { error, context });
    throw new PolicyEvaluationError('Failed to evaluate policy', error);
  }
}

// ❌ 悪い例：型定義なし、エラーハンドリングなし
function evaluate(ctx) {
  return engine.evaluate(ctx);
}
```

### テストの書き方

```typescript
describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  
  beforeEach(() => {
    engine = new PolicyEngine();
  });
  
  it('should permit access for valid context', async () => {
    // Arrange
    const context = createMockContext({
      agent: 'test-agent',
      action: 'read',
      resource: 'public-doc'
    });
    
    // Act
    const decision = await engine.evaluate(context);
    
    // Assert
    expect(decision.decision).toBe('PERMIT');
    expect(decision.confidence).toBeGreaterThan(0.8);
  });
});
```

## 🚀 コントリビューション

### プルリクエストのプロセス

1. Issueでの議論
2. フォークとブランチ作成
3. 実装とテスト
4. プルリクエスト作成
5. コードレビュー
6. マージ

### コミットメッセージ規約

```
feat: 新機能の追加
fix: バグ修正
docs: ドキュメントのみの変更
style: フォーマットの変更
refactor: リファクタリング
test: テストの追加・修正
chore: ビルドプロセスやツールの変更
```

## 🔗 関連リソース

### 内部ドキュメント
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - コントリビューションガイド
- [CLAUDE.md](../../CLAUDE.md) - 自然言語ポリシーアーキテクチャ

### 外部リソース
- [MCP仕様](https://modelcontextprotocol.io/docs)
- [TypeScript公式ドキュメント](https://www.typescriptlang.org/docs/)
- [Node.js ベストプラクティス](https://github.com/goldbergyoni/nodebestpractices)

---

開発に関する質問は、開発者用Slackチャンネル #aegis-dev または [GitHub Discussions](https://github.com/youraccount/aegis-policy-engine/discussions) でお願いします。