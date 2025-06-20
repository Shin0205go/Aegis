# システムアーキテクチャ

AEGISの全体的なシステム設計と、各コンポーネントの詳細な説明です。

## 🏛️ アーキテクチャ概要

AEGISは、自然言語ポリシーとMCPプロキシを組み合わせた革新的なアクセス制御システムです。

```
┌─────────────────────────────────────────────────────────────┐
│                    AIエージェント層                          │
├─────────────────────────────────────────────────────────────┤
│           MCPクライアント（各種AIエージェント）                │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCPリクエスト
                  ▼
┌─────────────────────────────────────────────────────────────┐
│    PEP (Policy Enforcement Point) - MCPプロキシサーバー      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │リクエスト    │ │判定エンジン  │ │制約・義務               │ │
│  │インターセプト│ │呼び出し      │ │実行                     │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────┬───────────────────┬───────────────────────────────┘
          │                   │
          ▼                   ▼
┌─────────────────┐    ┌─────────────────────────────────────┐
│PIP              │    │PDP                                  │
│(Policy Info     │    │(Policy Decision Point)             │
│Point)           │    │自然言語ポリシー判定エンジン          │
│コンテキスト      │    │                                     │
│情報収集・拡張    │    │┌─────────────┐ ┌─────────────────┐│
│                 │    ││自然言語      │ │AI判定           ││
│┌─────────────┐  │    ││ポリシー      │ │(LLM)            ││
││エージェント  │  │    ││→システム     │ │                 ││
││情報取得      │  │    ││プロンプト変換│ │PERMIT/DENY/     ││
│└─────────────┘  │    │└─────────────┘ │INDETERMINATE    ││
│┌─────────────┐  │    │                 └─────────────────┘│
││リソース分類  │  │    │                                     │
│└─────────────┘  │    └─────────────────────────────────────┘
│┌─────────────┐  │                        ▲
││時間・場所    │  │                        │
││セキュリティ  │  │                        │
│└─────────────┘  │    ┌─────────────────────────────────────┐
└─────────────────┘    │PAP                                  │
          │             │(Policy Administration Point)       │
          │             │自然言語ポリシー管理                 │
          │             │                                     │
          │             │┌─────────────┐ ┌─────────────────┐│
          │             ││ポリシー作成  │ │バージョン管理   ││
          │             ││更新・削除    │ │メタデータ管理   ││
          │             │└─────────────┘ └─────────────────┘│
          │             └─────────────────────────────────────┘
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    上流MCPサーバー群                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │Gmail MCP    │ │Google Drive │ │その他各種MCPサーバー     │ │
│  │サーバー     │ │MCPサーバー   │ │(Slack, Calendar, etc.)  │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🧩 主要コンポーネント

### 1. PEP (Policy Enforcement Point) - MCPプロキシサーバー

**役割**: すべてのMCPリクエストをインターセプトし、ポリシー制御を透明に実行

```typescript
export class MCPProxyServer implements PolicyEnforcementPoint {
  private server: Server;
  private pdp: PolicyDecisionPoint;
  private pip: PolicyInformationPoint;
  private enforcementSystem: EnforcementSystem;
  
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    // 1. コンテキスト構築
    const context = await this.buildContext(request);
    
    // 2. PIPによる情報拡張
    const enrichedContext = await this.pip.enrich(context);
    
    // 3. PDP判定
    const decision = await this.pdp.evaluate(enrichedContext);
    
    // 4. 判定に基づく処理
    if (decision.decision === 'PERMIT') {
      // 制約適用
      const processedRequest = await this.applyConstraints(request, decision.constraints);
      
      // 上流サーバーへプロキシ
      const response = await this.proxyToUpstream(processedRequest);
      
      // 義務実行
      await this.executeObligations(decision.obligations, context, response);
      
      return response;
    } else {
      throw new AccessDeniedError(decision.reason);
    }
  }
}
```

**主要機能**:
- 透明プロキシとして動作
- リクエストの事前・事後処理
- 制約と義務の実行管理
- 監査ログの自動記録

### 2. PDP (Policy Decision Point) - ハイブリッド判定エンジン

**役割**: ODRLルールベース判定とAI判定を組み合わせた高速・柔軟な判定を行う

> **📝 注**: 最新の実装では、AIの過度な厳格さを解決するため、ODRLハイブリッドエンジンを採用しています。
> 詳細は[ODRLアーキテクチャ概要](../ODRL_ARCHITECTURE_OVERVIEW.md)を参照してください。

```typescript
export class AIPolicyDecisionPoint implements PolicyDecisionPoint {
  private llm: LLMProvider;
  private policyStore: PolicyStore;
  private cache: DecisionCache;
  
  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    // キャッシュチェック
    const cached = await this.cache.get(context);
    if (cached) return cached;
    
    // 適用可能なポリシーを選択
    const policies = await this.selectApplicablePolicies(context);
    
    // プロンプト構築
    const prompt = this.buildPrompt(policies, context);
    
    // LLM判定
    const llmResponse = await this.llm.complete(prompt, {
      temperature: 0.2,  // 一貫性重視
      responseFormat: 'json'
    });
    
    // 結果パース
    const decision = this.parseDecision(llmResponse);
    
    // キャッシュ保存
    await this.cache.set(context, decision);
    
    return decision;
  }
  
  private buildPrompt(policies: Policy[], context: DecisionContext): string {
    return `
あなたはアクセス制御の判定を行うセキュリティシステムです。
以下のポリシーとコンテキストに基づいて、アクセスを許可(PERMIT)または拒否(DENY)してください。

ポリシー:
${policies.map(p => p.content).join('\n\n')}

リクエストコンテキスト:
- エージェント: ${context.agent}
- アクション: ${context.action}
- リソース: ${context.resource}
- 時刻: ${context.time}
- 追加情報: ${JSON.stringify(context.metadata)}

以下のJSON形式で回答してください:
{
  "decision": "PERMIT" | "DENY" | "INDETERMINATE",
  "reason": "判定理由の詳細な説明",
  "confidence": 0.0-1.0の信頼度,
  "constraints": ["適用すべき制約のリスト"],
  "obligations": ["実行すべき義務のリスト"]
}
`;
  }
}
```

### 3. PIP (Policy Information Point) - コンテキスト拡張

**役割**: 判定に必要な追加情報を収集し、コンテキストを充実させる

```typescript
export class ContextEnrichmentPIP implements PolicyInformationPoint {
  private enrichers: Map<string, ContextEnricher>;
  
  constructor() {
    this.registerEnrichers();
  }
  
  private registerEnrichers(): void {
    this.enrichers.set('agent', new AgentInfoEnricher());
    this.enrichers.set('time', new TimeBasedEnricher());
    this.enrichers.set('resource', new ResourceClassificationEnricher());
    this.enrichers.set('security', new SecurityContextEnricher());
    this.enrichers.set('lineage', new DataLineageEnricher());
  }
  
  async enrich(context: DecisionContext): Promise<EnrichedContext> {
    const enriched = { ...context };
    
    // 並列で全enricherを実行
    const enrichmentPromises = Array.from(this.enrichers.entries()).map(
      async ([name, enricher]) => {
        try {
          const data = await enricher.enrich(context);
          enriched[name] = data;
        } catch (error) {
          logger.warn(`Enricher ${name} failed`, error);
        }
      }
    );
    
    await Promise.all(enrichmentPromises);
    
    return enriched as EnrichedContext;
  }
}
```

### 4. PAP (Policy Administration Point) - ポリシー管理

**役割**: ポリシーのライフサイクル全体を管理

```typescript
export class PolicyAdministrationPoint {
  private storage: PolicyStorage;
  private validator: PolicyValidator;
  private versionControl: VersionControl;
  
  async createPolicy(
    name: string, 
    content: string, 
    metadata?: PolicyMetadata
  ): Promise<string> {
    // バリデーション
    await this.validator.validate(content);
    
    // メタデータ生成
    const policy: Policy = {
      id: generateId(),
      name,
      content,
      metadata: {
        ...metadata,
        version: '1.0.0',
        createdAt: new Date(),
        createdBy: getCurrentUser(),
        status: 'draft'
      }
    };
    
    // 保存
    await this.storage.save(policy);
    
    // バージョン管理
    await this.versionControl.commit(policy);
    
    return policy.id;
  }
  
  async updatePolicy(
    id: string, 
    content: string, 
    reason?: string
  ): Promise<void> {
    const existing = await this.storage.get(id);
    if (!existing) throw new NotFoundError('Policy not found');
    
    // 新バージョン作成
    const newVersion = incrementVersion(existing.metadata.version);
    
    const updated: Policy = {
      ...existing,
      content,
      metadata: {
        ...existing.metadata,
        version: newVersion,
        lastModified: new Date(),
        lastModifiedBy: getCurrentUser()
      }
    };
    
    // 保存とバージョン管理
    await this.storage.save(updated);
    await this.versionControl.commit(updated, reason);
  }
}
```

## 📊 データフロー

### 1. リクエスト処理フロー

```typescript
// 詳細な処理フロー
async function processRequest(mcpRequest: MCPRequest): Promise<MCPResponse> {
  // Phase 1: 受信とパース
  const parsedRequest = parseRequest(mcpRequest);
  const requestId = generateRequestId();
  
  // Phase 2: コンテキスト構築
  const baseContext: DecisionContext = {
    requestId,
    agent: extractAgent(parsedRequest),
    action: extractAction(parsedRequest),
    resource: extractResource(parsedRequest),
    time: new Date(),
    metadata: extractMetadata(parsedRequest)
  };
  
  // Phase 3: PIP情報拡張
  const enrichedContext = await pip.enrich(baseContext);
  
  // Phase 4: ポリシー選択
  const applicablePolicies = await pap.selectPolicies(enrichedContext);
  
  // Phase 5: PDP判定
  const decision = await pdp.evaluate(enrichedContext, applicablePolicies);
  
  // Phase 6: 判定実行
  if (decision.decision === 'PERMIT') {
    // 制約適用
    const constrainedRequest = await enforcer.applyConstraints(
      parsedRequest, 
      decision.constraints
    );
    
    // 上流実行
    const upstreamResponse = await upstream.execute(constrainedRequest);
    
    // 義務実行（非同期）
    enforcer.executeObligations(decision.obligations, enrichedContext)
      .catch(error => logger.error('Obligation execution failed', error));
    
    // 監査ログ
    await auditLogger.log({
      requestId,
      context: enrichedContext,
      decision,
      response: upstreamResponse
    });
    
    return upstreamResponse;
  } else {
    // 拒否処理
    await auditLogger.log({
      requestId,
      context: enrichedContext,
      decision
    });
    
    throw new AccessDeniedError(decision);
  }
}
```

### 2. 非同期処理アーキテクチャ

```typescript
export class AsyncProcessingArchitecture {
  private eventBus: EventBus;
  private taskQueue: TaskQueue;
  
  constructor() {
    this.setupEventHandlers();
  }
  
  private setupEventHandlers(): void {
    // 判定完了イベント
    this.eventBus.on('decision.made', async (event) => {
      // 統計更新
      await this.updateStatistics(event);
      
      // 異常検知
      await this.detectAnomalies(event);
      
      // 通知送信
      if (event.decision.decision === 'DENY') {
        await this.sendAlerts(event);
      }
    });
    
    // 義務実行イベント
    this.eventBus.on('obligation.execute', async (obligation) => {
      await this.taskQueue.enqueue({
        type: 'obligation',
        payload: obligation,
        priority: obligation.priority || 'normal'
      });
    });
  }
}
```

## 🔐 セキュリティアーキテクチャ

### 1. ゼロトラスト原則

```typescript
export class ZeroTrustArchitecture {
  // すべてのリクエストを検証
  async validateRequest(request: MCPRequest): Promise<ValidationResult> {
    // 1. 認証検証
    const authResult = await this.validateAuthentication(request);
    if (!authResult.valid) return authResult;
    
    // 2. 認可検証
    const authzResult = await this.validateAuthorization(request);
    if (!authzResult.valid) return authzResult;
    
    // 3. コンテキスト検証
    const contextResult = await this.validateContext(request);
    if (!contextResult.valid) return contextResult;
    
    // 4. 異常検知
    const anomalyResult = await this.detectAnomalies(request);
    if (anomalyResult.suspicious) {
      return { valid: false, reason: 'Anomaly detected' };
    }
    
    return { valid: true };
  }
}
```

### 2. 暗号化と完全性

```typescript
export class SecurityLayer {
  // 監査ログの暗号化
  async encryptAuditLog(log: AuditLog): Promise<EncryptedLog> {
    const key = await this.keyManager.getCurrentKey();
    const encrypted = await crypto.encrypt(JSON.stringify(log), key);
    
    // デジタル署名
    const signature = await crypto.sign(encrypted, this.signingKey);
    
    return {
      data: encrypted,
      signature,
      keyId: key.id,
      timestamp: new Date()
    };
  }
  
  // 通信の暗号化
  setupTLS(): void {
    this.server.use(tls({
      cert: fs.readFileSync('server.crt'),
      key: fs.readFileSync('server.key'),
      ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
      minVersion: 'TLSv1.2'
    }));
  }
}
```

## 🚀 スケーラビリティ設計

### 1. 水平スケーリング

```yaml
# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aegis-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aegis-proxy
  template:
    metadata:
      labels:
        app: aegis-proxy
    spec:
      containers:
      - name: aegis
        image: aegis:latest
        env:
        - name: REDIS_URL
          value: "redis://redis-cluster:6379"
        - name: ENABLE_CLUSTERING
          value: "true"
```

### 2. キャッシング戦略

```typescript
export class MultiLayerCache {
  private l1Cache: MemoryCache;  // プロセス内キャッシュ
  private l2Cache: RedisCache;   // 分散キャッシュ
  
  async get(key: string): Promise<any> {
    // L1キャッシュチェック
    const l1Result = await this.l1Cache.get(key);
    if (l1Result) return l1Result;
    
    // L2キャッシュチェック
    const l2Result = await this.l2Cache.get(key);
    if (l2Result) {
      // L1にも保存
      await this.l1Cache.set(key, l2Result);
      return l2Result;
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    // 両レイヤーに保存
    await Promise.all([
      this.l1Cache.set(key, value, ttl),
      this.l2Cache.set(key, value, ttl)
    ]);
  }
}
```

## 📚 関連ドキュメント

- [MCP統合詳細](./mcp-integration.md) - MCPプロトコルの実装詳細
- [API リファレンス](./api-reference.md) - REST APIの仕様
- [拡張・カスタマイズ](./extending.md) - システムの拡張方法