#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'aegis-proxy-test',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ポリシーをハードコード（実際のAEGISではAI判定を使用）
const POLICY = {
  readAllowed: true,
  writeAllowed: false,
  timeRestriction: 22 // 22時以降は禁止
};

server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'read_file',
        description: 'ファイルを読み取る（ポリシーで許可）',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'ファイルパス' }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file', 
        description: 'ファイルに書き込む（ポリシーで禁止）',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'ファイルパス' },
            content: { type: 'string', description: '内容' }
          },
          required: ['path', 'content']
        }
      }
    ]
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};
  
  // 現在時刻チェック
  const currentHour = new Date().getHours();
  if (currentHour >= POLICY.timeRestriction) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ ポリシー違反: ${POLICY.timeRestriction}時以降のツール使用は禁止されています（現在: ${currentHour}時）`
        }
      ]
    };
  }
  
  // ツール別の処理
  switch (toolName) {
    case 'read_file':
      if (POLICY.readAllowed) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ 読み取り許可: ${args.path}\n（実際のファイル読み取りはここでは実装していません）`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ポリシー違反: ファイル読み取りは禁止されています`
            }
          ]
        };
      }
      
    case 'write_file':
      if (POLICY.writeAllowed) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ 書き込み許可: ${args.path}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ポリシー違反: ファイル書き込みは禁止されています`
            }
          ]
        };
      }
      
    default:
      return {
        content: [
          {
            type: 'text',
            text: `❓ 不明なツール: ${toolName}`
          }
        ]
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ AEGIS Test Proxy started - Policy: 読み取りOK, 書き込みNG, 22時以降NG');
}

main().catch(console.error);