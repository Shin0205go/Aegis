import { ConstraintProcessor, ConstraintResult, ConstraintProcessorConfig } from './types';
import { DecisionContext } from '../../types';
import { Logger } from '../../utils/logger';

/**
 * 制約プロセッサマネージャー
 * 複数の制約プロセッサを管理し、適切なプロセッサに処理を委譲
 */
export class ConstraintProcessorManager {
  private processors = new Map<string, ConstraintProcessor>();
  private configs = new Map<string, ConstraintProcessorConfig>();
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * プロセッサを登録
   */
  async registerProcessor(
    processor: ConstraintProcessor, 
    config?: ConstraintProcessorConfig
  ): Promise<void> {
    this.logger.info(`制約プロセッサ登録: ${processor.name}`);
    
    // 初期化
    if (processor.initialize && config?.config) {
      await processor.initialize(config.config);
    }

    this.processors.set(processor.name, processor);
    
    if (config) {
      this.configs.set(processor.name, config);
    }

    this.logger.info(`登録完了: ${processor.name}, サポートタイプ: ${processor.supportedTypes.join(', ')}`);
  }

  /**
   * プロセッサを登録解除
   */
  async unregisterProcessor(name: string): Promise<void> {
    const processor = this.processors.get(name);
    
    if (processor?.cleanup) {
      await processor.cleanup();
    }

    this.processors.delete(name);
    this.configs.delete(name);
    
    this.logger.info(`制約プロセッサ登録解除: ${name}`);
  }

  /**
   * 制約を適用
   */
  async applyConstraints(
    constraints: string[], 
    data: any, 
    context: DecisionContext
  ): Promise<ConstraintResult> {
    const result: ConstraintResult = {
      success: true,
      data: data,
      appliedConstraints: [],
      metadata: {}
    };

    // 制約を優先順位でソート（実装可能な場合）
    const sortedConstraints = this.sortConstraintsByPriority(constraints);

    for (const constraint of sortedConstraints) {
      try {
        const processor = this.findProcessorForConstraint(constraint);
        
        if (!processor) {
          this.logger.warn(`制約プロセッサが見つかりません: ${constraint}`);
          continue;
        }

        const config = this.configs.get(processor.name);
        
        // タイムアウト設定
        const timeout = config?.timeout || 30000; // デフォルト30秒
        
        // タイムアウト付きで実行
        const processedData = await this.executeWithTimeout(
          () => processor.apply(constraint, result.data, context),
          timeout
        );

        result.data = processedData;
        result.appliedConstraints.push(constraint);
        
        this.logger.info(`制約適用成功: ${constraint}`);
        
      } catch (error) {
        this.logger.error(`制約適用エラー: ${constraint}`, error);
        
        result.success = false;
        result.error = `制約適用失敗: ${constraint} - ${error instanceof Error ? error.message : '不明なエラー'}`;
        
        // エラー時は処理を中断
        break;
      }
    }

    return result;
  }

  /**
   * 単一の制約を適用
   */
  async applyConstraint(
    constraint: string, 
    data: any, 
    context: DecisionContext
  ): Promise<any> {
    const result = await this.applyConstraints([constraint], data, context);
    
    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 制約に対応するプロセッサを検索
   */
  private findProcessorForConstraint(constraint: string): ConstraintProcessor | undefined {
    for (const processor of this.processors.values()) {
      const config = this.configs.get(processor.name);
      
      // 無効化されているプロセッサはスキップ
      if (config && !config.enabled) {
        continue;
      }

      if (processor.canProcess(constraint)) {
        return processor;
      }
    }

    return undefined;
  }

  /**
   * 制約を優先順位でソート
   */
  private sortConstraintsByPriority(constraints: string[]): string[] {
    // 現在は単純に入力順を維持
    // 将来的には制約定義から優先順位を取得してソート
    return [...constraints];
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
   * 登録されているプロセッサ一覧を取得
   */
  getProcessors(): Array<{
    name: string;
    supportedTypes: string[];
    enabled: boolean;
  }> {
    return Array.from(this.processors.entries()).map(([name, processor]) => ({
      name: processor.name,
      supportedTypes: processor.supportedTypes,
      enabled: this.configs.get(name)?.enabled ?? true
    }));
  }

  /**
   * 特定のプロセッサの設定を更新
   */
  updateProcessorConfig(name: string, config: Partial<ConstraintProcessorConfig>): void {
    const currentConfig = this.configs.get(name) || { enabled: true };
    
    this.configs.set(name, {
      ...currentConfig,
      ...config
    });

    this.logger.info(`プロセッサ設定更新: ${name}`, config);
  }
}