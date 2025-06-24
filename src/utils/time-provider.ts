// ============================================================================
// AEGIS - Time Provider
// テスト可能な時間管理インターフェース
// ============================================================================

/**
 * 時間提供インターフェース
 */
export interface TimeProvider {
  /**
   * 現在時刻をミリ秒で取得
   */
  now(): number;
  
  /**
   * 現在のDateオブジェクトを取得
   */
  getDate(): Date;
  
  /**
   * 指定ミリ秒後の時刻を取得
   */
  getFutureTime(milliseconds: number): number;
  
  /**
   * 指定ミリ秒前の時刻を取得
   */
  getPastTime(milliseconds: number): number;
}

/**
 * システム時刻を使用する実装
 */
export class SystemTimeProvider implements TimeProvider {
  now(): number {
    return Date.now();
  }
  
  getDate(): Date {
    return new Date();
  }
  
  getFutureTime(milliseconds: number): number {
    return this.now() + milliseconds;
  }
  
  getPastTime(milliseconds: number): number {
    return this.now() - milliseconds;
  }
}

/**
 * テスト用の固定時刻プロバイダー
 */
export class FixedTimeProvider implements TimeProvider {
  private currentTime: number;
  
  constructor(fixedTime: Date | number = new Date('2024-01-01T00:00:00Z')) {
    this.currentTime = typeof fixedTime === 'number' ? fixedTime : fixedTime.getTime();
  }
  
  now(): number {
    return this.currentTime;
  }
  
  getDate(): Date {
    return new Date(this.currentTime);
  }
  
  getFutureTime(milliseconds: number): number {
    return this.currentTime + milliseconds;
  }
  
  getPastTime(milliseconds: number): number {
    return this.currentTime - milliseconds;
  }
  
  /**
   * 時刻を進める
   */
  advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }
  
  /**
   * 時刻を設定
   */
  setTime(time: Date | number): void {
    this.currentTime = typeof time === 'number' ? time : time.getTime();
  }
}

/**
 * 調整可能な時刻プロバイダー（テスト用）
 */
export class AdjustableTimeProvider implements TimeProvider {
  private offset: number = 0;
  
  now(): number {
    return Date.now() + this.offset;
  }
  
  getDate(): Date {
    return new Date(this.now());
  }
  
  getFutureTime(milliseconds: number): number {
    return this.now() + milliseconds;
  }
  
  getPastTime(milliseconds: number): number {
    return this.now() - milliseconds;
  }
  
  /**
   * 時刻オフセットを設定
   */
  setOffset(milliseconds: number): void {
    this.offset = milliseconds;
  }
  
  /**
   * 時刻を進める
   */
  advance(milliseconds: number): void {
    this.offset += milliseconds;
  }
  
  /**
   * オフセットをリセット
   */
  reset(): void {
    this.offset = 0;
  }
}