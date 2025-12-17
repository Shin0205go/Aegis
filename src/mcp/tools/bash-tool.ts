// ============================================================================
// AEGIS - Bash Tool Implementation
// Bashコマンド実行ツール（セキュリティ制約付き）
// ============================================================================

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BashArguments {
  command: string;
  timeout?: number;
  workingDir?: string;
}

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  executionTime: number;
}

export class BashTool {
  private readonly DEFAULT_TIMEOUT = 30000; // 30秒
  private readonly MAX_TIMEOUT = 300000; // 5分

  /**
   * 危険なコマンドパターン（基本的なセキュリティチェック）
   */
  private readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,  // rm -rf /
    /:\(\)\{.*\};:/,  // Fork bomb
    /mkfs/,           // ファイルシステム作成
    /dd\s+if=/,       // ddコマンド
    /> \/dev\/(sd|hd|nvme)/, // ディスクへの直接書き込み
    /curl.*\|.*bash/, // パイプ実行
    /wget.*\|.*sh/,   // パイプ実行
  ];

  /**
   * Bashコマンドを実行
   */
  async execute(args: BashArguments): Promise<BashResult> {
    const startTime = Date.now();

    // 引数の検証
    if (!args.command || typeof args.command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    // タイムアウトの検証
    const timeout = Math.min(
      args.timeout || this.DEFAULT_TIMEOUT,
      this.MAX_TIMEOUT
    );

    // 基本的なセキュリティチェック
    this.validateCommand(args.command);

    try {
      // コマンド実行
      const { stdout, stderr } = await execAsync(args.command, {
        timeout,
        cwd: args.workingDir || process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          // セキュリティ: 環境変数の制限
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
        },
      });

      const executionTime = Date.now() - startTime;

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        command: args.command,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // エラーハンドリング
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`Command timeout after ${timeout}ms: ${args.command}`);
      }

      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1,
        command: args.command,
        executionTime,
      };
    }
  }

  /**
   * コマンドの基本的なセキュリティ検証
   * 注意: これは基本的なチェックのみ。実際のポリシー制御はAEGISが行う
   */
  private validateCommand(command: string): void {
    // 危険なパターンのチェック
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(
          `Potentially dangerous command detected: ${pattern.source}`
        );
      }
    }

    // コマンドの長さチェック
    if (command.length > 10000) {
      throw new Error('Command is too long (max 10000 characters)');
    }

    // 空白のみのコマンドを拒否
    if (!command.trim()) {
      throw new Error('Command cannot be empty');
    }
  }
}
