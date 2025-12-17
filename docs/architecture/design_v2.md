# 🛡️ Project Aegis: AI-Native Data Space Connector

**Version:** 2.0 (Rust Rewrite Edition)
**Status:** Planning / PoC
**Author:** Shingo Matsuo

---

## 1. 概要 (Executive Summary)

**Aegis** は、AIエージェント（LLM）と分散型データスペース（Gaia-X / Catena-X 等）を接続するための、軽量かつインテリジェントなゲートウェイソフトウェアである。

既存の標準実装（Eclipse Dataspace Components: EDC）が抱える「重量（Java製）」「設定の複雑さ（手動ODRL記述）」という課題を解決するため、**Rustによる軽量実装**と、**LLMによるポリシー設定の自動化（抽象化）**を提供する。

最終的には、車両（Honda Vezel）やIoTエッジデバイス上で動作し、中央集権的なクラウドを介さずに、**ユーザー主導で安全なデータ取引**を実現することを目指す。

---

## 2. 設計思想 (Design Philosophy)

### 1. **AI-Native Interface**
- 複雑なポリシー言語（ODRL/JSON-LD）を人間やAIエージェントに書かせない
- 自然言語による意図（Intent）を解釈し、プロトコルへ自動変換する

### 2. **Edge-First (Rust)**
- KubernetesやJVMを不要とする
- シングルバイナリで動作し、省メモリ・高速起動を実現
- 車載マイコン（Linux/ESP32）での稼働を前提とする

### 3. **Sovereignty by Design**
- データの実体はローカル（所有者の手元）に置く
- リクエストがあった時のみ、ポリシーに基づいて加工・フィルタリングして提供（Compute-to-Data）

---

## 3. システムアーキテクチャ (Architecture)

Aegisは、**北向き（Northbound）**にAIとの対話インターフェースを持ち、**南向き（Southbound）**にデータスペースとの通信機能を持つ。

```mermaid
graph TD
    %% ユーザー領域
    subgraph "User / Edge Device (Vezel)"
        User[👤 User]
        AI[🤖 AI Agent\n(Claude Desktop / Autonomous Driver)]

        %% Aegis Core
        subgraph "🛡️ Aegis Core (Rust Binary)"
            MCP[🔌 MCP Server Interface\n(JSON-RPC)]

            subgraph "Brain (Logic)"
                Translator[🗣️ Policy Translator\n(NL -> ODRL)]
                Guard[👮 Data Guardian\n(Access Control)]
            end

            DSP[🌐 DSP Client\n(Dataspace Protocol)]
        end

        LocalDB[(🔒 Local Data\nSQLite / CAN Bus)]
    end

    %% 外部領域
    subgraph "External World"
        CloudLLM[☁️ LLM API\n(Anthropic/OpenAI)]
        OtherOrg[🏢 Other Organization\n(EDC Connector)]
    end

    %% 通信フロー
    User -->|1. 'データを守りつつ共有して'| AI
    AI <==>|2. MCP Protocol| MCP
    MCP --> Translator
    Translator <==>|3. Infer Policy| CloudLLM
    Translator -->|4. Generate ODRL| DSP
    DSP <==>|5. Contract Negotiation| OtherOrg

    OtherOrg -->|6. Request Data| DSP
    DSP --> Guard
    Guard <==>|7. Fetch & Mask| LocalDB
    Guard -->|8. Secure Data| DSP
```

---

## 4. コンポーネント詳細

### 4.1. Northbound: MCP Server (Rust)

**役割:** AIエージェント（クライアント）との窓口

**技術:** `mcp-rs` (または自作JSON-RPCハンドラ) over Stdio/SSE

**機能:**
- `list_tools`: 「データ契約を結ぶ」「データを検索する」などのツール定義を提供
- `call_tool`: AIからの指示を受け、内部ロジックをキックする

---

### 4.2. The Brain: Policy Translator & Guardian

**役割:** 「抽象化」の核となるロジック

#### Policy Translator
- **入力:** 「研究目的以外は禁止、期間は1週間」
- **出力:** ODRL Policy (JSON-LD)
- **実装:** テンプレートエンジン + LLMによるパラメータ抽出

#### Data Guardian
- 実際のデータアクセス時に介入
- 生データをそのまま渡さず、ポリシーに従って「マスキング」「集計」「拒否」を行う

---

### 4.3. Southbound: DSP Client (Rust)

**役割:** 外部のEDCコネクタと会話するプロトコルスタック

**技術:**
- `reqwest` (HTTP Client)
- `axum` (HTTP Server for Callbacks)

**機能:**
- **Catalog Request:** 相手が持っているデータカタログを取得
- **Contract Negotiation:** ODRLポリシーを提示し、合意形成を行う（握手）
- **Transfer Process:** 実際のデータ転送を制御する

---

## 5. 開発ロードマップ

### Phase 1: MVP (Minimal Viable Product) - The "Mock"

**目標:** AIエージェントとRustアプリが繋がり、擬似的なデータ取引ができる

- [x] Rustプロジェクトのセットアップ (`cargo new`)
- [ ] MCPプロトコルの基本実装 (Hello World)
- [ ] 自然言語ポリシーを受け取り、ログに出すだけのモック実装
- [ ] SQLiteからのデータ読み出しと単純なフィルタリング

---

### Phase 2: Protocol Awareness - The "Translator"

**目標:** 内部的に正しいODRL/JSON-LDを生成できるようにする

- [ ] ODRLのRust構造体定義 (`struct Policy { ... }`)
- [ ] 自然言語 → ODRLの変換ロジック実装
- [ ] 生成されたJSON-LDの検証

---

### Phase 3: Connectivity - The "Connector"

**目標:** 外部サーバー（まずは自分でもう一つ立てたAegis）と通信する

- [ ] HTTPサーバー機能の追加 (`axum`)
- [ ] Aegis同士でのP2P通信の実装
- [ ] AWS等のデータスペースとの接続検証

---

## 6. 技術スタック選定理由

| 技術 | 理由 |
|------|------|
| **Rust** | メモリ安全性と実行速度。車載などの組み込み環境へのデプロイ容易性 |
| **Tokio / Axum** | Rustエコシステムにおける非同期通信のデファクトスタンダード |
| **MCP** | 2025年以降のAIエージェント標準プロトコルとして採用 |
| **SQLite** | エッジでのデータ保持に最適。管理コストゼロ |

---

## 7. 現状のTypeScript実装との関係

現在のプロジェクト（TypeScript版）は、MCPプロキシとして完全に動作しており、以下の機能が実装されています：

- ✅ 自然言語ポリシーエンジン（PDP）
- ✅ MCPプロキシサーバー（PEP）
- ✅ コンテキスト収集（PIP）
- ✅ ポリシー管理（PAP）
- ✅ 高度な制約・義務処理（EnforcementSystem）

この**Version 2.0 (Rust Rewrite)**は、上記の実装知見を活かしつつ、以下を目指します：

1. **エッジデバイスでの動作** - 省メモリ・高速起動
2. **データスペースプロトコル対応** - DSP/ODRL完全実装
3. **車載環境での実用化** - CAN Bus統合、車両データのセキュアな共有

---

## 8. 次のステップ

まずは **「Phase 1」のMCP部分** を動かすことに集中しましょう。

これが動けば、設計図の左半分（**User ⇔ AI ⇔ Aegis**）が開通します。

### 具体的なタスク：

1. Rust MCPサーバーの基本骨格を実装
2. Claude Desktopとの接続テスト
3. シンプルなツール（`hello_world`など）の動作確認

---

## 付録：参考情報

### Gaia-X / Catena-X とは
- **Gaia-X:** 欧州主導のデータスペースイニシアティブ
- **Catena-X:** 自動車業界向けデータエコシステム（サプライチェーン連携）

### ODRL (Open Digital Rights Language)
- デジタルコンテンツの利用条件を記述するW3C標準言語
- JSON-LD形式で記述され、ポリシー（許可・禁止・義務）を表現

### DSP (Dataspace Protocol)
- データスペース間の相互運用プロトコル
- カタログ取得、契約交渉、データ転送のフローを標準化
