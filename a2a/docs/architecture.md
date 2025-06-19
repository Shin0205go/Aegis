# A2A-AEGIS-MCP 統合アーキテクチャ

## 🏗️ 正しいアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                  外部クライアント                              │
└─────────────────────┬───────────────────────────────────────┘
                      │ A2Aリクエスト
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                A2Aエージェント層                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │Coordinator │  │ Research   │  │ Writing Agent        │  │
│  │Agent       │  │ Agent      │  │ (MCPクライアント)     │  │
│  │(MCPクライ  │  │(MCPクライ   │  │                      │  │
│  │ アント)    │  │ アント)    │  │                      │  │
│  └──────┬─────┘  └──────┬─────┘  └──────┬───────────────┘  │
└─────────┼───────────────┼───────────────┼───────────────────┘
          │               │               │
          │ MCPプロトコル  │ MCPプロトコル  │ MCPプロトコル
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              AEGIS MCPプロキシサーバー                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ポリシーエンジン (自然言語ポリシー評価)                  ││
│  │ - エージェント認証・識別                                 ││
│  │ - アクセス制御判定                                       ││
│  │ - 制約・義務の適用                                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────────────────┘
                      │ MCPプロトコル（許可されたリクエストのみ）
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                上流MCPサーバー群                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │filesystem  │  │execution-  │  │その他のMCPサーバー    │ │
│  │tools       │  │server      │  │(Gmail, Drive, etc.)  │ │
│  └────────────┘  └────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 重要な統合ポイント

### 1. A2AエージェントはMCPクライアント
- 各A2Aエージェントは、MCPクライアントとして実装
- タスク処理時に必要なツールをMCP経由で呼び出し
- すべてのMCPアクセスはAEGISプロキシを通過

### 2. AEGIS MCPプロキシでポリシー制御
- A2Aエージェントの識別
- 委譲チェーンの追跡
- ツール実行の許可/拒否
- 制約・義務の適用

### 3. 統合のメリット
- A2Aの水平通信とMCPの垂直通信の統合
- 統一されたポリシー制御
- 完全な監査証跡

## 📝 実装の修正点

### 現在の実装
```typescript
// ❌ 独自の模擬ポリシーエンジン
class AEGISPolicyEnforcer {
  private async simulatePolicyEvaluation(context) {
    // シミュレーションコード
  }
}

// ❌ MCPクライアント機能なし
class A2AAgent {
  protected async processTask(task) {
    // 独自の処理のみ
  }
}
```

### 正しい実装
```typescript
// ✅ MCPクライアントとしてAEGISプロキシに接続
import { MCPClient } from '@modelcontextprotocol/client';

class A2AAgent {
  private mcpClient: MCPClient;

  constructor(config) {
    super(config);
    
    // AEGIS MCPプロキシに接続
    this.mcpClient = new MCPClient({
      url: 'http://localhost:3000/mcp', // AEGISプロキシ
      transport: 'http',
      metadata: {
        agentId: config.name,
        agentType: 'a2a-agent'
      }
    });
  }

  protected async processTask(task) {
    // MCPツールを使用
    const tools = await this.mcpClient.listTools();
    
    // 例: ファイルシステムツールを使用
    const result = await this.mcpClient.callTool({
      name: 'filesystem__read_file',
      arguments: {
        path: '/path/to/file'
      }
    });
    
    // AEGIS側でポリシーチェックされる
  }
}
```

## 🔄 移行計画

### Phase 1: MCPクライアント機能追加
1. A2AエージェントにMCPクライアント機能を実装
2. AEGIS MCPプロキシへの接続設定
3. 基本的なツール呼び出しのテスト

### Phase 2: ポリシー統合
1. エージェント識別情報の伝達
2. 委譲チェーンのメタデータ追加
3. 実際のポリシー制御のテスト

### Phase 3: 完全統合
1. すべてのA2Aタスク処理をMCP経由に
2. 模擬ポリシーエンジンの削除
3. E2Eテストの更新

## 🎯 統合後の動作例

```typescript
// Research Agentがファイルを読む場合
async performResearch(prompt: string) {
  // MCPツールリスト取得（AEGIS経由）
  const tools = await this.mcpClient.listTools();
  // → AEGISがエージェントを識別し、利用可能なツールを返す
  
  // ファイル読み取り（AEGIS経由）
  const content = await this.mcpClient.callTool({
    name: 'filesystem__read_file',
    arguments: { path: '/docs/research.md' }
  });
  // → AEGISがポリシーチェック
  // → 許可されればファイル内容を返す
  // → 拒否されればエラー
  
  // 結果の処理
  return this.processContent(content);
}
```

## 📌 注意事項

1. **現在のデモは概念実証**
   - A2Aプロトコルの動作確認
   - ポリシー制御の概念デモ
   - 実際のMCP統合は未実装

2. **本番実装に必要な作業**
   - MCPクライアントライブラリの統合
   - AEGIS MCPプロキシとの接続
   - エージェント認証メカニズム
   - メタデータ伝達の標準化

3. **互換性の維持**
   - 既存のA2Aプロトコルは維持
   - MCPアクセスは内部実装
   - 外部APIは変更なし