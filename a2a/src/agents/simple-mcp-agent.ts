/**
 * Simple MCP-Enabled Agent for testing
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface TaskResult {
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface Task {
  type: string;
  description: string;
  data?: any;
}

export class MCPEnabledAgent {
  constructor(
    private name: string,
    private mcpClient: Client
  ) {}

  async executeTask(task: Task): Promise<TaskResult> {
    try {
      console.log(`[${this.name}] Executing task: ${task.description}`);
      
      if (task.data?.toolName) {
        // MCPツールを呼び出す
        const result = await this.mcpClient.callTool({
          name: task.data.toolName,
          arguments: task.data.arguments || {}
        });
        
        return {
          status: 'completed',
          result
        };
      } else {
        // シンプルなタスク実行
        return {
          status: 'completed',
          result: `Task "${task.description}" completed by ${this.name}`
        };
      }
    } catch (error: any) {
      console.error(`[${this.name}] Task failed:`, error);
      return {
        status: 'failed',
        error: error.message || 'Unknown error'
      };
    }
  }

  async listTools() {
    try {
      const tools = await this.mcpClient.listTools();
      return tools.tools;
    } catch (error) {
      console.error(`[${this.name}] Failed to list tools:`, error);
      return [];
    }
  }
}