#!/usr/bin/env node

// Test script to verify stdio output is clean

const { spawn } = require('child_process');
const path = require('path');

console.error('Testing AEGIS stdio mode output...\n');

const aegis = spawn('node', [path.join(__dirname, 'dist/src/mcp-server.js'), '--transport', 'stdio'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdoutBuffer = '';
let stderrBuffer = '';

aegis.stdout.on('data', (data) => {
  stdoutBuffer += data.toString();
  console.error(`STDOUT (${data.length} bytes): ${JSON.stringify(data.toString().substring(0, 100))}`);
});

aegis.stderr.on('data', (data) => {
  stderrBuffer += data.toString();
  console.error(`STDERR: ${data.toString()}`);
});

// Send a test JSON-RPC request
setTimeout(() => {
  const testRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '1.0.0',
      capabilities: {}
    }
  }) + '\n';
  
  console.error('\nSending test request:', testRequest);
  aegis.stdin.write(testRequest);
}, 1000);

// Kill after 3 seconds
setTimeout(() => {
  aegis.kill();
  console.error('\n\nTest complete.');
  console.error('Total stdout output:', stdoutBuffer.length, 'bytes');
  console.error('First 200 chars of stdout:', JSON.stringify(stdoutBuffer.substring(0, 200)));
}, 3000);