import { DecisionContext } from '../../types';

/**
 * 制約プロセッサのインターフェース
 */
export interface ConstraintProcessor {
  /**
   * プロセッサ名
   */
  name: string;

  /**
   * サポートする制約タイプ
   */
  supportedTypes: string[];

  /**
   * この制約を処理できるかチェック
   */
  canProcess(constraint: string): boolean;

  /**
   * 制約を適用
   */
  apply(constraint: string, data: any, context: DecisionContext): Promise<any>;

  /**
   * 初期化
   */
  initialize?(config: any): Promise<void>;

  /**
   * クリーンアップ
   */
  cleanup?(): Promise<void>;
}

/**
 * 制約定義
 */
export interface ConstraintDefinition {
  id: string;
  type: string;
  description?: string;
  parameters?: Record<string, any>;
  priority?: number;
  condition?: string; // 制約を適用する条件（オプション）
}

/**
 * 制約実行結果
 */
export interface ConstraintResult {
  success: boolean;
  data?: any;
  error?: string;
  appliedConstraints: string[];
  metadata?: Record<string, any>;
}

/**
 * 制約プロセッサ設定
 */
export interface ConstraintProcessorConfig {
  enabled: boolean;
  config?: Record<string, any>;
  timeout?: number;
  retryCount?: number;
}

/**
 * レート制限設定
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: DecisionContext) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * データ変換設定
 */
export interface DataTransformConfig {
  type: 'encrypt' | 'decrypt' | 'tokenize' | 'mask' | 'hash';
  algorithm?: string;
  key?: string;
  fields?: string[];
  preserveFormat?: boolean;
}

/**
 * 地理的制限設定
 */
export interface GeoRestrictionConfig {
  allowedCountries?: string[];
  blockedCountries?: string[];
  allowedRegions?: string[];
  blockedRegions?: string[];
  ipGeolocationService?: 'maxmind' | 'ipapi' | 'custom';
}