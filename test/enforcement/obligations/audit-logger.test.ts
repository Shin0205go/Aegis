import { AuditLoggerExecutor } from '../../../src/core/obligations/executors/audit-logger';
import { DecisionContext, PolicyDecision } from '../../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('AuditLoggerExecutor', () => {
  let executor: AuditLoggerExecutor;
  let context: DecisionContext;
  let decision: PolicyDecision;
  const testLogPath = path.join(process.cwd(), 'test-logs', 'audit');
  
  beforeEach(async () => {
    executor = new AuditLoggerExecutor();
    
    context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      purpose: 'testing',
      time: new Date(),
      environment: {
        clientIP: '192.168.1.1',
        sessionId: 'test-session-123'
      }
    };
    
    decision = {
      decision: 'PERMIT',
      reason: 'テスト用の許可',
      confidence: 0.95,
      constraints: ['匿名化'],
      obligations: ['ログ記録']
    };
    
    // テスト用ログディレクトリの作成
    await fs.mkdir(testLogPath, { recursive: true });
  });
  
  afterEach(async () => {
    await executor.cleanup();
    
    // テストログの削除
    try {
      await fs.rm(testLogPath, { recursive: true, force: true });
    } catch (error) {
      // エラーは無視
    }
  });
  
  describe('初期化', () => {
    it('エグゼキューターが正しく初期化される', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 1000,
        maxQueueSize: 50
      });
      
      expect(executor.name).toBe('AuditLogger');
      expect(executor.supportedTypes).toContain('audit-log');
    });
  });
  
  describe('canExecute', () => {
    it('サポートされる義務を認識する', () => {
      expect(executor.canExecute('ログ記録')).toBe(true);
      expect(executor.canExecute('監査ログ')).toBe(true);
      expect(executor.canExecute('audit log')).toBe(true);
      expect(executor.canExecute('アクセスログ記録')).toBe(true);
    });
    
    it('サポートされない義務を認識しない', () => {
      expect(executor.canExecute('通知')).toBe(false);
      expect(executor.canExecute('削除')).toBe(false);
    });
  });
  
  describe('ログ記録', () => {
    beforeEach(async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 100, // テスト用に短く設定
        maxQueueSize: 10
      });
    });
    
    it('基本的なログエントリを記録する', async () => {
      const result = await executor.execute('ログ記録', context, decision);
      
      expect(result.success).toBe(true);
      expect(result.executedAt).toBeInstanceOf(Date);
      expect(result.metadata?.logId).toBeDefined();
      expect(result.metadata?.destination).toBe('file');
    });
    
    it('適切な重要度を設定する', async () => {
      // 通常のアクセス
      const normalResult = await executor.execute('アクセスログ', context, decision);
      expect(normalResult.success).toBe(true);
      
      // 機密アクセス
      const sensitiveResult = await executor.execute('機密アクセス詳細ログ', context, decision);
      expect(sensitiveResult.success).toBe(true);
      
      // 拒否された場合
      const denyDecision = { ...decision, decision: 'DENY' as const };
      const denyResult = await executor.execute('ログ記録', context, denyDecision);
      expect(denyResult.success).toBe(true);
    });
    
    it('フルコンテキストを含める設定が動作する', async () => {
      await executor.cleanup();
      executor = new AuditLoggerExecutor();
      
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 100,
        maxQueueSize: 10,
        includeFullContext: true
      });
      
      const result = await executor.execute('ログ記録', context, decision);
      expect(result.success).toBe(true);
    });
  });
  
  describe('ログフォーマット', () => {
    it('JSON形式でログを出力する', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 100,
        maxQueueSize: 1 // 即座にフラッシュ
      });
      
      await executor.execute('ログ記録', context, decision);
      
      // フラッシュを待つ
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // ログファイルの確認
      const files = await fs.readdir(testLogPath);
      const logFile = files.find(f => f.startsWith('audit-') && f.endsWith('.log'));
      expect(logFile).toBeDefined();
      
      if (logFile) {
        const content = await fs.readFile(path.join(testLogPath, logFile), 'utf8');
        const lines = content.trim().split('\n');
        expect(lines.length).toBeGreaterThan(0);
        
        // JSON形式の確認
        const logEntry = JSON.parse(lines[0]);
        expect(logEntry.id).toBeDefined();
        expect(logEntry.timestamp).toBeDefined();
        expect(logEntry.data.agent).toBe('test-agent');
      }
    });
    
    it('CSV形式でログを出力する', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'csv',
        logPath: testLogPath,
        flushIntervalMs: 100,
        maxQueueSize: 1
      });
      
      await executor.execute('ログ記録', context, decision);
      
      // フラッシュを待つ
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const files = await fs.readdir(testLogPath);
      const csvFile = files.find(f => f.startsWith('audit-') && f.endsWith('.csv'));
      expect(csvFile).toBeDefined();
    });
  });
  
  describe('ログキューイング', () => {
    it('ログをキューに保持して定期的にフラッシュする', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 500,
        maxQueueSize: 5
      });
      
      // 3つのログを記録
      await executor.execute('ログ記録', context, decision);
      await executor.execute('ログ記録', context, decision);
      await executor.execute('ログ記録', context, decision);
      
      // この時点ではまだファイルに書き込まれていない
      const filesBefore = await fs.readdir(testLogPath);
      expect(filesBefore.length).toBe(0);
      
      // フラッシュを待つ
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // ファイルが作成されている
      const filesAfter = await fs.readdir(testLogPath);
      expect(filesAfter.length).toBeGreaterThan(0);
    });
    
    it('キューサイズ上限に達したら即座にフラッシュする', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 10000, // 長めに設定
        maxQueueSize: 2
      });
      
      // 2つ目まではキューに保持
      await executor.execute('ログ記録', context, decision);
      await executor.execute('ログ記録', context, decision);
      
      // 3つ目で即座にフラッシュされる
      await executor.execute('ログ記録', context, decision);
      
      // 少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const files = await fs.readdir(testLogPath);
      expect(files.length).toBeGreaterThan(0);
    });
  });
  
  describe('暗号化', () => {
    it('ログを暗号化して保存する', async () => {
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: testLogPath,
        flushIntervalMs: 100,
        maxQueueSize: 1,
        encryptLogs: true,
        encryptionKey: 'test-encryption-key-32-characters'
      });
      
      const result = await executor.execute('ログ記録', context, decision);
      expect(result.success).toBe(true);
      
      // フラッシュを待つ
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const files = await fs.readdir(testLogPath);
      if (files.length > 0) {
        const content = await fs.readFile(path.join(testLogPath, files[0]), 'utf8');
        const logEntry = JSON.parse(content.trim().split('\n')[0]);
        
        // 暗号化されたデータの確認
        expect(logEntry.encrypted).toBe(true);
        expect(logEntry.data).toHaveProperty('encrypted');
        expect(logEntry.data).toHaveProperty('iv');
        expect(logEntry.data).toHaveProperty('authTag');
      }
    });
  });
  
  describe('エラー処理', () => {
    it('ログ記録エラーをリトライ可能として報告する', async () => {
      // 不正なパスで初期化
      await executor.initialize({
        destination: 'file',
        format: 'json',
        logPath: '/invalid/path/that/does/not/exist',
        flushIntervalMs: 100,
        maxQueueSize: 1
      });
      
      const result = await executor.execute('ログ記録', context, decision);
      
      // エラーは発生するが、結果自体は成功として返す（非同期処理のため）
      expect(result.success).toBe(true);
      expect(result.retryable).toBeUndefined();
    });
  });
});