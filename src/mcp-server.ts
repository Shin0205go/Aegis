#!/usr/bin/env node

// ============================================================================
// AEGIS - MCPプロキシサーバー (MCP公式仕様準拠版)
// stdio/Streamable HTTPトランスポート対応
// ============================================================================

import { MCPServerStarter } from './mcp/server-starter.js';
import * as dotenv from 'dotenv';
import * as os from 'os';

// 環境変数読み込み
dotenv.config();

/**
 * MCPプロキシサーバーを起動
 */
async function startMCPServer(transport: 'stdio' | 'http' = 'stdio') {
  const starter = new MCPServerStarter({
    transport,
    logLevel: process.env.LOG_LEVEL
  });
  
  await starter.start();
}

// CLIオプション解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  return options;
}

// ヘルプ表示
function showHelp() {
  console.error(`
AEGIS MCP Proxy Server (MCP Standard Compliant)

Usage: node mcp-server.js [options]

Options:
  --help                Show this help message
  --transport <type>    Transport type: stdio or http (default: http)
  --port <port>         Server port for HTTP transport (default: 8080)
  --provider <provider> LLM provider: openai or anthropic (default: openai)
  --model <model>       LLM model name (default: gpt-4)
  --debug               Enable debug logging

Environment Variables:
  OPENAI_API_KEY        OpenAI API key
  ANTHROPIC_API_KEY     Anthropic API key
  LLM_PROVIDER          LLM provider (openai/anthropic)
  LLM_MODEL             LLM model name
  MCP_PROXY_PORT        Server port for HTTP transport
  LOG_LEVEL             Log level (debug/info/warn/error)
  
  For stdio transport:
  CLAUDE_DESKTOP_CONFIG Path to claude_desktop_config.json (auto-detected by default)
  UPSTREAM_SERVERS_STDIO  Additional servers (name:command args,...) - overrides config file
  
  For HTTP transport:
  UPSTREAM_SERVERS_HTTP   Comma-separated upstream servers (name:url,...)

Claude Desktop Integration (stdio):
  By default, AEGIS will automatically load upstream MCP servers from your
  Claude Desktop configuration file (~/.../claude_desktop_config.json).
  All configured MCP servers (except aegis-proxy itself) will be available.

Examples:
  # Start with HTTP transport (default) - Web UI included
  node mcp-server.js

  # Start with HTTP transport on custom port
  node mcp-server.js --port 9000

  # Start with stdio transport
  node mcp-server.js --transport stdio
  

  # Start with Anthropic Claude
  node mcp-server.js --provider anthropic --model claude-3-opus-20240229

  # Enable debug logging
  node mcp-server.js --debug

  # Configure upstream servers via environment
  UPSTREAM_SERVERS_STDIO="gmail:node gmail-mcp.js" node mcp-server.js
  UPSTREAM_SERVERS_HTTP="gmail:http://localhost:8081" node mcp-server.js --transport http
  
`);
}

// メイン関数
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // CLIオプションを環境変数に反映
  if (options.port) process.env.MCP_PROXY_PORT = options.port;
  if (options.provider) process.env.LLM_PROVIDER = options.provider;
  if (options.model) process.env.LLM_MODEL = options.model;
  if (options.debug) process.env.LOG_LEVEL = 'debug';

  // トランスポートタイプを決定
  const transport = (options.transport as 'stdio' | 'http') || 'http';
  if (transport !== 'stdio' && transport !== 'http') {
    console.error('Invalid transport type. Use "stdio" or "http".');
    process.exit(1);
  }

  await startMCPServer(transport);
}

// 実行
main();