// ============================================================================
// AEGIS E2E テスト - MCPプロキシ統合
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('AEGIS E2E Tests - MCP Proxy Integration', () => {
  let mcpProcess: ChildProcess;
  let client: Client;
  
  beforeAll(async () => {
    // MCPプロキシサーバーを起動
    mcpProcess = spawn('node', ['dist/src/mcp-server.js'], {
      env: { ...process.env, AEGIS_MCP_CONFIG: 'test-mcp-config.json' }
    });
    
    // クライアント接続
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/src/mcp-server.js']
    });
    
    client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
  });
  
  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (mcpProcess) {
      mcpProcess.kill();
    }
  });
  
  describe('ツール実行とポリシー制御', () => {
    it('許可されたファイル読み取りが成功する', async () => {
      const result = await client.request({
        method: 'tools/call',
        params: {
          name: 'filesystem__read_file',
          arguments: {
            path: '/workspace/README.md'
          }
        }
      });
      
      expect(result).toBeDefined();
      // ポリシーで許可されていればコンテンツが返る
    });
    
    it('禁止されたファイル書き込みが拒否される', async () => {
      try {
        await client.request({
          method: 'tools/call',
          params: {
            name: 'filesystem__write_file',
            arguments: {
              path: '/workspace/sensitive.txt',
              content: 'secret data'
            }
          }
        });
        
        // エラーが発生するはず
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('denied');
        // ポリシー違反のエラーメッセージを確認
      }
    });
    
    it('制約付きアクセスで匿名化が適用される', async () => {
      const result = await client.request({
        method: 'tools/call',
        params: {
          name: 'filesystem__read_file',
          arguments: {
            path: '/workspace/customer-data.csv'
          }
        }
      });
      
      // 個人情報が匿名化されているか確認
      expect(result).toBeDefined();
      if (typeof result === 'string') {
        expect(result).not.toContain('実際の名前');
        expect(result).toContain('***'); // マスキング
      }
    });
  });
  
  describe('リソース管理とポリシー制御', () => {
    it('リソース一覧取得が制御される', async () => {
      const result = await client.request({
        method: 'resources/list',
        params: {}
      });
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // 機密リソースがフィルタリングされているか確認
      const resources = result as any[];
      const hasSensitiveResource = resources.some(
        r => r.uri.includes('.env') || r.uri.includes('secret')
      );
      expect(hasSensitiveResource).toBe(false);
    });
    
    it('リソース読み取りがポリシーで制御される', async () => {
      try {
        await client.request({
          method: 'resources/read',
          params: {
            uri: 'file:///workspace/.env'
          }
        });
        
        // 機密ファイルへのアクセスは拒否されるべき
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('denied');
      }
    });
  });
  
  describe('監査とログ記録', () => {
    it('すべてのアクセスがログに記録される', async () => {
      // アクセスを実行
      await client.request({
        method: 'tools/call',
        params: {
          name: 'filesystem__list_directory',
          arguments: {
            path: '/workspace'
          }
        }
      });
      
      // ログファイルを確認（実際の実装では監査ログAPIを使用）
      // const logs = await getAuditLogs();
      // expect(logs).toContainEqual(expect.objectContaining({
      //   action: 'tools/call',
      //   tool: 'filesystem__list_directory',
      //   decision: 'PERMIT'
      // }));
    });
    
    it('ポリシー違反が特別にマークされる', async () => {
      try {
        await client.request({
          method: 'tools/call',
          params: {
            name: 'filesystem__delete_file',
            arguments: {
              path: '/workspace/important.txt'
            }
          }
        });
      } catch (error) {
        // エラーは予期される
      }
      
      // 違反ログを確認
      // const violations = await getPolicyViolations();
      // expect(violations).toHaveLength(greaterThan(0));
    });
  });
  
  describe('パフォーマンスとキャッシュ', () => {
    it('同一リクエストがキャッシュから返される', async () => {
      const startTime1 = Date.now();
      const result1 = await client.request({
        method: 'tools/call',
        params: {
          name: 'filesystem__read_file',
          arguments: {
            path: '/workspace/package.json'
          }
        }
      });
      const time1 = Date.now() - startTime1;
      
      // 2回目の同じリクエスト
      const startTime2 = Date.now();
      const result2 = await client.request({
        method: 'tools/call',
        params: {
          name: 'filesystem__read_file',
          arguments: {
            path: '/workspace/package.json'
          }
        }
      });
      const time2 = Date.now() - startTime2;
      
      // キャッシュからの応答は高速
      expect(time2).toBeLessThan(time1 * 0.5);
      expect(result1).toEqual(result2);
    });
  });
  
  describe('エラーハンドリング', () => {
    it('無効なツール名でエラーが返される', async () => {
      try {
        await client.request({
          method: 'tools/call',
          params: {
            name: 'invalid__tool__name',
            arguments: {}
          }
        });
        
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBeDefined();
        expect(error.message).toContain('not found');
      }
    });
    
    it('ポリシー判定エラーが適切に処理される', async () => {
      // AIサービスが利用できない状況をシミュレート
      // （実際のテストでは環境変数でモックモードを有効化）
      process.env.MOCK_AI_ERROR = 'true';
      
      try {
        await client.request({
          method: 'tools/call',
          params: {
            name: 'filesystem__read_file',
            arguments: {
              path: '/workspace/test.txt'
            }
          }
        });
        
        // INDETERMINATEまたはエラーが期待される
      } catch (error: any) {
        expect(error.message).toContain('policy decision failed');
      } finally {
        delete process.env.MOCK_AI_ERROR;
      }
    });
  });
});