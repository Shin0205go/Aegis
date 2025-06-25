import { ConstraintProcessor } from '../types';
import { DecisionContext } from '../../../types';
import { Logger } from '../../../utils/logger';

/**
 * 地理的制限制約プロセッサ
 * IPアドレスを基にアクセス元の地理的位置を判定し、制限を適用
 */
export class GeoRestrictorProcessor implements ConstraintProcessor {
  public readonly name = 'GeoRestrictor';
  public readonly supportedTypes = [
    'geo-restriction',
    'country-block',
    'region-restrict'
  ];

  private logger: Logger;
  private config: GeoRestrictorConfig;
  private ipLocationCache = new Map<string, GeoLocation>();

  constructor() {
    this.logger = new Logger();
    this.config = {
      cacheExpireMs: 3600000, // 1時間
      defaultAction: 'allow',
      // デモ用のIPレンジマッピング
      ipCountryMapping: {
        '192.168.': 'JP', // プライベートIP
        '10.': 'JP',      // プライベートIP
        '8.8.': 'US',     // Google DNS
        '1.1.': 'US',     // Cloudflare DNS
        '133.': 'JP',     // 日本のIPレンジ
        '202.': 'JP',     // 日本のIPレンジ
      }
    };
  }

  async initialize(config: GeoRestrictorConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.logger.info('GeoRestrictorプロセッサ初期化完了', this.config);
  }

  canProcess(constraint: string): boolean {
    const lowerConstraint = constraint.toLowerCase();
    return (
      lowerConstraint.includes('地理的制限') ||
      lowerConstraint.includes('geo') ||
      lowerConstraint.includes('国内のみ') ||
      lowerConstraint.includes('国外から') ||
      lowerConstraint.includes('country') ||
      lowerConstraint.includes('地域')
    );
  }

  async apply(
    constraint: string,
    data: any,
    context: DecisionContext
  ): Promise<any> {
    const clientIP = context.environment?.clientIP;
    
    if (!clientIP) {
      this.logger.warn('IPアドレスがコンテキストに含まれていません');
      // IP情報がない場合のデフォルト動作
      return this.applyDefaultAction(data, constraint);
    }

    const location = await this.getLocationFromIP(clientIP as string);
    const restriction = this.parseRestriction(constraint);

    // 制限チェック
    const isAllowed = this.checkRestriction(location, restriction);

    if (!isAllowed) {
      throw new GeoRestrictionError(
        `地理的制限によりアクセスが拒否されました: ${location.country} (${location.city || 'Unknown'})`,
        {
          clientIP,
          location,
          restriction
        }
      );
    }

    // 位置情報をメタデータとして追加
    if (typeof data === 'object' && data !== null) {
      return {
        ...data,
        _geoMetadata: {
          clientIP,
          country: location.country,
          region: location.region,
          city: location.city
        }
      };
    }

    return data;
  }

  private async getLocationFromIP(ip: string): Promise<GeoLocation> {
    // キャッシュチェック
    const cached = this.ipLocationCache.get(ip);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpireMs) {
      return cached;
    }

    // 実際の実装ではGeolocation APIを使用
    // ここではデモ用の簡易実装
    const location = this.getLocationFromMapping(ip);
    
    // キャッシュに保存
    this.ipLocationCache.set(ip, location);
    
    return location;
  }

  private getLocationFromMapping(ip: string): GeoLocation {
    // IPプレフィックスから国を推定（デモ用）
    for (const [prefix, country] of Object.entries(this.config.ipCountryMapping)) {
      if (ip.startsWith(prefix)) {
        return {
          country,
          region: this.getRegionForCountry(country),
          city: this.getCityForCountry(country),
          timestamp: Date.now()
        };
      }
    }

    // デフォルト
    return {
      country: 'US',
      region: 'North America',
      city: 'Unknown',
      timestamp: Date.now()
    };
  }

  private getRegionForCountry(country: string): string {
    const regionMap: Record<string, string> = {
      'JP': 'Asia',
      'CN': 'Asia',
      'KR': 'Asia',
      'US': 'North America',
      'CA': 'North America',
      'GB': 'Europe',
      'DE': 'Europe',
      'FR': 'Europe',
      'AU': 'Oceania',
      'BR': 'South America'
    };
    return regionMap[country] || 'Unknown';
  }

  private getCityForCountry(country: string): string {
    const cityMap: Record<string, string> = {
      'JP': 'Tokyo',
      'US': 'New York',
      'GB': 'London',
      'DE': 'Berlin',
      'FR': 'Paris'
    };
    return cityMap[country] || 'Unknown';
  }

  private parseRestriction(constraint: string): GeoRestriction {
    const restriction: GeoRestriction = {
      type: 'allow',
      countries: [],
      regions: []
    };

    // 「国内のみ」パターン
    if (constraint.includes('国内のみ')) {
      restriction.type = 'allow';
      restriction.countries = ['JP'];
    }
    // 「国外からブロック」パターン
    else if (constraint.includes('国外から') && constraint.includes('ブロック')) {
      restriction.type = 'block';
      restriction.countries = ['JP']; // JP以外をブロック
      restriction.invert = true;
    }
    // 特定国指定パターン
    else {
      const countryMatch = constraint.match(/(許可|ブロック|allow|block).*?([A-Z]{2}(?:,\s*[A-Z]{2})*)/i);
      if (countryMatch) {
        restriction.type = (countryMatch[1].includes('ブロック') || countryMatch[1].includes('block')) ? 'block' : 'allow';
        restriction.countries = countryMatch[2].split(',').map(c => c.trim());
      }

      // 地域指定パターン
      const regionMatch = constraint.match(/(Asia|Europe|North America|South America|Africa|Oceania)/gi);
      if (regionMatch) {
        restriction.regions = regionMatch;
      }
    }

    return restriction;
  }

  private checkRestriction(location: GeoLocation, restriction: GeoRestriction): boolean {
    let countryMatch = false;
    let regionMatch = false;

    // 国チェック
    if (restriction.countries.length > 0) {
      countryMatch = restriction.countries.includes(location.country);
      if (restriction.invert) {
        countryMatch = !countryMatch;
      }
    } else {
      countryMatch = true; // 国指定がない場合はパス
    }

    // 地域チェック
    if (restriction.regions.length > 0) {
      regionMatch = restriction.regions.includes(location.region);
    } else {
      regionMatch = true; // 地域指定がない場合はパス
    }

    const match = countryMatch && regionMatch;

    // allowタイプの場合はマッチしたらOK、blockタイプの場合はマッチしたらNG
    return restriction.type === 'allow' ? match : !match;
  }

  private applyDefaultAction(data: any, constraint: string): any {
    if (this.config.defaultAction === 'block') {
      throw new GeoRestrictionError(
        'IPアドレス情報がないため、デフォルトポリシーによりアクセスが拒否されました',
        { constraint }
      );
    }
    return data;
  }

  async cleanup(): Promise<void> {
    this.ipLocationCache.clear();
    this.logger.info('GeoRestrictorプロセッサクリーンアップ完了');
  }
}

interface GeoRestrictorConfig {
  cacheExpireMs: number;
  defaultAction: 'allow' | 'block';
  ipCountryMapping: Record<string, string>;
  geoLocationService?: 'maxmind' | 'ipapi' | 'custom';
}

interface GeoLocation {
  country: string;
  region: string;
  city: string;
  timestamp: number;
}

interface GeoRestriction {
  type: 'allow' | 'block';
  countries: string[];
  regions: string[];
  invert?: boolean; // 条件を反転（例：JP以外をブロック）
}

export class GeoRestrictionError extends Error {
  public readonly metadata: any;

  constructor(message: string, metadata: any) {
    super(message);
    this.name = 'GeoRestrictionError';
    this.metadata = metadata;
  }
}