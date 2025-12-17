#!/usr/bin/env node

// ============================================================================
// AEGIS - Built-in Tools MCP Server
// Claude Codeのビルトインツール（Bash, Read, Write, Edit, Glob, Grep）を
// MCPサーバーとして提供し、AEGIS制御下に置く
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { BashTool } from './tools/bash-tool.js';
import { FileTools } from './tools/file-tools.js';
import { SearchTools } from './tools/search-tools.js';

/**
 * Built-in Tools MCP Server
 * ビルトインツールをMCPプロトコルで提供
 */
class BuiltinToolsServer {
  private server: Server;
  private bashTool: BashTool;
  private fileTools: FileTools;
  private searchTools: SearchTools;

  constructor() {
    // MCPサーバー初期化
    this.server = new Server(
      {
        name: 'aegis-builtin-tools',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // ツール実装の初期化
    this.bashTool = new BashTool();
    this.fileTools = new FileTools();
    this.searchTools = new SearchTools();

    this.setupHandlers();
  }

  /**
   * ハンドラーの設定
   */
  private setupHandlers(): void {
    // ツール一覧の取得
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        // Bashツール
        {
          name: 'bash',
          description: 'Execute bash commands with AEGIS policy control. Supports command execution with timeout and security constraints.',
          inputSchema: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The bash command to execute'
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 30000)',
                default: 30000
              },
              workingDir: {
                type: 'string',
                description: 'Working directory for command execution'
              }
            },
            required: ['command']
          }
        },

        // ファイル読み取り
        {
          name: 'read_file',
          description: 'Read file contents with AEGIS policy control. Supports line range reading and encoding options.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the file'
              },
              offset: {
                type: 'number',
                description: 'Starting line number (0-indexed)'
              },
              limit: {
                type: 'number',
                description: 'Number of lines to read'
              },
              encoding: {
                type: 'string',
                description: 'File encoding (default: utf-8)',
                default: 'utf-8'
              }
            },
            required: ['path']
          }
        },

        // ファイル書き込み
        {
          name: 'write_file',
          description: 'Write or create files with AEGIS policy control. Supports backup creation and permission settings.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the file'
              },
              content: {
                type: 'string',
                description: 'Content to write'
              },
              createBackup: {
                type: 'boolean',
                description: 'Create backup before writing (default: false)',
                default: false
              },
              encoding: {
                type: 'string',
                description: 'File encoding (default: utf-8)',
                default: 'utf-8'
              }
            },
            required: ['path', 'content']
          }
        },

        // ファイル編集
        {
          name: 'edit_file',
          description: 'Edit files with string replacement with AEGIS policy control. Supports exact match and regex patterns.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the file'
              },
              oldString: {
                type: 'string',
                description: 'String to replace'
              },
              newString: {
                type: 'string',
                description: 'Replacement string'
              },
              replaceAll: {
                type: 'boolean',
                description: 'Replace all occurrences (default: false)',
                default: false
              }
            },
            required: ['path', 'oldString', 'newString']
          }
        },

        // Glob検索
        {
          name: 'glob',
          description: 'Search files by pattern with AEGIS policy control. Supports glob patterns like **/*.ts',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern (e.g., **/*.ts, src/**/*.json)'
              },
              cwd: {
                type: 'string',
                description: 'Working directory for search'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results (default: 1000)',
                default: 1000
              }
            },
            required: ['pattern']
          }
        },

        // Grep検索
        {
          name: 'grep',
          description: 'Search text in files with AEGIS policy control. Supports regex patterns and context lines.',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Search pattern (regex supported)'
              },
              path: {
                type: 'string',
                description: 'Path to search in (file or directory)'
              },
              glob: {
                type: 'string',
                description: 'File pattern filter (e.g., *.ts, *.json)'
              },
              caseInsensitive: {
                type: 'boolean',
                description: 'Case insensitive search (default: false)',
                default: false
              },
              contextLines: {
                type: 'number',
                description: 'Number of context lines to show (default: 0)',
                default: 0
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results (default: 100)',
                default: 100
              }
            },
            required: ['pattern']
          }
        }
      ];

      return { tools };
    });

    // ツール実行
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // 引数の検証
      if (!args) {
        throw new Error('Arguments are required');
      }

      try {
        let result: any;

        switch (name) {
          case 'bash':
            result = await this.bashTool.execute(args as any);
            break;

          case 'read_file':
            result = await this.fileTools.readFile(args as any);
            break;

          case 'write_file':
            result = await this.fileTools.writeFile(args as any);
            break;

          case 'edit_file':
            result = await this.fileTools.editFile(args as any);
            break;

          case 'glob':
            result = await this.searchTools.glob(args as any);
            break;

          case 'grep':
            result = await this.searchTools.grep(args as any);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * サーバー起動
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // stdioモードでは標準出力に何も書き込まない
    // （stderr はロギング用に使用可能）
  }
}

// メイン実行
async function main() {
  const server = new BuiltinToolsServer();
  await server.start();
}

main().catch((error) => {
  console.error('Failed to start Built-in Tools MCP Server:', error);
  process.exit(1);
});
