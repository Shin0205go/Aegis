/**
 * MCP-Enabled A2A Agent
 * A2AエージェントにMCPクライアント機能を追加
 */

import { A2AAgent } from '../core/a2a-agent';
import { Task, TaskState } from '../types/a2a-protocol';
import { SimpleMCPClient } from '../utils/mcp-client';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPEnabledAgentConfig {
  name: string;
  description: string;
  port: number;
  organization: string;
  organizationUrl: string;
  aegisProxyUrl: string;  // AEGIS MCPプロキシのURL
  agentMetadata?: {
    department?: string;
    clearanceLevel?: string;
    permissions?: string[];
  };
}

export abstract class MCPEnabledAgent extends A2AAgent {
  protected aegisProxyUrl: string;
  protected agentMetadata: any;
  private availableTools: MCPTool[] = [];
  private mcpClient: SimpleMCPClient;

  constructor(config: MCPEnabledAgentConfig) {
    const { aegisProxyUrl, agentMetadata, ...a2aConfig } = config;
    
    super(a2aConfig);
    
    // Store metadata separately
    (this as any).mcpMetadata = {
      mcpEnabled: true,
      agentMetadata
    };

    this.aegisProxyUrl = aegisProxyUrl;
    this.agentMetadata = agentMetadata || {};
    
    // Initialize MCP client with unique session per agent
    this.mcpClient = new SimpleMCPClient({
      baseUrl: aegisProxyUrl,
      headers: {
        'X-Agent-ID': this.config.name,
        'X-Agent-Type': 'a2a-agent',
        'X-Agent-Metadata': JSON.stringify(this.agentMetadata),
        'X-Agent-Instance': `${this.config.name}-${this.config.port}` // Unique instance identifier
      }
    });
  }

  /**
   * AEGIS MCPプロキシからツールリストを取得
   */
  protected async listMCPTools(): Promise<MCPTool[]> {
    try {
      this.logger.info(`Fetching MCP tools from AEGIS proxy at ${this.aegisProxyUrl}`);
      
      const result = await this.mcpClient.listTools();
      
      if (result?.tools) {
        this.availableTools = result.tools;
        this.logger.info(`Retrieved ${this.availableTools.length} MCP tools via AEGIS`);
        return this.availableTools;
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to list MCP tools:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Build task context for MCP tool calls
   */
  protected buildTaskContext(task: Task): any {
    const policyContext = task.metadata?.policyContext;
    return {
      taskId: task.id,
      delegationChain: policyContext?.delegationChain || [],
      priority: task.metadata?.priority || 'normal',
      requesterAgent: policyContext?.requesterAgent || task.agentId || this.config.name,
      permissions: policyContext?.permissions || []
    };
  }

  /**
   * AEGIS MCPプロキシ経由でツールを実行
   */
  protected async callMCPTool(
    toolName: string,
    args: any,
    taskContext?: {
      taskId: string;
      delegationChain?: string[];
      priority?: string;
      requesterAgent?: string;
      permissions?: string[];
    }
  ): Promise<any> {
    try {
      this.logger.info(`Calling MCP tool: ${toolName}`, { args });

      // Update headers with task context
      if (taskContext) {
        this.mcpClient.headers = {
          ...this.mcpClient.headers,
          'X-Agent-ID': taskContext.requesterAgent || this.config.name,  // Use requester agent from policy context
          'X-Task-ID': taskContext.taskId,
          'X-Delegation-Chain': JSON.stringify(taskContext.delegationChain || []),
          'X-Priority': taskContext.priority || 'normal',
          'X-Permissions': JSON.stringify(taskContext.permissions || [])
        };
      }

      const result = await this.mcpClient.callTool(toolName, args);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // ポリシー拒否の場合
      if (errorMessage.includes('Policy denied')) {
        this.logger.warn(`MCP tool access denied by policy: ${toolName}`, errorMessage);
      }
      
      this.logger.error(`Failed to call MCP tool: ${toolName}`, errorMessage);
      throw error;
    }
  }

  /**
   * ファイルシステムツールのヘルパーメソッド
   */
  protected async readFile(path: string, taskContext?: any): Promise<string> {
    const result = await this.callMCPTool(
      'filesystem__read_file',
      { path },
      taskContext
    );
    return result.content;
  }

  protected async writeFile(
    path: string,
    content: string,
    taskContext?: any
  ): Promise<void> {
    await this.callMCPTool(
      'filesystem__write_file',
      { path, content },
      taskContext
    );
  }

  protected async listDirectory(path: string, taskContext?: any): Promise<string[]> {
    const result = await this.callMCPTool(
      'filesystem__list_directory',
      { path },
      taskContext
    );
    return result.entries;
  }

  /**
   * 実行サーバーツールのヘルパーメソッド
   */
  protected async executeCommand(
    command: string,
    taskContext?: any
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await this.callMCPTool(
      'execution-server__execute',
      { command },
      taskContext
    );
    return result;
  }

  /**
   * 起動時にツールリストを取得
   */
  async start(): Promise<void> {
    await super.start();
    
    // Initialize MCP client
    try {
      await this.mcpClient.initialize();
      this.logger.info('MCP client initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to initialize MCP client:', errorMsg);
      // Don't fail startup if MCP init fails - let it retry on first use
    }
    
    // MCPツールリストを取得
    await this.listMCPTools();
  }


  /**
   * エージェント能力にMCPツール情報を追加
   */
  protected getCapabilities(): any {
    const baseCapabilities = {
      ...((this as any).agentCard?.capabilities || {}),
      name: this.config.name,
      description: this.config.description,
      mcpTools: this.availableTools.map(t => t.name),
      mcpEnabled: true,
      availableTools: this.availableTools.length,
      supportedTasks: ['research', 'analyze', 'investigate']
    };
    return baseCapabilities;
  }
}