# AEGIS ドキュメント

AEGIS (Agent Governance & Enforcement Intelligence System) のドキュメントへようこそ。

## 📖 ドキュメントガイド

### 📗 [ユーザーガイド](./user-guide/)
AEGISを使用する方向けのガイドです。

- **[導入・初期設定](./user-guide/getting-started.md)** - インストールから基本設定まで
- **[Claude Desktop統合](./user-guide/claude-desktop-setup.md)** - Claude Desktopとの連携方法
- **[ポリシー記述ガイド](./user-guide/policy-writing.md)** - 自然言語ポリシーの書き方
- **[Web UI使用方法](./user-guide/web-ui.md)** - Web UIの各機能の使い方
- **[利用可能なツール一覧](./user-guide/tools-catalog.md)** - 制御対象のツールカタログ
- **[実践的な使用例](./user-guide/examples.md)** - よくある使用パターン

### 📘 [管理者ガイド](./admin-guide/)
AEGISを運用・管理する方向けのガイドです。

- **[詳細設定](./admin-guide/configuration.md)** - 環境変数と設定オプション
- **[本番環境展開](./admin-guide/deployment.md)** - プロダクション環境への展開
- **[監視・ログ管理](./admin-guide/monitoring.md)** - 監査ログとモニタリング
- **[ガバナンス運用](./admin-guide/governance.md)** - ポリシーガバナンスのベストプラクティス
- **[トラブルシューティング](./admin-guide/troubleshooting.md)** - よくある問題と解決方法

### 📙 [開発者ガイド](./developer-guide/)
AEGISを拡張・カスタマイズする開発者向けのガイドです。

- **[システムアーキテクチャ](./developer-guide/architecture.md)** - システム設計と構成
- **[API リファレンス](./developer-guide/api-reference.md)** - REST APIとSDKの仕様
- **[MCP統合詳細](./developer-guide/mcp-integration.md)** - MCPプロキシの実装詳細
- **[エージェントシステム](./developer-guide/agent-system.md)** - エージェント識別と管理
- **[開発環境・テスト](./developer-guide/development.md)** - 開発環境構築とテスト方法
- **[拡張・カスタマイズ](./developer-guide/extending.md)** - カスタム機能の追加方法

### 📕 [リファレンス](./reference/)
全ユーザー向けの参考情報です。

- **[変更履歴](./reference/changelog.md)** - バージョン別の変更内容
- **[今後の計画](./reference/roadmap.md)** - 開発ロードマップ
- **[用語集](./reference/glossary.md)** - AEGIS関連の用語解説
- **[よくある質問](./reference/faq.md)** - FAQ

### 🚀 [ODRLハイブリッドポリシーエンジン](../src/odrl/)
AIの過度な厳格さを解決する新しいハイブリッド判定システムです。

- **[📚 ODRLドキュメントインデックス](./ODRL_INDEX.md)** - 全ODRLドキュメントへの統一アクセスポイント
- **[ODRLテストガイド](../ODRL_TEST_GUIDE.md)** - 今すぐテストを実行する方法
- **[実装ロジック詳解](./ODRL_IMPLEMENTATION_LOGIC.md)** - なぜODRLを導入したか、どう動作するか
- **[判定フロー図解](./ODRL_DECISION_FLOW.md)** - 判定の詳細な流れとパターン
- **[アーキテクチャ概要](./ODRL_ARCHITECTURE_OVERVIEW.md)** - システム全体構成と設計
- **[ODRLテスト実践ガイド](./odrl-testing-guide.md)** - 包括的なテスト方法

## 🎯 はじめての方へ

1. **ユーザーの方**: [導入・初期設定](./user-guide/getting-started.md) から始めてください
2. **管理者の方**: [詳細設定](./admin-guide/configuration.md) で環境設定を確認してください
3. **開発者の方**: [システムアーキテクチャ](./developer-guide/architecture.md) で全体像を把握してください

## 📚 その他のドキュメント

- **[AEGISの紹介](./introduction.md)** - AEGISのコンセプトと意義
- **[MCPデザインガイド](./mcp-design.md)** - MCP統合の詳細設計
- **[AEGIS vs Claude IAM](./aegis-vs-claude-iam.md)** - 他システムとの比較

## 🔗 関連リンク

- [GitHubリポジトリ](https://github.com/youraccount/aegis-policy-engine)
- [問題報告](https://github.com/youraccount/aegis-policy-engine/issues)
- [コントリビューションガイド](../CONTRIBUTING.md)

---

ドキュメントに関する質問や改善提案がありましたら、[Issue](https://github.com/youraccount/aegis-policy-engine/issues) でお知らせください。