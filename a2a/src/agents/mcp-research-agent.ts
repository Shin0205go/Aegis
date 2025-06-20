/**
 * MCP-Enabled Research Agent
 * AEGIS MCPプロキシ経由でツールを使用するリサーチエージェント
 */

import { MCPEnabledAgent } from './mcp-enabled-agent';
import { Task, TaskState, SendTaskParams, SendTaskResponse } from '../types/a2a-protocol';

export class MCPResearchAgent extends MCPEnabledAgent {
  constructor(port: number, aegisProxyUrl: string) {
    super({
      name: 'mcp-research-agent',
      description: 'MCP-enabled research agent that uses AEGIS-controlled tools',
      port,
      organization: 'AEGIS Demo',
      organizationUrl: 'https://aegis-demo.example.com',
      aegisProxyUrl,
      agentMetadata: {
        department: 'research',
        clearanceLevel: 'standard',
        permissions: ['read-public-data', 'web-search']
      }
    });
  }

  protected async processTask(task: Task): Promise<void> {
    try {
      this.logger.info(`Processing research task with MCP tools: ${task.id}`);
      this.updateTaskState(task.id, TaskState.WORKING);

      const taskContext = this.buildTaskContext(task);
      const researchResults = await this.performMCPResearch(task.prompt, taskContext);

      this.updateTaskState(task.id, TaskState.COMPLETED, {
        result: researchResults
      });

    } catch (error) {
      this.logger.error(`Task processing failed: ${task.id}`, error);
      
      // ポリシー拒否の場合は特別なエラーコード
      if (error instanceof Error && error.message.includes('Policy denied')) {
        this.updateTaskState(task.id, TaskState.FAILED, {
          error: {
            code: 'POLICY_DENIED',
            message: error.message,
            details: { taskId: task.id }
          }
        });
      } else {
        this.updateTaskState(task.id, TaskState.FAILED, {
          error: {
            code: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    }
  }

  private async performMCPResearch(prompt: string, taskContext: any): Promise<any> {
    const findings: string[] = [];
    const sources: string[] = [];

    // MCPツールを使用してリサーチ
    try {
      // 1. ドキュメントファイルを検索
      if (prompt.toLowerCase().includes('aegis')) {
        try {
          const docsPath = '/docs';
          const files = await this.listDirectory(docsPath, taskContext);
          sources.push(`filesystem:${docsPath}`);
          
          // AEGISに関連するファイルを読む
          for (const file of files) {
            if (file.includes('aegis') || file.includes('policy')) {
              try {
                const content = await this.readFile(`${docsPath}/${file}`, taskContext);
                findings.push(`From ${file}: ${content.substring(0, 200)}...`);
              } catch (error) {
                this.logger.warn(`Could not read ${file}:`, error);
              }
            }
          }
        } catch (error) {
          this.logger.warn('Could not access documents directory:', error);
        }
      }

      // 2. Web検索ツールを使用（利用可能な場合）
      try {
        const searchResult = await this.callMCPTool(
          'web_search',
          { query: prompt },
          taskContext
        );
        
        // MCPレスポンスフォーマットの処理
        let resultData: any;
        if (searchResult.content && Array.isArray(searchResult.content)) {
          // MCP標準フォーマット
          const textContent = searchResult.content.find((c: any) => c.type === 'text');
          if (textContent && textContent.text) {
            try {
              resultData = JSON.parse(textContent.text);
            } catch {
              resultData = { results: [{ snippet: textContent.text }] };
            }
          }
        } else {
          resultData = searchResult;
        }
        
        if (resultData?.results) {
          findings.push(...resultData.results.map((r: any) => r.snippet || r.title || 'Search result'));
          sources.push('web_search');
        }
      } catch (error) {
        // Web検索が利用できない、または拒否された
        this.logger.info('Web search not available or denied');
      }

      // 3. コード実行で情報収集（利用可能な場合）
      try {
        const command = `echo "Research query: ${prompt}" | head -n 1`;
        const execResult = await this.executeCommand(command, taskContext);
        
        // MCPレスポンスフォーマットの処理
        let output: string;
        if (execResult.stdout) {
          output = execResult.stdout;
        } else {
          output = 'No output';
        }
        
        findings.push(`Command output: ${output}`);
        sources.push('execution-server');
      } catch (error) {
        this.logger.info('Command execution not available or denied');
      }

    } catch (error) {
      this.logger.error('MCP tool access error:', error);
    }

    // 結果をまとめる
    return {
      summary: findings.length > 0 
        ? findings.join(' ') 
        : 'No research results available due to access restrictions.',
      sources,
      findings,
      toolsUsed: sources,
      confidence: findings.length > 0 ? 0.8 : 0.3,
      timestamp: new Date().toISOString(),
      metadata: {
        agent: this.config.name,
        mcpEnabled: true,
        taskContext
      }
    };
  }

  protected async handleSendTask(params: SendTaskParams): Promise<SendTaskResponse> {
    // タスク受信時の処理（基本クラスと同じ）
    return super.handleSendTask(params);
  }

  protected estimateTaskDuration(params: SendTaskParams): number {
    // MCPツールアクセスを考慮した時間見積もり
    return 4000; // 4秒
  }
}