// ============================================================================
// AEGIS - MCP stdio ルーター
// 複数の上流MCPサーバーをstdio経由で管理し、ルーティングする
// ============================================================================

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

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
        server.connected = true;

        // stdout処理
        proc.stdout?.on('data', (data) => {
          const text = data.toString();
          server.buffer += text;
          
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

        // stderr処理
        proc.stderr?.on('data', (data) => {
          this.logger.error(`Error from ${name}:`, data.toString());
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
          }, 5000);
        });

        proc.on('error', (error) => {
          this.logger.error(`Failed to start ${name}:`, error);
          server.connected = false;
          reject(error);
        });

        // 起動確認のため少し待つ
        setTimeout(() => {
          if (server.connected) {
            this.logger.info(`Successfully started upstream server: ${name}`);
            resolve();
          } else {
            reject(new Error(`Server ${name} failed to start`));
          }
        }, 1000);

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
    
    // リソース/ツールから対象サーバーを決定
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
      this.once(`response-${id}`, (response) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        resolve(response);
      });
    });
  }

  private selectTargetServer(method: string, params: any): string | null {
    // リソースURIからサーバーを決定
    if (method === 'resources/read' || method === 'resources/list') {
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
      // 簡易実装: ツール名のプレフィックスでマッチング
      for (const [name, server] of this.upstreamServers) {
        if (toolName.startsWith(name + '_') || toolName.startsWith(name + '.')) {
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