#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testAegisFilesystem() {
  console.log('🔧 Testing AEGIS MCP Proxy with filesystem tools...\n');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/src/mcp-server.js']
  });
  
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('✅ Connected to AEGIS proxy');
    
    // List available tools
    console.log('\n📋 Available tools:');
    const tools = await client.listTools();
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    
    // Test filesystem read (should be allowed)
    console.log('\n📖 Testing file read (should be allowed):');
    try {
      const readResult = await client.callTool('filesystem__read_file', {
        path: '/workspace/README.md'
      });
      console.log('✅ Read succeeded');
      console.log('Content preview:', readResult.content.slice(0, 100) + '...');
    } catch (error) {
      console.log('❌ Read failed:', error.message);
    }
    
    // Test filesystem write (should be denied)
    console.log('\n✏️ Testing file write (should be denied):');
    try {
      const writeResult = await client.callTool('filesystem__write_file', {
        path: '/workspace/test-write.txt',
        content: 'This should be blocked by policy'
      });
      console.log('❌ Write succeeded (policy not enforced!)');
    } catch (error) {
      console.log('✅ Write denied as expected:', error.message);
    }
    
    // Test after 22:00 (if current time is after 22:00)
    const hour = new Date().getHours();
    console.log(`\n🕐 Current hour: ${hour}`);
    if (hour >= 22) {
      console.log('Testing access after 22:00 (should be denied):');
      try {
        const lateResult = await client.callTool('filesystem__list_directory', {
          path: '/workspace'
        });
        console.log('❌ Late access succeeded (policy not enforced!)');
      } catch (error) {
        console.log('✅ Late access denied as expected:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\n👋 Test completed');
  }
}

testAegisFilesystem().catch(console.error);