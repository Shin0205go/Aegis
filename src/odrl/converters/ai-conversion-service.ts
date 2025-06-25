// ============================================================================
// AEGIS - AI Conversion Service
// AIを使用した自然言語からODRLへの変換
// ============================================================================

import { AEGISPolicy, Rule, Constraint, Action, AEGISOperands } from '../types.js';
import { AIJudgmentEngine } from '../../ai/judgment-engine.js';
import { logger } from '../../utils/logger.js';
import { ConversionResult } from '../nl-to-odrl-converter.js';

export class AIConversionService {
  constructor(private aiEngine: AIJudgmentEngine) {}
  
  /**
   * AIを使用して自然言語をODRLに変換
   */
  async convertWithAI(nlPolicy: string, basePolicy?: AEGISPolicy): Promise<ConversionResult> {
    try {
      // AIプロンプトを構築
      const prompt = this.buildConversionPrompt(nlPolicy);
      
      // AI判定エンジンのconvertToODRLメソッドを使用
      const analysis = await this.aiEngine.convertToODRL(nlPolicy);
      
      // AI分析結果からODRLポリシーを構築
      const policy = this.buildODRLFromAnalysis(nlPolicy, analysis);
      
      // ベースポリシーがある場合はマージ
      const finalPolicy = basePolicy ? this.mergeWithBase(basePolicy, policy) : policy;
      
      return {
        success: true,
        policy: finalPolicy,
        confidence: analysis.confidence || 0.7,
        patterns: ['AI-based conversion'],
        conversionMethod: 'ai',
        aiAnalysis: analysis
      };
    } catch (error) {
      logger.error('AI conversion failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI conversion failed',
        confidence: 0,
        patterns: [],
        conversionMethod: 'ai'
      };
    }
  }
  
  /**
   * 変換用のプロンプトを構築
   */
  private buildConversionPrompt(nlPolicy: string): string {
    return `
自然言語のポリシーをODRL形式に変換してください。

入力ポリシー: "${nlPolicy}"

以下の要素を抽出してJSON形式で返してください：
1. ルールタイプ（Permission/Prohibition）
2. アクション（read, write, execute, delete等）
3. 制約条件（時間、エージェント、リソース等）
4. 義務（ログ記録、通知、削除等）

応答形式:
{
  "rules": [
    {
      "type": "Permission|Prohibition",
      "action": "action_name",
      "constraints": [
        {
          "type": "time|agent|resource|...",
          "description": "制約の説明"
        }
      ],
      "obligations": ["義務1", "義務2"]
    }
  ],
  "confidence": 0.0-1.0
}`;
  }
  
  /**
   * AI分析結果からODRLポリシーを構築
   */
  buildODRLFromAnalysis(nlPolicy: string, analysis: any): AEGISPolicy {
    const policy: AEGISPolicy = {
      '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
      '@type': 'Policy',
      uid: `aegis:policy:${Date.now()}`,
      profile: 'https://aegis.example.com/odrl/profile',
      permission: [],
      prohibition: []
    };
    
    // ルールを構築
    if (analysis.rules && Array.isArray(analysis.rules)) {
      analysis.rules.forEach((ruleData: any) => {
        const rule = this.createRuleFromAnalysis(ruleData, nlPolicy);
        if (rule) {
          if (rule['@type'] === 'Permission') {
            policy.permission!.push(rule);
          } else {
            policy.prohibition!.push(rule);
          }
        }
      });
    }
    
    return policy;
  }
  
  /**
   * AI分析からルールを作成
   */
  private createRuleFromAnalysis(ruleData: any, nlPolicy: string): Rule | null {
    try {
      const rule: Rule = {
        '@type': ruleData.type || 'Permission',
        action: this.extractAction(ruleData.action || 'use'),
        target: { uid: 'aegis:resource' }
      };
      
      // 制約を追加
      if (ruleData.constraints && Array.isArray(ruleData.constraints)) {
        rule.constraint = ruleData.constraints
          .map((c: any) => this.createConstraintFromDescription(c))
          .filter((c: any) => c !== null);
      }
      
      // 義務を追加
      if (ruleData.obligations && Array.isArray(ruleData.obligations)) {
        rule.duty = ruleData.obligations.map((o: string) => ({
          '@type': 'Duty',
          action: { value: this.mapObligationToAction(o) },
          constraint: []
        }));
      }
      
      return rule;
    } catch (error) {
      logger.error('Failed to create rule from AI analysis', error);
      return null;
    }
  }
  
  /**
   * 制約の説明から制約オブジェクトを作成
   */
  private createConstraintFromDescription(constraint: any): Constraint | null {
    if (!constraint.type || !constraint.description) {
      return null;
    }
    
    switch (constraint.type) {
      case 'time':
        return this.createTimeConstraint(constraint.description);
      case 'agent':
        return this.createAgentConstraint(constraint.description);
      case 'resource':
        return this.createResourceConstraint(constraint.description);
      default:
        return null;
    }
  }
  
  /**
   * 時間制約を作成
   */
  private createTimeConstraint(description: string): Constraint | null {
    const timeMatch = description.match(/(\d+):?(\d+)?.*?(\d+):?(\d+)?/);
    if (timeMatch) {
      const startHour = parseInt(timeMatch[1]);
      const startMin = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const endHour = parseInt(timeMatch[3]);
      const endMin = timeMatch[4] ? parseInt(timeMatch[4]) : 0;
      
      return {
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
      };
    }
    
    return null;
  }
  
  /**
   * エージェント制約を作成
   */
  private createAgentConstraint(description: string): Constraint | null {
    const agentMatch = description.match(/([\w\-]+)(?:エージェント|agent)/i);
    if (agentMatch) {
      return {
        '@type': 'Constraint',
        leftOperand: AEGISOperands.AGENT_TYPE,
        operator: 'eq',
        rightOperand: agentMatch[1]
      };
    }
    
    return null;
  }
  
  /**
   * リソース制約を作成
   */
  private createResourceConstraint(description: string): Constraint | null {
    const classMatch = description.match(/(public|internal|confidential|機密|内部|公開)/i);
    if (classMatch) {
      return {
        '@type': 'Constraint',
        leftOperand: AEGISOperands.RESOURCE_CLASSIFICATION,
        operator: 'eq',
        rightOperand: this.translateClassification(classMatch[1])
      };
    }
    
    return null;
  }
  
  /**
   * アクションを抽出
   */
  private extractAction(actionStr: string): Action {
    const actionMap: Record<string, string> = {
      '読み取り': 'odrl:read',
      '書き込み': 'odrl:write',
      '実行': 'odrl:execute',
      '削除': 'odrl:delete',
      'read': 'odrl:read',
      'write': 'odrl:write',
      'execute': 'odrl:execute',
      'delete': 'odrl:delete',
      'use': 'odrl:use'
    };
    
    return {
      value: actionMap[actionStr] || 'odrl:use'
    };
  }
  
  /**
   * 義務をアクションにマップ
   */
  private mapObligationToAction(obligation: string): string {
    const obligationMap: Record<string, string> = {
      'ログ記録': 'aegis:log',
      '通知': 'aegis:notify',
      '削除': 'aegis:delete',
      '匿名化': 'aegis:anonymize',
      '暗号化': 'aegis:encrypt'
    };
    
    for (const [key, value] of Object.entries(obligationMap)) {
      if (obligation.includes(key)) {
        return value;
      }
    }
    
    return 'aegis:inform';
  }
  
  /**
   * 分類を翻訳
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
    return translations[term] || 'unknown';
  }
  
  /**
   * ベースポリシーとマージ
   */
  private mergeWithBase(base: AEGISPolicy, additional: AEGISPolicy): AEGISPolicy {
    return {
      ...base,
      permission: [...(base.permission || []), ...(additional.permission || [])],
      prohibition: [...(base.prohibition || []), ...(additional.prohibition || [])]
    };
  }
}