#!/usr/bin/env node

// 簡易MCPプロキシテスト
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main() {
  console.error('🛡️ AEGIS MCP Proxy (Test Mode) starting...');
  
  const server = new Server(
    {
      name: 'aegis-proxy-test',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {}
      },
    }
  );

  // テスト用のツール
  server.setRequestHandler('tools/list', async () => {
    console.error('📋 tools/list called');
    return {
      tools: [
        {
          name: 'test_read_file',
          description: 'ファイル読み取りテスト（ポリシーで制御）',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' }
            }
          }
        },
        {
          name: 'test_write_file',
          description: 'ファイル書き込みテスト（ポリシーで禁止）',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' }
            }
          }
        }
      ]
    };
  });

  // ツール実行
  server.setRequestHandler('tools/call', async (request) => {
    console.error(`🔧 tools/call: ${request.params.name}`);
    
    const currentHour = new Date().getHours();
    const isAfter22 = currentHour >= 22;
    
    // 22時以降のチェック
    if (isAfter22) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ アクセス拒否: 日本時間22時以降のツール使用は禁止されています'
          }
        ]
      };
    }
    
    // 書き込み操作のチェック
    if (request.params.name === 'test_write_file') {
      return {
        content: [
          {
            type: 'text',
            text: '❌ アクセス拒否: fileSystemの書き込みは禁止されています'
          }
        ]
      };
    }
    
    // 読み取り操作は許可
    if (request.params.name === 'test_read_file') {
      return {
        content: [
          {
            type: 'text',
            text: `✅ アクセス許可: ファイル読み取りが許可されました (${request.params.arguments.path})`
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: '❓ 不明なツール'
        }
      ]
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('✅ AEGIS MCP Proxy (Test Mode) started successfully');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});