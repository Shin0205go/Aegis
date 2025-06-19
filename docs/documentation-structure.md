# AEGIS ドキュメント構造案

## 現状の問題
- README.mdが351行と長すぎる（通常は100-200行が理想）
- 詳細な技術情報とクイックスタートが混在
- ナビゲーションが困難

## 提案する新構造

### 📄 README.md（簡潔版）
```markdown
# AEGIS - Natural Language Policy Enforcement System 🛡️

> 簡潔なプロジェクト説明（3-5行）

## ✨ 主要な特徴
- 箇条書きで5-8個

## 🚀 クイックスタート
```bash
# 最小限のセットアップ手順
npm install && npm run build
cp .env.example .env
# 詳細は docs/getting-started.md へ
```

## 📚 ドキュメント
- [はじめに](./docs/) - プロジェクト概要とガイド一覧
- [導入ガイド](./docs/getting-started.md) - インストールと初期設定
- [ユーザーガイド](./docs/user-guide/) - 使い方とベストプラクティス
- [開発者ガイド](./docs/developer-guide/) - API・アーキテクチャ詳細

## 🤝 コントリビューション
[CONTRIBUTING.md](./CONTRIBUTING.md) を参照

## 📄 ライセンス
MIT License
```

### 📁 ドキュメント体系

```
docs/
├── README.md                    # ドキュメントのホーム（目次）
├── introduction.md              # AEGISの詳細な紹介
│
├── 📗 user-guide/              # エンドユーザー向け
│   ├── README.md               # ユーザーガイド目次
│   ├── getting-started.md      # インストール・初期設定
│   ├── claude-desktop-setup.md # Claude Desktop統合
│   ├── policy-writing.md       # ポリシー記述ガイド
│   ├── web-ui.md              # Web UI使用方法
│   ├── tools-catalog.md       # 利用可能なツール一覧
│   └── examples.md            # 実践的な使用例
│
├── 📘 admin-guide/             # 管理者向け
│   ├── README.md              # 管理者ガイド目次
│   ├── configuration.md       # 詳細設定
│   ├── deployment.md          # 本番環境展開
│   ├── monitoring.md          # 監視・ログ管理
│   ├── governance.md          # ガバナンス運用
│   └── troubleshooting.md     # トラブルシューティング
│
├── 📙 developer-guide/         # 開発者向け
│   ├── README.md              # 開発者ガイド目次
│   ├── architecture.md        # システムアーキテクチャ
│   ├── api-reference.md       # API仕様
│   ├── mcp-integration.md     # MCP統合詳細
│   ├── agent-system.md        # エージェントシステム
│   ├── development.md         # 開発環境・テスト
│   └── extending.md           # 拡張・カスタマイズ
│
└── 📕 reference/               # リファレンス
    ├── changelog.md           # 変更履歴
    ├── roadmap.md            # 今後の計画
    ├── glossary.md           # 用語集
    └── faq.md                # よくある質問
```

## 移行内容

### README.mdから移動する内容

1. **→ introduction.md**
   - AEGISコンセプト（行33-43）
   - AEGISの由来と意義（行336-351）

2. **→ user-guide/getting-started.md**
   - 詳細なインストール手順（行45-59）
   - 環境設定の詳細

3. **→ user-guide/claude-desktop-setup.md**
   - Claude Desktop統合（行60-105）
   - 動作確認手順

4. **→ user-guide/web-ui.md**
   - Web UI詳細（行106-135）
   - React UI情報

5. **→ user-guide/examples.md**
   - 基本的な使用方法（行136-182）
   - ハイブリッドMCPプロキシ設定例（行184-212）

6. **→ developer-guide/architecture.md**
   - アーキテクチャ図と説明（行18-31）
   - プロジェクト構造（行214-233）

7. **→ developer-guide/development.md**
   - 開発・テスト（行235-284）
   - 新機能: Phase 3統合（行261-284）

8. **→ user-guide/tools-catalog.md**
   - 実際の動作例（行285-317）
   - ツール一覧

## 各ドキュメントの役割

### 📗 ユーザーガイド
**対象**: AEGISを使用する人（管理者、オペレーター）
- 具体的な手順
- 画面キャプチャ多め
- 実例中心

### 📘 管理者ガイド
**対象**: AEGISを運用・管理する人
- 本番環境の考慮事項
- セキュリティ設定
- パフォーマンスチューニング

### 📙 開発者ガイド
**対象**: AEGISを拡張・カスタマイズする人
- 技術的詳細
- APIリファレンス
- アーキテクチャ設計

### 📕 リファレンス
**対象**: 全員
- 変更履歴
- 用語定義
- FAQ

## メリット

1. **見つけやすさ**: 役割別に整理され、必要な情報に素早くアクセス
2. **保守性**: 各ドキュメントが適切なサイズ（50-200行）
3. **拡張性**: 新しいトピックを適切な場所に追加しやすい
4. **多言語対応**: 将来的に`docs/ja/`、`docs/en/`として展開可能