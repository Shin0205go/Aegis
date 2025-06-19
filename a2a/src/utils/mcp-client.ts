/**
 * Simple MCP Client for A2A agents
 * Implements the basic MCP protocol over HTTP
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface MCPClientConfig {
  baseUrl: string;
  sessionId?: string;
  headers?: Record<string, string>;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

export class SimpleMCPClient {
  private sessionId: string | null = null;
  private baseUrl: string;
  public headers: Record<string, string>;  // Make headers public for dynamic updates
  private initialized = false;
  private logger?: Console;

  constructor(config: MCPClientConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = config.headers || {};
    this.logger = console;
  }

  /**
   * Initialize the MCP session
   */
  async initialize(): Promise<void> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'a2a-agent-client',
          version: '1.0.0'
        }
      },
      id: 1
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mcp/messages`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            ...this.headers
          },
          timeout: 30000,
          responseType: 'text',
          validateStatus: (status) => status < 500
        }
      );

      // Debug response
      this.logger?.log('MCP initialize response status:', response.status);
      this.logger?.log('MCP initialize response headers:', response.headers);
      
      // Check for error response
      if (response.status >= 400) {
        this.logger?.log('MCP initialize error response:', response.data);
        throw new Error(`MCP initialization failed with status ${response.status}: ${response.data}`);
      }
      
      // Extract session ID from response headers
      this.sessionId = response.headers['mcp-session-id'];
      
      if (!this.sessionId) {
        throw new Error(`No session ID received from MCP server. Status: ${response.status}, Headers: ${JSON.stringify(response.headers)}`);
      }

      // For SSE responses, we need to parse the event stream data
      if (response.headers['content-type']?.includes('text/event-stream')) {
        const eventData = response.data;
        // Parse SSE format: "event: message\ndata: {...}\n\n"
        const lines = eventData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(6);
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.result) {
                this.logger?.info('MCP initialized with SSE response');
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      this.initialized = true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`MCP initialization failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send a request to the MCP server
   */
  async request(method: string, params?: any): Promise<any> {
    if (!this.initialized && method !== 'initialize') {
      try {
        await this.initialize();
      } catch (error) {
        // If initialization fails with "already initialized", mark as initialized
        if (error instanceof Error && error.message.includes('already initialized')) {
          this.initialized = true;
        } else {
          throw error;
        }
      }
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      method,
      params: params || {},
      id: Date.now()
    };

    try {
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...this.headers
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await axios.post(
        `${this.baseUrl}/mcp/messages`,
        request,
        {
          headers,
          timeout: 30000,
          responseType: 'text',
          validateStatus: (status) => status < 500
        }
      );

      // Handle response based on content type
      if (response.headers['content-type']?.includes('text/event-stream')) {
        // Parse SSE response
        const eventData = response.data;
        const lines = eventData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonData = line.substring(6);
            try {
              const parsed = JSON.parse(jsonData);
              if (parsed.error) {
                throw new Error(`MCP Error: ${parsed.error.message}`);
              }
              return parsed.result;
            } catch (e) {
              // Continue to next line
            }
          }
        }
        throw new Error('No valid data in SSE response');
      } else {
        // Parse JSON response
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (data.error) {
          throw new Error(`MCP Error: ${data.error.message}`);
        }
        return data.result;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`MCP Request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any> {
    return this.request('tools/list');
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: any): Promise<any> {
    return this.request('tools/call', { name, arguments: args });
  }

  /**
   * List resources
   */
  async listResources(): Promise<any> {
    return this.request('resources/list');
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    return this.request('resources/read', { uri });
  }
}