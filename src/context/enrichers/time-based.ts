import { ContextEnricher } from '../collector';
import { DecisionContext } from '../../types';

/**
 * 時間ベース情報エンリッチャー
 * 
 * 営業時間、曜日、時間帯、タイムゾーンなどの時間関連情報を追加
 */
export class TimeBasedEnricher implements ContextEnricher {
  name = 'time-based';

  // デフォルトの営業時間設定
  private businessHours = {
    start: 9,  // 9:00
    end: 18,   // 18:00
    timezone: 'Asia/Tokyo'
  };

  // 祝日リスト（簡易版）
  private holidays: Date[] = [
    new Date('2025-01-01'), // 元日
    new Date('2025-01-13'), // 成人の日
    new Date('2025-02-11'), // 建国記念の日
    new Date('2025-02-23'), // 天皇誕生日
    new Date('2025-03-20'), // 春分の日
    new Date('2025-04-29'), // 昭和の日
    new Date('2025-05-03'), // 憲法記念日
    new Date('2025-05-04'), // みどりの日
    new Date('2025-05-05'), // こどもの日
    new Date('2025-07-21'), // 海の日
    new Date('2025-08-11'), // 山の日
    new Date('2025-09-15'), // 敬老の日
    new Date('2025-09-23'), // 秋分の日
    new Date('2025-10-13'), // スポーツの日
    new Date('2025-11-03'), // 文化の日
    new Date('2025-11-23'), // 勤労感謝の日
  ];

  constructor(businessHours?: Partial<typeof TimeBasedEnricher.prototype.businessHours>) {
    if (businessHours) {
      this.businessHours = { ...this.businessHours, ...businessHours };
    }
  }

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    const now = context.time || new Date();
    
    // 基本的な時間情報
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0: Sunday, 6: Saturday
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // 営業時間判定
    const isBusinessHours = this.isBusinessHours(hour, minute);
    
    // 週末判定
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // 祝日判定
    const isHoliday = this.isHoliday(now);
    
    // 営業日判定
    const isBusinessDay = !isWeekend && !isHoliday;
    
    // 時間帯分類
    const timeOfDay = this.getTimeOfDay(hour);
    
    // 四半期
    const quarter = Math.floor((month - 1) / 3) + 1;
    
    // 月末判定
    const isMonthEnd = this.isMonthEnd(now);
    
    // 年度（日本式：4月開始）
    const fiscalYear = month >= 4 ? year : year - 1;
    const fiscalQuarter = month >= 4 ? Math.floor((month - 4) / 3) + 1 : Math.floor((month + 8) / 3) + 1;

    return {
      [this.name]: {
        currentTime: now.toISOString(),
        hour,
        minute,
        dayOfWeek,
        dayOfWeekName: this.getDayOfWeekName(dayOfWeek),
        dayOfMonth,
        month,
        monthName: this.getMonthName(month),
        year,
        quarter,
        fiscalYear,
        fiscalQuarter,
        isBusinessHours,
        isWeekend,
        isHoliday,
        isBusinessDay,
        timeOfDay,
        isMonthEnd,
        timezone: this.businessHours.timezone,
        businessHoursConfig: this.businessHours,
        timeSinceBusinessStart: isBusinessHours ? this.getTimeSinceBusinessStart(hour, minute) : null,
        timeUntilBusinessEnd: isBusinessHours ? this.getTimeUntilBusinessEnd(hour, minute) : null
      }
    };
  }

  private isBusinessHours(hour: number, minute: number): boolean {
    const currentMinutes = hour * 60 + minute;
    const startMinutes = this.businessHours.start * 60;
    const endMinutes = this.businessHours.end * 60;
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  private isHoliday(date: Date): boolean {
    const dateStr = date.toDateString();
    return this.holidays.some(holiday => holiday.toDateString() === dateStr);
  }

  private getTimeOfDay(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private getDayOfWeekName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day];
  }

  private getMonthName(month: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  }

  private isMonthEnd(date: Date): boolean {
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    return nextDay.getMonth() !== date.getMonth();
  }

  private getTimeSinceBusinessStart(hour: number, minute: number): number {
    const currentMinutes = hour * 60 + minute;
    const startMinutes = this.businessHours.start * 60;
    return Math.max(0, currentMinutes - startMinutes);
  }

  private getTimeUntilBusinessEnd(hour: number, minute: number): number {
    const currentMinutes = hour * 60 + minute;
    const endMinutes = this.businessHours.end * 60;
    return Math.max(0, endMinutes - currentMinutes);
  }

  /**
   * 祝日リストを更新
   */
  setHolidays(holidays: Date[]): void {
    this.holidays = holidays;
  }

  /**
   * 営業時間設定を更新
   */
  setBusinessHours(businessHours: Partial<typeof TimeBasedEnricher.prototype.businessHours>): void {
    this.businessHours = { ...this.businessHours, ...businessHours };
  }
}