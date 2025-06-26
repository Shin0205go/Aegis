# AEGIS - Natural Language Policy Enforcement System 🛡️

> AIエージェントの自然言語ポリシー制御を実現する、次世代のインテリジェント・ガバナンスシステム

## ✨ 主要な特徴

- **🗣️ 自然言語ポリシー**: 複雑なXMLやJSONではなく、日本語の自然文でポリシーを記述
- **🧠 AI判定エンジン**: LLMを活用したインテリジェントなアクセス制御判定
- **🚀 ODRLハイブリッド判定**: ルールベース（ODRL）とAIを組み合わせた高速・柔軟な判定
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

# AEGIS起動（HTTPモード: MCP機能 + Web UI）
node scripts/mcp-launcher.js

# または stdio モードで起動（Claude Desktop用）
node scripts/mcp-launcher.js stdio

# ODRLハイブリッドエンジンのテスト
npm run test:odrl:demo  # デモ実行
npm run test:odrl:quick # クイックテスト
```

### MCP Inspector でのテスト

MCP Inspector を使用して AEGIS Policy Engine の動作をインタラクティブにテストできます：

```bash
# テストスクリプトを実行
cd test/mcp-inspector && ./test-with-inspector.sh

# またはプロジェクトルートから直接実行
npx @modelcontextprotocol/inspector node dist/src/mcp-server.js
```

詳細は [MCP Inspector セットアップガイド](docs/guides/mcp-inspector-setup.md) を参照してください。

## 🔌 トランスポートモード

AEGISは2つのトランスポートモードをサポートしています：

### stdioモード（Claude Desktop統合用）
- **用途**: Claude Desktopとの統合
- **通信**: 標準入出力（stdio）経由のJSON-RPC
- **管理UI**: http://localhost:3000 で別途提供
- **起動方法**: `node mcp-launcher.js stdio`

### HTTPモード（Webアプリケーション統合用）
- **用途**: Claude.ai、Webアプリケーション、リモートアクセス
- **通信**: Streamable HTTP（単一エンドポイントでPOST/GET/DELETEに対応）
- **MCPエンドポイント**: `http://localhost:3000/mcp/messages`
  - POST: JSON-RPCリクエスト送信
  - GET: SSEストリーム確立（Server-Sent Events）
  - DELETE: セッション終了
- **管理UI**: 同じポートで提供
- **起動方法**: `node mcp-launcher.js` または `node mcp-launcher.js http`

### ポート設定
デフォルトポートは3000ですが、以下の環境変数で変更可能：
- `AEGIS_MANAGEMENT_PORT`: 最優先（管理UIとMCPエンドポイント）
- `MCP_PROXY_PORT`: 次優先
- デフォルト: 3000

詳細な手順は [導入ガイド](./docs/user-guide/getting-started.md) を参照してください。
ODRLハイブリッド判定については [ODRLテストガイド](./ODRL_TEST_GUIDE.md) を参照してください。

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

### 🚀 [ODRLハイブリッドポリシーエンジン](./src/odrl/)
- [ODRLテストガイド](./ODRL_TEST_GUIDE.md) - 今すぐテストを実行
- [実装ロジック詳解](./docs/ODRL_IMPLEMENTATION_LOGIC.md) - なぜODRLを導入したか
- [判定フロー図解](./docs/ODRL_DECISION_FLOW.md) - 判定の詳細な流れ
- [アーキテクチャ概要](./docs/ODRL_ARCHITECTURE_OVERVIEW.md) - システム全体構成
- [ODRLテスト実践ガイド](./docs/odrl-testing-guide.md) - 包括的なテスト方法

## 🎯 AEGIS とは

**AEGIS** (Agent Governance & Enforcement Intelligence System) は、古代ギリシャ神話のゼウスの盾の名前から取られています。現代のAI環境における「デジタルの盾」として、AIエージェントとデータリソースを保護します。

詳細は [AEGISの紹介](./docs/introduction.md) を参照してください。

## 🤝 コントリビューション

コントリビューションを歓迎します！詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

## 📄 ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルをご覧ください。

---

**Built with ❤️ by the AEGIS Governance Team**