# AEGIS - Natural Language Policy Enforcement System 🛡️

> AIエージェントの自然言語ポリシー制御を実現する、次世代のインテリジェント・ガバナンスシステム

## ✨ 主要な特徴

- **🗣️ 自然言語ポリシー**: 複雑なXMLやJSONではなく、日本語の自然文でポリシーを記述
- **🧠 AI判定エンジン**: LLMを活用したインテリジェントなアクセス制御判定
- **🔍 自動コンテキスト収集**: エージェント、リソース、環境情報の自動収集・分析
- **⚡ リアルタイム制御**: MCPプロキシによる透明なアクセス制御
- **📊 統計・監視**: 包括的なアクセス分析とリアルタイム監視
- **⚖️ ガバナンス統制**: 企業レベルのポリシーガバナンスと執行管理
- **🔧 ユニバーサル制御**: あらゆるMCPツールを自然言語で動的に制御

## 🚀 クイックスタート

```bash
# インストール
npm install && npm run build

# 環境設定
cp .env.example .env
# ANTHROPIC_API_KEY または OPENAI_API_KEY を設定

# AEGIS起動（Web UIも同時起動）
node mcp-launcher.js
```

詳細な手順は [導入ガイド](./docs/user-guide/getting-started.md) を参照してください。

## 📚 ドキュメント

### 🏠 [ドキュメントホーム](./docs/)
プロジェクト概要とガイド一覧

### 📗 [ユーザーガイド](./docs/user-guide/)
- [導入・初期設定](./docs/user-guide/getting-started.md)
- [Claude Desktop統合](./docs/user-guide/claude-desktop-setup.md)
- [ポリシー記述ガイド](./docs/user-guide/policy-writing.md)
- [Web UI使用方法](./docs/user-guide/web-ui.md)

### 📘 [管理者ガイド](./docs/admin-guide/)
- [詳細設定](./docs/admin-guide/configuration.md)
- [本番環境展開](./docs/admin-guide/deployment.md)
- [監視・ログ管理](./docs/admin-guide/monitoring.md)

### 📙 [開発者ガイド](./docs/developer-guide/)
- [システムアーキテクチャ](./docs/developer-guide/architecture.md)
- [API リファレンス](./docs/developer-guide/api-reference.md)
- [開発・テスト](./docs/developer-guide/development.md)

### 📕 [リファレンス](./docs/reference/)
- [変更履歴](./docs/reference/changelog.md)
- [今後の計画](./docs/reference/roadmap.md)
- [よくある質問](./docs/reference/faq.md)

## 🎯 AEGIS とは

**AEGIS** (Agent Governance & Enforcement Intelligence System) は、古代ギリシャ神話のゼウスの盾の名前から取られています。現代のAI環境における「デジタルの盾」として、AIエージェントとデータリソースを保護します。

詳細は [AEGISの紹介](./docs/introduction.md) を参照してください。

## 🤝 コントリビューション

コントリビューションを歓迎します！詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

## 📄 ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルをご覧ください。

---

**Built with ❤️ by the AEGIS Governance Team**