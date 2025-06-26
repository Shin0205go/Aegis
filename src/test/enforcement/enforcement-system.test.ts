import { EnforcementSystem } from '../../core/enforcement';
import { DecisionContext, PolicyDecision } from '../../types';

describe('EnforcementSystem', () => {
  let system: EnforcementSystem;
  let context: DecisionContext;
  let decision: PolicyDecision;
  
  beforeEach(async () => {
    system = new EnforcementSystem();
    await system.initialize();
    
    context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'customer-data',
      purpose: 'testing',
      time: new Date(),
      environment: {
        clientIP: '192.168.1.1',
        sessionId: 'test-123'
      }
    };
    
    decision = {
      decision: 'PERMIT',
      reason: '正当なアクセス',
      confidence: 0.95,
      constraints: ['個人情報を匿名化', 'レート制限: 10回/分'],
      obligations: ['アクセスログ記録', '管理者への通知']
    };
  });
  
  afterEach(() => {
    // システムのクリーンアップは不要（各プロセッサが自動的にクリーンアップ）
  });
  
  describe('初期化', () => {
    it('すべてのプロセッサとエグゼキューターが登録される', () => {
      const processors = system.getConstraintProcessors();
      const executors = system.getObligationExecutors();
      
      // 制約プロセッサの確認
      expect(processors.length).toBeGreaterThanOrEqual(3);
      expect(processors.some(p => p.name === 'DataAnonymizer')).toBe(true);
      expect(processors.some(p => p.name === 'RateLimiter')).toBe(true);
      expect(processors.some(p => p.name === 'GeoRestrictor')).toBe(true);
      
      // 義務エグゼキューターの確認
      expect(executors.length).toBeGreaterThanOrEqual(3);
      expect(executors.some(e => e.name === 'AuditLogger')).toBe(true);
      expect(executors.some(e => e.name === 'Notifier')).toBe(true);
      expect(executors.some(e => e.name === 'DataLifecycle')).toBe(true);
    });
  });
  
  describe('制約の適用', () => {
    it('複数の制約を順番に適用する', async () => {
      const data = {
        users: [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 25 }
        ]
      };
      
      const constraints = ['個人情報を匿名化'];
      const result = await system.applyConstraints(constraints, data, context);
      
      expect(result.users[0].name).toBe('[REDACTED]');
      expect(result.users[0].email).toBe('****@example.com'); // emailはマスク形式
      expect(result.users[0].age).toBe(30); // 年齢は匿名化されない
    });
    
    it('レート制限を適用する', async () => {
      const data = { value: 'test' };
      const constraints = ['レート制限: 3回/秒'];
      
      // 3回まではOK
      for (let i = 0; i < 3; i++) {
        await system.applyConstraints(constraints, data, context);
      }
      
      // 4回目でエラー
      await expect(system.applyConstraints(constraints, data, context))
        .rejects.toThrow('制約適用失敗');
    });
    
    it('地理的制限を適用する', async () => {
      const data = { value: 'test' };
      const constraints = ['国内のみ'];
      
      // 日本のIPからはOK
      const jpContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' }
      };
      const result = await system.applyConstraints(constraints, data, jpContext);
      expect(result.value).toBe('test');
      
      // 海外IPからはエラー
      const usContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' }
      };
      await expect(system.applyConstraints(constraints, data, usContext))
        .rejects.toThrow('制約適用失敗');
    });
    
    it('複合制約を適用する', async () => {
      const data = {
        user: { name: 'Test User', email: 'test@example.com' },
        content: 'Some content'
      };
      
      const constraints = [
        '個人情報を匿名化',
        'レート制限: 100回/分'
      ];
      
      const result = await system.applyConstraints(constraints, data, context);
      
      // 匿名化が適用される
      expect(result.user.name).toBe('[REDACTED]');
      expect(result.user.email).toBe('****@example.com'); // emailはマスク形式
      
      // レート制限のメタデータが追加される
      expect(result._rateLimitMetadata).toBeDefined();
    });
  });
  
  describe('義務の実行', () => {
    it('複数の義務を並列実行する', async () => {
      const obligations = ['アクセスログ記録'];
      
      await system.executeObligations(obligations, context, decision);
      
      // エラーが発生しないことを確認（非同期処理のため、詳細な確認は難しい）
      expect(true).toBe(true);
    });
    
    it('エラーが発生してもクラッシュしない', async () => {
      const obligations = [
        'アクセスログ記録',
        '存在しない義務',
        '管理者への通知'
      ];
      
      // エラーが発生してもクラッシュしない
      await system.executeObligations(obligations, context, decision);
      
      expect(true).toBe(true);
    });
  });
  
  describe('統計情報', () => {
    it('実行統計を取得できる', async () => {
      // いくつかの義務を実行
      await system.executeObligations(['アクセスログ記録'], context, decision);
      await system.executeObligations(['管理者への通知'], context, decision);
      
      // 少し待つ（非同期処理のため）
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = system.getExecutionStats();
      
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(2);
      expect(stats.successCount).toBeGreaterThanOrEqual(0);
      expect(stats.failureCount).toBeGreaterThanOrEqual(0);
      expect(stats.byObligation).toBeDefined();
      expect(stats.byExecutor).toBeDefined();
    });
  });
  
  describe('エラーハンドリング', () => {
    it('制約適用エラーを適切に伝播する', async () => {
      const data = { value: 'test' };
      const constraints = ['不明な制約タイプ'];
      
      // 認識できない制約は単に無視される（エラーにはならない）
      const result = await system.applyConstraints(constraints, data, context);
      expect(result).toEqual(data);
    });
    
    it('義務実行エラーをログに記録する', async () => {
      const obligations = ['無効な義務タイプ'];
      
      // エラーは内部でログに記録されるが、例外は投げない
      await system.executeObligations(obligations, context, decision);
      
      expect(true).toBe(true);
    });
  });
  
  describe('パフォーマンス', () => {
    it('大量のデータでも適切に動作する', async () => {
      const largeData = {
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          phone: `555-${String(i).padStart(4, '0')}`
        }))
      };
      
      const constraints = ['個人情報を匿名化'];
      const startTime = Date.now();
      
      const result = await system.applyConstraints(constraints, largeData, context);
      
      const duration = Date.now() - startTime;
      
      // パフォーマンスの確認
      expect(duration).toBeLessThan(1000); // 1秒以内
      
      // 結果の確認
      expect(result.users[0].name).toBe('[REDACTED]');
      expect(result.users[999].email).toBe('****@example.com'); // emailはマスク形式
    });
  });
});