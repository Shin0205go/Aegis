// ============================================================================
// 統一MCPアーキテクチャ - AGENTS.md ローダー
// プロジェクトのAGENTS.mdファイルを読み込み、MCPリソースとして提供
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type { AgentsMdContent } from './types.js';
import { Logger } from '../utils/logger.js';
import { SemanticDelegationProvider } from './semantic-delegation.js';

/**
 * AGENTS.mdセクション定義
 */
interface AgentsMdSection {
  title: string;
  content: string;
  level: number;
}

/**
 * AGENTS.md ローダー
 *
 * プロジェクト固有のAGENTS.mdファイルを読み込み、
 * MCPリソースおよびプロンプトとして提供する
 */
export class AgentsMdLoader {
  private logger: Logger;
  private delegationProvider?: SemanticDelegationProvider;
  private loadedContent: AgentsMdContent | null = null;
  private watchedPaths: Set<string> = new Set();

  constructor(logger?: Logger, delegationProvider?: SemanticDelegationProvider) {
    this.logger = logger || new Logger('info');
    this.delegationProvider = delegationProvider;
  }

  /**
   * AGENTS.mdファイルを読み込む
   */
  async loadAgentsMd(
    projectDir: string = process.cwd()
  ): Promise<AgentsMdContent | null> {
    const possiblePaths = [
      path.join(projectDir, 'AGENTS.md'),
      path.join(projectDir, '.github', 'AGENTS.md'),
      path.join(projectDir, 'docs', 'AGENTS.md')
    ];

    let filePath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      this.logger.debug('No AGENTS.md found in project');
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.loadedContent = this.parseAgentsMd(content);
      this.logger.info(`Loaded AGENTS.md from ${filePath}`);

      // MCPリソースとして登録
      if (this.delegationProvider) {
        this.registerAsResources();
      }

      return this.loadedContent;
    } catch (error) {
      this.logger.error('Failed to load AGENTS.md:', error);
      return null;
    }
  }

  /**
   * AGENTS.md コンテンツをパース
   */
  private parseAgentsMd(content: string): AgentsMdContent {
    const sections = this.extractSections(content);
    const result: AgentsMdContent = {
      sections: {},
      rawContent: content
    };

    for (const section of sections) {
      const titleLower = section.title.toLowerCase();

      // 名前と説明
      if (titleLower.includes('name') || section.level === 1) {
        result.name = section.title.replace(/^#\s*/, '');
      }

      if (titleLower.includes('description') || titleLower.includes('about')) {
        result.description = section.content.trim();
      }

      // ビルドコマンド
      if (titleLower.includes('build') || titleLower.includes('setup')) {
        result.buildCommands = this.extractCodeBlocks(section.content, 'bash', 'sh');
      }

      // テストコマンド
      if (titleLower.includes('test')) {
        result.testCommands = this.extractCodeBlocks(section.content, 'bash', 'sh');
      }

      // コーディングスタイル
      if (titleLower.includes('style') || titleLower.includes('coding') || titleLower.includes('guidelines')) {
        result.codingStyle = {
          guidelines: section.content.split('\n')
            .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
            .map(line => line.replace(/^[-*]\s*/, '').trim())
        };
      }

      // MCP参照
      if (titleLower.includes('mcp') || titleLower.includes('server')) {
        result.mcpServerRefs = this.extractMCPReferences(section.content);
      }

      // 全セクションを保存
      result.sections[section.title] = section.content;
    }

    return result;
  }

  /**
   * Markdownからセクションを抽出
   */
  private extractSections(content: string): AgentsMdSection[] {
    const sections: AgentsMdSection[] = [];
    const lines = content.split('\n');

    let currentSection: AgentsMdSection | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // 前のセクションを保存
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }

        // 新しいセクション開始
        currentSection = {
          title: headerMatch[2].trim(),
          content: '',
          level: headerMatch[1].length
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // 最後のセクションを保存
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * コードブロックを抽出
   */
  private extractCodeBlocks(content: string, ...languages: string[]): string[] {
    const commands: string[] = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const lang = match[1].toLowerCase();
      const code = match[2].trim();

      if (languages.length === 0 || languages.includes(lang) || lang === '') {
        // 複数行のコードブロックを個別のコマンドに分割
        const lines = code.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'));
        commands.push(...lines);
      }
    }

    return commands;
  }

  /**
   * MCP サーバー参照を抽出
   */
  private extractMCPReferences(content: string): string[] {
    const refs: string[] = [];

    // `server-name` 形式
    const backtickRefs = content.match(/`([a-zA-Z0-9_-]+)`/g);
    if (backtickRefs) {
      refs.push(...backtickRefs.map(r => r.replace(/`/g, '')));
    }

    // [ServerName](url) 形式
    const linkRefs = content.match(/\[([^\]]+)\]\([^)]+\)/g);
    if (linkRefs) {
      refs.push(...linkRefs.map(r => {
        const match = r.match(/\[([^\]]+)\]/);
        return match ? match[1] : '';
      }).filter(r => r));
    }

    return [...new Set(refs)]; // 重複除去
  }

  /**
   * MCPリソースとして登録
   */
  private registerAsResources(): void {
    if (!this.delegationProvider || !this.loadedContent) return;

    // 生のAGENTS.mdコンテンツ
    this.delegationProvider.registerResource({
      uri: 'aegis://agents-md/raw',
      name: 'AGENTS.md (Raw)',
      description: 'プロジェクトのAGENTS.mdファイル（生データ）',
      mimeType: 'text/markdown',
      content: this.loadedContent.rawContent
    });

    // ビルドコマンド
    if (this.loadedContent.buildCommands?.length) {
      this.delegationProvider.registerResource({
        uri: 'aegis://agents-md/build-commands',
        name: 'ビルドコマンド',
        description: 'AGENTS.mdから抽出されたビルドコマンド',
        mimeType: 'text/plain',
        content: this.loadedContent.buildCommands.join('\n')
      });
    }

    // テストコマンド
    if (this.loadedContent.testCommands?.length) {
      this.delegationProvider.registerResource({
        uri: 'aegis://agents-md/test-commands',
        name: 'テストコマンド',
        description: 'AGENTS.mdから抽出されたテストコマンド',
        mimeType: 'text/plain',
        content: this.loadedContent.testCommands.join('\n')
      });
    }

    // コーディングガイドライン
    if (this.loadedContent.codingStyle?.guidelines?.length) {
      this.delegationProvider.registerResource({
        uri: 'aegis://agents-md/coding-guidelines',
        name: 'コーディングガイドライン',
        description: 'AGENTS.mdから抽出されたコーディング規約',
        mimeType: 'text/markdown',
        content: this.loadedContent.codingStyle.guidelines
          .map(g => `- ${g}`)
          .join('\n')
      });
    }

    // 各セクションを個別リソースとして登録
    for (const [title, content] of Object.entries(this.loadedContent.sections)) {
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      this.delegationProvider.registerResource({
        uri: `aegis://agents-md/section/${slug}`,
        name: title,
        description: `AGENTS.md: ${title}`,
        mimeType: 'text/markdown',
        content: `# ${title}\n\n${content}`
      });
    }

    this.logger.info('AGENTS.md content registered as MCP resources');
  }

  /**
   * AGENTS.mdプロンプトを登録
   */
  registerAgentsMdPrompt(): void {
    if (!this.delegationProvider || !this.loadedContent) return;

    this.delegationProvider.registerPrompt({
      name: 'agents_md_context',
      description: 'AGENTS.mdからプロジェクトコンテキストを取得',
      template: `# プロジェクト情報

{{#if name}}
## プロジェクト名
{{name}}
{{/if}}

{{#if description}}
## 説明
{{description}}
{{/if}}

## ビルド手順
@{aegis://agents-md/build-commands}

## テスト手順
@{aegis://agents-md/test-commands}

## コーディング規約
@{aegis://agents-md/coding-guidelines}
`,
      resourceRefs: [
        'aegis://agents-md/build-commands',
        'aegis://agents-md/test-commands',
        'aegis://agents-md/coding-guidelines'
      ]
    });

    this.logger.info('AGENTS.md prompt registered');
  }

  /**
   * ファイル変更を監視
   */
  watchAgentsMd(projectDir: string = process.cwd()): void {
    const filePath = path.join(projectDir, 'AGENTS.md');

    if (this.watchedPaths.has(filePath)) return;

    if (fs.existsSync(filePath)) {
      fs.watchFile(filePath, { interval: 5000 }, async () => {
        this.logger.info('AGENTS.md changed, reloading...');
        await this.loadAgentsMd(projectDir);
      });
      this.watchedPaths.add(filePath);
      this.logger.info(`Watching AGENTS.md at ${filePath}`);
    }
  }

  /**
   * 監視を停止
   */
  unwatchAll(): void {
    for (const filePath of this.watchedPaths) {
      fs.unwatchFile(filePath);
    }
    this.watchedPaths.clear();
    this.logger.info('Stopped watching all AGENTS.md files');
  }

  /**
   * 読み込んだコンテンツを取得
   */
  getLoadedContent(): AgentsMdContent | null {
    return this.loadedContent;
  }

  /**
   * CLAUDE.md との統合
   * CLAUDE.md内の @AGENTS.md 参照を解決
   */
  async resolveClaudeMdReferences(
    claudeMdContent: string,
    projectDir: string = process.cwd()
  ): Promise<string> {
    // @AGENTS.md 参照を検出
    if (!claudeMdContent.includes('@AGENTS.md')) {
      return claudeMdContent;
    }

    // AGENTS.md を読み込み
    const agentsMd = await this.loadAgentsMd(projectDir);
    if (!agentsMd) {
      this.logger.warn('@AGENTS.md reference found but AGENTS.md not available');
      return claudeMdContent.replace(/@AGENTS\.md/g, '<!-- AGENTS.md not found -->');
    }

    // 参照を解決
    return claudeMdContent.replace(
      /@AGENTS\.md/g,
      `\n\n---\n\n<!-- Included from AGENTS.md -->\n\n${agentsMd.rawContent}\n\n---\n\n`
    );
  }

  /**
   * 薄いクライアント設定を生成
   * AGENTS.md参照を含む最小限の設定
   */
  generateThinAgentConfig(serverName: string): string {
    return `# ${serverName} エージェント設定

このエージェントは \`${serverName}\` MCPサーバーに接続されています。

## 初期化

1. サーバーから \`system_instruction\` プロンプトを読み込んでください
2. プロジェクト固有の指示は \`aegis://agents-md/raw\` リソースを参照してください

## AGENTS.md 参照

@AGENTS.md

---

上記の指示に従って操作を行ってください。
`;
  }
}

export default AgentsMdLoader;
