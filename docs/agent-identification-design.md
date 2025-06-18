# エージェント識別メカニズム設計書

## 概要

AEGISプロキシにおけるエージェント識別の統一的なメカニズムを定義し、将来的なAgent-to-Agentプロトコルとの統合を見据えた拡張可能な設計を提供します。

## 現状の課題

1. **MCPプロトコルの制約**
   - プロトコル自体にエージェント識別機能がない
   - クライアント認証メカニズムが標準化されていない

2. **トランスポート依存の識別**
   - stdio: 接続元情報なし
   - HTTP: ヘッダーベースの識別可能
   - WebSocket: セッション管理可能

3. **暫定的な実装**
   - ハードコードされた`mcp-client`識別子
   - 実際のエージェントとの紐付けなし

## 提案する統一識別アーキテクチャ

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

// 実装例
class StdioIdentificationStrategy implements IdentificationStrategy {
  canHandle(context: ConnectionContext): boolean {
    return context.transport === 'stdio';
  }
  
  async identify(context: ConnectionContext): Promise<AgentIdentifier> {
    // 環境変数やプロセス情報から推測
    const processInfo = context.processInfo;
    
    // Claude Desktopの検出
    if (processInfo?.env?.CLAUDE_DESKTOP === 'true') {
      return {
        id: 'claude-desktop-default',
        type: AgentType.CLAUDE_DESKTOP,
        protocol: 'mcp',
        authMethod: AuthMethod.NONE,
        metadata: {
          name: 'Claude Desktop',
          sessionId: generateSessionId()
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

class HttpIdentificationStrategy implements IdentificationStrategy {
  canHandle(context: ConnectionContext): boolean {
    return context.transport === 'http';
  }
  
  async identify(context: ConnectionContext): Promise<AgentIdentifier> {
    const headers = context.headers;
    
    // APIキー認証
    if (headers['x-api-key']) {
      return await this.identifyByApiKey(headers['x-api-key']);
    }
    
    // User-Agentベース
    if (headers['user-agent']?.includes('Claude-Code')) {
      return {
        id: `claude-code-${generateHash(headers)}`,
        type: AgentType.CLAUDE_CODE,
        protocol: 'mcp',
        authMethod: AuthMethod.SESSION,
        metadata: {
          name: 'Claude Code',
          sessionId: headers['x-session-id']
        }
      };
    }
    
    // デフォルト
    return {
      id: `http-client-${context.remoteAddress}`,
      type: AgentType.UNKNOWN,
      protocol: 'mcp',
      authMethod: AuthMethod.NONE
    };
  }
}
```

### 3. 統合識別マネージャー

```typescript
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

### 4. Agent-to-Agent統合準備

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

### Phase 1: 基本実装（短期）
1. `AgentIdentifier`インターフェースの定義
2. 基本的な識別戦略の実装（stdio, http）
3. 既存コードのリファクタリング

### Phase 2: 拡張実装（中期）
1. セッション管理の追加
2. 認証メカニズムの統合
3. エージェントプロファイル管理

### Phase 3: A2A統合（長期）
1. A2A互換インターフェースの実装
2. 相互運用性の確保
3. 完全な統合テスト

## 設定例

```yaml
# aegis-config.yaml
agent_identification:
  strategies:
    - type: stdio
      config:
        default_type: claude-desktop
        detection_rules:
          - env: CLAUDE_DESKTOP
            type: claude-desktop
          - process_name: claude-code
            type: claude-code
    
    - type: http
      config:
        auth_required: false
        api_key_header: x-api-key
        user_agent_mapping:
          - pattern: "Claude-Code/*"
            type: claude-code
          - pattern: "Claude-Desktop/*"
            type: claude-desktop
    
    - type: custom
      class: com.example.CustomIdentificationStrategy
      config:
        custom_param: value

  session_management:
    enabled: true
    ttl: 3600
    storage: redis

  a2a_compatibility:
    enabled: false  # 将来的に有効化
    adapter: default
```

## セキュリティ考慮事項

1. **なりすまし防止**
   - User-Agentのみに依存しない
   - 可能な限り認証を使用

2. **セッション管理**
   - セッションハイジャック対策
   - 適切なタイムアウト設定

3. **監査証跡**
   - すべての識別試行をログ
   - 異常パターンの検出

## まとめ

この設計により：
- 現在のMCP制約下でも柔軟な識別が可能
- 将来的なA2A統合への準備が整う
- プラガブルで拡張可能なアーキテクチャ
- セキュリティと利便性のバランス