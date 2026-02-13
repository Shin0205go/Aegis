// ============================================================================
// AEGIS - ポリシー形式自動検出
// ============================================================================

export type PolicyFormat = 'NATURAL_LANGUAGE' | 'UNKNOWN';

export interface PolicyDetectionResult {
  format: PolicyFormat;
  confidence: number;
  indicators: string[];
}

export class PolicyFormatDetector {
  /**
   * ポリシーの形式を自動検出
   */
  static detect(policy: string | object): PolicyDetectionResult {
    // 文字列の場合は内容を分析
    if (typeof policy === 'string') {
      return this.detectFromString(policy);
    }

    // オブジェクトの場合は文字列化して分析
    if (typeof policy === 'object' && policy !== null) {
      return this.detectFromString(JSON.stringify(policy));
    }

    return {
      format: 'UNKNOWN',
      confidence: 0,
      indicators: ['Invalid policy format']
    };
  }


  /**
   * 文字列形式からの検出
   */
  private static detectFromString(policy: string): PolicyDetectionResult {
    const indicators: string[] = [];
    
    // 自然言語のインジケーター
    let nlScore = 0;

    // 日本語の存在
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(policy)) {
      indicators.push('Japanese text detected');
      nlScore += 3;
    }

    // 自然言語ポリシーの典型的なパターン
    // 各パターンを細分化してスコアリングの精度を向上
    const nlPatterns = [
      { pattern: /ポリシー|方針/i, name: 'Policy keywords in Japanese' },
      { pattern: /規則|ルール/i, name: 'Rule keywords in Japanese' },
      { pattern: /\bpolicy\b/i, name: 'Policy keyword' },
      { pattern: /\brule\b/i, name: 'Rule keyword' },
      { pattern: /\baccess\b/i, name: 'Access keyword' },
      { pattern: /\bpermission\b/i, name: 'Permission keyword' },
      { pattern: /許可|禁止/i, name: 'Permission keywords in Japanese' },
      { pattern: /制限|必須/i, name: 'Restriction keywords in Japanese' },
      { pattern: /\ballow\b|\bdeny\b/i, name: 'Allow/Deny keywords' },
      { pattern: /\bpermit\b|\brestrict\b/i, name: 'Permit/Restrict keywords' },
      { pattern: /の場合|とき/i, name: 'Conditional in Japanese' },
      { pattern: /ならば|すべき/i, name: 'Should/Must in Japanese' },
      { pattern: /\bif\b|\bwhen\b/i, name: 'If/When keywords' },
      { pattern: /\bthen\b|\bshould\b|\bmust\b/i, name: 'Then/Should/Must keywords' },
      { pattern: /：|。|、/, name: 'Japanese punctuation' },
      { pattern: /\n\s*[-・]/, name: 'Bullet points' }
    ];

    for (const { pattern, name} of nlPatterns) {
      // 各パターンで新しいRegExpオブジェクトを使用してテスト（/g フラグによる状態の影響を回避）
      if (pattern.test(policy)) {
        indicators.push(name);
        nlScore += 1;
      }
    }

    // 形式判定
    // スコアリング: 6点以上で85%、8点以上で100%
    // 2つ以上のインジケーターが必要（誤検出防止）
    const MIN_SCORE_THRESHOLD = 2;
    let confidence: number;

    if (nlScore >= 8) {
      confidence = 1.0;
    } else if (nlScore >= 6) {
      confidence = 0.85;
    } else if (nlScore >= 2) {
      confidence = Math.max(nlScore * 0.3, 0.5); // 2点で60%、3点で90%
    } else {
      confidence = Math.max(nlScore * 0.2, 0);
    }

    if (nlScore >= MIN_SCORE_THRESHOLD) {
      return {
        format: 'NATURAL_LANGUAGE',
        confidence,
        indicators
      };
    }

    return {
      format: 'UNKNOWN',
      confidence: 0,
      indicators: nlScore > 0 ? ['Insufficient policy indicators'] : ['No clear format indicators found']
    };
  }

  /**
   * 複数のポリシーから最適な形式を推定
   */
  static detectBestFormat(policies: Array<string | object>): PolicyFormat {
    const results = policies.map(p => this.detect(p));
    
    const formatCounts = results.reduce((acc, result) => {
      if (result.format !== 'UNKNOWN') {
        acc[result.format] = (acc[result.format] || 0) + result.confidence;
      }
      return acc;
    }, {} as Record<PolicyFormat, number>);

    // 最も信頼度の高い形式を返す
    let bestFormat: PolicyFormat = 'UNKNOWN';
    let bestScore = 0;

    for (const [format, score] of Object.entries(formatCounts)) {
      if (score > bestScore) {
        bestScore = score;
        bestFormat = format as PolicyFormat;
      }
    }

    return bestFormat;
  }
}