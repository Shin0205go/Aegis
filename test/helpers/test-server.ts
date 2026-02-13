// ============================================================================
// Test Server Helper - Dynamic Port Allocation
// テスト用サーバーヘルパー - 動的ポート割り当て
// ============================================================================

import { MCPHttpPolicyProxy } from '../../src/mcp/http-proxy.js';
import { Logger } from '../../src/utils/logger.js';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine.js';
import type { AEGISConfig } from '../../src/types/index.js';
import type { Server } from 'http';

/**
 * テスト用サーバーヘルパーの戻り値
 */
export interface TestServerInstance {
  server: MCPHttpPolicyProxy;
  port: number;
  url: string;
  stop: () => Promise<void>;
}

/**
 * テスト用にMCPプロキシサーバーを動的ポートで起動
 * OSが自動的に利用可能なポートを割り当てるため、EADDRINUSE エラーを回避できます
 *
 * @param configOverride - オプション：追加設定をオーバーライド
 * @returns TestServerInstance - サーバーインスタンス、ポート番号、URL、停止関数
 */
export async function createTestServer(
  configOverride?: Partial<AEGISConfig>
): Promise<TestServerInstance> {
  // デフォルト設定
  const config: AEGISConfig = {
    nodeEnv: 'test',
    logLevel: 'error', // テスト中はエラーのみログ
    policyValidationEnabled: false,
    ...configOverride,
    mcpProxy: {
      upstreamServers: {},
      corsOrigins: ['*'],
      ...configOverride?.mcpProxy,
      port: 0 // Always use dynamic port for tests
    } as any
  };

  // Create mock logger for tests
  const logger: Logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  } as unknown as Logger;

  // Create server instance (without AI engine for faster tests)
  const server = new MCPHttpPolicyProxy(config, logger, null);

  // Start server
  await server.start();

  // Get actual port assigned by OS
  const httpServer: Server = (server as any).httpServer;
  const address = httpServer.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server port');
  }

  const port = address.port;
  const url = `http://localhost:${port}`;

  // Return server instance with helper methods
  return {
    server,
    port,
    url,
    stop: async () => {
      await server.stop();
    }
  };
}

/**
 * サーバーが準備完了になるまで待機
 * @param server - サーバーインスタンス
 * @param timeoutMs - タイムアウト（ミリ秒）
 */
export async function waitForReady(
  server: MCPHttpPolicyProxy | any,
  timeoutMs: number = 5000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Check if server has httpServer property (indicates it's started)
    const httpServer = (server as any).httpServer;

    if (httpServer && httpServer.listening) {
      return;
    }

    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Server not ready within ${timeoutMs}ms timeout`);
}

/**
 * テスト用のクリーンアップヘルパー
 * beforeEach/afterEach で使用
 */
export class TestServerManager {
  private servers: TestServerInstance[] = [];

  /**
   * 新しいテストサーバーを作成して管理下に追加
   */
  async createServer(configOverride?: Partial<AEGISConfig>): Promise<TestServerInstance> {
    const serverInstance = await createTestServer(configOverride);
    this.servers.push(serverInstance);
    return serverInstance;
  }

  /**
   * すべての管理下のサーバーを停止
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      this.servers.map(s => s.stop().catch(err => {
        console.error('Error stopping server:', err);
      }))
    );
    this.servers = [];
  }

  /**
   * 管理下のサーバー数を取得
   */
  get count(): number {
    return this.servers.length;
  }
}
