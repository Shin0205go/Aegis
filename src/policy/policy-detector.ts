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
    const nlPatterns = [
      { pattern: /ポリシー|方針|規則|ルール/i, name: 'Policy keywords in Japanese' },
      { pattern: /policy|rule|access|permission/i, name: 'Policy keywords in English' },
      { pattern: /許可|禁止|制限|必須/i, name: 'Permission keywords in Japanese' },
      { pattern: /allow|deny|permit|restrict|must/i, name: 'Permission keywords in English' },
      { pattern: /の場合|とき|ならば|すべき/i, name: 'Conditional expressions in Japanese' },
      { pattern: /if|when|then|should|must/i, name: 'Conditional expressions in English' },
      { pattern: /：|。|、/g, name: 'Japanese punctuation' },
      { pattern: /\n\s*[-・]/g, name: 'Bullet points' }
    ];

    for (const { pattern, name } of nlPatterns) {
      if (pattern.test(policy)) {
        indicators.push(name);
        nlScore += 1;
      }
    }

    // 形式判定
    if (nlScore > 0) {
      return {
        format: 'NATURAL_LANGUAGE',
        confidence: Math.min(nlScore / 8, 1.0),
        indicators
      };
    }

    return {
      format: 'UNKNOWN',
      confidence: 0,
      indicators: ['No clear format indicators found']
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