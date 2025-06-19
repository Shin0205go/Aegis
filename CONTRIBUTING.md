# コントリビューションガイド

AEGISプロジェクトへの貢献を検討いただき、ありがとうございます！このガイドでは、プロジェクトへの貢献方法について説明します。

## 📋 目次

1. [行動規範](#行動規範)
2. [貢献の方法](#貢献の方法)
3. [開発プロセス](#開発プロセス)
4. [コーディング規約](#コーディング規約)
5. [コミットメッセージ](#コミットメッセージ)
6. [プルリクエスト](#プルリクエスト)
7. [問題報告](#問題報告)
8. [機能提案](#機能提案)
9. [ドキュメント](#ドキュメント)
10. [コミュニティ](#コミュニティ)

## 🤝 行動規範

### 私たちの約束

- **敬意**: すべての参加者を尊重し、建設的な対話を心がけます
- **包括性**: 多様な背景、経験、意見を歓迎します
- **協力**: 共通の目標に向かって協力します
- **透明性**: オープンで誠実なコミュニケーションを行います

### 容認できない行為

- ハラスメント、差別的な言動
- 個人攻撃や侮辱的なコメント
- 不適切なコンテンツの投稿
- 他者のプライバシーの侵害

違反を見つけた場合は、conduct@aegis-project.org までご連絡ください。

## 🎯 貢献の方法

### 1. コードの貢献

- バグ修正
- 新機能の実装
- パフォーマンス改善
- リファクタリング
- テストの追加

### 2. ドキュメントの改善

- 誤字脱字の修正
- 説明の改善
- 新しいガイドの作成
- 翻訳

### 3. 問題の報告

- バグレポート
- セキュリティ脆弱性の報告
- パフォーマンス問題

### 4. コミュニティサポート

- 質問への回答
- コードレビュー
- 新規貢献者のメンタリング

## 🔄 開発プロセス

### 1. 環境構築

```bash
# フォーク & クローン
git clone https://github.com/yourusername/aegis-policy-engine.git
cd aegis-policy-engine

# 上流リポジトリを追加
git remote add upstream https://github.com/originalrepo/aegis-policy-engine.git

# 依存関係のインストール
npm install

# 開発環境の起動
npm run dev
```

### 2. ブランチ戦略

```bash
# 最新のmainを取得
git checkout main
git pull upstream main

# 機能ブランチを作成
git checkout -b feature/your-feature-name
# または
git checkout -b fix/issue-number-description
```

ブランチ命名規則：
- `feature/` - 新機能
- `fix/` - バグ修正
- `docs/` - ドキュメントのみ
- `refactor/` - リファクタリング
- `test/` - テストのみ
- `chore/` - その他のタスク

### 3. 開発フロー

1. **Issue確認**: 作業前に関連するIssueを確認
2. **実装**: コーディング規約に従って実装
3. **テスト**: 単体テストと統合テストを追加
4. **ドキュメント**: 必要に応じてドキュメントを更新
5. **コミット**: 適切なコミットメッセージで記録
6. **プッシュ**: フォークにプッシュ
7. **PR作成**: プルリクエストを作成

## 📝 コーディング規約

### TypeScript

```typescript
// ✅ 良い例
export interface PolicyDecision {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;
  constraints?: string[];
  obligations?: string[];
}

export class PolicyEngine {
  private readonly logger: Logger;

  constructor(
    private readonly llmProvider: LLMProvider,
    logger?: Logger
  ) {
    this.logger = logger || defaultLogger;
  }

  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    try {
      this.validateContext(context);
      const decision = await this.performEvaluation(context);
      this.logDecision(context, decision);
      return decision;
    } catch (error) {
      this.logger.error('Policy evaluation failed', { error, context });
      throw new PolicyEvaluationError('Failed to evaluate policy', error);
    }
  }

  private validateContext(context: DecisionContext): void {
    if (!context.agent || !context.action || !context.resource) {
      throw new ValidationError('Invalid context: missing required fields');
    }
  }
}
```

### スタイルガイド

- **インデント**: スペース2つ
- **行の長さ**: 100文字以内
- **命名規則**:
  - クラス: PascalCase
  - インターフェース: PascalCase
  - 変数・関数: camelCase
  - 定数: UPPER_SNAKE_CASE
  - ファイル: kebab-case

### ESLintとPrettier

```bash
# リント実行
npm run lint

# 自動修正
npm run lint:fix

# フォーマット
npm run format
```

## 💬 コミットメッセージ

### フォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

### タイプ

- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: コードの意味に影響しない変更
- `refactor`: バグ修正や機能追加を含まないコード変更
- `perf`: パフォーマンス改善
- `test`: テストの追加・修正
- `chore`: ビルドプロセスやツールの変更

### 例

```bash
feat(policy): 自然言語ポリシーのバッチ評価機能を追加

複数のポリシーを同時に評価できるバッチ処理機能を実装。
パフォーマンスが約3倍向上。

Closes #123
```

## 🔀 プルリクエスト

### PR作成前のチェックリスト

- [ ] コードがコーディング規約に従っている
- [ ] すべてのテストが通る（`npm test`）
- [ ] 新機能にはテストを追加した
- [ ] ドキュメントを更新した（必要な場合）
- [ ] CHANGELOGを更新した（大きな変更の場合）
- [ ] コミットメッセージが規約に従っている

### PRテンプレート

```markdown
## 概要
変更の概要を記述

## 変更内容
- 具体的な変更点1
- 具体的な変更点2

## 関連Issue
Fixes #123

## テスト方法
1. 手順1
2. 手順2

## チェックリスト
- [ ] コードレビューの準備完了
- [ ] テスト追加/更新
- [ ] ドキュメント更新
- [ ] 破壊的変更なし
```

### レビュープロセス

1. **自動チェック**: CI/CDパイプラインの通過
2. **コードレビュー**: 最低1名のメンテナーによるレビュー
3. **フィードバック対応**: レビューコメントへの対応
4. **承認**: レビュー承認
5. **マージ**: メンテナーによるマージ

## 🐛 問題報告

### バグレポートテンプレート

```markdown
## 問題の概要
問題の簡潔な説明

## 環境情報
- AEGIS バージョン: 
- Node.js バージョン: 
- OS: 
- ブラウザ（該当する場合）: 

## 再現手順
1. 手順1
2. 手順2
3. 手順3

## 期待される動作
正常な場合の動作

## 実際の動作
発生している問題

## スクリーンショット
（該当する場合）

## ログ
```
関連するログを貼り付け
```

## 追加情報
その他関連する情報
```

### セキュリティ脆弱性の報告

セキュリティに関する問題は、公開Issueではなく security@aegis-project.org に直接報告してください。

## 💡 機能提案

### 提案テンプレート

```markdown
## 機能の概要
提案する機能の説明

## 動機・背景
なぜこの機能が必要か

## 提案する解決策
どのように実装するか

## 代替案
検討した他の方法

## 追加情報
参考リンク、例など
```

## 📚 ドキュメント

### ドキュメントの構成

```
docs/
├── user-guide/      # エンドユーザー向け
├── admin-guide/     # 管理者向け
├── developer-guide/ # 開発者向け
└── reference/       # リファレンス
```

### ドキュメント作成ガイド

- 明確で簡潔な説明
- 実例を含める
- スクリーンショットを活用
- 相互参照を適切に使用

## 👥 コミュニティ

### コミュニケーションチャンネル

- **GitHub Discussions**: 一般的な質問と議論
- **Slack**: リアルタイムチャット（招待リンク）
- **Twitter**: @aegis_project
- **ブログ**: blog.aegis-project.org

### コントリビューター認定

- 初回コントリビューター: Welcome バッジ
- 5回以上: Active Contributor バッジ
- 10回以上: Core Contributor バッジ
- メンテナー: Maintainer バッジ

## 🎉 初めてのコントリビューション

初めての方向けの Good First Issue をご用意しています：
- [Good First Issues](https://github.com/aegis-project/aegis-policy-engine/labels/good%20first%20issue)
- [Help Wanted](https://github.com/aegis-project/aegis-policy-engine/labels/help%20wanted)

質問がある場合は、遠慮なく Issue や Discussion で聞いてください！

## 📜 ライセンス

コントリビュートされたコードは、プロジェクトと同じ MIT ライセンスの下で公開されます。

---

ご協力ありがとうございます！皆様のコントリビューションがAEGISをより良いものにします。🚀