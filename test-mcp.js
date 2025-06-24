#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

async function main() {
  const server = new Server(
    {
      name: 'test-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: [{
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      }
    }]
  }));

  server.setRequestHandler('tools/call', async (request) => ({
    content: [{
      type: 'text',
      text: `You said: ${request.params.arguments.message}`
    }]
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr
  console.error('Test MCP server started');
}

main().catch(console.error);