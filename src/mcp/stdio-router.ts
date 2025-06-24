// ============================================================================
// AEGIS - MCP stdio ルーター
// 複数の上流MCPサーバーをstdio経由で管理し、ルーティングする
// ============================================================================

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { TIMEOUTS } from '../constants/index.js';

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface UpstreamServerInfo {
  name: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  connected: boolean;
  buffer: string;
}

export class StdioRouter extends EventEmitter {
  private upstreamServers = new Map<string, UpstreamServerInfo>();
  private logger: Logger;
  private currentRequestId?: string | number;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    targetServer?: string;
  }>();

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Claude Desktop設定形式のサーバーを追加
   */
  addServerFromConfig(name: string, config: MCPServerConfig): void {
    this.upstreamServers.set(name, {
      name,
      config,
      connected: false,
      buffer: ''
    });
    this.logger.info(`Configured upstream server: ${name}`, { 
      command: config.command,
      args: config.args 
    });
  }

  /**
   * claude_desktop_config.jsonの内容から複数サーバーを設定
   */
  loadServersFromDesktopConfig(config: { mcpServers: Record<string, MCPServerConfig> }): void {
    Object.entries(config.mcpServers).forEach(([name, serverConfig]) => {
      // AEGISプロキシ自身は除外
      if (name !== 'aegis-proxy' && name !== 'aegis') {
        this.addServerFromConfig(name, serverConfig);
      }
    });
  }

  /**
   * 設定されたサーバーを起動
   */
  async startServers(): Promise<void> {
    const startPromises = Array.from(this.upstreamServers.entries()).map(
      async ([name, server]) => {
        try {
          await this.startServer(name, server);
        } catch (error) {
          this.logger.error(`Failed to start server ${name}:`, error);
        }
      }
    );

    await Promise.all(startPromises);
  }

  private async startServer(name: string, server: UpstreamServerInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 環境変数の展開
        const expandedEnv: Record<string, string> = {};
        if (server.config.env) {
          for (const [key, value] of Object.entries(server.config.env)) {
            if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
              const varName = value.slice(2, -1);
              expandedEnv[key] = process.env[varName] || '';
            } else {
              expandedEnv[key] = value as string;
            }
          }
        }
        
        const env = {
          ...process.env,
          ...expandedEnv
        };

        const proc = spawn(server.config.command, server.config.args || [], {
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        server.process = proc;
        // connectedはサーバーが実際に応答するまでfalseのまま
        server.connected = false;

        // stdout処理
        proc.stdout?.on('data', (data) => {
          const text = data.toString();
          server.buffer += text;
          
          // 初回データ受信時にconnectedにする
          if (!server.connected) {
            server.connected = true;
            this.logger.debug(`${name} is now connected (stdout data received)`);
          }
          
          // JSON-RPCメッセージを探す
          const lines = server.buffer.split('\n');
          server.buffer = lines.pop() || '';
          
          lines.forEach(line => {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                this.handleUpstreamMessage(name, message);
              } catch (error) {
                // JSON以外の出力は無視
                this.logger.debug(`Non-JSON output from ${name}: ${line}`);
              }
            }
          });
        });

        // stderr処理（MCPサーバーの通常のログ出力）
        proc.stderr?.on('data', (data) => {
          const message = data.toString().trim();
          
          // 初期化メッセージをチェック
          if (!server.connected && (
            message.toLowerCase().includes('running on stdio') ||
            message.toLowerCase().includes('server running') ||
            message.toLowerCase().includes('server started') ||
            message.toLowerCase().includes('listening')
          )) {
            server.connected = true;
            this.logger.debug(`${name} is now connected (initialization message detected)`);
          }
          
          // エラーレベルのメッセージのみ警告として記録
          if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail')) {
            this.logger.warn(`[${name}] ${message}`);
          } else {
            // 通常のログはデバッグレベルで記録
            this.logger.debug(`[${name}] ${message}`);
          }
        });

        // プロセス終了処理
        proc.on('close', (code) => {
          this.logger.info(`Server ${name} exited with code ${code}`);
          server.connected = false;
          server.process = undefined;
          
          // 自動再起動
          setTimeout(() => {
            if (this.upstreamServers.has(name)) {
              this.startServer(name, server).catch(err => {
                this.logger.error(`Failed to restart ${name}:`, err);
              });
            }
          }, TIMEOUTS.CONTEXT_ENRICHMENT);
        });

        proc.on('error', (error) => {
          this.logger.error(`Failed to start ${name}:`, error);
          server.connected = false;
          reject(error);
        });

        // MCPサーバーの初期化を待つ
        let initTimeout: NodeJS.Timeout;
        const waitForInit = () => {
          return new Promise<void>((waitResolve, waitReject) => {
            let initialized = false;
            
            // タイムアウト設定（5秒）
            initTimeout = setTimeout(() => {
              if (!initialized) {
                waitReject(new Error(`Server ${name} initialization timeout`));
              }
            }, TIMEOUTS.UPSTREAM_SERVER_INIT);
            
            // 初期化完了を検知
            const checkInit = () => {
              if (server.connected) {
                initialized = true;
                clearTimeout(initTimeout);
                this.logger.info(`Successfully started upstream server: ${name}`);
                waitResolve();
              } else {
                // 100ms後に再チェック
                setTimeout(checkInit, 100);
              }
            };
            
            checkInit();
          });
        };
        
        waitForInit()
          .then(() => resolve())
          .catch((err) => reject(err));

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * リクエストを適切な上流サーバーにルーティング
   */
  async routeRequest(request: any): Promise<any> {
    const { method, params, id } = request;
    
    this.logger.debug(`Routing request: ${method} (id: ${id})`);
    
    // tools/list と resources/list は全サーバーから集約
    if (method === 'tools/list' || method === 'resources/list') {
      this.logger.debug(`Aggregating ${method} from all servers`);
      return await this.aggregateListResponses(method, params, id);
    }
    
    // その他のリクエストは単一サーバーに転送
    const targetServer = this.selectTargetServer(method, params);
    
    if (!targetServer) {
      throw new Error(`No upstream server available for ${method}`);
    }

    const server = this.upstreamServers.get(targetServer);
    if (!server?.connected || !server.process) {
      throw new Error(`Upstream server ${targetServer} is not connected`);
    }

    return new Promise((resolve, reject) => {
      this.currentRequestId = id;
      this.pendingRequests.set(id, { resolve, reject, targetServer });
      
      // タイムアウト設定
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, 30000);

      // リクエスト送信
      server.process!.stdin?.write(JSON.stringify(request) + '\n');
      
      // レスポンス待ち
      const responseHandler = (response: any) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        this.removeListener(`response-${id}`, responseHandler);
        resolve(response);
      };
      this.on(`response-${id}`, responseHandler);
    });
  }

  /**
   * 複数サーバーからのリスト応答を集約
   */
  private async aggregateListResponses(method: string, params: any, id: number): Promise<any> {
    // デバッグ: 接続中のサーバーを確認
    const connectedServers = Array.from(this.upstreamServers.entries())
      .filter(([_, server]) => server.connected);
    
    this.logger.info(`Aggregating ${method} from ${connectedServers.length} connected servers`);
    connectedServers.forEach(([name, _]) => {
      this.logger.debug(`  - ${name}: connected`);
    });
    
    const responses = await Promise.allSettled(
      connectedServers.map(([name, _]) => this.sendRequestToServer(name, { method, params, id: `${id}-${name}-${Date.now()}-${Math.random()}`, jsonrpc: '2.0' }))
    );

    // デバッグ: レスポンス状況を確認
    responses.forEach((r, i) => {
      const serverName = connectedServers[i][0];
      if (r.status === 'fulfilled') {
        this.logger.debug(`${serverName} response: success`);
      } else {
        this.logger.warn(`${serverName} response: failed - ${r.reason}`);
      }
    });

    const successfulResponses = responses
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    if (method === 'tools/list') {
      const allTools: any[] = [];
      
      // 各サーバーのツールにプレフィックスを追加
      responses.forEach((response, index) => {
        if (response.status === 'fulfilled') {
          const serverName = connectedServers[index][0];
          const result = (response as PromiseFulfilledResult<any>).value;
          
          if (result.result?.tools) {
            result.result.tools.forEach((tool: any) => {
              // サーバー名をプレフィックスとして追加
              allTools.push({
                ...tool,
                name: `${serverName}__${tool.name}`
              });
            });
          }
        }
      });
      
      this.logger.info(`Aggregated ${allTools.length} tools total`);
      
      return { result: { tools: allTools } };
    } else if (method === 'resources/list') {
      const allResources = successfulResponses
        .filter(r => r.result?.resources)
        .flatMap(r => r.result.resources);
      return { result: { resources: allResources } };
    }

    return { result: {} };
  }

  /**
   * 特定のサーバーにリクエストを送信
   */
  private async sendRequestToServer(serverName: string, request: any): Promise<any> {
    const server = this.upstreamServers.get(serverName);
    if (!server?.connected || !server.process) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    return new Promise((resolve, reject) => {
      const requestId = request.id;
      this.pendingRequests.set(requestId, { resolve, reject, targetServer: serverName });
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout for ${serverName}`));
      }, 10000);

      server.process!.stdin?.write(JSON.stringify(request) + '\n');
      
      const responseHandler = (response: any) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        this.removeListener(`response-${requestId}`, responseHandler);
        resolve(response);
      };
      this.on(`response-${requestId}`, responseHandler);
    });
  }

  private selectTargetServer(method: string, params: any): string | null {
    // tools/list と resources/list は全サーバーから集約する必要がある
    // ここでは最初の利用可能なサーバーを返す（後で集約実装を追加）
    if (method === 'tools/list' || method === 'resources/list') {
      for (const [name, server] of this.upstreamServers) {
        if (server.connected) {
          this.logger.debug(`Selected server ${name} for ${method}`);
          return name;
        }
      }
    }
    
    // リソースURIからサーバーを決定
    if (method === 'resources/read') {
      const uri = params?.uri || '';
      
      // URI形式: gmail://... -> gmail サーバー
      const match = uri.match(/^([^:]+):\/\//);
      if (match) {
        const serverName = match[1];
        if (this.upstreamServers.has(serverName)) {
          return serverName;
        }
      }
    }
    
    // ツール名からサーバーを決定
    if (method === 'tools/call') {
      const toolName = params?.name || '';
      
      // 各サーバーに問い合わせて対応確認
      // プレフィックスでマッチング（__区切りを使用）
      for (const [name, server] of this.upstreamServers) {
        if (toolName.startsWith(name + '__')) {
          return name;
        }
      }
    }
    
    // デフォルト: 最初の利用可能なサーバー
    for (const [name, server] of this.upstreamServers) {
      if (server.connected) {
        return name;
      }
    }
    
    return null;
  }

  private handleUpstreamMessage(serverName: string, message: any): void {
    this.logger.debug(`Received message from ${serverName}:`, JSON.stringify(message).substring(0, 200));
    
    if (message.id && this.pendingRequests.has(message.id)) {
      // レスポンスを対応するリクエストに返す
      this.emit(`response-${message.id}`, message);
    } else if (message.method) {
      // 通知メッセージ
      this.emit('notification', { from: serverName, message });
    }
  }

  /**
   * すべての上流サーバーを停止
   */
  async stopServers(): Promise<void> {
    const stopPromises = Array.from(this.upstreamServers.values()).map(server => {
      if (server.process) {
        return new Promise<void>((resolve) => {
          server.process!.on('close', () => resolve());
          server.process!.kill('SIGTERM');
          
          // 強制終了のタイムアウト
          setTimeout(() => {
            if (server.process) {
              server.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(stopPromises);
    this.upstreamServers.clear();
  }

  /**
   * 利用可能なサーバーのリストを取得
   */
  getAvailableServers(): Array<{ name: string; connected: boolean }> {
    return Array.from(this.upstreamServers.entries()).map(([name, server]) => ({
      name,
      connected: server.connected
    }));
  }
}