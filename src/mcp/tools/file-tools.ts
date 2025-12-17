// ============================================================================
// AEGIS - File Tools Implementation
// ファイル操作ツール (Read/Write/Edit)
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

interface ReadFileArguments {
  path: string;
  offset?: number;
  limit?: number;
  encoding?: BufferEncoding;
}

interface WriteFileArguments {
  path: string;
  content: string;
  createBackup?: boolean;
  encoding?: BufferEncoding;
}

interface EditFileArguments {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export class FileTools {
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly DEFAULT_ENCODING: BufferEncoding = 'utf-8';

  /**
   * ファイル読み取り
   */
  async readFile(args: ReadFileArguments): Promise<string> {
    // 引数の検証
    if (!args.path) {
      throw new Error('File path is required');
    }

    const filePath = this.normalizePath(args.path);

    // ファイルの存在確認
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // ファイルサイズチェック
    const stats = await fs.stat(filePath);
    if (stats.size > this.MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${stats.size} bytes (max: ${this.MAX_FILE_SIZE})`
      );
    }

    // ファイル読み取り
    const encoding = args.encoding || this.DEFAULT_ENCODING;
    const content = await fs.readFile(filePath, encoding);

    // 行範囲の処理
    if (args.offset !== undefined || args.limit !== undefined) {
      const lines = content.split('\n');
      const offset = args.offset || 0;
      const limit = args.limit || lines.length;

      // 行番号付きで返す（Claude Codeの Read tool と同じ形式）
      const selectedLines = lines.slice(offset, offset + limit);
      return selectedLines
        .map((line, index) => `${offset + index + 1}\t${line}`)
        .join('\n');
    }

    // 全行を行番号付きで返す
    const lines = content.split('\n');
    return lines
      .map((line, index) => `${index + 1}\t${line}`)
      .join('\n');
  }

  /**
   * ファイル書き込み
   */
  async writeFile(args: WriteFileArguments): Promise<string> {
    // 引数の検証
    if (!args.path) {
      throw new Error('File path is required');
    }
    if (args.content === undefined) {
      throw new Error('Content is required');
    }

    const filePath = this.normalizePath(args.path);

    // バックアップ作成
    if (args.createBackup && existsSync(filePath)) {
      const backupPath = `${filePath}.backup-${Date.now()}`;
      await fs.copyFile(filePath, backupPath);
    }

    // ディレクトリの作成
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // ファイル書き込み
    const encoding = args.encoding || this.DEFAULT_ENCODING;
    await fs.writeFile(filePath, args.content, encoding);

    return `File written successfully: ${filePath} (${args.content.length} bytes)`;
  }

  /**
   * ファイル編集（文字列置換）
   */
  async editFile(args: EditFileArguments): Promise<string> {
    // 引数の検証
    if (!args.path) {
      throw new Error('File path is required');
    }
    if (!args.oldString) {
      throw new Error('oldString is required');
    }
    if (args.newString === undefined) {
      throw new Error('newString is required');
    }

    const filePath = this.normalizePath(args.path);

    // ファイルの存在確認
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // ファイル読み取り
    const content = await fs.readFile(filePath, 'utf-8');

    // 置換対象の確認
    if (!content.includes(args.oldString)) {
      throw new Error(
        `String not found in file: "${args.oldString.substring(0, 50)}..."`
      );
    }

    // 文字列置換
    let newContent: string;
    if (args.replaceAll) {
      newContent = content.split(args.oldString).join(args.newString);
    } else {
      // 最初の1箇所のみ置換
      newContent = content.replace(args.oldString, args.newString);
    }

    // 置換が実際に行われたか確認
    if (content === newContent) {
      throw new Error('No replacement occurred');
    }

    // ファイル書き込み
    await fs.writeFile(filePath, newContent, 'utf-8');

    const replacementCount = args.replaceAll
      ? content.split(args.oldString).length - 1
      : 1;

    return `File edited successfully: ${filePath} (${replacementCount} replacement(s) made)`;
  }

  /**
   * パスの正規化とセキュリティチェック
   */
  private normalizePath(filePath: string): string {
    // 相対パスを絶対パスに変換
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // パストラバーサル攻撃の防止
    const normalized = path.normalize(absolutePath);
    if (normalized.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // 危険なディレクトリへのアクセス制限
    const dangerousPaths = ['/etc', '/sys', '/proc', '/dev'];
    for (const dangerousPath of dangerousPaths) {
      if (normalized.startsWith(dangerousPath)) {
        throw new Error(`Access denied: ${dangerousPath}`);
      }
    }

    return normalized;
  }
}
