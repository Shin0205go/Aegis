/**
 * Mock AEGIS MCP Server for Testing
 */

import express, { Express } from 'express';
import { Server } from 'http';

export interface MockAEGISConfig {
  port: number;
  policies?: {
    [agentId: string]: {
      allowedTools: string[];
      deniedTools?: string[];
    };
  };
}

export class MockAEGISServer {
  private app: Express;
  private server?: Server;
  private sessions: Map<string, { agentId: string; initialized: boolean }> = new Map();
  private policies: MockAEGISConfig['policies'];

  constructor(private config: MockAEGISConfig) {
    this.app = express();
    this.policies = config.policies || {};
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Agent-ID, mcp-session-id');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', mode: 'mock' });
    });

    // MCP Messages endpoint
    this.app.post('/mcp/messages', (req, res) => {
      const { method, params, id } = req.body;
      const agentId = req.headers['x-agent-id'] as string;
      const sessionId = req.headers['mcp-session-id'] as string;

      console.log(`Mock AEGIS: ${method} from ${agentId}`);

      switch (method) {
        case 'initialize':
          return this.handleInitialize(req, res, agentId, id);
        
        case 'tools/list':
          return this.handleToolsList(req, res, agentId, sessionId, id);
        
        case 'tools/call':
          return this.handleToolCall(req, res, agentId, sessionId, params, id);
        
        default:
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            },
            id
          });
      }
    });
  }

  private handleInitialize(req: any, res: any, agentId: string, id: any): void {
    const sessionId = this.generateSessionId();
    
    this.sessions.set(sessionId, {
      agentId: agentId || 'unknown',
      initialized: true
    });

    res.setHeader('mcp-session-id', sessionId);
    res.setHeader('Content-Type', 'text/event-stream');
    
    const response = {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: {},
          tools: {}
        },
        serverInfo: {
          name: 'mock-aegis-proxy',
          version: '1.0.0'
        }
      },
      id
    };

    res.send(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }

  private handleToolsList(req: any, res: any, agentId: string, sessionId: string, id: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid session' },
        id
      });
      return;
    }

    // Use the agent ID from the session if available
    const effectiveAgentId = session.agentId || agentId || 'unknown';
    console.log(`Mock AEGIS: tools/list for agent: ${effectiveAgentId}`);
    
    const policy = this.policies?.[effectiveAgentId] || this.policies?.['default'];
    const allowedTools = policy?.allowedTools || [];
    console.log(`Mock AEGIS: Allowed tools for ${effectiveAgentId}:`, allowedTools);

    const tools = allowedTools.map(toolName => ({
      name: toolName,
      description: `Mock tool: ${toolName}`,
      inputSchema: {
        type: 'object',
        properties: {
          args: { type: 'object' }
        }
      }
    }));

    res.setHeader('Content-Type', 'text/event-stream');
    const response = {
      jsonrpc: '2.0',
      result: { tools },
      id
    };

    res.send(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }

  private handleToolCall(req: any, res: any, agentId: string, sessionId: string, params: any, id: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid session' },
        id
      });
      return;
    }

    // Get the actual requester agent from X-Agent-ID header (which is updated per call)
    console.log('Mock AEGIS: Request headers:', req.headers);
    const requesterAgent = req.headers['x-agent-id'] || agentId;
    const toolName = params?.name;
    console.log(`Mock AEGIS: tools/call from ${requesterAgent} for tool: ${toolName}`);
    const policy = this.policies?.[requesterAgent] || this.policies?.['default'];
    
    // Policy check
    if (!policy?.allowedTools?.includes(toolName)) {
      console.log(`Mock AEGIS: Policy denied for ${requesterAgent} using tool ${toolName}`);
      res.setHeader('Content-Type', 'text/event-stream');
      const response = {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Policy denied: Agent ${requesterAgent} not allowed to use tool ${toolName}`
        },
        id
      };
      res.send(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      return;
    }

    // Mock tool execution
    const mockResult = this.executeMockTool(toolName, params?.arguments);
    
    res.setHeader('Content-Type', 'text/event-stream');
    const response = {
      jsonrpc: '2.0',
      result: {
        content: [
          {
            type: 'text',
            text: mockResult
          }
        ]
      },
      id
    };

    res.send(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }

  private executeMockTool(toolName: string, args: any): string {
    switch (toolName) {
      case 'filesystem__list_directory':
        return JSON.stringify(['file1.txt', 'file2.md', 'subdir/']);
      
      case 'filesystem__read_file':
        return `Mock file content for ${args?.path}`;
      
      case 'web_search':
        return JSON.stringify({
          results: [
            { title: 'Mock Search Result', url: 'https://example.com', snippet: 'Mock snippet' }
          ]
        });
      
      case 'execution-server__execute':
        return `Mock command output for: ${args?.command}`;
      
      default:
        return `Mock result for tool: ${toolName}`;
    }
  }

  private generateSessionId(): string {
    return `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Mock AEGIS server started on port ${this.config.port}`);
        resolve();
      });
      
      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('Mock AEGIS server stopped');
          resolve();
        });
      });
    }
  }
}

// Helper function for tests
export async function createMockAEGISServer(port: number = 8080, policies?: MockAEGISConfig['policies']): Promise<MockAEGISServer> {
  const server = new MockAEGISServer({ 
    port, 
    policies: policies || {
      'mcp-research-agent': {
        allowedTools: ['filesystem__list_directory', 'filesystem__read_file', 'web_search']
      },
      'trusted-agent': {
        allowedTools: ['filesystem__list_directory', 'filesystem__read_file']
      },
      'untrusted-agent': {
        allowedTools: [] // No tools allowed
      },
      'default': {
        allowedTools: ['web_search'] // Minimal access
      }
    }
  });
  
  await server.start();
  return server;
}