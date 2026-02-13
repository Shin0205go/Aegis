// ============================================================================
// StdioRouter Test Suite
// ============================================================================

import { StdioRouter, MCPServerConfig, UpstreamServerInfo } from '../../mcp/stdio-router';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { TIMEOUTS } from '../../constants';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Helper function to create mock process
function createMockProcess(): {
  process: any;
  stdin: { write: jest.Mock };
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const stdin = { write: jest.fn() };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  
  const mockProcess = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: jest.fn(),
    pid: Math.floor(Math.random() * 10000)
  });

  return { process: mockProcess, stdin, stdout, stderr };
}

describe('StdioRouter', () => {
  let router: StdioRouter;
  let mockLogger: jest.Mocked<Logger>;
  let mockSpawn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;
    
    router = new StdioRouter(mockLogger);
    
    const { spawn } = require('child_process');
    mockSpawn = spawn as jest.Mock;
  });

  afterEach(() => {
    // Clean up any remaining processes
    router.stopServers().catch(() => {});
  });

  describe('Server Configuration', () => {
    it('should add server from config', () => {
      const config: MCPServerConfig = {
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' }
      };

      router.addServerFromConfig('test-server', config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configured upstream server: test-server',
        { command: 'node', args: ['server.js'] }
      );
    });

    it('should load multiple servers from desktop config', () => {
      const desktopConfig = {
        mcpServers: {
          'server1': { command: 'node', args: ['server1.js'] },
          'server2': { command: 'node', args: ['server2.js'] },
          'aegis-proxy': { command: 'node', args: ['aegis.js'] }, // Should be excluded
          'aegis': { command: 'node', args: ['aegis2.js'] } // Should be excluded
        }
      };

      router.loadServersFromDesktopConfig(desktopConfig);

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configured upstream server: server1',
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configured upstream server: server2',
        expect.any(Object)
      );
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      const { process: mockProcess, stdout, stderr } = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const config: MCPServerConfig = {
        command: 'node',
        args: ['test.js']
      };
      router.addServerFromConfig('test-server', config);

      const startPromise = router.startServers();

      // Simulate server initialization
      setTimeout(() => {
        stderr.emit('data', Buffer.from('Server running on stdio\n'));
      }, 10);

      await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith('node', ['test.js'], {
        env: expect.any(Object),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully started upstream server: test-server'
      );
    });

    it('should handle server startup failure', async () => {
      const { process: mockProcess } = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const config: MCPServerConfig = {
        command: 'invalid-command',
        args: []
      };
      router.addServerFromConfig('failing-server', config);

      // Trigger error after a short delay to allow handler registration
      setTimeout(() => {
        mockProcess.emit('error', new Error('Failed to start'));
      }, 100);

      await router.startServers();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start server failing-server:',
        expect.any(Error)
      );
    }, 35000);

    it('should handle server initialization timeout', async () => {
      const { process: mockProcess } = createMockProcess();
      // Mark process as killed to trigger error path instead of warning path
      mockProcess.killed = true;
      mockSpawn.mockReturnValue(mockProcess);

      const config: MCPServerConfig = {
        command: 'node',
        args: ['slow.js']
      };
      router.addServerFromConfig('slow-server', config);

      // Start servers - should timeout after 10 seconds waiting for MCP init
      // Don't emit stderr or stdout, so no initialization happens
      await router.startServers();

      // Process is killed, so timeout should trigger error path
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start server slow-server:',
        expect.objectContaining({
          message: expect.stringContaining('initialization timeout')
        })
      );
    }, 15000);

    it('should expand environment variables', async () => {
      process.env.TEST_VAR = 'test-value';
      const { process: mockProcess, stderr } = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const config: MCPServerConfig = {
        command: 'node',
        args: ['test.js'],
        env: {
          NORMAL_VAR: 'normal',
          EXPANDED_VAR: '${TEST_VAR}'
        }
      };
      router.addServerFromConfig('env-test', config);

      const startPromise = router.startServers();
      setTimeout(() => stderr.emit('data', Buffer.from('Server started\n')), 10);
      await startPromise;

      expect(mockSpawn).toHaveBeenCalledWith('node', ['test.js'], {
        env: expect.objectContaining({
          NORMAL_VAR: 'normal',
          EXPANDED_VAR: 'test-value'
        }),
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should auto-restart server on crash', async () => {
      const { process: mockProcess1, stderr: stderr1 } = createMockProcess();
      const { process: mockProcess2, stderr: stderr2 } = createMockProcess();
      
      mockSpawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      const config: MCPServerConfig = {
        command: 'node',
        args: ['crash.js']
      };
      router.addServerFromConfig('crash-server', config);

      const startPromise = router.startServers();
      setTimeout(() => stderr1.emit('data', Buffer.from('Server started\n')), 10);
      await startPromise;

      // Simulate crash
      mockProcess1.emit('close', 1);

      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.CONTEXT_ENRICHMENT + 100));

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Server crash-server exited with code 1'
      );
    });

    it('should stop all servers', async () => {
      const { process: mockProcess1, stderr: stderr1 } = createMockProcess();
      const { process: mockProcess2, stderr: stderr2 } = createMockProcess();
      
      mockSpawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      router.addServerFromConfig('server1', { command: 'node' });
      router.addServerFromConfig('server2', { command: 'node' });

      const startPromise = router.startServers();
      setTimeout(() => {
        stderr1.emit('data', Buffer.from('Server started\n'));
        stderr2.emit('data', Buffer.from('Server started\n'));
      }, 10);
      await startPromise;

      // Mock kill to trigger close event
      (mockProcess1.kill as jest.Mock).mockImplementation(() => {
        setTimeout(() => {
          const closeListeners = (mockProcess1 as any).listeners('close');
          closeListeners.forEach((listener: any) => listener(0, 'SIGTERM'));
        }, 10);
      });
      (mockProcess2.kill as jest.Mock).mockImplementation(() => {
        setTimeout(() => {
          const closeListeners = (mockProcess2 as any).listeners('close');
          closeListeners.forEach((listener: any) => listener(0, 'SIGTERM'));
        }, 10);
      });

      await router.stopServers();

      expect(mockProcess1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProcess2.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Request Routing', () => {
    let mockProcess: any;
    let stdin: { write: jest.Mock };
    let stdout: EventEmitter;
    let stderr: EventEmitter;

    beforeEach(async () => {
      const mock = createMockProcess();
      mockProcess = mock.process;
      stdin = mock.stdin;
      stdout = mock.stdout;
      stderr = mock.stderr;
      
      mockSpawn.mockReturnValue(mockProcess);

      router.addServerFromConfig('test-server', { command: 'node', args: ['test.js'] });
      
      const startPromise = router.startServers();
      setTimeout(() => stderr.emit('data', Buffer.from('Server started\n')), 10);
      await startPromise;
    });

    it('should route simple request to server', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'test/method',
        params: { foo: 'bar' },
        id: 1
      };

      const routePromise = router.routeRequest(request);

      // Verify request was sent
      expect(stdin.write).toHaveBeenCalledWith(
        JSON.stringify(request) + '\n'
      );

      // Simulate response
      const response = {
        jsonrpc: '2.0',
        result: { success: true },
        id: 1
      };
      stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));

      const result = await routePromise;
      expect(result).toEqual(response);
    });

    it('should handle request timeout', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'slow/method',
        params: {},
        id: 2
      };

      // Mock setTimeout to trigger immediately
      jest.useFakeTimers();
      
      const routePromise = router.routeRequest(request);
      
      // Fast-forward time
      jest.advanceTimersByTime(30001);
      
      await expect(routePromise).rejects.toThrow('Request timeout for slow/method');
      
      jest.useRealTimers();
    });

    it('should aggregate tools/list from multiple servers', async () => {
      // Add second server
      const { process: mockProcess2, stdin: stdin2, stdout: stdout2, stderr: stderr2 } = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess2);

      router.addServerFromConfig('server2', { command: 'node', args: ['server2.js'] });
      const startPromise = router.startServers();

      // Simulate server2 startup and initialization
      setTimeout(() => {
        stderr2.emit('data', Buffer.from('Server started\n'));
        // Send initialize response for server2
        const initResponse = {
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'server2', version: '1.0.0' },
            capabilities: {}
          }
        };
        stdout2.emit('data', Buffer.from(JSON.stringify(initResponse) + '\n'));
      }, 100);

      await startPromise;

      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 3
      };

      const routePromise = router.routeRequest(request);

      // Wait a bit for the request to be sent
      await new Promise(resolve => setTimeout(resolve, 50));

      // Both servers should receive the request
      expect(stdin.write).toHaveBeenCalled();
      expect(stdin2.write).toHaveBeenCalled();

      // Simulate responses from both servers
      const response1 = {
        jsonrpc: '2.0',
        result: { tools: [{ name: 'tool1', description: 'Tool 1' }] },
        id: expect.stringMatching(/3-test-server-/)
      };
      const response2 = {
        jsonrpc: '2.0',
        result: { tools: [{ name: 'tool2', description: 'Tool 2' }] },
        id: expect.stringMatching(/3-server2-/)
      };

      // Find the actual request IDs used
      const call1 = stdin.write.mock.calls.find(call => 
        call[0].includes('tools/list')
      );
      const call2 = stdin2.write.mock.calls.find(call => 
        call[0].includes('tools/list')
      );
      
      if (call1 && call2) {
        const req1 = JSON.parse(call1[0].trim());
        const req2 = JSON.parse(call2[0].trim());
        
        response1.id = req1.id;
        response2.id = req2.id;
        
        stdout.emit('data', Buffer.from(JSON.stringify(response1) + '\n'));
        stdout2.emit('data', Buffer.from(JSON.stringify(response2) + '\n'));
      }

      const result = await routePromise;
      
      expect(result.result.tools).toHaveLength(2);
      expect(result.result.tools).toContainEqual({
        name: 'test-server__tool1',
        description: 'Tool 1'
      });
      expect(result.result.tools).toContainEqual({
        name: 'server2__tool2',
        description: 'Tool 2'
      });
    });

    it('should route tools/call based on tool name prefix', async () => {
      // Clear initialization calls
      stdin.write.mockClear();

      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'test-server__some-tool', arguments: {} },
        id: 4
      };

      const routePromise = router.routeRequest(request);

      // Should only send to test-server
      expect(stdin.write).toHaveBeenCalledTimes(1);
      // The prefix should be stripped before sending to upstream server
      expect(stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"name":"some-tool"')
      );

      // Simulate response
      const response = {
        jsonrpc: '2.0',
        result: { output: 'Tool executed' },
        id: 4
      };
      stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));

      const result = await routePromise;
      expect(result).toEqual(response);
    });

    it('should handle no available servers', async () => {
      // Stop the server
      mockProcess.emit('close', 0);
      
      // Wait for server to be marked as disconnected
      await new Promise(resolve => setTimeout(resolve, 10));

      const request = {
        jsonrpc: '2.0',
        method: 'test/method',
        params: {},
        id: 5
      };

      await expect(router.routeRequest(request)).rejects.toThrow(
        'No upstream server available for test/method'
      );
    });

    it('should handle JSON parsing errors gracefully', async () => {
      // Send non-JSON data
      stdout.emit('data', Buffer.from('This is not JSON\n'));
      
      // Should log but not crash
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Non-JSON output from test-server')
      );
    });
  });

  describe('getAvailableServers', () => {
    it('should return list of configured servers with connection status', async () => {
      const { process: mockProcess1, stderr: stderr1, stdout: stdout1 } = createMockProcess();
      const { process: mockProcess2 } = createMockProcess();
      // Mark second process as killed to prevent fallback connection
      mockProcess2.killed = true;

      mockSpawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      router.addServerFromConfig('connected-server', { command: 'node' });
      router.addServerFromConfig('disconnected-server', { command: 'node' });

      // Start servers but only one connects
      const startPromise = router.startServers();

      // First server: emit stderr then send initialize response
      setTimeout(() => {
        stderr1.emit('data', Buffer.from('Server started\n'));
        // Send initialize response
        const initResponse = {
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'connected-server', version: '1.0.0' },
            capabilities: {}
          }
        };
        stdout1.emit('data', Buffer.from(JSON.stringify(initResponse) + '\n'));
      }, 100);

      // Second server: killed process, won't connect
      // Don't emit anything for this server

      await startPromise;

      const servers = router.getAvailableServers();

      expect(servers).toContainEqual({ name: 'connected-server', connected: true });
      expect(servers).toContainEqual({ name: 'disconnected-server', connected: false });
    });
  });
});