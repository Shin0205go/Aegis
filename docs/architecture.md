# AEGIS アーキテクチャ設計書

## 📋 目次

1. [概要](#概要)
2. [システム全体構成](#システム全体構成)
3. [コンポーネント詳細](#コンポーネント詳細)
4. [データフロー](#データフロー)
5. [技術スタック](#技術スタック)
6. [セキュリティ設計](#セキュリティ設計)
7. [スケーラビリティ](#スケーラビリティ)

## 概要

AEGIS (Agent Governance & Enforcement Intelligence System) は、自然言語ポリシーとAI判定エンジンを活用した次世代のアクセス制御システムです。従来のXACMLなどの複雑な記述形式を必要とせず、日本語で記述したポリシーをAIが理解・判定することで、柔軟で強力なガバナンス統制を実現します。

### 主要な設計原則

- **透明性**: MCPプロキシにより、既存のエージェントシステムを改修することなく制御を導入
- **柔軟性**: 自然言語によるポリシー記述で、複雑な条件も直感的に表現
- **拡張性**: プラグイン可能なアーキテクチャで、新しいコンテキスト情報源を容易に追加
- **信頼性**: AI判定の信頼度スコアとフォールバック機構により安定した動作を保証

## システム全体構成

```mermaid
graph TB
    subgraph "AIエージェント層"
        A1[AIエージェント1]
        A2[AIエージェント2]
        A3[AIエージェントN]
    end
    
    subgraph "AEGIS制御層"
        PEP[PEP<br/>MCPプロキシサーバー]
        PDP[PDP<br/>AI判定エンジン]
        PIP[PIP<br/>コンテキスト収集]
        PAP[PAP<br/>ポリシー管理]
    end
    
    subgraph "上流システム層"
        U1[Gmail MCP]
        U2[Google Drive MCP]
        U3[Slack MCP]
        U4[その他MCPサーバー]
    end
    
    A1 & A2 & A3 -->|MCP Protocol| PEP
    PEP <--> PIP
    PEP <--> PDP
    PDP <--> PAP
    PEP -->|Proxy| U1 & U2 & U3 & U4
```

## コンポーネント詳細

### 1. PEP (Policy Enforcement Point) - MCPプロキシサーバー

**責務**: すべてのMCPリクエストをインターセプトし、ポリシー制御を透明に実行

**主要機能**:
- MCP公式仕様準拠のトランスポート実装
  - stdio（標準入出力）- 推奨
  - Streamable HTTP（HTTPストリーミング）
- リクエスト/レスポンスのインターセプト
- 制約・義務の実行
- 上流サーバーへの透過的プロキシ

**実装詳細**:
```typescript
// src/mcp/proxy.ts
export class MCPPolicyProxy {
  // WebSocketサーバーとしてMCPプロトコルを実装
  private wss: WebSocketServer;
  private contextCollector: ContextCollector;
  private judgmentEngine: AIJudgmentEngine;
  
  async handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    // 1. コンテキスト構築
    const context = await this.buildContext(request);
    
    // 2. ポリシー判定
    const decision = await this.judgmentEngine.makeDecision(policy, context);
    
    // 3. 判定に基づく処理
    if (decision.decision === 'PERMIT') {
      return this.proxyToUpstream(request, decision.constraints);
    } else {
      return this.createDenyResponse(decision.reason);
    }
  }
}
```

### 2. PDP (Policy Decision Point) - AI判定エンジン

**責務**: 自然言語ポリシーを解釈し、コンテキストに基づいて判定を実行

**主要機能**:
- 自然言語ポリシーの解釈
- LLMを使用した柔軟な判定
- キャッシュによる高速化
- バッチ判定のサポート

**判定プロセス**:
1. ポリシーをシステムプロンプトに変換
2. コンテキスト情報を構造化
3. LLMに判定を依頼
4. 結果の検証とキャッシュ

### 3. PIP (Policy Information Point) - コンテキスト収集

**責務**: 判定に必要な環境情報を収集・拡張

**エンリッチャーカテゴリ**:

#### 時間ベース情報エンリッチャー
- 営業時間判定
- 祝日・週末判定
- タイムゾーン考慮

#### エージェント情報エンリッチャー
- クリアランスレベル
- 部署・役職情報
- 信頼度スコア計算

#### リソース分類エンリッチャー
- データ種別（PII、PHI、財務等）
- 機密度レベル
- 保持期間要件

#### セキュリティ情報エンリッチャー
- IPアドレス分析
- VPN接続判定
- 脅威スコア計算

### 4. PAP (Policy Administration Point) - ポリシー管理

**責務**: 自然言語ポリシーのライフサイクル管理

**主要機能**:
- ポリシーCRUD操作
- バージョン管理
- メタデータ管理
- インポート/エクスポート

## データフロー

### 1. 通常のアクセス制御フロー

```mermaid
sequenceDiagram
    participant Agent as AIエージェント
    participant PEP as PEP(MCPプロキシ)
    participant PIP as PIP(コンテキスト)
    participant PDP as PDP(AI判定)
    participant Upstream as 上流サーバー
    
    Agent->>PEP: MCPリクエスト
    PEP->>PIP: コンテキスト収集依頼
    PIP-->>PEP: 拡張コンテキスト
    PEP->>PDP: 判定依頼
    PDP-->>PEP: 判定結果(PERMIT)
    PEP->>Upstream: プロキシリクエスト
    Upstream-->>PEP: レスポンス
    PEP-->>Agent: フィルタリングされたレスポンス
```

### 2. アクセス拒否フロー

```mermaid
sequenceDiagram
    participant Agent as AIエージェント
    participant PEP as PEP(MCPプロキシ)
    participant PDP as PDP(AI判定)
    participant Log as 監査ログ
    
    Agent->>PEP: MCPリクエスト
    PEP->>PDP: 判定依頼
    PDP-->>PEP: 判定結果(DENY)
    PEP->>Log: 違反記録
    PEP-->>Agent: エラーレスポンス
```

## 技術スタック

### バックエンド
- **言語**: TypeScript (Node.js)
- **フレームワーク**: Express.js
- **AI/LLM**: OpenAI API / Anthropic Claude API

### インフラストラクチャ
- **コンテナ**: Docker
- **オーケストレーション**: Kubernetes (本番環境)
- **ロードバランサー**: NGINX
- **キャッシュ**: Redis

### 監視・ログ
- **ログ**: Winston
- **メトリクス**: Prometheus
- **可視化**: Grafana
- **トレーシング**: OpenTelemetry

## セキュリティ設計

### 1. 認証・認可
- **エージェント認証**: APIキーベース認証
- **管理者認証**: OAuth 2.0 / SAML
- **役割ベースアクセス制御**: ポリシー管理権限の分離

### 2. データ保護
- **転送時暗号化**: TLS 1.3
- **保存時暗号化**: AES-256
- **ポリシー署名**: デジタル署名による改ざん防止

### 3. 監査・コンプライアンス
- **完全監査証跡**: すべての判定とアクセスの記録
- **改ざん防止ログ**: ブロックチェーン連携（オプション）
- **規制対応**: GDPR、HIPAA、PCI-DSS準拠設計

## スケーラビリティ

### 水平スケーリング

```yaml
# Kubernetes設定例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aegis-pep
spec:
  replicas: 3  # 負荷に応じて自動スケール
  template:
    spec:
      containers:
      - name: pep
        image: aegis/pep:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### キャッシング戦略

1. **判定キャッシュ**: 同一条件の判定結果を一定期間キャッシュ
2. **コンテキストキャッシュ**: 頻繁に参照される情報をメモリキャッシュ
3. **ポリシーキャッシュ**: コンパイル済みポリシーをRedisに保存

### パフォーマンス最適化

- **バッチ処理**: 複数のリクエストを一括判定
- **非同期処理**: 義務実行の非同期化
- **接続プーリング**: 上流サーバーへの接続再利用

## 拡張ポイント

### 1. カスタムエンリッチャー
```typescript
export class CustomEnricher implements ContextEnricher {
  name = 'custom-enricher';
  
  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    // カスタムロジックでコンテキストを拡張
    return {
      customField: await this.fetchCustomData(context)
    };
  }
}
```

### 2. カスタム制約・義務
```typescript
export class CustomConstraint implements Constraint {
  async apply(data: any, params: any): Promise<any> {
    // データ変換やフィルタリング
    return transformedData;
  }
}
```

### 3. 外部システム連携
- **SIEM連携**: セキュリティイベントの転送
- **ワークフロー連携**: 承認フローの自動化
- **通知連携**: Slack、メール通知

## まとめ

AEGISのアーキテクチャは、従来の複雑なポリシー記述システムを自然言語とAIで置き換えることで、以下を実現します：

1. **導入の容易さ**: MCPプロキシによる透明な統合
2. **運用の簡素化**: 自然言語によるポリシー管理
3. **高度な柔軟性**: AIによる動的な判定
4. **エンタープライズ対応**: スケーラビリティとセキュリティ

この設計により、現代の複雑なAI環境において、効果的なガバナンス統制を実現します。