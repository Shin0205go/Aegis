# エージェント設計と統合ガイド

## 概要

AEGISプロキシにおけるエージェント識別の統一的なメカニズムを定義し、Claude Codeを含む各種MCPクライアントとの統合、そして将来的なAgent-to-Agentプロトコルとの統合を見据えた拡張可能な設計を提供します。

## 現状の課題

### 1. MCPプロトコルの制約
- プロトコル自体にエージェント識別機能がない
- クライアント認証メカニズムが標準化されていない
- リクエストにエージェント情報が含まれない

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

### 2. トランスポート依存の識別
- **stdio**: 接続元情報なし、環境変数に依存
- **HTTP**: ヘッダーベースの識別可能
- **WebSocket**: セッション管理可能

### 3. 暫定的な実装の問題
- ハードコードされた`mcp-client`識別子
- Claude Codeかその他のクライアントかを区別できない
- エージェント固有のポリシー適用が困難

## 統一識別アーキテクチャ

### 1. エージェント識別インターフェース

```typescript
interface AgentIdentifier {
  // コア識別情報
  id: string;                    // 一意識別子
  type: AgentType;              // エージェントタイプ
  protocol: string;             // 使用プロトコル（mcp, a2a等）
  
  // 認証情報
  authMethod?: AuthMethod;      // 認証方式
  credentials?: any;            // 認証クレデンシャル
  
  // メタデータ
  metadata?: {
    name?: string;              // 人間可読な名前
    organization?: string;      // 所属組織
    purpose?: string;           // 利用目的
    sessionId?: string;         // セッションID
    version?: string;           // クライアントバージョン
    capabilities?: string[];    // 機能リスト
  };
}

enum AgentType {
  CLAUDE_CODE = 'claude-code',
  CLAUDE_DESKTOP = 'claude-desktop',
  CUSTOM_CLIENT = 'custom-client',
  SERVICE_AGENT = 'service-agent',
  UNKNOWN = 'unknown'
}

enum AuthMethod {
  NONE = 'none',
  API_KEY = 'api-key',
  OAUTH = 'oauth',
  CERTIFICATE = 'certificate',
  SESSION = 'session'
}
```

### 2. 識別戦略パターン

```typescript
interface IdentificationStrategy {
  canHandle(context: ConnectionContext): boolean;
  identify(context: ConnectionContext): Promise<AgentIdentifier>;
}

// 統合識別マネージャー
class AgentIdentificationManager {
  private strategies: IdentificationStrategy[] = [];
  private cache: Map<string, AgentIdentifier> = new Map();
  
  constructor() {
    // デフォルト戦略の登録
    this.registerStrategy(new StdioIdentificationStrategy());
    this.registerStrategy(new HttpIdentificationStrategy());
    this.registerStrategy(new WebSocketIdentificationStrategy());
  }
  
  registerStrategy(strategy: IdentificationStrategy): void {
    this.strategies.push(strategy);
  }
  
  async identifyAgent(context: ConnectionContext): Promise<AgentIdentifier> {
    // キャッシュチェック
    const cacheKey = this.getCacheKey(context);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // 適切な戦略を選択
    for (const strategy of this.strategies) {
      if (strategy.canHandle(context)) {
        const identifier = await strategy.identify(context);
        this.cache.set(cacheKey, identifier);
        return identifier;
      }
    }
    
    // フォールバック
    return {
      id: 'unknown-agent',
      type: AgentType.UNKNOWN,
      protocol: 'unknown',
      authMethod: AuthMethod.NONE
    };
  }
}
```

## Claude Codeとの統合

### 方法1: 環境変数による識別（推奨・短期）

**Claude Desktop設定**:
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

**AEGIS実装**:
```typescript
class StdioIdentificationStrategy implements IdentificationStrategy {
  canHandle(context: ConnectionContext): boolean {
    return context.transport === 'stdio';
  }
  
  async identify(context: ConnectionContext): Promise<AgentIdentifier> {
    const env = process.env;
    
    // Claude Desktopの検出
    if (env.AEGIS_AGENT_NAME?.includes('claude')) {
      return {
        id: env.AEGIS_AGENT_NAME,
        type: this.inferAgentType(env.AEGIS_AGENT_NAME),
        protocol: 'mcp',
        authMethod: AuthMethod.NONE,
        metadata: {
          name: env.AEGIS_AGENT_NAME,
          sessionId: env.AEGIS_SESSION_ID || generateSessionId(),
          processId: process.pid,
          startTime: new Date().toISOString()
        }
      };
    }
    
    // デフォルト
    return {
      id: 'stdio-client-default',
      type: AgentType.UNKNOWN,
      protocol: 'mcp',
      authMethod: AuthMethod.NONE
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
        type: AgentType.CLAUDE_DESKTOP,
        metadata: {
          processName: parentProcess.name,
          processPath: parentProcess.path
        }
      };
    }
    
    return { id: 'unknown-stdio-client', type: AgentType.UNKNOWN };
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
```

## エージェントプロファイル管理

### エージェントデータベース

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

### 設定ファイルによる管理

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

## Agent-to-Agent統合準備

### A2A互換インターフェース

```typescript
// 将来的なA2A統合のためのインターフェース
interface A2ACompatibleIdentifier extends AgentIdentifier {
  // A2A固有の識別情報
  a2aProfile?: {
    publicKey?: string;        // 公開鍵
    capabilities?: string[];   // エージェント能力
    trustChain?: string[];     // 信頼チェーン
    reputation?: number;       // レピュテーションスコア
  };
}

// 変換アダプター
class MCPToA2AAdapter {
  convertIdentifier(mcpIdentifier: AgentIdentifier): A2ACompatibleIdentifier {
    return {
      ...mcpIdentifier,
      a2aProfile: {
        capabilities: this.inferCapabilities(mcpIdentifier),
        reputation: this.calculateReputation(mcpIdentifier)
      }
    };
  }
}
```

## 実装ロードマップ

### Phase 1: 基本実装（即座に実装可能）

1. **環境変数サポート**
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

2. **後方互換性の維持**
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

### Phase 2: 拡張実装（中期）

1. セッション管理の追加
2. 認証メカニズムの統合
3. エージェントプロファイル管理
4. プロセス情報による自動識別

### Phase 3: A2A統合（長期）

1. A2A互換インターフェースの実装
2. 相互運用性の確保
3. 暗号学的に検証可能な識別子
4. 完全な統合テスト

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
- User-Agentのみに依存しない

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

## まとめ

この設計により：
- 現在のMCP制約下でも柔軟な識別が可能
- Claude Codeとの即座の統合が可能
- 将来的なA2A統合への準備が整う
- プラガブルで拡張可能なアーキテクチャ
- セキュリティと利便性のバランス

段階的アプローチにより、既存システムへの影響を最小限に抑えながら、より精密なエージェント識別とポリシー制御を実現できます。