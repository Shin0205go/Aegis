# エージェント名統合ガイド

## 概要

本ドキュメントでは、AEGISプロキシにおけるエージェント名の現状と、Claude Codeを含む各種MCPクライアントとの統合方法について説明します。

## 現状の課題

### 1. MCPプロトコルの制約
MCPプロトコル自体にはクライアント識別のための標準的なメカニズムが存在しません：

```typescript
// MCPリクエストの例（エージェント情報なし）
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "filesystem__read_file",
    "arguments": {
      "path": "/example.txt"
    }
  }
}
```

### 2. 現在の暫定実装

#### stdio-proxy.ts
```typescript
// 現在の実装：全てのstdio接続を'mcp-client'として扱う
const baseContext: DecisionContext = {
  agent: 'mcp-client', // stdioでは識別子が限定的
  action,
  resource,
  // ...
};
```

#### 問題点
- Claude Codeかその他のクライアントかを区別できない
- エージェント固有のポリシー適用が困難
- 監査ログでの追跡が不正確

## Claude Codeとの統合方法

### 方法1: 環境変数による識別（推奨・短期）

Claude Desktopの設定で環境変数を追加：

```json
{
  "mcpServers": {
    "aegis-proxy": {
      "command": "node",
      "args": ["dist/src/mcp-server.js"],
      "env": {
        "AEGIS_AGENT_NAME": "claude-code",
        "AEGIS_AGENT_TYPE": "claude-desktop",
        "AEGIS_SESSION_ID": "unique-session-id"
      }
    }
  }
}
```

AEGIS側の実装：
```typescript
class StdioAgentIdentifier {
  identify(context: ConnectionContext): AgentIdentifier {
    const env = process.env;
    
    return {
      id: env.AEGIS_AGENT_NAME || 'unknown-mcp-client',
      type: env.AEGIS_AGENT_TYPE || 'generic',
      metadata: {
        sessionId: env.AEGIS_SESSION_ID,
        processId: process.pid,
        startTime: new Date()
      }
    };
  }
}
```

### 方法2: プロセス情報による推測（中期）

```typescript
class ProcessBasedIdentifier {
  async identify(context: ConnectionContext): Promise<AgentIdentifier> {
    const parentProcess = await this.getParentProcess();
    
    // プロセス名から推測
    if (parentProcess.name.includes('Claude')) {
      return {
        id: 'claude-desktop-' + generateHash(parentProcess),
        type: 'claude-desktop',
        metadata: {
          processName: parentProcess.name,
          processPath: parentProcess.path
        }
      };
    }
    
    // デフォルト
    return { id: 'unknown-stdio-client', type: 'unknown' };
  }
}
```

### 方法3: 初回ハンドシェイク（長期・推奨）

MCPプロトコルの拡張提案：

```typescript
// 接続開始時のハンドシェイク
interface MCPHandshake {
  method: "initialize",
  params: {
    clientInfo: {
      name: string;        // "Claude Code"
      version: string;     // "1.0.0"
      identifier: string;  // "claude-code-12345"
      capabilities?: string[];
    }
  }
}

// AEGIS側の処理
class HandshakeBasedIdentifier {
  private clientInfo: Map<string, ClientInfo> = new Map();
  
  async handleHandshake(request: MCPHandshake, sessionId: string) {
    this.clientInfo.set(sessionId, request.params.clientInfo);
    
    return {
      id: request.params.clientInfo.identifier,
      type: this.inferType(request.params.clientInfo.name),
      metadata: {
        name: request.params.clientInfo.name,
        version: request.params.clientInfo.version,
        capabilities: request.params.clientInfo.capabilities
      }
    };
  }
}
```

## 実装ロードマップ

### Phase 1: 環境変数ベース（即座に実装可能）

1. **AEGIS側の変更**
```typescript
// src/mcp/stdio-proxy.ts の修正
private async enforcePolicy(action: string, resource: string, context: any): Promise<AccessControlResult> {
  const baseContext: DecisionContext = {
    agent: process.env.AEGIS_AGENT_NAME || 'mcp-client',
    action,
    resource,
    // ...
  };
}
```

2. **ドキュメント更新**
```markdown
# Claude Desktop設定例
mcpServers.jsonに以下を追加：
"env": {
  "AEGIS_AGENT_NAME": "claude-code"
}
```

### Phase 2: エージェントプロファイル拡張

1. **エージェントデータベースの更新**
```typescript
// src/context/enrichers/agent-info.ts
const AGENT_DATABASE = new Map([
  ['claude-code', {
    id: 'claude-code',
    type: 'ai-assistant',
    department: 'development',
    clearanceLevel: 3,
    permissions: ['read-files', 'write-files', 'execute-tools'],
    tags: ['ide', 'development', 'trusted'],
    riskScore: 0.2
  }],
  ['claude-desktop', {
    id: 'claude-desktop',
    type: 'ai-assistant',
    department: 'general',
    clearanceLevel: 2,
    permissions: ['read-files', 'execute-tools'],
    tags: ['desktop', 'general-purpose'],
    riskScore: 0.3
  }]
]);
```

### Phase 3: 動的エージェント管理

1. **設定ファイルによる管理**
```yaml
# aegis-agents.yaml
agents:
  claude-code:
    type: ai-assistant
    clearanceLevel: 3
    permissions:
      - read-files
      - write-files
      - execute-tools
    policies:
      - developer-policy
      - code-assistant-policy
    
  custom-client:
    type: external
    clearanceLevel: 1
    permissions:
      - read-public-files
    policies:
      - restricted-access-policy
```

## 移行ガイド

### 既存の'mcp-client'からの移行

1. **後方互換性の維持**
```typescript
// ポリシー選択ロジックの更新
private selectApplicablePolicy(resource: string, agent?: string): string {
  // 後方互換性：mcp-clientとclaude-*を同等に扱う
  if (agent === 'mcp-client' || agent?.startsWith('claude-')) {
    return 'claude-desktop-policy';
  }
  // ...
}
```

2. **段階的移行**
- Week 1-2: 環境変数サポートの追加
- Week 3-4: ログとモニタリングで新旧エージェント名を追跡
- Week 5-6: ポリシーを新しいエージェント名に更新
- Week 7-8: 古い'mcp-client'のサポート終了

## ベストプラクティス

### 1. エージェント命名規則
```
<product>-<type>-<instance>

例：
- claude-code-default
- claude-desktop-user123
- custom-client-prod
```

### 2. セキュリティ考慮事項
- エージェント名は信頼できるソースから取得
- なりすまし防止のための検証
- 不明なエージェントはデフォルトで低権限

### 3. 監査とトレーサビリティ
```typescript
interface AuditEntry {
  agentId: string;          // 具体的なエージェント名
  agentType: string;        // カテゴリ
  agentMetadata: {
    source: string;         // 識別方法（env, process, handshake）
    confidence: number;     // 識別の信頼度
  };
}
```

## トラブルシューティング

### エージェントが'unknown'と識別される場合

1. **環境変数の確認**
```bash
# AEGIS起動時の環境変数を確認
echo $AEGIS_AGENT_NAME
```

2. **ログの確認**
```typescript
// デバッグログの追加
this.logger.debug('Agent identification', {
  providedAgent: process.env.AEGIS_AGENT_NAME,
  fallbackAgent: 'mcp-client',
  finalAgent: agent
});
```

3. **ポリシーのテスト**
```bash
# 特定のエージェントでポリシーをテスト
AEGIS_AGENT_NAME=claude-code npm run test:policy
```

## 今後の展望

### Agent-to-Agentプロトコルとの統合

将来的なA2Aプロトコルでは、エージェント識別が標準化される予定：

```typescript
interface A2AAgentIdentity {
  // 暗号学的に検証可能な識別子
  publicKey: string;
  signature: string;
  
  // メタデータ
  profile: {
    name: string;
    type: string;
    capabilities: string[];
    trustChain: string[];
  };
}
```

AEGISは、現在の暫定的な識別方法から、将来の標準化された方法へスムーズに移行できるよう設計されています。

## まとめ

エージェント名の統合は、以下のステップで進めることを推奨します：

1. **短期**: 環境変数による識別（即座に実装可能）
2. **中期**: プロセス情報やハンドシェイクによる自動識別
3. **長期**: 標準化されたプロトコルへの対応

この段階的アプローチにより、既存システムへの影響を最小限に抑えながら、より精密なエージェント識別とポリシー制御を実現できます。