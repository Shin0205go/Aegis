import { ConstraintProcessor } from '../types';
import { DecisionContext } from '../../../types';
import { Logger } from '../../../utils/logger';

/**
 * レート制限制約プロセッサ
 * APIアクセスやリソースアクセスの頻度を制限
 */
export class RateLimiterProcessor implements ConstraintProcessor {
  public readonly name = 'RateLimiter';
  public readonly supportedTypes = [
    'rate-limit',
    'throttle',
    'quota'
  ];

  private logger: Logger;
  private config: RateLimiterConfig;
  private windowStore = new Map<string, RateLimitWindow>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger();
    this.config = {
      defaultMaxRequests: 100,
      defaultWindowMs: 60000, // 1分
      cleanupIntervalMs: 300000 // 5分
    };
  }

  async initialize(config: RateLimiterConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    // 定期クリーンアップを開始
    this.startCleanupInterval();
    
    this.logger.info('RateLimiterプロセッサ初期化完了', this.config);
  }

  canProcess(constraint: string): boolean {
    const lowerConstraint = constraint.toLowerCase();
    return (
      lowerConstraint.includes('レート制限') ||
      lowerConstraint.includes('rate limit') ||
      lowerConstraint.includes('回/') ||
      lowerConstraint.includes('requests per') ||
      lowerConstraint.includes('アクセス制限')
    );
  }

  async apply(
    constraint: string,
    data: any,
    context: DecisionContext
  ): Promise<any> {
    const limit = this.parseLimit(constraint);
    const key = this.generateKey(context, constraint);
    
    const window = this.getOrCreateWindow(key, limit);
    const now = Date.now();

    // ウィンドウが期限切れの場合はリセット
    if (now - window.startTime >= window.windowMs) {
      this.resetWindow(window, now);
    }

    // レート制限チェック
    if (window.count >= window.maxRequests) {
      const resetTime = new Date(window.startTime + window.windowMs);
      const remainingMs = window.startTime + window.windowMs - now;
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      
      throw new RateLimitExceededError(
        `レート制限超過: ${window.maxRequests}回/${window.windowMs}ms`,
        {
          limit: window.maxRequests,
          windowMs: window.windowMs,
          resetAt: resetTime,
          retryAfter: remainingSeconds
        }
      );
    }

    // カウントを増やす
    window.count++;
    window.lastAccess = now;

    // メタデータを追加
    const metadata = {
      'X-RateLimit-Limit': window.maxRequests,
      'X-RateLimit-Remaining': window.maxRequests - window.count,
      'X-RateLimit-Reset': new Date(window.startTime + window.windowMs).toISOString()
    };

    if (typeof data === 'object' && data !== null) {
      return {
        ...data,
        _rateLimitMetadata: metadata
      };
    }

    return data;
  }

  private parseLimit(constraint: string): RateLimitConfig {
    // 例: "100回/分", "50 requests per minute", "1000/hour"
    const patterns = [
      /(\d+)\s*回\s*\/\s*(秒|分|時間|日)/,
      /(\d+)\s*requests?\s*per\s*(second|minute|hour|day)/i,
      /(\d+)\s*\/\s*(second|minute|hour|day|s|m|h|d)/i
    ];

    for (const pattern of patterns) {
      const match = constraint.match(pattern);
      if (match) {
        const count = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const windowMs = this.unitToMs(unit);
        
        return {
          maxRequests: count,
          windowMs: windowMs
        };
      }
    }

    // デフォルト値を返す
    return {
      maxRequests: this.config.defaultMaxRequests,
      windowMs: this.config.defaultWindowMs
    };
  }

  private unitToMs(unit: string): number {
    switch (unit) {
      case '秒':
      case 'second':
      case 's':
        return 1000;
      case '分':
      case 'minute':
      case 'm':
        return 60 * 1000;
      case '時間':
      case 'hour':
      case 'h':
        return 60 * 60 * 1000;
      case '日':
      case 'day':
      case 'd':
        return 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000; // デフォルト1分
    }
  }

  private generateKey(context: DecisionContext, constraint: string): string {
    // カスタムキージェネレータがあれば使用
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(context, constraint);
    }

    // デフォルト: エージェント+アクション+リソース
    const parts = [
      context.agent,
      context.action,
      context.resource
    ];

    // IPアドレスがあれば含める
    if (context.environment?.clientIP) {
      parts.push(context.environment.clientIP as string);
    }

    return parts.join(':');
  }

  private getOrCreateWindow(key: string, limit: RateLimitConfig): RateLimitWindow {
    let window = this.windowStore.get(key);
    
    if (!window) {
      window = {
        key,
        count: 0,
        startTime: Date.now(),
        lastAccess: Date.now(),
        maxRequests: limit.maxRequests,
        windowMs: limit.windowMs
      };
      this.windowStore.set(key, window);
    }

    return window;
  }

  private resetWindow(window: RateLimitWindow, now: number): void {
    window.count = 0;
    window.startTime = now;
    window.lastAccess = now;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, window] of this.windowStore.entries()) {
        // 最終アクセスから1時間以上経過したウィンドウを削除
        if (now - window.lastAccess > 3600000) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        this.windowStore.delete(key);
      }

      if (expiredKeys.length > 0) {
        this.logger.info(`期限切れウィンドウを削除: ${expiredKeys.length}件`);
      }
    }, this.config.cleanupIntervalMs);
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.windowStore.clear();
    this.logger.info('RateLimiterプロセッサクリーンアップ完了');
  }
}

interface RateLimiterConfig {
  defaultMaxRequests: number;
  defaultWindowMs: number;
  cleanupIntervalMs: number;
  keyGenerator?: (context: DecisionContext, constraint: string) => string;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitWindow {
  key: string;
  count: number;
  startTime: number;
  lastAccess: number;
  maxRequests: number;
  windowMs: number;
}

export class RateLimitExceededError extends Error {
  public readonly metadata: {
    limit: number;
    windowMs: number;
    resetAt: Date;
    retryAfter: number;
  };

  constructor(message: string, metadata: RateLimitExceededError['metadata']) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.metadata = metadata;
  }
}