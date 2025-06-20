/**
 * Natural Language to ODRL Converter
 * Converts natural language policies to ODRL format using pattern matching and AI
 */

import { 
  AEGISPolicy,
  Rule,
  Constraint,
  Action,
  AEGISOperands
} from './types';
import { ODRLParser } from './parser';
import { logger } from '../utils/logger';

export interface ConversionResult {
  success: boolean;
  policy?: AEGISPolicy;
  error?: string;
  confidence: number;
  patterns: string[];
}

interface PolicyPattern {
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => Partial<Rule>;
  type: 'permission' | 'prohibition';
}

export class NLToODRLConverter {
  private patterns: PolicyPattern[] = [
    // Time-based patterns
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
    
    // Trust score patterns
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
    },
    
    // Agent type patterns
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
    
    // Resource classification patterns
    {
      pattern: /(public|internal|confidential|機密|内部|公開).*?(リソース|データ|情報).*?(許可|禁止)/i,
      type: 'permission',
      extractor: (match) => {
        const classification = this.translateClassification(match[1]);
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
    },
    
    // Emergency override patterns
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
    
    // Delegation depth patterns
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
   * Convert natural language policy to ODRL
   */
  async convert(nlPolicy: string): Promise<ConversionResult> {
    try {
      // Extract action from policy text
      const action = this.extractAction(nlPolicy);
      
      // Extract rules using patterns
      const rules = this.extractRules(nlPolicy, action);
      
      // Create ODRL policy
      const policy: AEGISPolicy = {
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: `aegis:policy:nl-${Date.now()}`,
        profile: 'https://aegis.example.com/odrl/profile',
        naturalLanguageSource: nlPolicy,
        metadata: {
          created: new Date().toISOString(),
          description: `Auto-converted from: ${nlPolicy.substring(0, 100)}...`
        },
        permission: [],
        prohibition: []
      };
      
      // Add rules to policy
      const matchedPatterns: string[] = [];
      for (const rule of rules) {
        if (rule.pattern) {
          matchedPatterns.push(rule.pattern);
        }
        
        if (rule['@type'] === 'Permission') {
          policy.permission!.push(rule);
        } else if (rule['@type'] === 'Prohibition') {
          policy.prohibition!.push(rule);
        }
      }
      
      // Calculate confidence based on matched patterns
      const confidence = this.calculateConfidence(nlPolicy, matchedPatterns);
      
      // Validate the generated policy
      ODRLParser.parseAEGIS(policy);
      
      return {
        success: true,
        policy,
        confidence,
        patterns: matchedPatterns
      };
      
    } catch (error) {
      logger.error('Failed to convert NL to ODRL', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0,
        patterns: []
      };
    }
  }

  /**
   * Extract action from natural language policy
   */
  private extractAction(nlPolicy: string): Action {
    // Common action patterns
    const actionPatterns = [
      { pattern: /ファイル.*?読み?取り/i, action: 'filesystem:read' },
      { pattern: /ファイル.*?書き?込み/i, action: 'filesystem:write' },
      { pattern: /ツール.*?実行/i, action: 'tool:execute' },
      { pattern: /リソース.*?アクセス/i, action: 'resource:access' },
      { pattern: /タスク.*?委譲/i, action: 'task:delegate' },
      { pattern: /データ.*?取得/i, action: 'data:retrieve' },
      { pattern: /コマンド.*?実行/i, action: 'command:execute' },
      { pattern: /API.*?呼び出し/i, action: 'api:call' }
    ];
    
    for (const { pattern, action } of actionPatterns) {
      if (pattern.test(nlPolicy)) {
        return { value: action };
      }
    }
    
    // Default action
    return { value: 'resource:access' };
  }

  /**
   * Extract rules from natural language using patterns
   */
  private extractRules(nlPolicy: string, defaultAction: Action): Rule[] {
    const rules: Rule[] = [];
    const usedPatterns = new Set<string>();
    
    for (const patternDef of this.patterns) {
      const match = nlPolicy.match(patternDef.pattern);
      if (match && !usedPatterns.has(patternDef.pattern.source)) {
        const ruleData = patternDef.extractor(match);
        
        // Add default action if not specified
        if (!ruleData.action) {
          ruleData.action = defaultAction;
        }
        
        // Add pattern info for tracking
        (ruleData as any).pattern = patternDef.pattern.source;
        
        rules.push(ruleData as Rule);
        usedPatterns.add(patternDef.pattern.source);
      }
    }
    
    // If no patterns matched, create a simple rule
    if (rules.length === 0) {
      const isPermissive = /許可|allow|permit/i.test(nlPolicy);
      rules.push({
        '@type': isPermissive ? 'Permission' : 'Prohibition',
        action: defaultAction
      });
    }
    
    return rules;
  }

  /**
   * Translate classification terms
   */
  private translateClassification(term: string): string {
    const translations: Record<string, string> = {
      '機密': 'confidential',
      '内部': 'internal',
      '公開': 'public',
      'confidential': 'confidential',
      'internal': 'internal',
      'public': 'public'
    };
    
    return translations[term.toLowerCase()] || 'internal';
  }

  /**
   * Calculate confidence score for conversion
   */
  private calculateConfidence(nlPolicy: string, matchedPatterns: string[]): number {
    // Base confidence
    let confidence = 0.5;
    
    // Add confidence for each matched pattern
    confidence += matchedPatterns.length * 0.15;
    
    // Add confidence for specific keywords
    const keywords = ['許可', '禁止', 'allow', 'deny', 'のみ', 'only', '場合', 'if'];
    const keywordMatches = keywords.filter(k => nlPolicy.includes(k)).length;
    confidence += keywordMatches * 0.05;
    
    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }

  /**
   * Suggest ODRL policy based on common patterns
   */
  suggestPolicy(scenario: string): AEGISPolicy | null {
    const suggestions: Record<string, () => AEGISPolicy> = {
      'business-hours': () => ({
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'aegis:policy:business-hours-suggestion',
        profile: 'https://aegis.example.com/odrl/profile',
        naturalLanguageSource: '営業時間内（9-18時）のみアクセスを許可',
        permission: [{
          '@type': 'Permission',
          action: { value: 'resource:access' },
          constraint: [{
            '@type': 'LogicalConstraint',
            and: [
              {
                '@type': 'Constraint',
                leftOperand: 'timeOfDay',
                operator: 'gteq',
                rightOperand: '09:00:00'
              },
              {
                '@type': 'Constraint',
                leftOperand: 'timeOfDay',
                operator: 'lteq',
                rightOperand: '18:00:00'
              }
            ]
          }]
        }]
      }),
      
      'trusted-agents': () => ({
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        uid: 'aegis:policy:trusted-agents-suggestion',
        profile: 'https://aegis.example.com/odrl/profile',
        naturalLanguageSource: '信頼スコア0.7以上のエージェントのみ許可',
        permission: [{
          '@type': 'Permission',
          action: { value: 'resource:access' },
          constraint: [{
            '@type': 'Constraint',
            leftOperand: AEGISOperands.TRUST_SCORE,
            operator: 'gteq',
            rightOperand: 0.7
          }]
        }]
      })
    };
    
    return suggestions[scenario]?.() || null;
  }
}

// Quick test
if (require.main === module) {
  const test = async () => {
    const converter = new NLToODRLConverter();
    
    const testPolicies = [
      '営業時間内（9時から18時まで）のみファイルシステムへの読み取りアクセスを許可',
      '信頼スコアが0.7以上のエージェントのみ機密リソースへのアクセスを許可',
      'researchエージェントのみツール実行を許可',
      '緊急の場合は時間制限を解除',
      'タスクの委譲は最大3レベルまで'
    ];
    
    console.log('🧪 Testing Natural Language to ODRL Conversion\n');
    
    for (const nl of testPolicies) {
      console.log(`Input: "${nl}"`);
      const result = await converter.convert(nl);
      
      if (result.success) {
        console.log(`✅ Success (confidence: ${result.confidence})`);
        console.log(`   Patterns: ${result.patterns.join(', ')}`);
        console.log(`   Rules: ${result.policy!.permission!.length} permissions, ${result.policy!.prohibition!.length} prohibitions`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
      console.log();
    }
  };
  
  test().catch(console.error);
}