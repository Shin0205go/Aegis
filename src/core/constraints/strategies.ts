// ============================================================================
// AEGIS - Constraint Strategies
// ストラテジーパターンによる制約処理の実装
// ============================================================================

import type { ConstrainableData, ConstrainedData } from '../../types/enforcement-types.js';

export interface ConstraintStrategy {
  /**
   * この制約を処理できるかチェック
   */
  canHandle(constraint: string): boolean;
  
  /**
   * 制約を適用
   */
  apply(data: ConstrainableData, constraint: string): ConstrainableData;
  
  /**
   * 制約の説明を取得
   */
  getDescription(): string;
}

/**
 * 個人情報匿名化ストラテジー
 */
export class AnonymizeStrategy implements ConstraintStrategy {
  canHandle(constraint: string): boolean {
    return constraint.includes('個人情報を匿名化') || 
           constraint.includes('anonymize') ||
           constraint.includes('個人情報の匿名化');
  }
  
  apply(data: ConstrainableData, constraint: string): ConstrainableData {
    if (typeof data === 'string') {
      return this.anonymizeString(data);
    }
    
    if (typeof data === 'object' && data !== null) {
      return this.anonymizeObject(data as Record<string, any>);
    }
    
    return data;
  }
  
  private anonymizeString(text: string): string {
    const patterns = [
      { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '***@***.***' },
      { regex: /\b\d{3}-\d{4}-\d{4}\b/g, replacement: '***-****-****' },
      { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '***.***.***.***' }
    ];
    
    return patterns.reduce((result, pattern) => 
      result.replace(pattern.regex, pattern.replacement), text
    );
  }
  
  private anonymizeObject(obj: Record<string, any>): Record<string, any> {
    const result = { ...obj };
    const sensitiveFields = ['email', 'phone', 'address', 'name', 'ip', 'ipAddress'];
    
    sensitiveFields.forEach(field => {
      if (field in result) {
        result[field] = '***REDACTED***';
      }
    });
    
    return result;
  }
  
  getDescription(): string {
    return '個人情報（メールアドレス、電話番号、IPアドレス等）を匿名化';
  }
}

/**
 * フィールド制限ストラテジー
 */
export class FieldRestrictionStrategy implements ConstraintStrategy {
  canHandle(constraint: string): boolean {
    return constraint.startsWith('フィールド制限:') || 
           constraint.startsWith('restrict-fields:');
  }
  
  apply(data: ConstrainableData, constraint: string): ConstrainableData {
    if (!this.isValidObject(data)) {
      return data;
    }
    
    const fields = this.extractFields(constraint);
    return this.filterData(data, fields);
  }
  
  private isValidObject(data: ConstrainableData): data is Record<string, any> {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
  }
  
  private filterData(data: Record<string, any>, fields: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        result[key] = this.filterArray(value, fields);
      } else if (fields.includes(key)) {
        result[key] = value;
      }
    });
    
    return result;
  }
  
  private filterArray(items: any[], fields: string[]): any[] {
    return items.map(item => 
      this.isValidObject(item) ? this.filterFields(item as Record<string, any>, fields) : item
    );
  }
  
  private extractFields(constraint: string): string[] {
    const match = constraint.match(/[:：](.+)$/);
    if (!match) return [];
    return match[1].trim().split(/[,、]/);
  }
  
  private filterFields(obj: Record<string, any>, fields: string[]): Record<string, any> {
    const filtered: Record<string, any> = {};
    for (const field of fields) {
      if (field in obj) {
        filtered[field] = obj[field];
      }
    }
    return filtered;
  }
  
  getDescription(): string {
    return '指定されたフィールドのみを返却';
  }
}

/**
 * レコード数制限ストラテジー
 */
export class RecordLimitStrategy implements ConstraintStrategy {
  canHandle(constraint: string): boolean {
    return constraint.startsWith('レコード数制限:') || 
           constraint.startsWith('limit-records:');
  }
  
  apply(data: ConstrainableData, constraint: string): ConstrainableData {
    const limit = this.extractLimit(constraint);
    
    if (!this.canApplyLimit(data, limit)) {
      return data;
    }
    
    return this.limitArrayFields(data, limit);
  }
  
  private canApplyLimit(data: ConstrainableData, limit: number): data is Record<string, any> {
    return limit > 0 && typeof data === 'object' && data !== null && !Array.isArray(data);
  }
  
  private limitArrayFields(data: Record<string, any>, limit: number): ConstrainedData {
    const result: ConstrainedData = { ...data };
    let truncated = false;
    let originalCount = 0;
    
    Object.entries(data)
      .filter(([_, value]) => Array.isArray(value))
      .forEach(([key, value]) => {
        const array = value as any[];
        if (array.length > limit) {
          result[key] = array.slice(0, limit);
          truncated = true;
          originalCount = Math.max(originalCount, array.length);
        }
      });
    
    if (truncated) {
      result._truncated = true;
      result._originalCount = originalCount;
    }
    
    return result;
  }
  
  private extractLimit(constraint: string): number {
    const match = constraint.match(/[:：](\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  
  getDescription(): string {
    return '配列内のレコード数を制限';
  }
}

/**
 * データサイズ制限ストラテジー
 */
export class DataSizeLimitStrategy implements ConstraintStrategy {
  canHandle(constraint: string): boolean {
    return constraint.startsWith('データサイズ制限:') || 
           constraint.startsWith('limit-size:');
  }
  
  apply(data: ConstrainableData, constraint: string): ConstrainableData {
    const limitBytes = this.parseSize(constraint);
    
    if (this.isWithinLimit(data, limitBytes)) {
      return data;
    }
    
    return this.truncateData(data, limitBytes);
  }
  
  private isWithinLimit(data: ConstrainableData, limitBytes: number): boolean {
    return JSON.stringify(data).length <= limitBytes;
  }
  
  private truncateData(data: ConstrainableData, limitBytes: number): ConstrainableData {
    const truncateMarker = '[TRUNCATED]';
    const safeLimit = limitBytes - truncateMarker.length;
    
    if (typeof data === 'string') {
      return data.substring(0, safeLimit) + truncateMarker;
    }
    
    if (this.hasStringContent(data)) {
      return this.truncateContent(data, safeLimit, truncateMarker);
    }
    
    return data;
  }
  
  private hasStringContent(data: ConstrainableData): data is { content: string; [key: string]: any } {
    return typeof data === 'object' && data !== null && 'content' in data && typeof (data as any).content === 'string';
  }
  
  private truncateContent(data: { content: string; [key: string]: any }, limit: number, marker: string): ConstrainedData {
    return {
      ...data,
      content: data.content.substring(0, limit) + marker,
      _truncated: true,
      _originalSize: data.content.length
    };
  }
  
  private parseSize(constraint: string): number {
    const match = constraint.match(/[:：](\d+)\s*(KB|MB|GB)?/i);
    if (!match) return 1024;
    
    const value = parseInt(match[1]);
    const unit = match[2]?.toUpperCase() || 'B';
    
    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
  }
  
  getDescription(): string {
    return 'データサイズを指定されたバイト数に制限';
  }
}

/**
 * 時間制限ストラテジー（非同期処理用）
 */
export class TimeLimitStrategy implements ConstraintStrategy {
  canHandle(constraint: string): boolean {
    return constraint.startsWith('実行時間制限:') || 
           constraint.startsWith('time-limit:');
  }
  
  apply(data: ConstrainableData, constraint: string): ConstrainableData {
    // このストラテジーは実際には非同期処理のラッパーで使用される
    // ここでは制限値の抽出のみ行う
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return {
        ...(data as Record<string, any>),
        _timeLimit: this.parseTime(constraint)
      } as ConstrainedData;
    }
    return data;
  }
  
  private parseTime(constraint: string): number {
    const match = constraint.match(/[:：](\d+)\s*(秒|分|時間|s|m|h)?/);
    if (!match) return 1000;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case '秒':
      case 's': return value * 1000;
      case '分':
      case 'm': return value * 60 * 1000;
      case '時間':
      case 'h': return value * 60 * 60 * 1000;
      default: return value * 1000;
    }
  }
  
  getDescription(): string {
    return '処理の実行時間を制限';
  }
}

/**
 * 制約ストラテジーマネージャー
 */
export class ConstraintStrategyManager {
  private strategies: ConstraintStrategy[] = [];
  
  constructor() {
    // デフォルトストラテジーを登録
    this.registerStrategy(new AnonymizeStrategy());
    this.registerStrategy(new FieldRestrictionStrategy());
    this.registerStrategy(new RecordLimitStrategy());
    this.registerStrategy(new DataSizeLimitStrategy());
    this.registerStrategy(new TimeLimitStrategy());
  }
  
  /**
   * ストラテジーを登録
   */
  registerStrategy(strategy: ConstraintStrategy): void {
    this.strategies.push(strategy);
  }
  
  /**
   * 制約を適用
   */
  applyConstraint(constraint: string, data: ConstrainableData): ConstrainableData {
    const strategy = this.strategies.find(s => s.canHandle(constraint));
    
    if (!strategy) {
      // 処理できるストラテジーがない場合はデータをそのまま返す
      return data;
    }
    
    return strategy.apply(data, constraint);
  }
  
  /**
   * 複数の制約を順番に適用
   */
  applyConstraints(constraints: string[], data: ConstrainableData): ConstrainableData {
    return constraints.reduce((result, constraint) => {
      return this.applyConstraint(constraint, result);
    }, data);
  }
  
  /**
   * 登録されているストラテジーの情報を取得
   */
  getStrategiesInfo(): Array<{ name: string; description: string }> {
    return this.strategies.map(strategy => ({
      name: strategy.constructor.name,
      description: strategy.getDescription()
    }));
  }
}