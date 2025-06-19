# 用語集

AEGISで使用される専門用語の解説です。アルファベット順、五十音順で整理しています。

## アルファベット順

### A

**AEGIS**
- Agent Governance & Enforcement Intelligence System の略
- AIエージェントのガバナンス統制とアクセス制御を行うシステム

**Agent（エージェント）**
- MCPプロトコルを通じてリソースにアクセスするクライアント
- Claude Desktop、GitHub Copilot、自動化ツールなどを含む

**API Key（APIキー）**
- AEGISのREST APIにアクセスするための認証トークン
- Bearer認証方式で使用

**Audit Log（監査ログ）**
- すべてのアクセス要求と判定結果を記録したログ
- コンプライアンスと分析のために使用

### C

**Cache（キャッシュ）**
- ポリシー判定結果を一時的に保存する仕組み
- パフォーマンス向上のために使用

**Clearance Level（クリアランスレベル）**
- エージェントのセキュリティ権限レベル
- basic、standard、elevated、critical などのレベルがある

**Constraint（制約）**
- PERMITの判定に付加される制限事項
- データ匿名化、レート制限、地理的制限など

**Context（コンテキスト）**
- ポリシー判定に使用される状況情報
- エージェント、時間、場所、目的などを含む

### D

**Decision（判定）**
- ポリシー評価の結果
- PERMIT（許可）、DENY（拒否）、INDETERMINATE（不確定）のいずれか

**Dynamic Discovery（動的発見）**
- 実行時に新しいMCPツールを自動的に検出する機能

### E

**Enforcement（執行）**
- ポリシー判定に基づいてアクセスを制御すること
- 制約の適用と義務の実行を含む

**Enricher（エンリッチャー）**
- コンテキスト情報を拡張するコンポーネント
- エージェント情報、時間情報、セキュリティ情報などを追加

### L

**LLM（Large Language Model）**
- 大規模言語モデル
- 自然言語ポリシーの理解と判定に使用

### M

**MCP（Model Context Protocol）**
- AIモデルが外部ツールと対話するための標準プロトコル
- Anthropic社が開発

**Metadata（メタデータ）**
- ポリシーやエージェントに関する追加情報
- バージョン、作成者、タグなどを含む

### N

**Natural Language Policy（自然言語ポリシー）**
- 日本語や英語などの自然言語で記述されたポリシー
- XMLやJSONではなく、人間が読みやすい形式

### O

**Obligation（義務）**
- アクセス許可後に実行すべきアクション
- ログ記録、通知送信、データ削除予約など

### P

**PAP（Policy Administration Point）**
- ポリシー管理ポイント
- ポリシーの作成、更新、削除を担当

**PDP（Policy Decision Point）**
- ポリシー判定ポイント
- アクセス要求に対してPERMIT/DENYを判定

**PEP（Policy Enforcement Point）**
- ポリシー執行ポイント
- MCPプロキシサーバーとして実装

**PIP（Policy Information Point）**
- ポリシー情報ポイント
- 判定に必要なコンテキスト情報を収集

**Plugin（プラグイン）**
- AEGISの機能を拡張するモジュール
- カスタムエンジン、ツール、制約などを追加可能

**Proxy（プロキシ）**
- MCPクライアントと上流サーバーの間に立つ中継サーバー
- すべてのリクエストをインターセプトして制御

### R

**Rate Limiting（レート制限）**
- 一定時間内のアクセス回数を制限する機能
- DoS攻撃の防止とリソース保護のため

**Resource（リソース）**
- アクセス対象となるデータやサービス
- ファイル、データベース、APIエンドポイントなど

### S

**SSE（Server-Sent Events）**
- サーバーからクライアントへの単方向リアルタイム通信
- 監査イベントのストリーミングに使用

**Session（セッション）**
- エージェントの認証済み接続状態
- 一定期間有効な認証トークンを含む

### T

**Tool（ツール）**
- MCPプロトコルで実行可能な機能単位
- ファイル操作、コード実行、Web検索など

**Transport（トランスポート）**
- MCPメッセージの通信方式
- stdio（標準入出力）またはHTTP/SSE

### U

**Upstream（上流）**
- プロキシから見た接続先のMCPサーバー
- Gmail、Google Drive、GitHubなどのサービス

### V

**Validation（検証）**
- 入力データやポリシーの妥当性チェック
- セキュリティと整合性のために重要

## 五十音順

### あ行

**アクセス制御（Access Control）**
- リソースへのアクセスを管理・制限すること
- 認証、認可、監査を含む

**異常検知（Anomaly Detection）**
- 通常と異なるアクセスパターンを検出する機能
- 機械学習を使用して実装

**インターセプト（Intercept）**
- リクエストを途中で捕捉して処理すること
- ポリシー制御のために必要

### か行

**監査証跡（Audit Trail）**
- アクセスと判定の完全な記録
- コンプライアンスと分析のために保存

**キャッシュ（Cache）**
- → Cache を参照

**クリアランスレベル（Clearance Level）**
- → Clearance Level を参照

**コンテキスト（Context）**
- → Context を参照

### さ行

**制約（Constraint）**
- → Constraint を参照

**自然言語ポリシー（Natural Language Policy）**
- → Natural Language Policy を参照

### た行

**動的発見（Dynamic Discovery）**
- → Dynamic Discovery を参照

**トランスポート（Transport）**
- → Transport を参照

### は行

**判定（Decision）**
- → Decision を参照

**プラグイン（Plugin）**
- → Plugin を参照

**プロキシ（Proxy）**
- → Proxy を参照

### ま行

**メタデータ（Metadata）**
- → Metadata を参照

### や行

**義務（Obligation）**
- → Obligation を参照

### ら行

**レート制限（Rate Limiting）**
- → Rate Limiting を参照

**リソース（Resource）**
- → Resource を参照

## 略語一覧

| 略語 | 正式名称 | 説明 |
|------|----------|------|
| AEGIS | Agent Governance & Enforcement Intelligence System | 本システムの名称 |
| API | Application Programming Interface | アプリケーション間の通信インターフェース |
| CORS | Cross-Origin Resource Sharing | 異なるオリジン間のリソース共有 |
| CRUD | Create, Read, Update, Delete | 基本的なデータ操作 |
| E2E | End-to-End | 端から端まで |
| GDPR | General Data Protection Regulation | EU一般データ保護規則 |
| HSM | Hardware Security Module | ハードウェアセキュリティモジュール |
| HTTP | HyperText Transfer Protocol | ハイパーテキスト転送プロトコル |
| HTTPS | HTTP Secure | 暗号化されたHTTP |
| JSON | JavaScript Object Notation | データ交換フォーマット |
| JWT | JSON Web Token | 認証トークンの形式 |
| LLM | Large Language Model | 大規模言語モデル |
| MCP | Model Context Protocol | モデルコンテキストプロトコル |
| OIDC | OpenID Connect | 認証プロトコル |
| PAP | Policy Administration Point | ポリシー管理ポイント |
| PDP | Policy Decision Point | ポリシー判定ポイント |
| PEP | Policy Enforcement Point | ポリシー執行ポイント |
| PIP | Policy Information Point | ポリシー情報ポイント |
| RBAC | Role-Based Access Control | 役割ベースアクセス制御 |
| REST | Representational State Transfer | Webサービスの設計原則 |
| SAML | Security Assertion Markup Language | セキュリティ認証マークアップ言語 |
| SDK | Software Development Kit | ソフトウェア開発キット |
| SIEM | Security Information and Event Management | セキュリティ情報イベント管理 |
| SLA | Service Level Agreement | サービスレベル契約 |
| SOAR | Security Orchestration, Automation and Response | セキュリティオーケストレーション |
| SOX | Sarbanes-Oxley Act | 米国企業改革法 |
| SSE | Server-Sent Events | サーバー送信イベント |
| TLS | Transport Layer Security | 暗号化通信プロトコル |
| UI | User Interface | ユーザーインターフェース |
| UUID | Universally Unique Identifier | 汎用一意識別子 |
| XML | eXtensible Markup Language | 拡張可能マークアップ言語 |
| XSS | Cross-Site Scripting | クロスサイトスクリプティング |

## 関連用語

### セキュリティ関連
- **ゼロトラスト**: すべてのアクセスを検証する原則
- **最小権限の原則**: 必要最小限の権限のみ付与
- **職務分離**: 重要な操作を複数人で分担

### ガバナンス関連
- **コンプライアンス**: 法規制への準拠
- **監査対応**: 外部監査への準備と対応
- **リスク管理**: リスクの特定と軽減

### AI/ML関連
- **ファインチューニング**: モデルの追加学習
- **プロンプトエンジニアリング**: 効果的なプロンプト作成
- **説明可能AI**: 判定理由を説明できるAI

---

この用語集は継続的に更新されます。新しい用語の追加要望は [Issue](https://github.com/youraccount/aegis-policy-engine/issues) でお知らせください。