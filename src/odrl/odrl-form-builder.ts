/**
 * ODRL Form Builder
 * Provides a user-friendly interface for creating ODRL policies
 */

import { 
  AEGISPolicy, 
  Rule, 
  Action, 
  Constraint, 
  Duty,
  AEGISOperands 
} from './types';
import { v4 as uuidv4 } from 'uuid';

export interface PolicyFormData {
  // 基本情報
  name: string;
  description: string;
  type: 'permission' | 'prohibition' | 'both';
  
  // ルール設定
  rules: RuleFormData[];
  
  // 義務設定
  obligations?: ObligationFormData[];
}

export interface RuleFormData {
  type: 'permission' | 'prohibition';
  action: ActionType;
  target?: string;
  conditions: ConditionFormData[];
  duties?: DutyFormData[];
}

export interface ConditionFormData {
  type: 'time' | 'agent' | 'resource' | 'trust' | 'location' | 'custom';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'between';
  value: any;
  value2?: any; // for between operator
}

export interface DutyFormData {
  type: 'log' | 'notify' | 'anonymize' | 'delete' | 'encrypt' | 'custom';
  target?: string;
  timeframe?: number; // in days
}

export interface ObligationFormData {
  type: 'notify' | 'report' | 'delete' | 'custom';
  target: string;
  timeframe?: number;
}

export type ActionType = 
  | 'read' 
  | 'write' 
  | 'execute' 
  | 'delete' 
  | 'modify' 
  | 'access' 
  | 'tool_execute'
  | 'api_call'
  | 'custom';

export class ODRLFormBuilder {
  /**
   * Convert form data to ODRL policy
   */
  static buildPolicy(formData: PolicyFormData): AEGISPolicy {
    const policy: AEGISPolicy = {
      uid: `aegis:policy:${formData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
      '@type': 'Policy',
      profile: 'https://aegis.example.com/odrl/profile',
      metadata: {
        created: new Date().toISOString(),
        description: formData.description
      }
    };

    // Add permissions
    if (formData.type === 'permission' || formData.type === 'both') {
      policy.permission = formData.rules
        .filter(r => r.type === 'permission')
        .map(r => this.buildRule(r));
    }

    // Add prohibitions
    if (formData.type === 'prohibition' || formData.type === 'both') {
      policy.prohibition = formData.rules
        .filter(r => r.type === 'prohibition')
        .map(r => this.buildRule(r));
    }

    // Add obligations
    if (formData.obligations && formData.obligations.length > 0) {
      policy.obligation = formData.obligations.map(o => this.buildObligation(o));
    }

    return policy;
  }

  /**
   * Build a rule from form data
   */
  private static buildRule(ruleData: RuleFormData): Rule {
    const rule: Rule = {
      '@type': ruleData.type === 'permission' ? 'Permission' : 'Prohibition',
      action: this.buildAction(ruleData.action)
    };

    // Add target if specified
    if (ruleData.target) {
      rule.target = { uid: ruleData.target };
    }

    // Build constraints
    if (ruleData.conditions && ruleData.conditions.length > 0) {
      const constraints = ruleData.conditions.map(c => this.buildConstraint(c));
      
      if (constraints.length === 1) {
        rule.constraint = constraints;
      } else {
        // Multiple constraints - use logical AND
        rule.constraint = [{
          '@type': 'LogicalConstraint',
          and: constraints
        }];
      }
    }

    // Add duties
    if (ruleData.duties && ruleData.duties.length > 0) {
      rule.duty = ruleData.duties.map(d => this.buildDuty(d));
    }

    return rule;
  }

  /**
   * Build action from type
   */
  private static buildAction(actionType: ActionType): Action {
    const actionMap: Record<ActionType, string> = {
      'read': 'resource:read',
      'write': 'resource:write',
      'execute': 'resource:execute',
      'delete': 'resource:delete',
      'modify': 'resource:modify',
      'access': 'resource:access',
      'tool_execute': 'tool:execute',
      'api_call': 'api:call',
      'custom': 'custom:action'
    };

    return { value: actionMap[actionType] };
  }

  /**
   * Build constraint from form data
   */
  private static buildConstraint(condition: ConditionFormData): Constraint {
    const operatorMap = {
      'equals': 'eq',
      'not_equals': 'neq',
      'greater_than': 'gt',
      'less_than': 'lt',
      'contains': 'isPartOf',
      'between': 'between'
    };

    // Handle between operator specially
    if (condition.operator === 'between') {
      // Return a constraint with logical AND
      return {
        '@type': 'Constraint',
        leftOperand: 'and',
        operator: 'isAllOf' as any,
        rightOperand: [
          {
            '@type': 'Constraint',
            leftOperand: this.getOperand(condition.type),
            operator: 'gteq',
            rightOperand: condition.value
          },
          {
            '@type': 'Constraint',
            leftOperand: this.getOperand(condition.type),
            operator: 'lteq',
            rightOperand: condition.value2
          }
        ]
      };
    }

    return {
      '@type': 'Constraint',
      leftOperand: this.getOperand(condition.type),
      operator: operatorMap[condition.operator] as any,
      rightOperand: this.formatValue(condition.type, condition.value)
    };
  }

  /**
   * Get ODRL operand from condition type
   */
  private static getOperand(type: ConditionFormData['type']): string {
    switch (type) {
      case 'time':
        return 'timeOfDay';
      case 'agent':
        return AEGISOperands.AGENT_TYPE;
      case 'resource':
        return AEGISOperands.RESOURCE_CLASSIFICATION;
      case 'trust':
        return AEGISOperands.TRUST_SCORE;
      case 'location':
        return AEGISOperands.LOCATION;
      default:
        return 'custom';
    }
  }

  /**
   * Format value based on type
   */
  private static formatValue(type: ConditionFormData['type'], value: any): any {
    switch (type) {
      case 'time':
        // Convert time to HH:MM:SS format
        if (typeof value === 'string' && value.includes(':')) {
          return value.length === 5 ? `${value}:00` : value;
        }
        return value;
      case 'trust':
        // Ensure trust score is a number
        return typeof value === 'string' ? parseFloat(value) : value;
      default:
        return value;
    }
  }

  /**
   * Build duty from form data
   */
  private static buildDuty(dutyData: DutyFormData): Duty {
    const duty: Duty = {
      '@type': 'Duty',
      action: { value: this.getDutyAction(dutyData.type) }
    };

    if (dutyData.target) {
      duty.target = { uid: dutyData.target };
    }

    if (dutyData.timeframe) {
      duty.constraint = [{
        '@type': 'Constraint',
        leftOperand: 'elapsedTime',
        operator: 'lteq',
        rightOperand: `P${dutyData.timeframe}D` // ISO 8601 duration
      }];
    }

    return duty;
  }

  /**
   * Build obligation from form data
   */
  private static buildObligation(obligationData: ObligationFormData): Duty {
    return this.buildDuty({
      type: obligationData.type as any,
      target: obligationData.target,
      timeframe: obligationData.timeframe
    });
  }

  /**
   * Get duty action from type
   */
  private static getDutyAction(type: DutyFormData['type']): string {
    const dutyMap = {
      'log': 'log',
      'notify': 'notify',
      'anonymize': 'anonymize',
      'delete': 'delete',
      'encrypt': 'encrypt',
      'custom': 'custom'
    };

    return dutyMap[type];
  }

  /**
   * Create common policy templates
   */
  static getTemplates(): Record<string, PolicyFormData> {
    return {
      'business-hours': {
        name: 'Business Hours Access',
        description: 'Allow access only during business hours',
        type: 'permission',
        rules: [{
          type: 'permission',
          action: 'access',
          conditions: [{
            type: 'time',
            operator: 'between',
            value: '09:00',
            value2: '18:00'
          }],
          duties: [{
            type: 'log',
            target: 'access-log'
          }]
        }]
      },

      'trusted-agents': {
        name: 'Trusted Agents Only',
        description: 'Allow access only for agents with high trust score',
        type: 'permission',
        rules: [{
          type: 'permission',
          action: 'access',
          conditions: [{
            type: 'trust',
            operator: 'greater_than',
            value: 0.7
          }]
        }]
      },

      'confidential-data': {
        name: 'Confidential Data Protection',
        description: 'Restrict access to confidential data with obligations',
        type: 'both',
        rules: [
          {
            type: 'permission',
            action: 'read',
            target: 'confidential://*',
            conditions: [
              {
                type: 'agent',
                operator: 'equals',
                value: 'admin'
              }
            ],
            duties: [
              {
                type: 'log',
                target: 'security-log'
              },
              {
                type: 'notify',
                target: 'security-team'
              }
            ]
          },
          {
            type: 'prohibition',
            action: 'write',
            target: 'confidential://*',
            conditions: []
          }
        ],
        obligations: [
          {
            type: 'delete',
            target: 'temp-data',
            timeframe: 30
          }
        ]
      },

      'api-rate-limit': {
        name: 'API Rate Limiting',
        description: 'Limit API calls based on agent type',
        type: 'prohibition',
        rules: [{
          type: 'prohibition',
          action: 'api_call',
          conditions: [
            {
              type: 'agent',
              operator: 'not_equals',
              value: 'premium'
            }
          ]
        }]
      }
    };
  }

  /**
   * Validate form data
   */
  static validateFormData(formData: PolicyFormData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!formData.name || formData.name.trim().length === 0) {
      errors.push('Policy name is required');
    }

    if (!formData.description || formData.description.trim().length === 0) {
      errors.push('Policy description is required');
    }

    if (!formData.rules || formData.rules.length === 0) {
      errors.push('At least one rule is required');
    }

    // Validate each rule
    formData.rules?.forEach((rule, index) => {
      if (!rule.action) {
        errors.push(`Rule ${index + 1}: Action is required`);
      }

      // Validate conditions
      rule.conditions?.forEach((condition, condIndex) => {
        if (!condition.type) {
          errors.push(`Rule ${index + 1}, Condition ${condIndex + 1}: Type is required`);
        }
        if (!condition.operator) {
          errors.push(`Rule ${index + 1}, Condition ${condIndex + 1}: Operator is required`);
        }
        if (condition.value === undefined || condition.value === null) {
          errors.push(`Rule ${index + 1}, Condition ${condIndex + 1}: Value is required`);
        }
        if (condition.operator === 'between' && !condition.value2) {
          errors.push(`Rule ${index + 1}, Condition ${condIndex + 1}: Second value is required for between operator`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Quick test
if (require.main === module) {
  const template = ODRLFormBuilder.getTemplates()['business-hours'];
  const policy = ODRLFormBuilder.buildPolicy(template);
  console.log('Generated ODRL Policy:');
  console.log(JSON.stringify(policy, null, 2));
}