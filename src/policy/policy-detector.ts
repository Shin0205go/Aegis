// ============================================================================
// AEGIS - ポリシー形式自動検出
// ============================================================================

export type PolicyFormat = 'ODRL' | 'NATURAL_LANGUAGE' | 'UNKNOWN';

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
    // オブジェクトの場合はODRL
    if (typeof policy === 'object' && policy !== null) {
      return this.detectFromObject(policy);
    }

    // 文字列の場合は内容を分析
    if (typeof policy === 'string') {
      return this.detectFromString(policy);
    }

    return {
      format: 'UNKNOWN',
      confidence: 0,
      indicators: ['Invalid policy format']
    };
  }

  /**
   * オブジェクト形式からの検出
   */
  private static detectFromObject(policy: object): PolicyDetectionResult {
    const indicators: string[] = [];
    let odrlScore = 0;

    // naturalLanguageSourceフィールドの存在をチェック（ハイブリッド形式）
    if ('naturalLanguageSource' in policy && (policy as any).naturalLanguageSource) {
      indicators.push('naturalLanguageSource field present');
      // naturalLanguageSourceがある場合は自然言語として扱う
      const nlResult = this.detectFromString((policy as any).naturalLanguageSource);
      nlResult.indicators.unshift('Embedded in ODRL structure');
      return nlResult;
    }

    // ODRL必須フィールドをチェック
    if ('@context' in policy) {
      indicators.push('@context field present');
      odrlScore += 2;
    }

    if ('@type' in policy && (policy as any)['@type'] === 'Policy') {
      indicators.push('@type is Policy');
      odrlScore += 2;
    }

    // ODRL標準フィールド
    const odrlFields = ['uid', 'permission', 'prohibition', 'obligation', 'target', 'action'];
    for (const field of odrlFields) {
      if (field in policy) {
        indicators.push(`${field} field present`);
        odrlScore += 1;
      }
    }

    // ODRL名前空間
    const policyStr = JSON.stringify(policy);
    if (policyStr.includes('http://www.w3.org/ns/odrl/2/')) {
      indicators.push('ODRL namespace detected');
      odrlScore += 3;
    }

    // 信頼度計算
    const confidence = Math.min(odrlScore / 10, 1.0);

    return {
      format: confidence > 0.5 ? 'ODRL' : 'UNKNOWN',
      confidence,
      indicators
    };
  }

  /**
   * 文字列形式からの検出
   */
  private static detectFromString(policy: string): PolicyDetectionResult {
    const indicators: string[] = [];
    
    // まずJSONとして解析を試みる
    try {
      const parsed = JSON.parse(policy);
      const objectResult = this.detectFromObject(parsed);
      if (objectResult.format === 'ODRL') {
        return objectResult;
      }
    } catch {
      // JSONではない - 自然言語の可能性
    }

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

    // ODRL形式の痕跡をチェック（文字列内）
    let odrlScore = 0;
    const odrlPatterns = [
      { pattern: /@context|@type|uid/, name: 'ODRL keywords' },
      { pattern: /"permission"|"prohibition"|"obligation"/, name: 'ODRL rule types' },
      { pattern: /http:\/\/www\.w3\.org\/ns\/odrl/, name: 'ODRL namespace' },
      { pattern: /"leftOperand"|"rightOperand"|"operator"/, name: 'ODRL constraint syntax' }
    ];

    for (const { pattern, name } of odrlPatterns) {
      if (pattern.test(policy)) {
        indicators.push(name);
        odrlScore += 2;
      }
    }

    // 形式判定
    if (odrlScore > nlScore) {
      return {
        format: 'ODRL',
        confidence: Math.min(odrlScore / 8, 1.0),
        indicators
      };
    } else if (nlScore > 0) {
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