#!/usr/bin/env node

/**
 * MCP Launcher - Claude Desktop用ラッパー
 * MCPサーバーとWeb UI（ポリシー管理・監査ダッシュボード）を同時に起動
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

log('🚀 Starting AEGIS MCP Server with Web UI...');

// APIサーバー（Web UI）を起動
// tsx を使用してTypeScriptファイルを直接実行
const apiServer = spawn('npx', [
  'tsx',
  path.join(__dirname, 'src/api/server.ts')
], {
  stdio: ['ignore', 'ignore', 'pipe'], // stderrをパイプして取得
  cwd: __dirname, // 作業ディレクトリを設定
  detached: false,
  env: process.env
});

// APIサーバーのエラー出力をログファイルに記録
apiServer.stderr.on('data', (data) => {
  log(`[API Server Error] ${data.toString().trim()}`);
});

log(`🌐 Web UI started on http://localhost:3000 (PID: ${apiServer.pid})`);
log('  📝 Policy Management: http://localhost:3000/');
log('  📊 Audit Dashboard: http://localhost:3000/audit-dashboard.html');
log('  🔍 Request Dashboard: http://localhost:3000/request-dashboard.html');

// MCPサーバーを起動（stdioで通信）
const mcpServer = spawn('node', [
  path.join(__dirname, 'dist/src/mcp-server.js')
], {
  stdio: 'inherit',
  env: process.env
});

// プロセス終了時の処理
process.on('SIGINT', () => {
  log('⏹️  Shutting down...');
  apiServer.kill();
  mcpServer.kill();
  logStream.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Terminated');
  apiServer.kill();
  mcpServer.kill();
  logStream.end();
  process.exit(0);
});

// MCPサーバーが終了したらAPIサーバーも終了
mcpServer.on('exit', (code) => {
  apiServer.kill();
  process.exit(code);
});