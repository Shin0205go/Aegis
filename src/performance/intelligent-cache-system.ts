// ============================================================================
// AEGIS - Intelligent Cache System (Phase 3)
// インテリジェントキャッシュシステム
// ============================================================================

import { Logger } from '../utils/logger.js';
import { DecisionContext, PolicyDecision, AccessControlResult } from '../types/index.js';
import * as crypto from 'crypto';

const logger = new Logger('intelligent-cache');

export interface CacheEntry {
  key: string;
  value: AccessControlResult;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  ttl: number; // seconds
  contextHash: string;
  policyHash: string;
  confidence: number;
  tags: string[];
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  avgResponseTime: number;
  memoryUsage: number; // bytes
  evictionCount: number;
}

export interface CacheConfiguration {
  maxEntries: number;
  defaultTtl: number; // seconds
  confidenceThreshold: number; // 0-1, minimum confidence to cache
  enableLRUEviction: boolean;
  enableIntelligentTtl: boolean;
  contextSensitivity: number; // 0-1, how sensitive to context changes
  compressionEnabled: boolean;
}

export interface IntelligentCacheOptions {
  adaptiveTtl: boolean;
  contextualGrouping: boolean;
  predictivePreloading: boolean;
  patternRecognition: boolean;
}

export class IntelligentCacheSystem {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // LRU tracking
  private stats: CacheStats = {
    totalEntries: 0,
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    avgResponseTime: 0,
    memoryUsage: 0,
    evictionCount: 0
  };
  private config: CacheConfiguration;
  private options: IntelligentCacheOptions;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private patternMap: Map<string, number> = new Map(); // pattern frequency

  constructor(
    config: Partial<CacheConfiguration> = {},
    options: Partial<IntelligentCacheOptions> = {}
  ) {
    this.config = {
      maxEntries: 1000,
      defaultTtl: 300, // 5 minutes
      confidenceThreshold: 0.7,
      enableLRUEviction: true,
      enableIntelligentTtl: true,
      contextSensitivity: 0.8,
      compressionEnabled: true,
      ...config
    };

    this.options = {
      adaptiveTtl: true,
      contextualGrouping: true,
      predictivePreloading: false,
      patternRecognition: true,
      ...options
    };

    this.startCleanupTimer();
    logger.info('Intelligent Cache System initialized', { config: this.config, options: this.options });
  }

  /**
   * キャッシュからエントリを取得
   */
  async get(
    context: DecisionContext,
    policy: string,
    environment: Record<string, any>
  ): Promise<AccessControlResult | null> {
    const startTime = Date.now();
    const key = this.generateCacheKey(context, policy, environment);

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.missCount++;
      this.updateHitRate();
      logger.debug('Cache miss', { key: key.substring(0, 16) + '...' });
      return null;
    }

    // TTL確認
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.missCount++;
      this.updateHitRate();
      logger.debug('Cache expired', { key: key.substring(0, 16) + '...' });
      return null;
    }

    // アクセス記録更新
    entry.lastAccessed = new Date();
    entry.accessCount++;
    this.updateAccessOrder(key);

    // パターン学習
    if (this.options.patternRecognition) {
      this.recordAccessPattern(context, policy);
    }

    this.stats.hitCount++;
    this.updateHitRate();
    
    const responseTime = Date.now() - startTime;
    this.updateAvgResponseTime(responseTime);

    logger.debug('Cache hit', { 
      key: key.substring(0, 16) + '...',
      accessCount: entry.accessCount,
      responseTime
    });

    return entry.value;
  }

  /**
   * キャッシュにエントリを保存
   */
  async set(
    context: DecisionContext,
    policy: string,
    environment: Record<string, any>,
    result: AccessControlResult
  ): Promise<void> {
    // 信頼度閾値チェック
    if (result.confidence < this.config.confidenceThreshold) {
      logger.debug('Result confidence too low for caching', { 
        confidence: result.confidence,
        threshold: this.config.confidenceThreshold
      });
      return;
    }

    const key = this.generateCacheKey(context, policy, environment);
    const now = new Date();

    // インテリジェントTTL計算
    const ttl = this.options.adaptiveTtl ? 
      this.calculateIntelligentTtl(context, result) : 
      this.config.defaultTtl;

    const entry: CacheEntry = {
      key,
      value: result,
      createdAt: now,
      lastAccessed: now,
      accessCount: 1,
      ttl,
      contextHash: this.generateContextHash(context),
      policyHash: this.generatePolicyHash(policy),
      confidence: result.confidence,
      tags: this.generateTags(context, policy, result)
    };

    // 容量チェックと退避
    if (this.cache.size >= this.config.maxEntries) {
      await this.evictEntries();
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.stats.totalEntries = this.cache.size;
    this.updateMemoryUsage();

    logger.debug('Entry cached', {
      key: key.substring(0, 16) + '...',
      ttl,
      confidence: result.confidence,
      tags: entry.tags
    });

    // コンテキストグループ化
    if (this.options.contextualGrouping) {
      await this.updateContextualGroups(context, policy, entry);
    }
  }

  /**
   * キャッシュキーの生成
   */
  private generateCacheKey(
    context: DecisionContext,
    policy: string,
    environment: Record<string, any>
  ): string {
    const contextStr = this.normalizeContext(context);
    const envStr = JSON.stringify(environment, Object.keys(environment).sort());
    const combined = `${contextStr}:${policy}:${envStr}`;
    
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * コンテキストの正規化
   */
  private normalizeContext(context: DecisionContext): string {
    // コンテキスト感度設定に基づいて、どの要素を含めるかを決定
    const sensitiveFields = ['agent', 'action', 'resource'];
    const optionalFields = ['purpose', 'time'];
    
    const normalizedContext: any = {};
    
    // 必須フィールド
    sensitiveFields.forEach(field => {
      if (context[field as keyof DecisionContext]) {
        normalizedContext[field] = context[field as keyof DecisionContext];
      }
    });

    // オプションフィールド（感度設定による）
    if (this.config.contextSensitivity > 0.5) {
      optionalFields.forEach(field => {
        if (context[field as keyof DecisionContext]) {
          if (field === 'time') {
            // 時間は分単位で丸める（細かすぎる差異を無視）
            const time = context.time as Date;
            normalizedContext[field] = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), time.getMinutes()).toISOString();
          } else {
            normalizedContext[field] = context[field as keyof DecisionContext];
          }
        }
      });
    }

    return JSON.stringify(normalizedContext, Object.keys(normalizedContext).sort());
  }

  /**
   * コンテキストハッシュの生成
   */
  private generateContextHash(context: DecisionContext): string {
    const contextStr = this.normalizeContext(context);
    return crypto.createHash('md5').update(contextStr).digest('hex');
  }

  /**
   * ポリシーハッシュの生成
   */
  private generatePolicyHash(policy: string): string {
    return crypto.createHash('md5').update(policy).digest('hex');
  }

  /**
   * タグの生成
   */
  private generateTags(context: DecisionContext, policy: string, result: AccessControlResult): string[] {
    const tags: string[] = [];
    
    // エージェントタグ
    tags.push(`agent:${context.agent}`);
    
    // アクションタグ
    tags.push(`action:${context.action}`);
    
    // リソースタイプタグ
    if (context.resource.startsWith('tool:')) {
      tags.push('type:tool');
    } else if (context.resource.includes('file')) {
      tags.push('type:file');
    } else {
      tags.push('type:resource');
    }
    
    // 判定結果タグ
    tags.push(`decision:${result.decision}`);
    
    // 信頼度レベルタグ
    if (result.confidence > 0.9) {
      tags.push('confidence:high');
    } else if (result.confidence > 0.7) {
      tags.push('confidence:medium');
    } else {
      tags.push('confidence:low');
    }

    return tags;
  }

  /**
   * インテリジェントTTL計算
   */
  private calculateIntelligentTtl(context: DecisionContext, result: AccessControlResult): number {
    let baseTtl = this.config.defaultTtl;

    // 信頼度ベースの調整
    const confidenceMultiplier = result.confidence;
    baseTtl *= confidenceMultiplier;

    // 判定結果ベースの調整
    if (result.decision === 'PERMIT') {
      baseTtl *= 1.2; // PERMITは長めにキャッシュ
    } else if (result.decision === 'DENY') {
      baseTtl *= 0.8; // DENYは短めにキャッシュ
    } else {
      baseTtl *= 0.5; // INDETERMINATEは最短
    }

    // リソースタイプベースの調整
    if (context.resource.includes('sensitive') || context.resource.includes('.env')) {
      baseTtl *= 0.5; // 機密リソースは短めに
    }

    // アクセスパターンベースの調整
    const pattern = `${context.agent}:${context.action}`;
    const patternFrequency = this.patternMap.get(pattern) || 0;
    if (patternFrequency > 10) {
      baseTtl *= 1.5; // 頻繁なパターンは長めに
    }

    return Math.max(Math.min(baseTtl, this.config.defaultTtl * 3), 30); // 30秒～3倍の範囲
  }

  /**
   * エントリの期限切れ確認
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const createdTime = entry.createdAt.getTime();
    const ttlMs = entry.ttl * 1000;
    
    return (now - createdTime) > ttlMs;
  }

  /**
   * アクセス順序の更新（LRU用）
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * エントリの退避
   */
  private async evictEntries(): Promise<void> {
    const evictCount = Math.floor(this.config.maxEntries * 0.1); // 10%を削除
    
    if (this.config.enableLRUEviction) {
      // LRU方式での削除
      for (let i = 0; i < evictCount && this.accessOrder.length > 0; i++) {
        const oldestKey = this.accessOrder.shift()!;
        this.cache.delete(oldestKey);
        this.stats.evictionCount++;
      }
    } else {
      // 期限切れエントリを優先削除
      const expiredKeys: string[] = [];
      for (const [key, entry] of this.cache) {
        if (this.isExpired(entry)) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.slice(0, evictCount).forEach(key => {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.stats.evictionCount++;
      });
    }

    logger.debug('Cache entries evicted', { evictedCount: evictCount });
  }

  /**
   * アクセスパターンの記録
   */
  private recordAccessPattern(context: DecisionContext, policy: string): void {
    const pattern = `${context.agent}:${context.action}`;
    const count = this.patternMap.get(pattern) || 0;
    this.patternMap.set(pattern, count + 1);

    // パターンマップのサイズ制限
    if (this.patternMap.size > 1000) {
      // 頻度の低いパターンを削除
      const entries = Array.from(this.patternMap.entries())
        .sort(([,a], [,b]) => a - b)
        .slice(0, 200); // 下位200個を削除

      entries.forEach(([pattern]) => {
        this.patternMap.delete(pattern);
      });
    }
  }

  /**
   * コンテキストグループの更新
   */
  private async updateContextualGroups(
    context: DecisionContext,
    policy: string,
    entry: CacheEntry
  ): Promise<void> {
    // 類似コンテキストのエントリを探してグループ化
    // 実装は簡素化版
    const similarEntries = Array.from(this.cache.values()).filter(cached => 
      cached.contextHash === entry.contextHash && cached.key !== entry.key
    );

    if (similarEntries.length > 0) {
      logger.debug('Found similar context entries', { 
        count: similarEntries.length,
        contextHash: entry.contextHash.substring(0, 8) + '...'
      });
    }
  }

  /**
   * 統計情報の更新
   */
  private updateHitRate(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = total > 0 ? (this.stats.hitCount / total) * 100 : 0;
  }

  private updateAvgResponseTime(responseTime: number): void {
    this.stats.avgResponseTime = (this.stats.avgResponseTime + responseTime) / 2;
  }

  private updateMemoryUsage(): void {
    // 簡易メモリ使用量計算
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry).length * 2; // rough estimate
    }
    this.stats.memoryUsage = totalSize;
  }

  /**
   * クリーンアップタイマーの開始
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // 1分ごと
  }

  /**
   * 期限切れエントリのクリーンアップ
   */
  private cleanupExpiredEntries(): void {
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    });

    if (expiredKeys.length > 0) {
      this.stats.totalEntries = this.cache.size;
      this.updateMemoryUsage();
      logger.debug('Expired entries cleaned up', { count: expiredKeys.length });
    }
  }

  /**
   * 統計情報の取得
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * タグベースでエントリを検索
   */
  findByTags(tags: string[]): CacheEntry[] {
    return Array.from(this.cache.values()).filter(entry =>
      tags.every(tag => entry.tags.includes(tag))
    );
  }

  /**
   * キャッシュのクリア
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      totalEntries: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      avgResponseTime: 0,
      memoryUsage: 0,
      evictionCount: 0
    };
    logger.info('Cache cleared');
  }

  /**
   * 特定パターンのエントリを無効化
   */
  invalidateByPattern(pattern: string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (entry.tags.some(tag => tag.includes(pattern))) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      invalidatedCount++;
    });

    this.stats.totalEntries = this.cache.size;
    this.updateMemoryUsage();

    logger.info('Cache entries invalidated by pattern', { pattern, count: invalidatedCount });
    return invalidatedCount;
  }

  /**
   * 停止処理
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    logger.info('Intelligent Cache System stopped');
  }
}