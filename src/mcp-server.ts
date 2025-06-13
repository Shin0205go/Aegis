#!/usr/bin/env node

// ============================================================================
// AEGIS - MCPプロキシサーバー (MCP公式仕様準拠版)
// stdio/Streamable HTTPトランスポート対応
// ============================================================================

import { Config } from './utils/config.js';
import { Logger } from './utils/logger.js';
import { AIJudgmentEngine } from './ai/judgment-engine.js';
import { MCPStdioPolicyProxy } from './mcp/stdio-proxy.js';
import { MCPHttpPolicyProxy } from './mcp/http-proxy.js';
import { SAMPLE_POLICIES } from '../policies/sample-policies.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 環境変数読み込み
dotenv.config();

/**
 * MCPプロキシサーバーを起動
 */
async function startMCPServer(transport: 'stdio' | 'http' = 'stdio') {
  const logger = new Logger();
  
  try {
    logger.info(`🚀 Starting AEGIS MCP Proxy Server (${transport} transport)...`);

    // 設定を読み込み
    const config = new Config({
      llm: {
        provider: process.env.LLM_PROVIDER as 'openai' | 'anthropic' || 'openai',
        model: process.env.LLM_MODEL || 'gpt-4',
        apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        temperature: 0.3
      },
      port: parseInt(process.env.PORT || '3000'),
      cache: {
        enabled: process.env.CACHE_ENABLED === 'true',
        ttl: parseInt(process.env.CACHE_TTL || '3600'),
        maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100')
      },
      mcpProxy: {
        port: parseInt(process.env.MCP_PROXY_PORT || '8080'),
        upstreamServers: {}
      }
    });

    // APIキーチェック
    if (!config.llm.apiKey) {
      throw new Error(
        'APIキーが設定されていません。環境変数 OPENAI_API_KEY または ANTHROPIC_API_KEY を設定してください。'
      );
    }

    // AI判定エンジン初期化
    logger.info('Initializing AI Judgment Engine...');
    const judgmentEngine = new AIJudgmentEngine(config.llm);

    // トランスポートに応じてプロキシを初期化
    let mcpProxy: MCPStdioPolicyProxy | MCPHttpPolicyProxy;
    
    if (transport === 'stdio') {
      logger.info('Using stdio transport (MCP standard)');
      mcpProxy = new MCPStdioPolicyProxy(config, logger, judgmentEngine);
      
      // 上流サーバー設定
      // 1. Claude Desktop設定ファイルから読み込み
      const desktopConfigPath = process.env.CLAUDE_DESKTOP_CONFIG || 
        path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      
      if (fs.existsSync(desktopConfigPath)) {
        try {
          const configContent = fs.readFileSync(desktopConfigPath, 'utf-8');
          const desktopConfig = JSON.parse(configContent);
          
          if (desktopConfig.mcpServers) {
            logger.info('Loading upstream servers from Claude Desktop config...');
            mcpProxy.loadDesktopConfig(desktopConfig);
            
            const serverNames = Object.keys(desktopConfig.mcpServers)
              .filter(name => name !== 'aegis-proxy' && name !== 'aegis');
            logger.info(`  ✓ Loaded ${serverNames.length} servers: ${serverNames.join(', ')}`);
          }
        } catch (error) {
          logger.warn('Failed to load Claude Desktop config:', error);
        }
      }
      
      // 2. 環境変数からの設定（オーバーライド）
      const upstreamServers = process.env.UPSTREAM_SERVERS_STDIO;
      if (upstreamServers) {
        logger.info('Configuring additional upstream servers from environment...');
        const servers = upstreamServers.split(',');
        servers.forEach(server => {
          const [name, ...commandParts] = server.trim().split(':');
          if (name && commandParts.length > 0) {
            const [command, ...args] = commandParts[0].split(' ');
            mcpProxy.addUpstreamServer(name, command, args);
            logger.info(`  ✓ Added upstream: ${name} -> ${command} ${args.join(' ')}`);
          }
        });
      }
    } else {
      logger.info('Using HTTP transport (MCP standard)');
      mcpProxy = new MCPHttpPolicyProxy(config, logger, judgmentEngine);
      
      // 上流サーバー設定（HTTP用）
      const upstreamServers = process.env.UPSTREAM_SERVERS_HTTP;
      if (upstreamServers) {
        logger.info('Configuring upstream servers...');
        const servers = upstreamServers.split(',');
        servers.forEach(server => {
          const [name, ...urlParts] = server.split(':');
          const url = urlParts.join(':');
          if (name && url) {
            mcpProxy.addUpstreamServer(name.trim(), url.trim());
            logger.info(`  ✓ Added upstream: ${name} -> ${url}`);
          }
        });
      }
    }

    // デフォルトポリシーを追加
    logger.info('Loading default policies...');
    Object.entries(SAMPLE_POLICIES).forEach(([key, policyData]) => {
      mcpProxy.addPolicy(key, policyData.policy);
      logger.info(`  ✓ Loaded policy: ${key}`);
    });

    // サーバー起動
    await mcpProxy.start();

    if (transport === 'stdio') {
      logger.info('✅ AEGIS MCP Proxy Server is running (stdio mode)');
      logger.info('📝 Reading from stdin, writing to stdout');
      logger.info('');
      logger.info('Connect via MCP client with stdio transport');
    } else {
      const port = config.mcpProxy.port || 8080;
      logger.info('✅ AEGIS MCP Proxy Server is running (HTTP mode)');
      logger.info(`📍 MCP endpoint: http://localhost:${port}/mcp/messages`);
      logger.info(`📊 Health check: http://localhost:${port}/health`);
      logger.info(`🔧 Policies API: http://localhost:${port}/policies`);
    }
    
    logger.info('');
    logger.info('Press Ctrl+C to stop the server');

    // グレースフルシャットダウン
    process.on('SIGINT', async () => {
      logger.info('\n🛑 Shutting down AEGIS MCP Proxy Server...');
      await mcpProxy.stop();
      logger.info('✅ Server stopped gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\n🛑 Shutting down AEGIS MCP Proxy Server...');
      await mcpProxy.stop();
      logger.info('✅ Server stopped gracefully');
      process.exit(0);
    });

    // エラーハンドリング
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start MCP Proxy Server:', error);
    process.exit(1);
  }
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
  console.log(`
AEGIS MCP Proxy Server (MCP Standard Compliant)

Usage: node mcp-server.js [options]

Options:
  --help                Show this help message
  --transport <type>    Transport type: stdio or http (default: stdio)
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
  # Start with stdio transport (default)
  node mcp-server.js

  # Start with HTTP transport
  node mcp-server.js --transport http --port 8080

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
  const transport = (options.transport as 'stdio' | 'http') || 'stdio';
  if (transport !== 'stdio' && transport !== 'http') {
    console.error('Invalid transport type. Use "stdio" or "http".');
    process.exit(1);
  }

  await startMCPServer(transport);
}

// 実行
main();