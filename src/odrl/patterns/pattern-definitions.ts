// ============================================================================
// AEGIS - Pattern Definitions
// 自然言語ポリシーをODRLに変換するためのパターン定義
// ============================================================================

import { Rule, AEGISOperands } from '../types.js';

export interface PolicyPattern {
  pattern: RegExp;
  type: 'permission' | 'prohibition';
  extractor: (match: RegExpMatchArray) => Partial<Rule>;
}

/**
 * 時間ベースのパターン
 */
export const TIME_PATTERNS: PolicyPattern[] = [
  {
    pattern: /(\d{1,2})[時:-]?(\d{1,2})?時?[~～から](\d{1,2})[時:-]?(\d{1,2})?時?(?:まで)?.*?(許可|禁止)/i,
    type: 'permission',
    extractor: (match) => {
      const startHour = parseInt(match[1]);
      const startMin = match[2] ? parseInt(match[2]) : 0;
      const endHour = parseInt(match[3]);
      const endMin = match[4] ? parseInt(match[4]) : 0;
      const isAllow = match[5] === '許可';
      
      return {
        '@type': isAllow ? 'Permission' : 'Prohibition',
        constraint: [{
          '@type': 'LogicalConstraint',
          and: [
            {
              '@type': 'Constraint',
              leftOperand: 'timeOfDay',
              operator: 'gteq',
              rightOperand: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`
            },
            {
              '@type': 'Constraint',
              leftOperand: 'timeOfDay',
              operator: 'lteq',
              rightOperand: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`
            }
          ]
        }]
      };
    }
  },
  {
    pattern: /営業時間外.*?(禁止|許可)/i,
    type: 'prohibition',
    extractor: (match) => ({
      '@type': match[1] === '禁止' ? 'Prohibition' : 'Permission',
      constraint: [{
        '@type': 'Constraint',
        leftOperand: AEGISOperands.IS_BUSINESS_HOURS,
        operator: 'eq',
        rightOperand: false
      }]
    })
  }
];

/**
 * エージェントベースのパターン
 */
export const AGENT_PATTERNS: PolicyPattern[] = [
  {
    pattern: /([\w\-]+)(?:エージェント|agent).*?のみ.*?(許可|禁止)/i,
    type: 'permission',
    extractor: (match) => {
      const agentType = match[1];
      const isAllow = match[2] === '許可';
      
      return {
        '@type': isAllow ? 'Permission' : 'Prohibition',
        constraint: [{
          '@type': 'Constraint',
          leftOperand: AEGISOperands.AGENT_TYPE,
          operator: 'eq',
          rightOperand: agentType
        }]
      };
    }
  },
  {
    pattern: /信頼スコア.*?(\d+\.?\d*)[以]?(上|下).*?(許可|禁止)/i,
    type: 'permission',
    extractor: (match) => {
      const score = parseFloat(match[1]);
      const comparison = match[2];
      const isAllow = match[3] === '許可';
      
      return {
        '@type': isAllow ? 'Permission' : 'Prohibition',
        constraint: [{
          '@type': 'Constraint',
          leftOperand: AEGISOperands.TRUST_SCORE,
          operator: comparison === '上' ? 'gteq' : 'lteq',
          rightOperand: score
        }]
      };
    }
  }
];

/**
 * リソースベースのパターン
 */
export const RESOURCE_PATTERNS: PolicyPattern[] = [
  {
    pattern: /(public|internal|confidential|機密|内部|公開).*?(リソース|データ|情報).*?(許可|禁止)/i,
    type: 'permission',
    extractor: (match) => {
      const classification = translateClassification(match[1]);
      const isAllow = match[3] === '許可';
      
      return {
        '@type': isAllow ? 'Permission' : 'Prohibition',
        constraint: [{
          '@type': 'Constraint',
          leftOperand: AEGISOperands.RESOURCE_CLASSIFICATION,
          operator: 'eq',
          rightOperand: classification
        }]
      };
    }
  }
];

/**
 * 特殊条件のパターン
 */
export const SPECIAL_PATTERNS: PolicyPattern[] = [
  {
    pattern: /緊急.*?場合.*?制限.*?解除/i,
    type: 'permission',
    extractor: () => ({
      constraint: [{
        '@type': 'Constraint',
        leftOperand: AEGISOperands.EMERGENCY_FLAG,
        operator: 'eq',
        rightOperand: true
      }]
    })
  },
  {
    pattern: /委譲.*?最大(\d+).*?レベル/i,
    type: 'prohibition',
    extractor: (match) => ({
      '@type': 'Prohibition',
      action: { value: 'task:delegate' },
      constraint: [{
        '@type': 'Constraint',
        leftOperand: AEGISOperands.DELEGATION_DEPTH,
        operator: 'gt',
        rightOperand: parseInt(match[1])
      }]
    })
  }
];

/**
 * 制約パターン
 */
export const CONSTRAINT_PATTERNS: string[] = [
  '個人情報を含む場合は匿名化',
  'ログを記録',
  '監査証跡を保存',
  '通知を送信',
  '承認を取得',
  '暗号化して送信',
  '利用目的を記録'
];

/**
 * 義務パターン
 */
export const OBLIGATION_PATTERNS: string[] = [
  '30日後に削除',
  'アクセスログを記録',
  '管理者に通知',
  '利用統計を更新',
  'セキュリティスキャンを実行'
];

/**
 * 分類を翻訳
 */
function translateClassification(term: string): string {
  const translations: Record<string, string> = {
    '機密': 'confidential',
    '内部': 'internal',
    '公開': 'public',
    'confidential': 'confidential',
    'internal': 'internal',
    'public': 'public'
  };
  return translations[term] || 'unknown';
}

/**
 * すべてのパターンを取得
 */
export function getAllPatterns(): PolicyPattern[] {
  return [
    ...TIME_PATTERNS,
    ...AGENT_PATTERNS,
    ...RESOURCE_PATTERNS,
    ...SPECIAL_PATTERNS
  ];
}