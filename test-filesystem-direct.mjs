#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testFilesystemDirect() {
  console.log('🔧 Testing filesystem server directly...\n');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      '--experimental-modules',
      'node_modules/@modelcontextprotocol/server-filesystem/dist/index.js',
      '/workspace'
    ]
  });
  
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('✅ Connected to filesystem server');
    
    // List available tools
    console.log('\n📋 Available tools:');
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools`);
    
    // Test listing allowed directories
    console.log('\n📁 Testing list allowed directories:');
    const dirs = await client.callTool('list_allowed_directories', {});
    console.log('Allowed directories:', dirs);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n👋 Test completed');
  }
}

testFilesystemDirect().catch(console.error);