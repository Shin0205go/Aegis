import { ObligationExecutor, ObligationResult, ObligationExecutorConfig } from './types';
import { DecisionContext, PolicyDecision } from '../../types';
import { Logger } from '../../utils/logger';

/**
 * 義務エグゼキューターマネージャー
 * 複数の義務エグゼキューターを管理し、適切なエグゼキューターに処理を委譲
 */
export class ObligationExecutorManager {
  private executors = new Map<string, ObligationExecutor>();
  private configs = new Map<string, ObligationExecutorConfig>();
  private logger: Logger;
  private executionHistory: ObligationExecutionRecord[] = [];
  private maxHistorySize = 1000;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * エグゼキューターを登録
   */
  async registerExecutor(
    executor: ObligationExecutor,
    config?: ObligationExecutorConfig
  ): Promise<void> {
    this.logger.info(`義務エグゼキューター登録: ${executor.name}`);

    // 初期化
    if (executor.initialize && config?.config) {
      await executor.initialize(config.config);
    }

    this.executors.set(executor.name, executor);

    if (config) {
      this.configs.set(executor.name, config);
    }

    this.logger.info(`登録完了: ${executor.name}, サポートタイプ: ${executor.supportedTypes.join(', ')}`);
  }

  /**
   * エグゼキューターを登録解除
   */
  async unregisterExecutor(name: string): Promise<void> {
    const executor = this.executors.get(name);

    if (executor?.cleanup) {
      await executor.cleanup();
    }

    this.executors.delete(name);
    this.configs.delete(name);

    this.logger.info(`義務エグゼキューター登録解除: ${name}`);
  }

  /**
   * 義務を実行
   */
  async executeObligations(
    obligations: string[],
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationExecutionResult> {
    const results: ObligationResult[] = [];
    const errors: string[] = [];

    for (const obligation of obligations) {
      const startTime = Date.now();
      
      try {
        const executor = this.findExecutorForObligation(obligation);

        if (!executor) {
          this.logger.warn(`義務エグゼキューターが見つかりません: ${obligation}`);
          errors.push(`未対応の義務: ${obligation}`);
          continue;
        }

        const config = this.configs.get(executor.name);

        // タイムアウト設定
        const timeout = config?.timeout || 30000; // デフォルト30秒

        // タイムアウト付きで実行
        const result = await this.executeWithTimeout(
          () => executor.execute(obligation, context, decision),
          timeout
        );

        results.push(result);
        
        // 実行履歴を記録
        this.recordExecution({
          obligation,
          executor: executor.name,
          result,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });

        this.logger.info(`義務実行成功: ${obligation}`);

      } catch (error) {
        const errorMessage = `義務実行エラー: ${obligation} - ${error instanceof Error ? error.message : '不明なエラー'}`;
        this.logger.error(errorMessage, error);
        errors.push(errorMessage);

        // 失敗も記録
        results.push({
          success: false,
          executedAt: new Date(),
          error: errorMessage
        });

        // リトライが必要かチェック
        const config = this.configs.get(this.findExecutorForObligation(obligation)?.name || '');
        if (config?.retryCount && config.retryCount > 0) {
          // リトライ機能は将来的な拡張点
          // 現在はエラーをログに記録して継続
        }
      }
    }

    return {
      success: errors.length === 0,
      results,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 単一の義務を実行
   */
  async executeObligation(
    obligation: string,
    context: DecisionContext,
    decision: PolicyDecision
  ): Promise<ObligationResult> {
    const result = await this.executeObligations([obligation], context, decision);
    
    if (!result.success) {
      throw new Error(result.errors?.[0] || '義務実行失敗');
    }

    return result.results[0];
  }

  /**
   * 義務に対応するエグゼキューターを検索
   */
  private findExecutorForObligation(obligation: string): ObligationExecutor | undefined {
    for (const executor of this.executors.values()) {
      const config = this.configs.get(executor.name);

      // 無効化されているエグゼキューターはスキップ
      if (config && !config.enabled) {
        continue;
      }

      if (executor.canExecute(obligation)) {
        return executor;
      }
    }

    return undefined;
  }

  /**
   * タイムアウト付きで関数を実行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`タイムアウト: ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([fn(), timeoutPromise]);
  }

  /**
   * 実行履歴を記録
   */
  private recordExecution(record: ObligationExecutionRecord): void {
    this.executionHistory.push(record);

    // 履歴サイズ制限
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * 登録されているエグゼキューター一覧を取得
   */
  getExecutors(): Array<{
    name: string;
    supportedTypes: string[];
    enabled: boolean;
  }> {
    return Array.from(this.executors.entries()).map(([name, executor]) => ({
      name: executor.name,
      supportedTypes: executor.supportedTypes,
      enabled: this.configs.get(name)?.enabled ?? true
    }));
  }

  /**
   * 特定のエグゼキューターの設定を更新
   */
  updateExecutorConfig(name: string, config: Partial<ObligationExecutorConfig>): void {
    const currentConfig = this.configs.get(name) || { enabled: true };

    this.configs.set(name, {
      ...currentConfig,
      ...config
    });

    this.logger.info(`エグゼキューター設定更新: ${name}`, config);
  }

  /**
   * 実行履歴を取得
   */
  getExecutionHistory(limit?: number): ObligationExecutionRecord[] {
    const history = [...this.executionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 実行統計を取得
   */
  getExecutionStats(): ObligationExecutionStats {
    const stats: ObligationExecutionStats = {
      totalExecutions: this.executionHistory.length,
      successCount: 0,
      failureCount: 0,
      averageDuration: 0,
      byObligation: {},
      byExecutor: {}
    };

    let totalDuration = 0;

    for (const record of this.executionHistory) {
      if (record.result.success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }

      totalDuration += record.duration;

      // 義務別統計
      if (!stats.byObligation[record.obligation]) {
        stats.byObligation[record.obligation] = {
          count: 0,
          successCount: 0,
          failureCount: 0
        };
      }
      stats.byObligation[record.obligation].count++;
      if (record.result.success) {
        stats.byObligation[record.obligation].successCount++;
      } else {
        stats.byObligation[record.obligation].failureCount++;
      }

      // エグゼキューター別統計
      if (!stats.byExecutor[record.executor]) {
        stats.byExecutor[record.executor] = {
          count: 0,
          successCount: 0,
          failureCount: 0
        };
      }
      stats.byExecutor[record.executor].count++;
      if (record.result.success) {
        stats.byExecutor[record.executor].successCount++;
      } else {
        stats.byExecutor[record.executor].failureCount++;
      }
    }

    if (stats.totalExecutions > 0) {
      stats.averageDuration = totalDuration / stats.totalExecutions;
    }

    return stats;
  }
}

interface ObligationExecutionResult {
  success: boolean;
  results: ObligationResult[];
  errors?: string[];
}

interface ObligationExecutionRecord {
  obligation: string;
  executor: string;
  result: ObligationResult;
  duration: number;
  timestamp: Date;
}

interface ObligationExecutionStats {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  byObligation: Record<string, {
    count: number;
    successCount: number;
    failureCount: number;
  }>;
  byExecutor: Record<string, {
    count: number;
    successCount: number;
    failureCount: number;
  }>;
}