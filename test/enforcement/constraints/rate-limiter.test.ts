import { RateLimiterProcessor, RateLimitExceededError } from '../../../src/core/constraints/processors/rate-limiter';
import { DecisionContext } from '../../../src/types';

describe('RateLimiterProcessor', () => {
  let processor: RateLimiterProcessor;
  let context: DecisionContext;
  
  beforeEach(() => {
    processor = new RateLimiterProcessor();
    context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      purpose: 'testing',
      time: new Date(),
      environment: {
        clientIP: '192.168.1.1'
      }
    };
  });
  
  afterEach(async () => {
    await processor.cleanup();
  });
  
  describe('初期化', () => {
    it('プロセッサが正しく初期化される', async () => {
      await processor.initialize({
        defaultMaxRequests: 50,
        defaultWindowMs: 30000,
        cleanupIntervalMs: 60000
      });
      
      expect(processor.name).toBe('RateLimiter');
      expect(processor.supportedTypes).toContain('rate-limit');
    });
  });
  
  describe('canProcess', () => {
    it('サポートされる制約を認識する', () => {
      expect(processor.canProcess('レート制限: 100回/分')).toBe(true);
      expect(processor.canProcess('rate limit: 50 requests per minute')).toBe(true);
      expect(processor.canProcess('10回/秒')).toBe(true);
      expect(processor.canProcess('アクセス制限')).toBe(true);
    });
    
    it('サポートされない制約を認識しない', () => {
      expect(processor.canProcess('匿名化')).toBe(false);
      expect(processor.canProcess('地理的制限')).toBe(false);
    });
  });
  
  describe('レート制限の解析', () => {
    it('日本語形式のレート制限を解析する', async () => {
      const data = { value: 'test' };
      
      // 10回/秒のレート制限
      await processor.apply('10回/秒', data, context);
      
      // 同じコンテキストで10回まではOK
      for (let i = 0; i < 9; i++) {
        await processor.apply('10回/秒', data, context);
      }
      
      // 11回目でエラー
      await expect(processor.apply('10回/秒', data, context))
        .rejects.toThrow(RateLimitExceededError);
    });
    
    it('英語形式のレート制限を解析する', async () => {
      const data = { value: 'test' };
      
      // 5 requests per second
      for (let i = 0; i < 5; i++) {
        await processor.apply('5 requests per second', data, context);
      }
      
      // 6回目でエラー
      await expect(processor.apply('5 requests per second', data, context))
        .rejects.toThrow(RateLimitExceededError);
    });
    
    it('分単位のレート制限を処理する', async () => {
      const data = { value: 'test' };
      
      // 100回/分
      for (let i = 0; i < 100; i++) {
        await processor.apply('100回/分', data, context);
      }
      
      // 101回目でエラー
      await expect(processor.apply('100回/分', data, context))
        .rejects.toThrow(RateLimitExceededError);
    });
  });
  
  describe('キー生成', () => {
    it('エージェント、アクション、リソースでキーを生成する', async () => {
      const data = { value: 'test' };
      const context1 = { ...context, agent: 'agent1' };
      const context2 = { ...context, agent: 'agent2' };
      
      // 異なるエージェントは別々にカウント
      for (let i = 0; i < 5; i++) {
        await processor.apply('5回/秒', data, context1);
        await processor.apply('5回/秒', data, context2);
      }
      
      // agent1は制限に達する
      await expect(processor.apply('5回/秒', data, context1))
        .rejects.toThrow(RateLimitExceededError);
      
      // agent2はまだOK（別カウント）
      await expect(processor.apply('5回/秒', data, context2))
        .rejects.toThrow(RateLimitExceededError);
    });
    
    it('IPアドレスを含むキーを生成する', async () => {
      const data = { value: 'test' };
      const contextWithIP = { ...context, environment: { clientIP: '10.0.0.1' } };
      const contextWithDifferentIP = { ...context, environment: { clientIP: '10.0.0.2' } };
      
      // 異なるIPは別々にカウント
      for (let i = 0; i < 3; i++) {
        await processor.apply('3回/秒', data, contextWithIP);
      }
      
      // 同じIPは制限に達する
      await expect(processor.apply('3回/秒', data, contextWithIP))
        .rejects.toThrow(RateLimitExceededError);
      
      // 異なるIPはまだOK
      await processor.apply('3回/秒', data, contextWithDifferentIP);
    });
  });
  
  describe('ウィンドウリセット', () => {
    it('時間ウィンドウが経過したらリセットされる', async () => {
      const data = { value: 'test' };
      
      // 1回/100ミリ秒の制限
      await processor.apply('1回/秒', data, context);
      
      // すぐに2回目はエラー
      await expect(processor.apply('1回/秒', data, context))
        .rejects.toThrow(RateLimitExceededError);
      
      // ウィンドウが経過するのを待つ
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // リセットされたので再度アクセス可能
      await processor.apply('1回/秒', data, context);
    });
  });
  
  describe('エラー情報', () => {
    it('RateLimitExceededErrorに適切なメタデータが含まれる', async () => {
      const data = { value: 'test' };
      
      await processor.apply('1回/秒', data, context);
      
      try {
        await processor.apply('1回/秒', data, context);
        fail('Expected RateLimitExceededError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitExceededError);
        const rateLimitError = error as RateLimitExceededError;
        
        expect(rateLimitError.metadata.limit).toBe(1);
        expect(rateLimitError.metadata.windowMs).toBe(1000);
        expect(rateLimitError.metadata.resetAt).toBeInstanceOf(Date);
        expect(rateLimitError.metadata.retryAfter).toBeGreaterThan(0);
      }
    });
  });
  
  describe('データへのメタデータ追加', () => {
    it('レート制限情報をレスポンスに追加する', async () => {
      const data = { value: 'test' };
      
      const result = await processor.apply('10回/分', data, context);
      
      expect(result._rateLimitMetadata).toBeDefined();
      expect(result._rateLimitMetadata['X-RateLimit-Limit']).toBe(10);
      expect(result._rateLimitMetadata['X-RateLimit-Remaining']).toBe(9);
      expect(result._rateLimitMetadata['X-RateLimit-Reset']).toBeDefined();
    });
  });
  
  describe('カスタムキージェネレーター', () => {
    it('カスタムキージェネレーターを使用する', async () => {
      await processor.initialize({
        defaultMaxRequests: 100,
        defaultWindowMs: 60000,
        cleanupIntervalMs: 300000,
        keyGenerator: (ctx, constraint) => `custom-${ctx.agent}-${constraint}`
      });
      
      const data = { value: 'test' };
      
      // カスタムキーで制限が適用される
      for (let i = 0; i < 5; i++) {
        await processor.apply('5回/秒', data, context);
      }
      
      await expect(processor.apply('5回/秒', data, context))
        .rejects.toThrow(RateLimitExceededError);
    });
  });
});