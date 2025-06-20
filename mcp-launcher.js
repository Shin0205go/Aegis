#!/usr/bin/env node

/**
 * MCP Launcher - Claude Desktop用ラッパー
 * 統合MCPサーバー（MCP機能 + Web UI）を起動
 */

const { spawn } = require('child_process');
const path = require('path');

// 環境変数を.envから読み込む
require('dotenv').config();

// ログをファイルに出力（stdioを汚染しないため）
const fs = require('fs');
const logFile = path.join(__dirname, 'logs', 'mcp-launcher.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
}

log('🚀 Starting AEGIS MCP Server (統合版)...');

// MCPサーバーを起動（stdioで通信）
const mcpServer = spawn('node', [
  path.join(__dirname, 'dist/src/mcp-server.js')
], {
  stdio: 'inherit',
  env: process.env
});

log('🛡️ AEGIS MCP Server started (統合版)');
log('  🌐 Web UI: http://localhost:8080/');
log('  📝 Policy Management: http://localhost:8080/api/policies');
log('  📊 Audit Dashboard: http://localhost:8080/audit-dashboard.html');
log('  🔍 Request Dashboard: http://localhost:8080/request-dashboard.html');
log('  📡 MCP Endpoint: http://localhost:8080/mcp/messages');

// プロセス終了時の処理
process.on('SIGINT', () => {
  log('⏹️  Shutting down...');
  mcpServer.kill();
  logStream.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Terminated');
  mcpServer.kill();
  logStream.end();
  process.exit(0);
});