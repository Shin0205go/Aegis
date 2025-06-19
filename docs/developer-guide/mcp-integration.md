# MCP統合詳細

Model Context Protocol (MCP) とAEGISの統合に関する技術的な詳細です。

## 📋 MCPプロトコル概要

MCPは、AIモデルが外部ツールやデータソースと対話するための標準化されたプロトコルです。

### プロトコル仕様

```typescript
// MCPメッセージ構造
interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

// MCPエラー構造
interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// 標準エラーコード
const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // カスタムエラー
  ACCESS_DENIED: -32000,
  POLICY_VIOLATION: -32001,
  RATE_LIMITED: -32002
};
```

## 🔧 トランスポート実装

### 1. stdio トランスポート

```typescript
export class StdioTransport implements MCPTransport {
  private parser: JSONRPCParser;
  
  constructor() {
    this.parser = new JSONRPCParser();
    this.setupStreams();
  }
  
  private setupStreams(): void {
    // 標準入力からのメッセージ読み取り
    process.stdin.setEncoding('utf8');
    
    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      
      // 改行で分割してメッセージを処理
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            this.sendError(null, MCP_ERRORS.PARSE_ERROR, 'Invalid JSON');
          }
        }
      }
    });
  }
  
  async send(message: MCPMessage): Promise<void> {
    const json = JSON.stringify(message);
    process.stdout.write(json + '\n');
  }
  
  private async handleMessage(message: MCPMessage): Promise<void> {
    try {
      // AEGISプロキシ処理
      const response = await this.processWithPolicy(message);
      await this.send(response);
    } catch (error) {
      await this.sendError(
        message.id,
        MCP_ERRORS.INTERNAL_ERROR,
        error.message
      );
    }
  }
}
```

### 2. HTTP/SSE トランスポート

```typescript
export class HttpTransport implements MCPTransport {
  private app: Express;
  private sseClients: Map<string, Response>;
  
  constructor(port: number = 3000) {
    this.app = express();
    this.sseClients = new Map();
    this.setupRoutes();
    this.app.listen(port);
  }
  
  private setupRoutes(): void {
    // CORS設定
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      credentials: true
    }));
    
    // JSONパーサー
    this.app.use(express.json());
    
    // MCPエンドポイント
    this.app.post('/mcp', async (req, res) => {
      try {
        const message = req.body as MCPMessage;
        const response = await this.processWithPolicy(message);
        res.json(response);
      } catch (error) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: MCP_ERRORS.INTERNAL_ERROR,
            message: error.message
          }
        });
      }
    });
    
    // SSE接続
    this.app.get('/mcp/sse', (req, res) => {
      const clientId = generateId();
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      this.sseClients.set(clientId, res);
      
      // 接続確立通知
      res.write(`data: ${JSON.stringify({
        type: 'connection',
        clientId
      })}\n\n`);
      
      // クライアント切断時の処理
      req.on('close', () => {
        this.sseClients.delete(clientId);
      });
    });
  }
  
  async broadcast(message: MCPMessage): Promise<void> {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    
    for (const [clientId, res] of this.sseClients) {
      res.write(data);
    }
  }
}
```

## 🎯 MCPプロキシアーキテクチャ

### 1. リクエストインターセプション

```typescript
export class MCPProxy {
  private upstreams: Map<string, MCPUpstream>;
  private policyEngine: PolicyEngine;
  private toolRegistry: ToolRegistry;
  
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    // メソッドルーティング
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      
      case 'tools/list':
        return this.handleToolsList(request);
      
      case 'tools/call':
        return this.handleToolCall(request);
      
      case 'resources/list':
        return this.handleResourcesList(request);
      
      case 'resources/read':
        return this.handleResourceRead(request);
      
      default:
        throw new Error(`Method not found: ${request.method}`);
    }
  }
  
  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;
    
    // ポリシー判定用コンテキスト構築
    const context: DecisionContext = {
      agent: this.extractAgent(request),
      action: 'tools/call',
      resource: `tool:${name}`,
      metadata: {
        toolName: name,
        arguments: args
      }
    };
    
    // ポリシー判定
    const decision = await this.policyEngine.evaluate(context);
    
    if (decision.decision !== 'PERMIT') {
      throw new PolicyViolationError(decision.reason);
    }
    
    // 制約適用
    const constrainedArgs = await this.applyConstraints(
      args,
      decision.constraints
    );
    
    // ツール実行
    const tool = this.toolRegistry.get(name);
    const result = await tool.execute(constrainedArgs);
    
    // 義務実行
    await this.executeObligations(decision.obligations, context, result);
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      result
    };
  }
}
```

### 2. ツール集約システム

```typescript
export class ToolAggregator {
  private tools: Map<string, MCPTool> = new Map();
  
  constructor() {
    this.initializeTools();
  }
  
  private async initializeTools(): Promise<void> {
    // 設定ベースのMCPサーバーからツール取得
    await this.loadConfiguredTools();
    
    // ネイティブツールの登録
    await this.loadNativeTools();
    
    // 動的発見されたツールの登録
    await this.discoverDynamicTools();
  }
  
  private async loadConfiguredTools(): Promise<void> {
    const config = await loadConfig('aegis-mcp-config.json');
    
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const client = new MCPClient(serverConfig);
      const tools = await client.listTools();
      
      for (const tool of tools) {
        // プレフィックスを付けて登録
        const prefixedName = `${name}__${tool.name}`;
        this.tools.set(prefixedName, {
          ...tool,
          name: prefixedName,
          execute: (args) => client.callTool(tool.name, args)
        });
      }
    }
  }
  
  private async loadNativeTools(): Promise<void> {
    // Claude Code内蔵ツール
    const nativeTools = [
      'Agent', 'Bash', 'Edit', 'Read', 'Write',
      'MultiEdit', 'Glob', 'Grep', 'LS',
      'TodoRead', 'TodoWrite', 'WebSearch', 'WebFetch'
    ];
    
    for (const toolName of nativeTools) {
      const tool = await import(`./native-tools/${toolName}`);
      this.tools.set(toolName, tool.default);
    }
  }
  
  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values());
  }
  
  async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    return tool.execute(args);
  }
}
```

### 3. 動的ツール発見

```typescript
export class DynamicToolDiscovery {
  private discoveryInterval: number = 60000; // 1分
  private discoveredTools: Map<string, MCPTool> = new Map();
  
  async startDiscovery(): Promise<void> {
    // 初回発見
    await this.discoverTools();
    
    // 定期的な再発見
    setInterval(() => {
      this.discoverTools().catch(error => {
        logger.error('Tool discovery failed', error);
      });
    }, this.discoveryInterval);
  }
  
  private async discoverTools(): Promise<void> {
    // VSCode拡張機能のスキャン
    await this.scanVSCodeExtensions();
    
    // システムパスのスキャン
    await this.scanSystemPath();
    
    // ネットワーク上のMCPサーバー発見
    await this.discoverNetworkServers();
  }
  
  private async scanVSCodeExtensions(): Promise<void> {
    const extensionsPath = path.join(
      os.homedir(),
      '.vscode/extensions'
    );
    
    if (!fs.existsSync(extensionsPath)) return;
    
    const extensions = await fs.promises.readdir(extensionsPath);
    
    for (const ext of extensions) {
      const packagePath = path.join(extensionsPath, ext, 'package.json');
      
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(
          await fs.promises.readFile(packagePath, 'utf8')
        );
        
        // MCP対応チェック
        if (packageJson.contributes?.mcpServers) {
          await this.registerExtensionTools(ext, packageJson);
        }
      }
    }
  }
}
```

## 🔒 セキュリティ実装

### 1. リクエスト検証

```typescript
export class MCPSecurityLayer {
  private validator: RequestValidator;
  private rateLimiter: RateLimiter;
  
  async validateRequest(request: MCPRequest): Promise<void> {
    // 1. 構造検証
    this.validateStructure(request);
    
    // 2. メソッド検証
    this.validateMethod(request.method);
    
    // 3. パラメータ検証
    await this.validateParameters(request.method, request.params);
    
    // 4. レート制限
    await this.checkRateLimit(request);
    
    // 5. 署名検証（オプション）
    if (request.headers?.signature) {
      await this.validateSignature(request);
    }
  }
  
  private validateStructure(request: any): void {
    const schema = z.object({
      jsonrpc: z.literal("2.0"),
      id: z.union([z.string(), z.number()]).optional(),
      method: z.string(),
      params: z.any().optional()
    });
    
    try {
      schema.parse(request);
    } catch (error) {
      throw new ValidationError('Invalid request structure');
    }
  }
  
  private async checkRateLimit(request: MCPRequest): Promise<void> {
    const key = this.getRateLimitKey(request);
    const allowed = await this.rateLimiter.check(key);
    
    if (!allowed) {
      throw new RateLimitError('Rate limit exceeded');
    }
  }
}
```

### 2. ツール実行サンドボックス

```typescript
export class ToolSandbox {
  private vm: VM;
  
  async executeInSandbox(
    tool: MCPTool,
    args: any,
    constraints?: string[]
  ): Promise<any> {
    // サンドボックス環境の準備
    const sandbox = this.createSandbox(constraints);
    
    // タイムアウト設定
    const timeout = this.getTimeout(tool.name);
    
    // 実行
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Tool execution timed out: ${tool.name}`));
      }, timeout);
      
      try {
        const result = this.vm.run(
          `(${tool.execute.toString()})(${JSON.stringify(args)})`,
          sandbox
        );
        
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  
  private createSandbox(constraints?: string[]): any {
    const sandbox = {
      // 安全な組み込み関数のみ
      console: {
        log: (...args) => logger.info('Sandbox log:', ...args),
        error: (...args) => logger.error('Sandbox error:', ...args)
      },
      Math,
      Date,
      JSON,
      // 制限されたファイルシステムアクセス
      fs: this.createRestrictedFS(constraints)
    };
    
    return sandbox;
  }
}
```

## 📊 パフォーマンス最適化

### 1. 接続プーリング

```typescript
export class MCPConnectionPool {
  private pools: Map<string, ConnectionPool> = new Map();
  
  async getConnection(upstream: string): Promise<MCPConnection> {
    let pool = this.pools.get(upstream);
    
    if (!pool) {
      pool = this.createPool(upstream);
      this.pools.set(upstream, pool);
    }
    
    return pool.acquire();
  }
  
  private createPool(upstream: string): ConnectionPool {
    return new ConnectionPool({
      create: async () => {
        const connection = new MCPConnection(upstream);
        await connection.connect();
        return connection;
      },
      destroy: async (connection) => {
        await connection.disconnect();
      },
      validate: async (connection) => {
        return connection.isAlive();
      },
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 5000
    });
  }
}
```

### 2. バッチ処理

```typescript
export class MCPBatchProcessor {
  private batchQueue: BatchQueue<MCPRequest, MCPResponse>;
  
  constructor() {
    this.batchQueue = new BatchQueue({
      batchSize: 10,
      batchTimeout: 100,
      processor: this.processBatch.bind(this)
    });
  }
  
  async addRequest(request: MCPRequest): Promise<MCPResponse> {
    return this.batchQueue.add(request);
  }
  
  private async processBatch(
    requests: MCPRequest[]
  ): Promise<MCPResponse[]> {
    // 同じツールへのリクエストをグループ化
    const grouped = this.groupByTool(requests);
    
    const results = await Promise.all(
      Array.from(grouped.entries()).map(async ([tool, reqs]) => {
        // バッチ対応ツールの場合
        if (this.supportsBatch(tool)) {
          return this.executeBatch(tool, reqs);
        }
        
        // 通常の並列実行
        return Promise.all(
          reqs.map(req => this.executeSingle(req))
        );
      })
    );
    
    // 結果を元の順序に戻す
    return this.reorderResults(requests, results.flat());
  }
}
```

## 🧪 テスト戦略

### 1. MCPプロトコルテスト

```typescript
describe('MCPProxy', () => {
  let proxy: MCPProxy;
  let mockUpstream: MockMCPServer;
  
  beforeEach(() => {
    mockUpstream = new MockMCPServer();
    proxy = new MCPProxy({
      upstreams: { test: mockUpstream }
    });
  });
  
  describe('Protocol Compliance', () => {
    it('should handle valid JSON-RPC request', async () => {
      const request: MCPRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      };
      
      const response = await proxy.handleRequest(request);
      
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: expect.any(Array)
      });
    });
    
    it('should return proper error for invalid request', async () => {
      const request = {
        method: "invalid"
        // jsonrpc missing
      };
      
      const response = await proxy.handleRequest(request as any);
      
      expect(response.error).toMatchObject({
        code: -32600,
        message: 'Invalid Request'
      });
    });
  });
});
```

### 2. 統合テスト

```typescript
describe('MCP Integration', () => {
  let aegisServer: AEGISServer;
  let mcpClient: MCPClient;
  
  beforeAll(async () => {
    aegisServer = await startTestServer();
    mcpClient = new MCPClient({
      transport: 'http',
      url: 'http://localhost:3001'
    });
  });
  
  it('should enforce policies on tool execution', async () => {
    // 危険なツールの実行を試みる
    const result = await mcpClient.callTool('Bash', {
      command: 'rm -rf /'
    });
    
    expect(result.error).toMatchObject({
      code: -32000,
      message: expect.stringContaining('Access denied')
    });
  });
});
```

## 📚 関連ドキュメント

- [システムアーキテクチャ](./architecture.md) - 全体的なシステム設計
- [エージェントシステム](./agent-system.md) - エージェント管理の詳細
- [API リファレンス](./api-reference.md) - REST APIとの統合