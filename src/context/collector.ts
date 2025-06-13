import { DecisionContext } from '../types';
import { Logger } from '../utils/logger';

/**
 * コンテキストエンリッチャーのインターフェース
 */
export interface ContextEnricher {
  name: string;
  enrich(context: DecisionContext): Promise<Record<string, any>>;
}

/**
 * Policy Information Point (PIP) - コンテキスト情報収集
 * 
 * 判定に必要な環境情報を収集・拡張し、より精度の高い判定を可能にします
 */
export class ContextCollector {
  private enrichers: Map<string, ContextEnricher> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * エンリッチャーを登録
   */
  registerEnricher(enricher: ContextEnricher): void {
    this.enrichers.set(enricher.name, enricher);
    this.logger.info(`エンリッチャー登録: ${enricher.name}`);
  }

  /**
   * エンリッチャーを削除
   */
  unregisterEnricher(name: string): void {
    this.enrichers.delete(name);
    this.logger.info(`エンリッチャー削除: ${name}`);
  }

  /**
   * コンテキストを拡張
   * 
   * @param context 基本コンテキスト情報
   * @returns 拡張されたコンテキスト情報
   */
  async enrichContext(context: DecisionContext): Promise<DecisionContext> {
    const startTime = Date.now();
    const enrichedData: Record<string, any> = {};

    // 並列でエンリッチャーを実行
    const enrichmentPromises = Array.from(this.enrichers.values()).map(async (enricher) => {
      try {
        const data = await enricher.enrich(context);
        return { name: enricher.name, data, success: true };
      } catch (error) {
        this.logger.error(`エンリッチャーエラー [${enricher.name}]:`, error);
        return { name: enricher.name, data: {}, success: false, error };
      }
    });

    const results = await Promise.all(enrichmentPromises);

    // 結果を統合
    for (const result of results) {
      if (result.success) {
        enrichedData[result.name] = result.data;
      }
    }

    // 環境情報にエンリッチメントデータを追加
    const enrichedContext: DecisionContext = {
      ...context,
      environment: {
        ...context.environment,
        enrichments: enrichedData,
        enrichmentTime: Date.now() - startTime
      }
    };

    this.logger.info('コンテキスト拡張完了', {
      originalContext: context,
      enrichedContext,
      enrichmentTime: enrichedContext.environment.enrichmentTime
    });

    return enrichedContext;
  }

  /**
   * 登録されているエンリッチャーの一覧を取得
   */
  getEnrichers(): string[] {
    return Array.from(this.enrichers.keys());
  }

  /**
   * エンリッチャーの統計情報を取得
   */
  async getEnrichmentStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {
      totalEnrichers: this.enrichers.size,
      enrichers: this.getEnrichers()
    };

    return stats;
  }
}