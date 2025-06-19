#!/usr/bin/env node

// Test script for MCP HTTP proxy endpoints
const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

// Test 1: GET request to establish SSE stream
console.log('Testing GET /mcp/messages (SSE stream)...');
const getReq = http.request({
  hostname: HOST,
  port: PORT,
  path: '/mcp/messages',
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream'
  }
}, (res) => {
  console.log(`GET Status: ${res.statusCode}`);
  console.log(`GET Headers:`, res.headers);
  
  res.on('data', (chunk) => {
    console.log(`GET Data: ${chunk.toString()}`);
  });
  
  // Close after 2 seconds
  setTimeout(() => {
    res.destroy();
    testPost();
  }, 2000);
});

getReq.on('error', (err) => {
  console.error('GET Error:', err);
  testPost();
});

getReq.end();

// Test 2: POST request with JSON-RPC
function testPost() {
  console.log('\nTesting POST /mcp/messages (JSON-RPC)...');
  
  const postData = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-12-10',
      capabilities: {}
    },
    id: 1
  });
  
  const postReq = http.request({
    hostname: HOST,
    port: PORT,
    path: '/mcp/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    console.log(`POST Status: ${res.statusCode}`);
    console.log(`POST Headers:`, res.headers);
    
    let body = '';
    res.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    res.on('end', () => {
      console.log('POST Response:', body);
      testDelete();
    });
  });
  
  postReq.on('error', (err) => {
    console.error('POST Error:', err);
    testDelete();
  });
  
  postReq.write(postData);
  postReq.end();
}

// Test 3: DELETE request to terminate session
function testDelete() {
  console.log('\nTesting DELETE /mcp/messages (terminate session)...');
  
  const deleteReq = http.request({
    hostname: HOST,
    port: PORT,
    path: '/mcp/messages',
    method: 'DELETE',
    headers: {
      'X-Session-Id': 'test-session-123'
    }
  }, (res) => {
    console.log(`DELETE Status: ${res.statusCode}`);
    console.log(`DELETE Headers:`, res.headers);
    
    res.on('data', (chunk) => {
      console.log(`DELETE Data: ${chunk.toString()}`);
    });
    
    res.on('end', () => {
      console.log('\nAll tests completed!');
      process.exit(0);
    });
  });
  
  deleteReq.on('error', (err) => {
    console.error('DELETE Error:', err);
    process.exit(1);
  });
  
  deleteReq.end();
}

console.log(`Testing MCP HTTP endpoints at http://${HOST}:${PORT}/mcp/messages`);
console.log('Make sure AEGIS proxy is running on port 3000\n');