import { ContextEnricher } from '../collector';
import { DecisionContext } from '../../types';

/**
 * セキュリティ情報エンリッチャー
 * 
 * 接続IP、VPN判定、リスクスコア、過去の失敗試行などのセキュリティ情報を追加
 */
export class SecurityInfoEnricher implements ContextEnricher {
  name = 'security-info';

  // IPアドレス範囲の定義
  private ipRanges = {
    internal: [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16'
    ],
    vpn: [
      '10.8.0.0/16',  // OpenVPN
      '10.9.0.0/16'   // WireGuard
    ],
    office: [
      '203.0.113.0/24',  // 東京オフィス
      '198.51.100.0/24'  // 大阪オフィス
    ]
  };

  // 既知の脅威IP（デモ用）
  private threatIPs = new Set([
    '192.0.2.100',
    '192.0.2.101',
    '198.51.100.200'
  ]);

  // アクセス履歴（デモ用）
  private accessHistory: Map<string, AccessRecord[]> = new Map();

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    // 環境情報からIPアドレスを取得（実際のIPまたはデモ用）
    // 開発環境の場合はローカルIPとして扱う
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         context.environment.transport === 'stdio' ||
                         context.agent === 'mcp-client' ||
                         context.agent === 'claude-desktop';
    
    const clientIP = isDevelopment ? '127.0.0.1' : 
                    ((context.environment.clientIP as string) || '125.56.86.166');
    
    // IP情報の解析
    const ipInfo = this.analyzeIP(clientIP);
    
    // VPN接続判定
    const isVpnConnection = this.isVpnIP(clientIP);
    
    // 地理情報（デモ用）
    const geoInfo = this.getGeoInfo(clientIP);
    
    // 脅威判定
    const threatInfo = this.analyzeThreat(clientIP, context.agent);
    
    // アクセス履歴分析
    const historyAnalysis = this.analyzeAccessHistory(context.agent);
    
    // セキュリティスコアの計算
    const securityScore = this.calculateSecurityScore({
      ipInfo,
      isVpnConnection,
      geoInfo,
      threatInfo,
      historyAnalysis
    });

    // 認証情報（デモ用）
    const authInfo = this.getAuthenticationInfo(context);

    return {
      [this.name]: {
        clientIP,
        ipType: ipInfo.type,
        isInternalIP: ipInfo.isInternal,
        isOfficeIP: ipInfo.isOffice,
        isVpnConnection,
        vpnType: isVpnConnection ? this.getVpnType(clientIP) : null,
        geoLocation: geoInfo,
        threatLevel: threatInfo.level,
        isThreatIP: threatInfo.isThreat,
        threatReasons: threatInfo.reasons,
        recentFailedAttempts: historyAnalysis.failedAttempts,
        lastSuccessfulAccess: historyAnalysis.lastSuccess,
        unusualActivity: historyAnalysis.unusual,
        securityScore,
        authMethod: authInfo.method,
        authStrength: authInfo.strength,
        mfaEnabled: authInfo.mfaEnabled,
        sessionAge: authInfo.sessionAge,
        deviceTrust: this.getDeviceTrust(context),
        networkTrust: this.getNetworkTrust(ipInfo, isVpnConnection),
        requiresAdditionalAuth: securityScore < 0.5
      }
    };
  }

  private generateDemoIP(): string {
    const demos = [
      '10.0.1.100',      // 内部IP
      '10.8.0.50',       // VPN
      '203.0.113.10',    // オフィス
      '8.8.8.8',         // 外部
      '172.16.0.100'     // 安全な外部IP
    ];
    return demos[Math.floor(Math.random() * demos.length)];
  }

  private analyzeIP(ip: string): IPInfo {
    return {
      type: this.getIPType(ip),
      isInternal: this.isInternalIP(ip),
      isOffice: this.isOfficeIP(ip),
      isPublic: !this.isInternalIP(ip) && !this.isOfficeIP(ip)
    };
  }

  private getIPType(ip: string): string {
    if (this.isInternalIP(ip)) return 'internal';
    if (this.isOfficeIP(ip)) return 'office';
    if (this.isVpnIP(ip)) return 'vpn';
    return 'external';
  }

  private isInternalIP(ip: string): boolean {
    // ローカルホストは内部IPとして扱う
    if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
      return true;
    }
    return this.ipRanges.internal.some(range => this.isIPInRange(ip, range));
  }

  private isOfficeIP(ip: string): boolean {
    return this.ipRanges.office.some(range => this.isIPInRange(ip, range));
  }

  private isVpnIP(ip: string): boolean {
    return this.ipRanges.vpn.some(range => this.isIPInRange(ip, range));
  }

  private isIPInRange(ip: string, range: string): boolean {
    // 簡易的な実装（実際にはCIDR計算が必要）
    const [network] = range.split('/');
    return ip.startsWith(network.split('.').slice(0, -1).join('.'));
  }

  private getVpnType(ip: string): string {
    if (ip.startsWith('10.8.')) return 'openvpn';
    if (ip.startsWith('10.9.')) return 'wireguard';
    return 'unknown';
  }

  private getGeoInfo(ip: string): GeoInfo {
    // デモ用の地理情報
    if (this.isInternalIP(ip) || this.isOfficeIP(ip)) {
      return {
        country: 'JP',
        city: 'Tokyo',
        region: 'Kanto',
        timezone: 'Asia/Tokyo',
        isHighRisk: false
      };
    }
    
    // 日本のIPアドレス範囲をチェック
    if (ip.startsWith('125.') || ip.startsWith('126.') || ip.startsWith('133.')) {
      return {
        country: 'JP',
        city: 'Tokyo',
        region: 'Kanto',
        timezone: 'Asia/Tokyo',
        isHighRisk: false
      };
    }
    
    return {
      country: 'US',
      city: 'Unknown',
      region: 'Unknown',
      timezone: 'UTC',
      isHighRisk: false
    };
  }

  private analyzeThreat(ip: string, agent: string): ThreatInfo {
    const isThreat = this.threatIPs.has(ip);
    const reasons: string[] = [];
    let level: 'critical' | 'high' | 'medium' | 'low' = 'low';

    if (isThreat) {
      reasons.push('既知の脅威IPアドレス');
      level = 'critical';
    }

    // アクセス履歴から異常を検出
    const history = this.accessHistory.get(agent) || [];
    const recentFailures = history.filter(r => 
      !r.success && 
      (Date.now() - r.timestamp.getTime()) < 3600000 // 1時間以内
    ).length;

    if (recentFailures > 5) {
      reasons.push('短時間での複数回の失敗試行');
      level = level === 'low' ? 'high' : level;
    }

    return { isThreat, level, reasons };
  }

  private analyzeAccessHistory(agent: string): HistoryAnalysis {
    const history = this.accessHistory.get(agent) || [];
    
    // 最近の失敗試行
    const recentFailures = history.filter(r => 
      !r.success && 
      (Date.now() - r.timestamp.getTime()) < 86400000 // 24時間以内
    );

    // 最後の成功アクセス
    const successfulAccesses = history.filter(r => r.success);
    const lastSuccess = successfulAccesses.length > 0 
      ? successfulAccesses[successfulAccesses.length - 1].timestamp
      : null;

    // 異常なアクティビティ検出
    const unusual = this.detectUnusualActivity(history);

    return {
      failedAttempts: recentFailures.length,
      lastSuccess: lastSuccess?.toISOString() || null,
      unusual
    };
  }

  private detectUnusualActivity(history: AccessRecord[]): string[] {
    const unusual: string[] = [];

    // 異なるIPからの同時アクセス
    const recentIPs = new Set(
      history
        .filter(r => (Date.now() - r.timestamp.getTime()) < 3600000)
        .map(r => r.ip)
    );
    
    if (recentIPs.size > 3) {
      unusual.push('複数の異なるIPからのアクセス');
    }

    // 通常と異なる時間帯のアクセス
    const currentHour = new Date().getHours();
    const typicalHours = history
      .filter(r => r.success)
      .map(r => r.timestamp.getHours());
    
    if (typicalHours.length > 0) {
      const avgHour = typicalHours.reduce((a, b) => a + b, 0) / typicalHours.length;
      if (Math.abs(currentHour - avgHour) > 6) {
        unusual.push('通常と異なる時間帯のアクセス');
      }
    }

    return unusual;
  }

  private calculateSecurityScore(factors: SecurityFactors): number {
    let score = 1.0;

    // IP種別による基本スコア
    if (factors.ipInfo.isInternal || factors.ipInfo.isOffice) {
      score = 0.9;
    } else if (factors.isVpnConnection) {
      score = 0.8;
    } else {
      score = 0.5;
    }

    // 脅威レベルによる減点
    const threatPenalties = {
      critical: 0.8,
      high: 0.5,
      medium: 0.3,
      low: 0.1
    };
    score -= threatPenalties[factors.threatInfo.level];

    // 失敗試行による減点
    if (factors.historyAnalysis.failedAttempts > 0) {
      score -= Math.min(0.3, factors.historyAnalysis.failedAttempts * 0.05);
    }

    // 異常アクティビティによる減点
    score -= factors.historyAnalysis.unusual.length * 0.1;

    // 地理的リスクによる減点
    if (factors.geoInfo.isHighRisk) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  private getAuthenticationInfo(context: DecisionContext): AuthInfo {
    // デモ用の認証情報
    // 開発環境やClaude Desktopの場合はMFAを有効として扱う
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         context.environment.transport === 'stdio' ||
                         context.agent === 'mcp-client' ||
                         context.agent === 'claude-desktop';
    
    return {
      method: (context.environment.authMethod as string) || 'password',
      strength: (context.environment.authStrength as string) || (isDevelopment ? 'high' : 'medium'),
      mfaEnabled: (context.environment.mfaEnabled as boolean) || isDevelopment,
      sessionAge: Math.floor(Math.random() * 3600) // 秒単位
    };
  }

  private getDeviceTrust(context: DecisionContext): string {
    // デバイス信頼度の判定（デモ用）
    if (context.environment.deviceId && typeof context.environment.deviceId === 'string' && context.environment.deviceId.includes('trusted')) {
      return 'trusted';
    }
    return 'untrusted';
  }

  private getNetworkTrust(ipInfo: IPInfo, isVpn: boolean): string {
    if (ipInfo.isInternal || ipInfo.isOffice) return 'trusted';
    if (isVpn) return 'semi-trusted';
    return 'untrusted';
  }

  /**
   * アクセスを記録
   */
  recordAccess(agent: string, ip: string, success: boolean): void {
    if (!this.accessHistory.has(agent)) {
      this.accessHistory.set(agent, []);
    }
    
    const history = this.accessHistory.get(agent)!;
    history.push({
      ip,
      success,
      timestamp: new Date()
    });

    // 古い記録を削除（最大100件）
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * 脅威IPを追加
   */
  addThreatIP(ip: string): void {
    this.threatIPs.add(ip);
  }

  /**
   * 脅威IPを削除
   */
  removeThreatIP(ip: string): void {
    this.threatIPs.delete(ip);
  }
}

interface IPInfo {
  type: string;
  isInternal: boolean;
  isOffice: boolean;
  isPublic: boolean;
}

interface GeoInfo {
  country: string;
  city: string;
  region: string;
  timezone: string;
  isHighRisk: boolean;
}

interface ThreatInfo {
  isThreat: boolean;
  level: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
}

interface HistoryAnalysis {
  failedAttempts: number;
  lastSuccess: string | null;
  unusual: string[];
}

interface SecurityFactors {
  ipInfo: IPInfo;
  isVpnConnection: boolean;
  geoInfo: GeoInfo;
  threatInfo: ThreatInfo;
  historyAnalysis: HistoryAnalysis;
}

interface AuthInfo {
  method: string;
  strength: string;
  mfaEnabled: boolean;
  sessionAge: number;
}

interface AccessRecord {
  ip: string;
  success: boolean;
  timestamp: Date;
}