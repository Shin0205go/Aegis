#!/usr/bin/env node

/**
 * MCP Launcher - Claude Desktop用ラッパー
 * 統合MCPサーバー（stdio/HTTPモード自動判定）を起動
 */

const { spawn } = require('child_process');
const path = require('path');

// 環境変数を.envから読み込む
require('dotenv').config();

// ログをファイルに出力（stdioを汚染しないため）
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
// ログディレクトリが存在しない場合は作成
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const logFile = path.join(logsDir, 'mcp-launcher.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
}

// 起動モードを判定（環境変数またはコマンドライン引数から）
const transport = process.env.MCP_TRANSPORT || process.argv[2] || 'http';

log(`🚀 Starting AEGIS MCP Server (${transport} mode)...`);

// MCPサーバーを起動
const args = [path.join(__dirname, '..', 'dist/src/mcp-server.js')];
if (transport === 'stdio') {
  args.push('--transport', 'stdio');
}

// stdioモードの場合は標準入出力を継承、httpモードの場合はログ出力を許可
const mcpServer = spawn('node', args, {
  stdio: transport === 'stdio' ? ['inherit', 'inherit', 'pipe'] : 'inherit',
  cwd: __dirname, // 作業ディレクトリをプロジェクトルートに設定
  env: {
    ...process.env,
    MCP_TRANSPORT: transport,
    // stdioモードではログを無効化
    LOG_SILENT: transport === 'stdio' ? 'true' : 'false'
  }
});

// spawnエラーのハンドリング
mcpServer.on('error', (err) => {
  log(`Failed to start MCP server: ${err.message}`);
  console.error(`Failed to start MCP server: ${err.message}`);
  process.exit(1);
});

// 子プロセスの終了を監視
mcpServer.on('exit', (code, signal) => {
  if (code !== null) {
    log(`MCP server exited with code ${code}`);
    if (code !== 0) {
      console.error(`MCP server exited with code ${code}`);
      process.exit(code);
    }
  } else if (signal !== null) {
    log(`MCP server terminated by signal ${signal}`);
  }
});

// stdioモードでは標準エラー出力をログファイルにリダイレクト
if (transport === 'stdio' && mcpServer.stderr) {
  mcpServer.stderr.on('data', (data) => {
    log(`[STDERR] ${data.toString().trim()}`);
  });
}

log(`🛡️ AEGIS MCP Server started (${transport} mode)`);
log(`  📡 MCP communication via ${transport}`);
log('  🔒 Policy enforcement enabled');
if (transport === 'http') {
  log('  🌐 Web UI available at http://localhost:3000/');
}

// プロセス終了時の処理
let isExiting = false;

function cleanup(signal) {
  if (isExiting) return;
  isExiting = true;
  
  log(`Received ${signal}, shutting down...`);
  
  // 子プロセスが存在し、まだ終了していない場合は終了させる
  if (mcpServer && !mcpServer.killed) {
    mcpServer.kill('SIGTERM');
    
    // 5秒待っても終了しない場合は強制終了
    const FORCE_KILL_TIMEOUT = 5000;
    setTimeout(() => {
      if (!mcpServer.killed) {
        log('Force killing MCP server...');
        mcpServer.kill('SIGKILL');
      }
    }, FORCE_KILL_TIMEOUT);
  }
  
  // ログストリームを閉じる
  logStream.end(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
  console.error('Uncaught exception:', err);
  cleanup('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  console.error('Unhandled rejection:', reason);
  cleanup('unhandledRejection');
});