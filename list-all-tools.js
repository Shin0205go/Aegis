const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function listAllTools() {
  try {
    // Suppress debug logs
    process.env.AEGIS_LOG_LEVEL = 'error';
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['./dist/src/mcp-server.js'],
      env: { ...process.env, AEGIS_LOG_LEVEL: 'error' }
    });
    
    const client = new Client({
      name: 'tool-lister',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('Connecting to AEGIS...');
    await client.connect(transport);
    console.log('Connected. Fetching tools list...\n');
    
    const response = await client.listTools();
    const tools = response.tools;
    
    // Group tools by server
    const toolsByServer = {};
    tools.forEach(tool => {
      const parts = tool.name.split('__');
      const serverName = parts.length > 1 ? parts[0] : 'unknown';
      const toolName = parts.length > 1 ? parts.slice(1).join('__') : tool.name;
      
      if (!toolsByServer[serverName]) {
        toolsByServer[serverName] = [];
      }
      
      toolsByServer[serverName].push({
        name: toolName,
        description: tool.description
      });
    });
    
    // Display tools by server
    console.log(`📊 Total tools available: ${tools.length}\n`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    Object.entries(toolsByServer).forEach(([server, serverTools]) => {
      console.log(`📦 ${server.toUpperCase()} (${serverTools.length} tools)`);
      console.log('───────────────────────────────────────────────────────────');
      
      serverTools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}`);
        if (tool.description) {
          // Truncate long descriptions
          const desc = tool.description.length > 60 
            ? tool.description.substring(0, 60) + '...' 
            : tool.description;
          console.log(`     └─ ${desc}`);
        }
      });
      console.log('');
    });
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listAllTools();