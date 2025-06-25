// ============================================================================
// AEGIS - Conversion Utilities
// 変換処理のユーティリティ関数
// ============================================================================

import { Action, Rule } from '../types.js';
import { PolicyPattern } from '../patterns/pattern-definitions.js';

export class ConversionUtilities {
  /**
   * 自然言語からアクションを抽出
   */
  static extractAction(nlPolicy: string): Action {
    const actionPatterns = [
      { pattern: /読み取り|読む|参照|閲覧|表示/i, action: 'odrl:read' },
      { pattern: /書き込み|書く|編集|更新|変更/i, action: 'odrl:write' },
      { pattern: /実行|起動|開始/i, action: 'odrl:execute' },
      { pattern: /削除|消去|破棄/i, action: 'odrl:delete' },
      { pattern: /コピー|複製/i, action: 'odrl:reproduce' },
      { pattern: /共有|配布/i, action: 'odrl:distribute' },
      { pattern: /印刷|プリント/i, action: 'odrl:print' },
      { pattern: /ダウンロード|取得/i, action: 'odrl:extract' }
    ];
    
    for (const { pattern, action } of actionPatterns) {
      if (pattern.test(nlPolicy)) {
        return { value: action };
      }
    }
    
    // デフォルトアクション
    return { value: 'odrl:use' };
  }
  
  /**
   * 分類用語を翻訳
   */
  static translateClassification(term: string): string {
    const translations: Record<string, string> = {
      '機密': 'confidential',
      '内部': 'internal',
      '公開': 'public',
      '秘密': 'secret',
      '限定': 'restricted',
      'confidential': 'confidential',
      'internal': 'internal',
      'public': 'public',
      'secret': 'secret',
      'restricted': 'restricted'
    };
    
    return translations[term.toLowerCase()] || 'unknown';
  }
  
  /**
   * 信頼度を計算
   */
  static calculateConfidence(nlPolicy: string, matchedPatterns: string[]): number {
    // 基本信頼度
    let confidence = 0.5;
    
    // マッチしたパターン数に応じて信頼度を上げる
    confidence += matchedPatterns.length * 0.1;
    
    // ポリシーの長さによる調整（詳細なポリシーほど信頼度が高い）
    const wordCount = nlPolicy.split(/\s+/).length;
    if (wordCount > 10) confidence += 0.1;
    if (wordCount > 20) confidence += 0.1;
    
    // 特定のキーワードの存在で信頼度を上げる
    const keywordBoosts = [
      { keyword: /必須|必ず|常に/i, boost: 0.1 },
      { keyword: /禁止|してはならない|不可/i, boost: 0.1 },
      { keyword: /営業時間|業務時間/i, boost: 0.05 },
      { keyword: /承認|許可/i, boost: 0.05 }
    ];
    
    keywordBoosts.forEach(({ keyword, boost }) => {
      if (keyword.test(nlPolicy)) {
        confidence += boost;
      }
    });
    
    // 最大値を1.0に制限
    return Math.min(confidence, 1.0);
  }
  
  /**
   * パターンからルールを抽出
   */
  static extractRules(
    nlPolicy: string, 
    patterns: PolicyPattern[], 
    defaultAction: Action
  ): Rule[] {
    const rules: Rule[] = [];
    const usedMatches = new Set<string>();
    
    patterns.forEach(pattern => {
      const match = nlPolicy.match(pattern.pattern);
      if (match && !usedMatches.has(match[0])) {
        usedMatches.add(match[0]);
        
        const ruleData = pattern.extractor(match);
        const rule: Rule = {
          '@type': ruleData['@type'] || (pattern.type === 'permission' ? 'Permission' : 'Prohibition'),
          action: ruleData.action || defaultAction,
          target: { uid: 'aegis:resource' },
          ...ruleData
        };
        
        rules.push(rule);
      }
    });
    
    // パターンにマッチしない場合、デフォルトルールを作成
    if (rules.length === 0) {
      const isProhibition = /禁止|不可|してはならない/i.test(nlPolicy);
      rules.push({
        '@type': isProhibition ? 'Prohibition' : 'Permission',
        action: defaultAction,
        target: { uid: 'aegis:resource' }
      });
    }
    
    return rules;
  }
  
  /**
   * 時間文字列をパース
   */
  static parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
    const match = timeStr.match(/(\d{1,2}):?(\d{0,2})/);
    if (!match) return null;
    
    const hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    
    return { hours, minutes };
  }
  
  /**
   * 期間文字列をパース（日数）
   */
  static parseDurationDays(durationStr: string): number | null {
    const patterns = [
      { pattern: /(\d+)\s*日/, unit: 1 },
      { pattern: /(\d+)\s*週間/, unit: 7 },
      { pattern: /(\d+)\s*ヶ月|ヵ月|か月/, unit: 30 },
      { pattern: /(\d+)\s*年/, unit: 365 }
    ];
    
    for (const { pattern, unit } of patterns) {
      const match = durationStr.match(pattern);
      if (match) {
        return parseInt(match[1]) * unit;
      }
    }
    
    return null;
  }
  
  /**
   * エージェント名を正規化
   */
  static normalizeAgentName(agentName: string): string {
    return agentName
      .toLowerCase()
      .replace(/エージェント|agent/gi, '')
      .replace(/[\s\-_]+/g, '-')
      .trim();
  }
  
  /**
   * ポリシーテキストから制約を抽出
   */
  static extractConstraints(nlPolicy: string): string[] {
    const constraints: string[] = [];
    
    const constraintPatterns = [
      /個人情報.*?匿名化/i,
      /ログ.*?記録/i,
      /暗号化.*?必須/i,
      /承認.*?必要/i,
      /監査.*?対象/i
    ];
    
    constraintPatterns.forEach(pattern => {
      const match = nlPolicy.match(pattern);
      if (match) {
        constraints.push(match[0]);
      }
    });
    
    return constraints;
  }
  
  /**
   * ポリシーテキストから義務を抽出
   */
  static extractObligations(nlPolicy: string): string[] {
    const obligations: string[] = [];
    
    const obligationPatterns = [
      /(\d+日).*?削除/i,
      /アクセス.*?ログ.*?記録/i,
      /管理者.*?通知/i,
      /利用統計.*?更新/i,
      /セキュリティ.*?スキャン/i
    ];
    
    obligationPatterns.forEach(pattern => {
      const match = nlPolicy.match(pattern);
      if (match) {
        obligations.push(match[0]);
      }
    });
    
    return obligations;
  }
}