// ============================================================================
// AEGIS - Search Tools Implementation
// 検索ツール (Glob/Grep)
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { minimatch } from 'minimatch';

interface GlobArguments {
  pattern: string;
  cwd?: string;
  maxResults?: number;
}

interface GrepArguments {
  pattern: string;
  path?: string;
  glob?: string;
  caseInsensitive?: boolean;
  contextLines?: number;
  maxResults?: number;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export class SearchTools {
  private readonly DEFAULT_MAX_RESULTS = 1000;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Glob検索 - ファイルパターンマッチング
   */
  async glob(args: GlobArguments): Promise<string> {
    // 引数の検証
    if (!args.pattern) {
      throw new Error('Pattern is required');
    }

    const cwd = args.cwd || process.cwd();
    const maxResults = args.maxResults || this.DEFAULT_MAX_RESULTS;

    // 検索実行
    const matches = await this.findFilesByPattern(
      args.pattern,
      cwd,
      maxResults
    );

    // 結果のフォーマット
    if (matches.length === 0) {
      return `No files found matching pattern: ${args.pattern}`;
    }

    const resultText = [
      `Found ${matches.length} file(s) matching pattern: ${args.pattern}`,
      '',
      ...matches.map((file, index) => `${index + 1}. ${file}`),
    ].join('\n');

    if (matches.length >= maxResults) {
      return (
        resultText +
        `\n\n(Results limited to ${maxResults}. Use maxResults parameter to see more.)`
      );
    }

    return resultText;
  }

  /**
   * Grep検索 - テキスト内容検索
   */
  async grep(args: GrepArguments): Promise<string> {
    // 引数の検証
    if (!args.pattern) {
      throw new Error('Pattern is required');
    }

    const searchPath = args.path || process.cwd();
    const maxResults = args.maxResults || 100;

    // 検索対象ファイルの収集
    const files = await this.collectSearchFiles(searchPath, args.glob);

    // パターンマッチング
    const regex = new RegExp(
      args.pattern,
      args.caseInsensitive ? 'gi' : 'g'
    );

    const matches: GrepMatch[] = [];

    for (const file of files) {
      if (matches.length >= maxResults) break;

      try {
        // ファイルサイズチェック
        const stats = statSync(file);
        if (stats.size > this.MAX_FILE_SIZE) continue;

        // ファイル読み取り
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        // パターンマッチング
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;

          if (regex.test(lines[i])) {
            const match: GrepMatch = {
              file: this.makeRelativePath(file, searchPath),
              line: i + 1,
              content: lines[i].trim(),
            };

            // コンテキスト行の追加
            if (args.contextLines && args.contextLines > 0) {
              const contextSize = args.contextLines;
              match.context = {
                before: lines
                  .slice(Math.max(0, i - contextSize), i)
                  .map((l) => l.trim()),
                after: lines
                  .slice(i + 1, i + 1 + contextSize)
                  .map((l) => l.trim()),
              };
            }

            matches.push(match);
          }

          // regex のlastIndexをリセット（グローバルフラグ使用時）
          regex.lastIndex = 0;
        }
      } catch (error) {
        // ファイル読み取りエラーは無視
        continue;
      }
    }

    // 結果のフォーマット
    return this.formatGrepResults(matches, args.pattern, maxResults);
  }

  /**
   * パターンによるファイル検索
   */
  private async findFilesByPattern(
    pattern: string,
    basePath: string,
    maxResults: number
  ): Promise<string[]> {
    const matches: string[] = [];

    const walk = (dir: string) => {
      if (matches.length >= maxResults) return;

      try {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (matches.length >= maxResults) break;

          const fullPath = path.join(dir, entry.name);

          // 除外ディレクトリのスキップ
          if (entry.isDirectory()) {
            if (this.shouldSkipDirectory(entry.name)) continue;
            walk(fullPath);
          } else if (entry.isFile()) {
            // パターンマッチング
            const relativePath = path.relative(basePath, fullPath);
            if (minimatch(relativePath, pattern, { dot: true })) {
              matches.push(relativePath);
            }
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは無視
      }
    };

    walk(basePath);
    return matches.sort();
  }

  /**
   * 検索対象ファイルの収集
   */
  private async collectSearchFiles(
    searchPath: string,
    globPattern?: string
  ): Promise<string[]> {
    const files: string[] = [];

    // ファイルかディレクトリかを判定
    if (!existsSync(searchPath)) {
      throw new Error(`Path not found: ${searchPath}`);
    }

    const stats = statSync(searchPath);

    if (stats.isFile()) {
      // 単一ファイル
      return [searchPath];
    }

    // ディレクトリ内のファイルを再帰的に収集
    const walk = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (this.shouldSkipDirectory(entry.name)) continue;
            walk(fullPath);
          } else if (entry.isFile()) {
            // Globパターンでフィルタ
            if (globPattern) {
              const relativePath = path.relative(searchPath, fullPath);
              if (minimatch(relativePath, globPattern, { dot: true })) {
                files.push(fullPath);
              }
            } else {
              // テキストファイルのみ
              if (this.isTextFile(entry.name)) {
                files.push(fullPath);
              }
            }
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは無視
      }
    };

    walk(searchPath);
    return files;
  }

  /**
   * Grep結果のフォーマット
   */
  private formatGrepResults(
    matches: GrepMatch[],
    pattern: string,
    maxResults: number
  ): string {
    if (matches.length === 0) {
      return `No matches found for pattern: ${pattern}`;
    }

    const lines: string[] = [
      `Found ${matches.length} match(es) for pattern: ${pattern}`,
      '',
    ];

    for (const match of matches) {
      lines.push(`${match.file}:${match.line}`);

      if (match.context) {
        // コンテキスト付き表示
        match.context.before.forEach((line, i) => {
          lines.push(`  ${match.line - match.context!.before.length + i} | ${line}`);
        });
        lines.push(`> ${match.line} | ${match.content}`);
        match.context.after.forEach((line, i) => {
          lines.push(`  ${match.line + i + 1} | ${line}`);
        });
      } else {
        // 通常表示
        lines.push(`  ${match.content}`);
      }

      lines.push('');
    }

    if (matches.length >= maxResults) {
      lines.push(
        `(Results limited to ${maxResults}. Use maxResults parameter to see more.)`
      );
    }

    return lines.join('\n');
  }

  /**
   * スキップすべきディレクトリの判定
   */
  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      '__pycache__',
      '.vscode',
      '.idea',
    ];

    return skipDirs.includes(name) || name.startsWith('.');
  }

  /**
   * テキストファイルの判定
   */
  private isTextFile(filename: string): boolean {
    const textExtensions = [
      '.txt',
      '.md',
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.json',
      '.xml',
      '.html',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.yaml',
      '.yml',
      '.toml',
      '.ini',
      '.conf',
      '.sh',
      '.bash',
      '.py',
      '.rb',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
    ];

    const ext = path.extname(filename).toLowerCase();
    return textExtensions.includes(ext);
  }

  /**
   * 相対パスの作成
   */
  private makeRelativePath(fullPath: string, basePath: string): string {
    const relative = path.relative(basePath, fullPath);
    return relative || fullPath;
  }
}
