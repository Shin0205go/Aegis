#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

// AEGIS Policy-Controlled MCP Proxy
const POLICY_API = 'http://localhost:3000/api/policies';
const ACTIVE_POLICY_ID = 'policy-af8acd82-6ed2-4753-8039-33eaac116303';

class AEGISProxy {
  constructor() {
    this.policy = null;
    this.server = new Server(
      {
        name: 'aegis-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        },
      }
    );
    
    this.setupHandlers();
  }

  async loadPolicy() {
    try {
      const response = await fetch(`${POLICY_API}/${ACTIVE_POLICY_ID}`);
      const data = await response.json();
      if (data.success) {
        this.policy = data.data.policy;
        console.error(`📋 ポリシー読み込み成功: ${data.data.metadata.name}`);
        console.error(`   内容: ${this.policy}`);
      }
    } catch (error) {
      console.error('⚠️ ポリシー読み込みエラー、デフォルトポリシーを使用');
      this.policy = `
- fileSystemの読み取りは許可
- fileSystemの書き込みは禁止
- 日本時間で22時以降のツールの使用は禁止
      `.trim();
    }
  }

  checkPolicy(action, resource) {
    const hour = new Date().getHours();
    
    // 22時以降チェック
    if (hour >= 22) {
      return {
        allowed: false,
        reason: '日本時間22時以降のツール使用は禁止されています'
      };
    }
    
    // ファイルシステム書き込みチェック
    if (action === 'write' && resource.includes('fileSystem')) {
      return {
        allowed: false,
        reason: 'fileSystemの書き込みは禁止されています'
      };
    }
    
    // ファイルシステム読み取りは許可
    if (action === 'read' && resource.includes('fileSystem')) {
      return {
        allowed: true,
        reason: 'fileSystemの読み取りは許可されています'
      };
    }
    
    // デフォルトは許可
    return {
      allowed: true,
      reason: 'ポリシーに明示的な制限がありません'
    };
  }

  setupHandlers() {
    // ツールリスト
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'read_file',
            description: 'ファイルを読み取る',
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
            description: 'ファイルに書き込む',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'ファイルパス' },
                content: { type: 'string', description: '内容' }
              },
              required: ['path', 'content']
            }
          },
          {
            name: 'list_directory',
            description: 'ディレクトリの内容を一覧表示',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'ディレクトリパス' }
              },
              required: ['path']
            }
          }
        ]
      };
    });

    // ツール実行
    this.server.setRequestHandler('tools/call', async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};
      
      console.error(`🔧 ツール実行要求: ${toolName}`);
      
      // ポリシーチェック
      let action, resource;
      switch (toolName) {
        case 'read_file':
        case 'list_directory':
          action = 'read';
          resource = 'fileSystem';
          break;
        case 'write_file':
          action = 'write';
          resource = 'fileSystem';
          break;
        default:
          action = 'unknown';
          resource = 'unknown';
      }
      
      const policyCheck = this.checkPolicy(action, resource);
      
      if (!policyCheck.allowed) {
        console.error(`❌ ポリシー違反: ${policyCheck.reason}`);
        return {
          content: [
            {
              type: 'text',
              text: `❌ アクセス拒否: ${policyCheck.reason}`
            }
          ]
        };
      }
      
      console.error(`✅ ポリシー許可: ${policyCheck.reason}`);
      
      // 実際のツール実行（ポリシーで許可された場合のみ）
      try {
        switch (toolName) {
          case 'read_file':
            const content = await fs.readFile(args.path, 'utf-8');
            return {
              content: [
                {
                  type: 'text',
                  text: content
                }
              ]
            };
            
          case 'list_directory':
            const files = await fs.readdir(args.path);
            return {
              content: [
                {
                  type: 'text',
                  text: files.join('\n')
                }
              ]
            };
            
          case 'write_file':
            // ここには到達しない（ポリシーで禁止）
            return {
              content: [
                {
                  type: 'text',
                  text: 'エラー: この操作は実行されません'
                }
              ]
            };
            
          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `不明なツール: ${toolName}`
                }
              ]
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `エラー: ${error.message}`
            }
          ]
        };
      }
    });

    // リソースリスト（今回は空）
    this.server.setRequestHandler('resources/list', async () => {
      return { resources: [] };
    });
  }

  async start() {
    await this.loadPolicy();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🛡️ AEGIS MCP Proxy started');
    console.error(`⏰ 現在時刻: ${new Date().toLocaleString('ja-JP')}`);
  }
}

// メイン処理
const proxy = new AEGISProxy();
proxy.start().catch(console.error);