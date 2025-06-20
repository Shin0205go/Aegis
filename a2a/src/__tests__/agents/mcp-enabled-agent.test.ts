/**
 * MCP-Enabled Agent Tests
 */

import { MCPEnabledAgent } from '../../agents/mcp-enabled-agent';
import { TaskState } from '../../types/a2a-protocol';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Test implementation of MCPEnabledAgent
class TestMCPAgent extends MCPEnabledAgent {
  protected async processTask(task: any): Promise<void> {
    this.updateTaskState(task.id, TaskState.WORKING);
    
    try {
      // Use MCP tools
      const files = await this.listDirectory('/test', this.buildTaskContext(task));
      
      this.updateTaskState(task.id, TaskState.COMPLETED, {
        result: { files }
      });
    } catch (error) {
      this.updateTaskState(task.id, TaskState.FAILED, {
        error: {
          code: 'MCP_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
}

describe('MCPEnabledAgent', () => {
  let agent: TestMCPAgent;
  
  beforeEach(() => {
    mockedAxios.post.mockClear();
    
    agent = new TestMCPAgent({
      name: 'test-mcp-agent',
      description: 'Test MCP agent',
      port: 9999,
      organization: 'Test',
      organizationUrl: 'https://test.org',
      aegisProxyUrl: 'http://localhost:3000',
      agentMetadata: {
        department: 'testing',
        clearanceLevel: 'high'
      }
    });
  });

  afterEach(async () => {
    await agent.stop();
  });

  describe('MCP Tool Discovery', () => {
    it('should list MCP tools on startup', async () => {
      // Mock MCP initialization response with SSE format
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock tools list response
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[{"name":"filesystem__read_file","description":"Read file","inputSchema":{}},{"name":"filesystem__write_file","description":"Write file","inputSchema":{}}]},"id":2}\n\n'
      });

      await agent.start();

      // Check that tools were listed
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/mcp/messages',
        expect.objectContaining({
          method: 'tools/list'
        }),
        expect.any(Object)
      );
    });

    it('should handle tool listing errors gracefully', async () => {
      // Mock MCP initialization
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock tool listing error
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await agent.start();
      
      // Should have empty tools list
      const capabilities = (agent as any).getCapabilities();
      expect(capabilities.mcpTools).toEqual([]);
    });
  });

  describe('MCP Tool Execution', () => {
    beforeEach(async () => {
      // Mock MCP initialization
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock successful tool listing
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[]},"id":2}\n\n'
      });
      
      await agent.start();
      mockedAxios.post.mockClear();
    });

    it('should call MCP tools with proper headers', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          result: { entries: ['file1.txt', 'file2.md'] },
          id: 2
        }
      });

      const result = await (agent as any).listDirectory('/test', {
        taskId: 'test-task-123',
        delegationChain: ['agent1', 'agent2'],
        priority: 'high'
      });

      expect(result).toEqual(['file1.txt', 'file2.md']);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/mcp/messages',
        expect.objectContaining({
          method: 'tools/call',
          params: {
            name: 'filesystem__list_directory',
            arguments: { path: '/test' }
          }
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Agent-ID': 'test-mcp-agent',
            'X-Task-ID': 'test-task-123',
            'X-Delegation-Chain': '["agent1","agent2"]',
            'X-Priority': 'high'
          })
        })
      );
    });

    it('should handle policy denial errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'data: {"jsonrpc":"2.0","error":{"code":-32001,"message":"Policy denied: Agent lacks permission for filesystem access"},"id":2}\n\n'
      });

      await expect(
        (agent as any).callMCPTool('filesystem__read_file', { path: '/secret' })
      ).rejects.toThrow('MCP Error: Policy denied');
    });

    it('should handle generic MCP errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'data: {"jsonrpc":"2.0","error":{"code":-32603,"message":"Internal error"},"id":2}\n\n'
      });

      await expect(
        (agent as any).callMCPTool('unknown_tool', {})
      ).rejects.toThrow('MCP Error: Internal error');
    });

    it('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        (agent as any).callMCPTool('any_tool', {})
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('Helper Methods', () => {
    beforeEach(async () => {
      // Mock MCP initialization
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock tools list
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[]},"id":2}\n\n'
      });
      
      await agent.start();
      mockedAxios.post.mockClear();
    });

    it('should read file via MCP', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"content":"File contents"},"id":2}\n\n'
      });

      const content = await (agent as any).readFile('/test.txt');
      expect(content).toBe('File contents');
    });

    it('should write file via MCP', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{},"id":2}\n\n'
      });

      await (agent as any).writeFile('/output.txt', 'Hello world');
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            name: 'filesystem__write_file',
            arguments: {
              path: '/output.txt',
              content: 'Hello world'
            }
          }
        }),
        expect.any(Object)
      );
    });

    it('should execute commands via MCP', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"stdout":"Command output","stderr":"","exitCode":0},"id":2}\n\n'
      });

      const result = await (agent as any).executeCommand('echo test');
      expect(result.stdout).toBe('Command output');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Task Processing with MCP', () => {
    beforeEach(async () => {
      // Mock MCP initialization
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock tools list
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[]},"id":2}\n\n'
      });
      
      await agent.start();
      mockedAxios.post.mockClear();
    });

    it('should process task using MCP tools', async () => {
      // Mock directory listing
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"entries":["doc1.md","doc2.txt"]},"id":2}\n\n'
      });

      const taskResult = await new Promise((resolve) => {
        agent.on('taskUpdate', (update) => {
          if (update.state === TaskState.COMPLETED) {
            resolve((agent as any).tasks.get(update.taskId));
          }
        });

        (agent as any).handleSendTask({
          prompt: 'List test directory'
        });
      });

      expect((taskResult as any).state).toBe(TaskState.COMPLETED);
      expect((taskResult as any).result.files).toEqual(['doc1.md', 'doc2.txt']);
    });

    it('should handle MCP errors in task processing', async () => {
      // Mock policy denial
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","error":{"code":-32001,"message":"Policy denied: No directory access"},"id":2}\n\n'
      });

      const taskResult = await new Promise((resolve) => {
        agent.on('taskUpdate', (update) => {
          if (update.state === TaskState.FAILED) {
            resolve((agent as any).tasks.get(update.taskId));
          }
        });

        (agent as any).handleSendTask({
          prompt: 'List restricted directory'
        });
      });

      expect((taskResult as any).state).toBe(TaskState.FAILED);
      expect((taskResult as any).error.code).toBe('MCP_ERROR');
      expect((taskResult as any).error.message).toContain('No valid data in SSE response');
    });
  });

  describe('Capabilities', () => {
    it('should include MCP tools in capabilities', async () => {
      // Mock MCP initialization
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'mcp-session-id': 'test-session-123'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"test","version":"1.0.0"}},"id":1}\n\n'
      });
      
      // Mock tools list with tools
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        },
        data: 'event: message\ndata: {"jsonrpc":"2.0","result":{"tools":[{"name":"tool1","description":"Tool 1","inputSchema":{}},{"name":"tool2","description":"Tool 2","inputSchema":{}}]},"id":2}\n\n'
      });

      await agent.start();

      const capabilities = (agent as any).getCapabilities();
      expect(capabilities.mcpTools).toEqual(['tool1', 'tool2']);
      expect(capabilities.mcpEnabled).toBe(true);
    });
  });
});