// ============================================================================
// 統一MCPアーキテクチャ - クロスプラットフォーム構成ジェネレーター
// GitHub Copilot, Gemini CLI, Claude Code用の設定ファイル生成
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type {
  UnifiedMCPConfig,
  UnifiedServerDefinition,
  VSCodeMCPConfig,
  GeminiCLIConfig,
  ClaudeConfig,
  GeneratedConfigs,
  ConfigGeneratorOptions
} from './types.js';
import { Logger } from '../utils/logger.js';

/**
 * クロスプラットフォーム構成ジェネレーター
 *
 * マスター構成（mcp-config.yaml）から各プラットフォーム固有の
 * 設定ファイルを自動生成する
 */
export class CrossPlatformConfigGenerator {
  private logger: Logger;
  private masterConfig: UnifiedMCPConfig | null = null;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('info');
  }

  /**
   * マスター構成ファイルを読み込む
   */
  async loadMasterConfig(configPath: string): Promise<UnifiedMCPConfig> {
    const absolutePath = path.isAbsolute(configPath)
      ? configPath
      : path.join(process.cwd(), configPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Master config not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const ext = path.extname(absolutePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      this.masterConfig = yaml.parse(content) as UnifiedMCPConfig;
    } else if (ext === '.json') {
      this.masterConfig = JSON.parse(content) as UnifiedMCPConfig;
    } else {
      throw new Error(`Unsupported config format: ${ext}`);
    }

    this.logger.info(`Loaded master config from ${absolutePath}`);
    return this.masterConfig;
  }

  /**
   * 全プラットフォーム用の構成を生成
   */
  generateAllConfigs(options: ConfigGeneratorOptions = {
    platforms: ['vscode', 'gemini', 'claude']
  }): GeneratedConfigs {
    if (!this.masterConfig) {
      throw new Error('Master config not loaded. Call loadMasterConfig first.');
    }

    const result: GeneratedConfigs = {};

    if (options.platforms.includes('vscode')) {
      result.vscode = this.generateVSCodeConfig();
    }

    if (options.platforms.includes('gemini')) {
      result.gemini = this.generateGeminiConfig();
    }

    if (options.platforms.includes('claude')) {
      result.claude = this.generateClaudeConfig();
      result.claudeCommands = this.generateClaudeCommands();
    }

    return result;
  }

  /**
   * VS Code / GitHub Copilot用構成を生成
   */
  generateVSCodeConfig(): VSCodeMCPConfig {
    if (!this.masterConfig) {
      throw new Error('Master config not loaded');
    }

    const mcpServers: VSCodeMCPConfig['mcpServers'] = {};

    for (const server of this.masterConfig.servers) {
      if (!server.clients.copilot) continue;

      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        env: this.buildEnvVars(server.envVars, 'vscode')
      };
    }

    return { mcpServers };
  }

  /**
   * Gemini CLI用構成を生成
   */
  generateGeminiConfig(): GeminiCLIConfig {
    if (!this.masterConfig) {
      throw new Error('Master config not loaded');
    }

    const mcpServers: GeminiCLIConfig['mcpServers'] = {};

    for (const server of this.masterConfig.servers) {
      if (!server.clients.gemini) continue;

      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        env: this.buildEnvVars(server.envVars, 'gemini')
      };
    }

    return { mcpServers };
  }

  /**
   * Claude Desktop / Claude Code用構成を生成
   */
  generateClaudeConfig(): ClaudeConfig {
    if (!this.masterConfig) {
      throw new Error('Master config not loaded');
    }

    const mcpServers: ClaudeConfig['mcpServers'] = {};

    for (const server of this.masterConfig.servers) {
      if (!server.clients.claude) continue;

      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        env: this.buildEnvVars(server.envVars, 'claude')
      };
    }

    return { mcpServers };
  }

  /**
   * Claude Code CLI用のコマンドを生成
   */
  generateClaudeCommands(): string[] {
    if (!this.masterConfig) {
      throw new Error('Master config not loaded');
    }

    const commands: string[] = [];

    for (const server of this.masterConfig.servers) {
      if (!server.clients.claude) continue;

      const envArgs = server.envVars
        .map(v => `-e ${v}`)
        .join(' ');

      const argsStr = server.args.join(' ');
      commands.push(
        `claude mcp add ${server.name} ${envArgs} -- ${server.command} ${argsStr}`
      );
    }

    return commands;
  }

  /**
   * 環境変数をプラットフォーム固有の形式に変換
   */
  private buildEnvVars(
    envVars: string[],
    platform: 'vscode' | 'gemini' | 'claude'
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const varName of envVars) {
      // プラットフォーム固有の環境変数参照構文
      switch (platform) {
        case 'vscode':
          // VS Code: ${env:VAR_NAME}
          result[varName] = `\${env:${varName}}`;
          break;
        case 'gemini':
          // Gemini: $VAR_NAME (Unix shell style)
          result[varName] = `$${varName}`;
          break;
        case 'claude':
          // Claude: 直接値を展開、または環境変数参照
          result[varName] = process.env[varName] || `\${${varName}}`;
          break;
      }
    }

    return result;
  }

  /**
   * 生成した構成をファイルに書き出す
   */
  async writeConfigs(
    configs: GeneratedConfigs,
    outputDir: string = process.cwd()
  ): Promise<void> {
    // VS Code用
    if (configs.vscode) {
      const vscodeDir = path.join(outputDir, '.vscode');
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }
      const vscodePath = path.join(vscodeDir, 'mcp.json');
      fs.writeFileSync(vscodePath, JSON.stringify(configs.vscode, null, 2));
      this.logger.info(`Generated VS Code config: ${vscodePath}`);
    }

    // Gemini CLI用
    if (configs.gemini) {
      const geminiDir = path.join(outputDir, '.gemini');
      if (!fs.existsSync(geminiDir)) {
        fs.mkdirSync(geminiDir, { recursive: true });
      }
      const geminiPath = path.join(geminiDir, 'settings.json');
      fs.writeFileSync(geminiPath, JSON.stringify(configs.gemini, null, 2));
      this.logger.info(`Generated Gemini CLI config: ${geminiPath}`);
    }

    // Claude用
    if (configs.claude) {
      const claudePath = path.join(outputDir, 'claude_desktop_config.json');
      fs.writeFileSync(claudePath, JSON.stringify(configs.claude, null, 2));
      this.logger.info(`Generated Claude config: ${claudePath}`);
    }

    // Claude Code CLI用コマンド
    if (configs.claudeCommands && configs.claudeCommands.length > 0) {
      const scriptPath = path.join(outputDir, 'setup-claude-mcp.sh');
      const script = [
        '#!/bin/bash',
        '# Generated by AEGIS Cross-Platform Config Generator',
        '# Run this script to register MCP servers with Claude Code',
        '',
        ...configs.claudeCommands
      ].join('\n');
      fs.writeFileSync(scriptPath, script);
      fs.chmodSync(scriptPath, '755');
      this.logger.info(`Generated Claude Code setup script: ${scriptPath}`);
    }
  }

  /**
   * AEGIS Gateway用の統一エンドポイント構成を生成
   * 全クライアントが同じゲートウェイに接続するための構成
   */
  generateGatewayConfigs(gatewayUrl: string = 'http://localhost:3000'): GeneratedConfigs {
    const gatewayConfig = {
      mcpServers: {
        'aegis-gateway': {
          url: `${gatewayUrl}/sse`,
          transport: 'sse'
        }
      }
    };

    // 全プラットフォームで同じゲートウェイに接続
    return {
      vscode: gatewayConfig as unknown as VSCodeMCPConfig,
      gemini: gatewayConfig as unknown as GeminiCLIConfig,
      claude: gatewayConfig as unknown as ClaudeConfig,
      claudeCommands: [
        `claude mcp add aegis-gateway --transport sse -- ${gatewayUrl}/sse`
      ]
    };
  }

  /**
   * 薄いクライアント設定を生成（意味論的委譲パターン用）
   * クライアントはサーバーからプロンプトとリソースを動的に取得
   */
  generateThinClientConfig(serverName: string): string {
    return `# ${serverName} エージェント設定
# このファイルは最小限の設定のみ含みます
# 実際の指示はMCPサーバーから動的に取得されます

## 初期化プロセス

このエージェントは \`${serverName}\` MCPサーバーに接続されています。

会話を開始する前に、以下の手順を実行してください：

1. サーバーから \`system_instruction\` リソースを読み込み、その指示をシステムプロンプトとして適用してください
2. \`available_tools\` リソースから利用可能なツールの一覧を取得してください
3. \`notifications/tools/list_changed\` を受信した場合は、直ちにツールリストを更新してください

## 重要な注意事項

- すべての操作はサーバー側のポリシーに従って制御されます
- ツールの使用方法はサーバーが提供する \`usage_guide\` プロンプトを参照してください
`;
  }

  /**
   * マスター構成のテンプレートを生成
   */
  static generateMasterConfigTemplate(): UnifiedMCPConfig {
    return {
      version: '1.0.0',
      servers: [
        {
          name: 'example-server',
          description: 'Example MCP server',
          command: 'node',
          args: ['path/to/server.js'],
          envVars: ['API_KEY'],
          transport: 'stdio',
          clients: {
            copilot: true,
            gemini: true,
            claude: true
          },
          auth: {
            type: 'env-var',
            config: { varName: 'API_KEY' }
          },
          healthCheck: {
            enabled: true,
            interval: 30000,
            timeout: 5000
          }
        }
      ],
      prompts: [
        {
          name: 'system_instruction',
          description: 'エージェントの初期化指示',
          template: 'あなたは専門的なアシスタントです。以下の規約に従ってください...',
          arguments: [],
          resourceRefs: ['aegis://guidelines']
        }
      ],
      resources: [
        {
          uri: 'aegis://guidelines',
          name: 'システムガイドライン',
          description: 'エージェントが従うべきガイドライン',
          mimeType: 'text/markdown',
          content: '# ガイドライン\n\n...',
          subscription: {
            enabled: true,
            updateInterval: 60000
          }
        }
      ],
      globalSettings: {
        defaultClients: {
          copilot: true,
          gemini: true,
          claude: true
        },
        envPrefix: 'AEGIS_',
        logging: {
          level: 'info',
          format: 'json'
        },
        security: {
          allowedOrigins: ['http://localhost:*'],
          requireAuth: false
        }
      }
    };
  }
}

export default CrossPlatformConfigGenerator;
