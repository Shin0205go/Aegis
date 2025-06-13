# AEGIS - Natural Language Policy Enforcement System 🛡️

> *"Governing AI Agents with the Shield of Intelligent Policy Control"*

**AEGIS** (Agent Governance & Enforcement Intelligence System) は、自然言語で記述されたポリシーを用いてAIエージェントのガバナンス統制とアクセス制御を行う次世代のインテリジェント・ポリシーエンフォースメントシステムです。

## ✨ 主要な特徴

- **🗣️ 自然言語ポリシー**: 複雑なXMLやJSONではなく、日本語の自然文でポリシーを記述
- **🧠 AI判定エンジン**: LLMを活用したインテリジェントなアクセス制御判定
- **🔍 自動コンテキスト収集**: エージェント、リソース、環境情報の自動収集・分析
- **⚡ リアルタイム制御**: MCPプロキシによる透明なアクセス制御
- **📊 統計・監視**: 包括的なアクセス分析とリアルタイム監視
- **⚖️ ガバナンス統制**: 企業レベルのポリシーガバナンスと執行管理

## 🏛️ アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AIエージェント   │───▶│   MCPプロキシ    │───▶│   上流システム    │
│                 │    │   (PEP)         │    │                 │
└─────────────────┘    └─────────┬───────┘    └─────────────────┘
                                  │
                                  ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ コンテキスト収集 │◀───│   AI判定エンジン  │───▶│  自然言語ポリシー │
│    (PIP)        │    │     (PDP)       │    │      (PAP)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 AEGIS コンセプト

**AEGIS**は古代ギリシャ神話のゼウスの盾の名前から取られており：

- **🛡️ Agent**: AIエージェントの保護と統制
- **🏛️ Governance**: 企業ガバナンス・ポリシー統治
- **⚖️ Enforcement**: 自動執行・強制力
- **🧠 Intelligence**: AI駆動のインテリジェント判定
- **🔧 System**: 統合システムソリューション

現代のAI環境における「デジタルの盾」として、複雑なポリシー要件を自然言語で表現し、AIの力で柔軟かつ確実に執行します。

## 🚀 クイックスタート

### インストール
```bash
npm install
npm run build
```

### Claude Desktop統合（推奨）

AEGISは既存のClaude Desktop MCP設定を自動的に読み込み、すべてのMCPサーバーにポリシー制御を適用できます：

1. `aegis-mcp-config.json`を作成（`aegis-mcp-config.example.json`をコピー）
2. Claude Desktopの設定：

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["/path/to/aegis-policy-engine/dist/src/mcp-server.js"],
      "env": {
        "CLAUDE_DESKTOP_CONFIG": "/path/to/aegis-policy-engine/aegis-mcp-config.json"
      }
    }
  }
}
```

**注意**: APIキーは環境変数で管理してください（`.env`ファイルまたはシェル設定）

### 基本的な使用方法
```typescript
import { AEGISController } from './src/core/controller';
import { OpenAILLM } from './src/llm/openai';

// LLMインスタンス初期化
const llm = new OpenAILLM({ apiKey: process.env.OPENAI_API_KEY });

// AEGIS制御システム初期化
const aegis = new AEGISController(llm);

// アクセス制御実行
const result = await aegis.controlAccess(
  'support-agent-001',           // エージェントID
  'read',                        // アクション
  'customer-database/profile',   // リソース
  'customer-support-inquiry'     // 目的
);

console.log('判定結果:', result.decision); // PERMIT/DENY/INDETERMINATE
console.log('理由:', result.reason);
```

### 自然言語ポリシーの例
```javascript
const customerDataPolicy = `
【顧客データアクセスポリシー】

基本原則：
- 顧客データは顧客サポート業務の目的でのみアクセス可能
- アクセスは営業時間内（平日9-18時）を基本とする
- 適切なクリアランスレベル（standard以上）が必要

制限事項：
- 外部エージェントのアクセスは禁止
- 個人情報の外部システム送信は一切禁止
- 個人情報の長期間保存（30日超）は禁止

必須対応：
- 全アクセスの詳細ログ記録
- データ処理完了後の関係者通知
- 30日後の自動削除予約設定
`;

// ポリシー追加
aegis.addPolicy('customer-data-policy', customerDataPolicy);
```

## 📁 プロジェクト構造

```
aegis-policy-engine/
├── src/
│   ├── core/           # コアシステム
│   ├── ai/             # AI判定エンジン
│   ├── context/        # コンテキスト収集
│   ├── mcp/            # MCPプロキシ
│   ├── policies/       # ポリシー管理
│   ├── monitoring/     # 監視・統計
│   └── utils/          # ユーティリティ
├── policies/           # ポリシーファイル
├── examples/           # 使用例
├── tests/              # テストコード
└── docs/               # ドキュメント
```

## 🔧 開発・テスト

```bash
# 開発サーバー起動
npm run dev

# テスト実行
npm test

# ビルド
npm run build

# MCPプロキシサーバー起動 (stdio)
npm run start:mcp

# MCPプロキシサーバー起動 (HTTP)
npm run start:mcp:http
```

## 📚 ドキュメント

- [はじめに](./docs/getting-started.md) - インストールと起動方法
- [アーキテクチャ設計](./docs/architecture.md) - システム構成の詳細
- [自然言語ポリシー記述ガイド](./docs/policy-writing-guide.md) - ポリシーの書き方
- [API リファレンス](./docs/api-reference.md) - APIの詳細仕様
- [デプロイメントガイド](./docs/deployment.md) - 本番環境への展開
- [ガバナンス運用ガイド](./docs/governance-guide.md) - 運用管理のベストプラクティス

## 🤝 コントリビューション

コントリビューションを歓迎します！詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

## 📄 ライセンス

MIT License - 詳細は [LICENSE](./LICENSE) ファイルをご覧ください。

## 🛡️ AEGIS の由来と意義

**AEGIS** は古代ギリシャ神話に登場するゼウスの盾の名前です。この盾は絶対的な保護を象徴し、持つ者に無敵の力を与えるとされていました。

私たちのAEGISシステムも同様に、AIエージェントとデータリソースを守る「デジタルの盾」として機能し、インテリジェントで柔軟なポリシー制御により、現代の複雑なAI環境における**ガバナンス統制**と**セキュリティ保護**を実現します。

### 🏛️ エンタープライズガバナンス

- **統制の透明性**: 自然言語ポリシーによる明確なルール定義
- **監査対応**: 包括的なアクセスログと意思決定記録
- **コンプライアンス**: GDPR、SOX等の規制要件への自動対応
- **リスク管理**: AIによるリアルタイムリスク評価と制御

---

**Built with ❤️ by the AEGIS Governance Team**