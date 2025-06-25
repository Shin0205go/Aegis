// ============================================================================
// AEGIS - Policy Builder
// ODRLポリシーの構築と操作
// ============================================================================

import { AEGISPolicy, Rule, Constraint, Action } from '../types.js';
import { logger } from '../../utils/logger.js';

export class PolicyBuilder {
  /**
   * ポリシーを作成
   */
  createPolicy(nlPolicy: string, rules: Rule[]): AEGISPolicy {
    const policy: AEGISPolicy = {
      '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
      '@type': 'Policy',
      uid: `aegis:policy:${Date.now()}`,
      profile: 'https://aegis.example.com/odrl/profile',
      permission: [],
      prohibition: [],
      metadata: {
        creator: 'AEGIS NL Converter',
        created: new Date().toISOString(),
        description: nlPolicy,
        label: nlPolicy
      }
    };
    
    // ルールを分類して追加
    rules.forEach(rule => {
      if (rule['@type'] === 'Permission') {
        policy.permission!.push(rule);
      } else if (rule['@type'] === 'Prohibition') {
        policy.prohibition!.push(rule);
      }
    });
    
    return policy;
  }
  
  /**
   * ポリシーに制約を追加
   */
  addConstraints(policy: AEGISPolicy, constraints: string[]): void {
    constraints.forEach(constraintText => {
      const constraint = this.parseConstraint(constraintText);
      if (constraint) {
        // すべてのルールに制約を追加
        [...(policy.permission || []), ...(policy.prohibition || [])].forEach(rule => {
          if (!rule.constraint) {
            rule.constraint = [];
          }
          rule.constraint.push(constraint);
        });
      }
    });
  }
  
  /**
   * ポリシーに義務を追加
   */
  addObligations(policy: AEGISPolicy, obligations: string[]): void {
    obligations.forEach(obligationText => {
      const duty = this.parseObligation(obligationText);
      if (duty) {
        // すべてのルールに義務を追加
        [...(policy.permission || []), ...(policy.prohibition || [])].forEach(rule => {
          if (!rule.duty) {
            rule.duty = [];
          }
          rule.duty.push(duty);
        });
      }
    });
  }
  
  /**
   * ポリシーをマージ
   */
  mergePolicy(base: AEGISPolicy, additional: AEGISPolicy): AEGISPolicy {
    const merged: AEGISPolicy = {
      ...base,
      permission: this.deduplicateRules([
        ...(base.permission || []),
        ...(additional.permission || [])
      ]),
      prohibition: this.deduplicateRules([
        ...(base.prohibition || []),
        ...(additional.prohibition || [])
      ])
    };
    
    // メタデータをマージ
    if (additional.metadata) {
      merged.metadata = {
        ...base.metadata,
        ...additional.metadata,
        modified: new Date().toISOString()
      };
    }
    
    return merged;
  }
  
  /**
   * 重複するルールを除去
   */
  deduplicateRules(rules: Rule[]): Rule[] {
    const seen = new Set<string>();
    const unique: Rule[] = [];
    
    rules.forEach(rule => {
      const hash = this.hashRule(rule);
      if (!seen.has(hash)) {
        seen.add(hash);
        unique.push(rule);
      }
    });
    
    return unique;
  }
  
  /**
   * 制約をパース
   */
  private parseConstraint(constraintText: string): Constraint | null {
    // 時間制約
    if (constraintText.includes('営業時間')) {
      return {
        '@type': 'Constraint',
        leftOperand: 'aegis:isBusinessHours',
        operator: 'eq',
        rightOperand: true
      };
    }
    
    // 匿名化制約
    if (constraintText.includes('匿名化')) {
      return {
        '@type': 'Constraint',
        leftOperand: 'aegis:dataProcessing',
        operator: 'eq',
        rightOperand: 'anonymize'
      };
    }
    
    // 暗号化制約
    if (constraintText.includes('暗号化')) {
      return {
        '@type': 'Constraint',
        leftOperand: 'aegis:encryption',
        operator: 'eq',
        rightOperand: true
      };
    }
    
    return null;
  }
  
  /**
   * 義務をパース
   */
  private parseObligation(obligationText: string): any {
    const baseObligation = {
      '@type': 'Duty',
      constraint: []
    };
    
    // ログ記録
    if (obligationText.includes('ログ') || obligationText.includes('記録')) {
      return {
        ...baseObligation,
        action: { value: 'aegis:log' }
      };
    }
    
    // 通知
    if (obligationText.includes('通知')) {
      return {
        ...baseObligation,
        action: { value: 'aegis:notify' }
      };
    }
    
    // 削除
    if (obligationText.includes('削除')) {
      const daysMatch = obligationText.match(/(\d+)日/);
      if (daysMatch) {
        return {
          ...baseObligation,
          action: { value: 'aegis:delete' },
          constraint: [{
            '@type': 'Constraint',
            leftOperand: 'aegis:retentionPeriod',
            operator: 'eq',
            rightOperand: parseInt(daysMatch[1])
          }]
        };
      }
    }
    
    return null;
  }
  
  /**
   * ルールのハッシュを生成（重複検出用）
   */
  private hashRule(rule: Rule): string {
    const action = Array.isArray(rule.action) ? rule.action[0] : rule.action;
    const key = [
      rule['@type'],
      action?.value || '',
      rule.target || '',
      JSON.stringify(rule.constraint || []),
      JSON.stringify(rule.duty || [])
    ].join('|');
    
    return key;
  }
  
  /**
   * ルールを検証
   */
  validateRule(rule: Rule): boolean {
    // 必須フィールドのチェック
    if (!rule['@type'] || !rule.action) {
      return false;
    }
    
    // アクションの検証
    const action = Array.isArray(rule.action) ? rule.action[0] : rule.action;
    if (!action.value) {
      return false;
    }
    
    // 制約の検証
    if (rule.constraint) {
      for (const constraint of rule.constraint) {
        if (!this.validateConstraint(constraint)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * 制約を検証
   */
  private validateConstraint(constraint: Constraint): boolean {
    if (!constraint['@type']) {
      return false;
    }
    
    if (constraint['@type'] === 'Constraint') {
      return !!(constraint.leftOperand && constraint.operator && constraint.rightOperand !== undefined);
    }
    
    if (constraint['@type'] === 'LogicalConstraint') {
      const logicalConstraint = constraint as any;
      return !!(logicalConstraint.and || logicalConstraint.or);
    }
    
    return true;
  }
}