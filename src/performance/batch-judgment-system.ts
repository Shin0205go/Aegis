// ============================================================================
// AEGIS - Batch Judgment System (Phase 3)
// バッチ判定システム - 複数リクエストの効率的一括処理
// ============================================================================

import { Logger } from '../utils/logger.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { DecisionContext, PolicyDecision, AccessControlResult } from '../types/index.js';

const logger = new Logger('batch-judgment');

export interface BatchRequest {
  id: string;
  context: DecisionContext;
  policy: string;
  environment: Record<string, any>;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  timeout?: number; // milliseconds
}

export interface BatchResult {
  id: string;
  result: AccessControlResult;
  processingTime: number;
  error?: string;
}

export interface BatchJudgmentOptions {
  maxBatchSize: number;
  batchTimeout: number; // milliseconds
  enableParallelProcessing: boolean;
  priorityQueuing: boolean;
}

export interface BatchStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgProcessingTime: number;
  maxProcessingTime: number;
  throughput: number; // requests per second
}

export class BatchJudgmentSystem {
  private judgmentEngine: AIJudgmentEngine;
  private options: BatchJudgmentOptions;
  private requestQueue: BatchRequest[] = [];
  private processingQueue: BatchRequest[] = [];
  private stats: BatchStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    avgProcessingTime: 0,
    maxProcessingTime: 0,
    throughput: 0
  };
  private processingTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(judgmentEngine: AIJudgmentEngine, options: Partial<BatchJudgmentOptions> = {}) {
    this.judgmentEngine = judgmentEngine;
    this.options = {
      maxBatchSize: 10,
      batchTimeout: 5000, // 5秒
      enableParallelProcessing: true,
      priorityQueuing: true,
      ...options
    };

    this.startBatchProcessor();
    logger.info('Batch Judgment System initialized', this.options);
  }

  /**
   * バッチリクエストを追加
   */
  async addBatchRequest(
    context: DecisionContext,
    policy: string,
    environment: Record<string, any>,
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL',
    timeout?: number
  ): Promise<string> {
    const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const batchRequest: BatchRequest = {
      id: requestId,
      context,
      policy,
      environment,
      priority,
      timeout
    };

    // 優先度キューイングが有効な場合は優先度順に挿入
    if (this.options.priorityQueuing) {
      this.insertByPriority(batchRequest);
    } else {
      this.requestQueue.push(batchRequest);
    }

    logger.debug('Batch request added', {
      requestId,
      priority,
      queueLength: this.requestQueue.length
    });

    // 緊急優先度の場合は即座に処理
    if (priority === 'URGENT') {
      await this.processUrgentRequest(batchRequest);
    }

    return requestId;
  }

  private insertByPriority(request: BatchRequest): void {
    const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'NORMAL': 2, 'LOW': 1 };
    const requestPriority = priorityOrder[request.priority];

    let insertIndex = this.requestQueue.length;
    for (let i = 0; i < this.requestQueue.length; i++) {
      const queuedPriority = priorityOrder[this.requestQueue[i].priority];
      if (requestPriority > queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    this.requestQueue.splice(insertIndex, 0, request);
  }

  private async processUrgentRequest(request: BatchRequest): Promise<void> {
    try {
      logger.info('Processing urgent request immediately', { requestId: request.id });
      
      const result = await this.processSingleRequest(request);
      
      // 緊急リクエストの結果を別途処理（必要に応じて実装）
      logger.info('Urgent request completed', {
        requestId: request.id,
        decision: result.result.decision,
        processingTime: result.processingTime
      });
    } catch (error) {
      logger.error('Urgent request processing failed', { requestId: request.id, error });
    }
  }

  /**
   * バッチ処理の開始
   */
  private startBatchProcessor(): void {
    this.processingTimer = setInterval(async () => {
      if (!this.isProcessing && this.requestQueue.length > 0) {
        await this.processBatch();
      }
    }, this.options.batchTimeout);
  }

  /**
   * バッチ処理の実行
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batchStartTime = Date.now();

    try {
      // バッチサイズ分のリクエストを処理キューに移動
      const batchSize = Math.min(this.options.maxBatchSize, this.requestQueue.length);
      const batch = this.requestQueue.splice(0, batchSize);
      this.processingQueue.push(...batch);

      logger.info('Starting batch processing', {
        batchSize,
        remainingQueue: this.requestQueue.length
      });

      // 並列処理 vs 順次処理
      let results: BatchResult[];
      if (this.options.enableParallelProcessing) {
        results = await this.processParallel(batch);
      } else {
        results = await this.processSequential(batch);
      }

      // 統計更新
      this.updateStats(results, batchStartTime);

      // 処理完了後の結果処理（必要に応じて実装）
      await this.handleBatchResults(results);

      logger.info('Batch processing completed', {
        batchSize: results.length,
        successCount: results.filter(r => !r.error).length,
        failCount: results.filter(r => r.error).length,
        totalTime: Date.now() - batchStartTime
      });

    } catch (error) {
      logger.error('Batch processing failed', error);
    } finally {
      // 処理キューをクリア
      this.processingQueue = [];
      this.isProcessing = false;
    }
  }

  /**
   * 並列処理実行
   */
  private async processParallel(batch: BatchRequest[]): Promise<BatchResult[]> {
    const promises = batch.map(request => this.processSingleRequest(request));
    
    try {
      return await Promise.all(promises);
    } catch (error) {
      logger.error('Parallel processing failed', error);
      // 個別にリトライ
      return await this.processSequential(batch);
    }
  }

  /**
   * 順次処理実行
   */
  private async processSequential(batch: BatchRequest[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    
    for (const request of batch) {
      const result = await this.processSingleRequest(request);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 単一リクエストの処理
   */
  private async processSingleRequest(request: BatchRequest): Promise<BatchResult> {
    const startTime = Date.now();
    
    try {
      // タイムアウト設定
      const timeout = request.timeout || 30000; // デフォルト30秒
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // AI判定実行
      const judgmentPromise = this.judgmentEngine.makeDecision(
        request.policy,
        request.context,
        request.environment
      );

      const decision = await Promise.race([judgmentPromise, timeoutPromise]);
      const processingTime = Date.now() - startTime;

      const result: AccessControlResult = {
        ...decision,
        processingTime,
        policyUsed: 'batch-processed',
        context: request.context
      };

      return {
        id: request.id,
        result,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Single request processing failed', {
        requestId: request.id,
        error: error instanceof Error ? error.message : error,
        processingTime
      });

      // エラー時のフォールバック結果
      const fallbackResult: AccessControlResult = {
        decision: 'INDETERMINATE',
        reason: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.0,
        processingTime,
        policyUsed: 'error-fallback',
        context: request.context
      };

      return {
        id: request.id,
        result: fallbackResult,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 統計情報の更新
   */
  private updateStats(results: BatchResult[], batchStartTime: number): void {
    const batchProcessingTime = Date.now() - batchStartTime;
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;
    
    // 累積統計の更新
    this.stats.totalRequests += results.length;
    this.stats.successfulRequests += successCount;
    this.stats.failedRequests += failCount;
    
    // 平均処理時間の更新
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const newAvgTime = totalProcessingTime / results.length;
    this.stats.avgProcessingTime = (this.stats.avgProcessingTime + newAvgTime) / 2;
    
    // 最大処理時間の更新
    const maxTime = Math.max(...results.map(r => r.processingTime));
    this.stats.maxProcessingTime = Math.max(this.stats.maxProcessingTime, maxTime);
    
    // スループットの計算（requests per second）
    this.stats.throughput = (results.length / batchProcessingTime) * 1000;
    
    logger.debug('Batch stats updated', this.stats);
  }

  /**
   * バッチ結果の処理
   */
  private async handleBatchResults(results: BatchResult[]): Promise<void> {
    // 結果に基づく後続処理（必要に応じて実装）
    const errors = results.filter(r => r.error);
    
    if (errors.length > 0) {
      logger.warn('Batch contained errors', {
        errorCount: errors.length,
        totalCount: results.length,
        errors: errors.map(e => ({ id: e.id, error: e.error }))
      });
    }
    
    // 高優先度リクエストの結果を特別処理
    const highPriorityResults = results.filter(r => {
      const originalRequest = this.processingQueue.find(req => req.id === r.id);
      return originalRequest?.priority === 'HIGH' || originalRequest?.priority === 'URGENT';
    });
    
    if (highPriorityResults.length > 0) {
      logger.info('High priority requests completed', {
        count: highPriorityResults.length,
        results: highPriorityResults.map(r => ({
          id: r.id,
          decision: r.result.decision,
          processingTime: r.processingTime
        }))
      });
    }
  }

  /**
   * 統計情報の取得
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  /**
   * キューの状態取得
   */
  getQueueStatus(): {
    waitingRequests: number;
    processingRequests: number;
    isProcessing: boolean;
    priorityDistribution: Record<string, number>;
  } {
    const priorityDistribution: Record<string, number> = {
      'LOW': 0,
      'NORMAL': 0,
      'HIGH': 0,
      'URGENT': 0
    };

    this.requestQueue.forEach(req => {
      priorityDistribution[req.priority]++;
    });

    return {
      waitingRequests: this.requestQueue.length,
      processingRequests: this.processingQueue.length,
      isProcessing: this.isProcessing,
      priorityDistribution
    };
  }

  /**
   * バッチ処理の停止
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    
    logger.info('Batch Judgment System stopped', {
      remainingRequests: this.requestQueue.length + this.processingQueue.length
    });
  }

  /**
   * 設定の更新
   */
  updateOptions(newOptions: Partial<BatchJudgmentOptions>): void {
    this.options = { ...this.options, ...newOptions };
    logger.info('Batch Judgment System options updated', this.options);
  }

  /**
   * 待機中リクエストの強制処理
   */
  async forceProcessPendingRequests(): Promise<void> {
    if (this.requestQueue.length === 0) {
      logger.info('No pending requests to process');
      return;
    }

    logger.info('Force processing pending requests', {
      pendingCount: this.requestQueue.length
    });

    await this.processBatch();
  }
}