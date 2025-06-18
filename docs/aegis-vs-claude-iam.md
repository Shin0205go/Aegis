# AEGIS vs Claude Code IAM - アーキテクチャ比較と相互補完

## 概要

このドキュメントでは、AEGIS Policy EngineとClaude Code IAMの違いを明確にし、両システムがどのように相互補完的に動作するかを説明します。

## 1. システムの位置づけ

### Claude Code IAM
- **役割**: Claude Code内部のツール使用許可制御
- **動作レベル**: アプリケーションレベル
- **制御方式**: 静的ルールベース
- **設定主体**: エンドユーザーまたは企業管理者

### AEGIS Policy Engine
- **役割**: MCPプロトコルレベルでの動的アクセス制御
- **動作レベル**: プロトコル/プロキシレベル
- **制御方式**: 自然言語ポリシー + AI判定
- **設定主体**: セキュリティ管理者/コンプライアンス担当者

## 2. アーキテクチャにおける位置関係

```
┌─────────────────────────────────────────┐
│         Claude Code Application         │
│  ┌───────────────────────────────────┐  │
│  │      Claude Code IAM Layer        │  │ ← ツール使用の許可/拒否
│  │  - Static permission rules        │  │
│  │  - Tool allow/deny lists          │  │
│  └───────────────────────────────────┘  │
│                    ↓                    │
│         IAM Check: Can I use this tool? │
│                    ↓                    │
│  ┌───────────────────────────────────┐  │
│  │        MCP Client Library         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                     ↓
              MCPプロトコル
                     ↓
┌─────────────────────────────────────────┐
│          AEGIS Policy Engine            │ ← 動的ポリシー制御
│  ┌───────────────────────────────────┐  │
│  │   Natural Language Policy Engine  │  │
│  │  - Context-aware decisions        │  │
│  │  - AI-powered judgment            │  │
│  │  - Compliance & audit logging     │  │
│  └───────────────────────────────────┘  │
│                    ↓                    │
│    Policy Check: How/When/Why to use?  │
└─────────────────────────────────────────┘
                     ↓
              MCPプロトコル
                     ↓
┌─────────────────────────────────────────┐
│        Upstream MCP Servers             │
│  (filesystem, gmail, drive, etc.)       │
└─────────────────────────────────────────┘
```

## 3. 制御の観点比較

| 制御観点 | Claude Code IAM | AEGIS Policy Engine |
|---------|----------------|-------------------|
| **What（何を）** | ✓ どのツールを使用可能か | ✓ どのリソースにアクセス可能か |
| **How（どのように）** | ✗ | ✓ アクセス方法の制約（読み取り専用、匿名化等） |
| **When（いつ）** | ✗ | ✓ 時間ベースの制御（営業時間内のみ等） |
| **Where（どこで）** | ✗ | ✓ 場所ベースの制御（社内ネットワークのみ等） |
| **Why（なぜ）** | ✗ | ✓ アクセス目的の検証 |
| **Who（誰が）** | △ ユーザーレベル | ✓ エージェント識別とプロファイリング |
| **Context（文脈）** | ✗ | ✓ 状況に応じた動的判断 |

## 4. 具体的な制御例

### Claude Code IAM の設定例
```json
{
  "permissions": [
    {
      "tool": "filesystem__read_file",
      "action": "allow"
    },
    {
      "tool": "filesystem__write_file",
      "action": "deny"
    },
    {
      "tool": "bash",
      "action": "allow",
      "specifier": "ls, cat, grep"
    }
  ]
}
```

### AEGIS Policy Engine のポリシー例
```typescript
const policy = `
ファイルシステムアクセスポリシー：

【基本原則】
- ファイルの読み取りは原則許可
- ただし、個人情報を含むファイルは特別な扱い

【アクセス条件】
- 個人情報ファイル（*.personal, *.private）へのアクセス：
  - 営業時間内（9:00-18:00）のみ許可
  - アクセス理由の明示が必要
  - 全アクセスの監査ログ記録
  - データは自動的に匿名化して返却

【制限事項】
- 機密ファイル（*.secret, *.confidential）：
  - 管理者承認なしにアクセス不可
  - アクセス試行は即座に通知

【時間外アクセス】
- 緊急時のみ、理由を明記した上で許可
- 上長への事後報告義務
`;
```

## 5. ユースケース別の動作

### ケース1: 通常のファイル読み取り
```
1. Claude Code IAM: filesystem__read_file → ALLOW
2. AEGIS: /project/README.md → PERMIT（制約なし）
3. 結果: ファイル内容をそのまま返却
```

### ケース2: 個人情報ファイルの読み取り（営業時間内）
```
1. Claude Code IAM: filesystem__read_file → ALLOW
2. AEGIS: /users/personal.csv → PERMIT（制約あり）
   - 制約: データ匿名化
   - 義務: 監査ログ記録
3. 結果: 匿名化されたデータを返却、アクセスログ記録
```

### ケース3: 機密ファイルへのアクセス試行
```
1. Claude Code IAM: filesystem__read_file → ALLOW
2. AEGIS: /secrets/api-keys.txt → DENY
   - 理由: 管理者承認なし
   - 義務: セキュリティチームへの通知
3. 結果: アクセス拒否、インシデント通知送信
```

## 6. 相互補完のメリット

### 1. **多層防御（Defense in Depth）**
- IAMレベルで基本的な制御
- AEGISレベルで高度な制御
- 両方を突破するのは困難

### 2. **柔軟性の確保**
- IAM: シンプルで理解しやすい静的ルール
- AEGIS: 複雑な条件を自然言語で表現

### 3. **既存環境への影響最小化**
- Claude Codeの設定変更不要
- 透明プロキシとして動作
- 段階的な導入が可能

### 4. **コンプライアンス対応**
- IAMだけでは対応困難な規制要件
- 動的な監査ログと証跡
- ポリシーの一元管理

### 5. **拡張性**
- 他のMCPクライアントにも適用可能
- 将来的なAgent-to-Agentプロトコル対応
- 新しい制御要件への対応が容易

## 7. 実装における考慮事項

### パフォーマンス
- IAMチェックは即座に完了
- AEGIS判定には若干の遅延（AI判定）
- キャッシュによる高速化

### エラーハンドリング
- IAM拒否: 即座にエラー返却
- AEGIS拒否: 詳細な理由とともにエラー返却
- 両者の拒否理由を区別可能

### 管理の分離
- IAM: 開発者/ユーザーが管理
- AEGIS: セキュリティ/コンプライアンスチームが管理
- 責任分界点が明確

## 8. 将来の統合可能性

### 統合シナリオ1: メタデータ共有
```typescript
// Claude Code IAMからのヒント情報
interface IAMContext {
  tool: string;
  userPermissions: string[];
  enterprisePolicy?: any;
}

// AEGISでの活用
class AEGISDecisionEngine {
  async decide(request: MCPRequest, iamContext?: IAMContext) {
    // IAM情報を考慮した判定
    if (iamContext?.enterprisePolicy?.requiresAudit) {
      this.enforceAuditLogging();
    }
  }
}
```

### 統合シナリオ2: フィードバックループ
- AEGIS判定結果をIAMにフィードバック
- 頻繁な拒否パターンを学習
- IAMルールの自動提案

## 9. まとめ

AEGIS Policy EngineとClaude Code IAMは、異なるレイヤーで動作する相互補完的なシステムです：

- **IAM**: 「何を使えるか」を制御（アプリケーションレベル）
- **AEGIS**: 「どのように使うか」を制御（プロトコルレベル）

両システムを組み合わせることで、シンプルさと高度な制御を両立させ、エンタープライズ環境で求められる厳格なガバナンスを実現できます。