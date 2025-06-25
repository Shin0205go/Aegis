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
import { AIJudgmentEngine } from '../ai/judgment-engine';
import { DecisionContext } from '../types/index';

export interface ConversionResult {
  success: boolean;
  policy?: AEGISPolicy;
  error?: string;
  confidence: number;
  patterns: string[];
  conversionMethod: 'pattern' | 'ai' | 'hybrid';
  aiAnalysis?: any;
}

export interface ConversionHistory {
  id: string;
  timestamp: Date;
  naturalLanguage: string;
  odrlPolicy: AEGISPolicy;
  confidence: number;
  conversionMethod: 'pattern' | 'ai' | 'hybrid';
  patterns: string[];
  aiAnalysis?: any;
}

export interface LearnedPattern {
  id: string;
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => Partial<Rule>;
  type: 'permission' | 'prohibition';
  confidence: number;
  usageCount: number;
  successRate: number;
  source: 'manual' | 'learned';
}

interface PolicyPattern {
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => Partial<Rule>;
  type: 'permission' | 'prohibition';
}

export class NLToODRLConverter {
  private patterns: PolicyPattern[] = [
    // 既存のパターンマッチング
  ];
  
  private aiEngine: AIJudgmentEngine | null = null;
  private conversionHistory: ConversionHistory[] = [];
  private learnedPatterns: LearnedPattern[] = [];
  private maxHistorySize = 1000;
  private minConfidenceForLearning = 0.8;
  
  constructor(aiEngine?: AIJudgmentEngine) {
    this.aiEngine = aiEngine || null;
    this.patterns = [
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
  }

  /**
   * Convert natural language policy to ODRL with AI fallback
   */
  async convert(nlPolicy: string, options?: {
    useAI?: boolean;
    saveHistory?: boolean;
    learnFromSuccess?: boolean;
  }): Promise<ConversionResult> {
    const opts = {
      useAI: true,
      saveHistory: true,
      learnFromSuccess: true,
      ...options
    };
    try {
      // Extract action from policy text
      const action = this.extractAction(nlPolicy);
      
      // Extract rules using patterns
      const rules = this.extractRules(nlPolicy, action);
      
      // Create ODRL policy
      let policy: AEGISPolicy = {
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
        if ((rule as any).pattern) {
          matchedPatterns.push((rule as any).pattern);
        }
        
        if (rule['@type'] === 'Permission') {
          policy.permission!.push(rule);
        } else if (rule['@type'] === 'Prohibition') {
          policy.prohibition!.push(rule);
        }
      }
      
      // Calculate confidence based on matched patterns
      let confidence = this.calculateConfidence(nlPolicy, matchedPatterns);
      let conversionMethod: 'pattern' | 'ai' | 'hybrid' = 'pattern';
      let aiAnalysis = undefined;
      
      // If confidence is low and AI is available, use AI fallback
      if (confidence < 0.7 && opts.useAI && this.aiEngine) {
        logger.info('Low confidence pattern match, using AI fallback');
        const aiResult = await this.convertWithAI(nlPolicy, policy);
        
        if (aiResult.success && aiResult.policy) {
          policy = aiResult.policy;
          confidence = aiResult.confidence;
          conversionMethod = matchedPatterns.length > 0 ? 'hybrid' : 'ai';
          aiAnalysis = aiResult.aiAnalysis;
          
          // Learn from successful AI conversion
          if (opts.learnFromSuccess && confidence >= this.minConfidenceForLearning) {
            await this.learnFromConversion(nlPolicy, policy, aiResult);
          }
        }
      }
      
      // Validate the generated policy
      ODRLParser.parseAEGIS(policy);
      
      const result: ConversionResult = {
        success: true,
        policy,
        confidence,
        patterns: matchedPatterns,
        conversionMethod,
        aiAnalysis
      };
      
      // Save to history if requested
      if (opts.saveHistory) {
        this.addToHistory(nlPolicy, policy, result);
      }
      
      return result;
      
    } catch (error) {
      logger.error('Failed to convert NL to ODRL', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        confidence: 0,
        patterns: [],
        conversionMethod: 'pattern'
      };
    }
  }
  
  /**
   * Convert using AI when pattern matching fails or has low confidence
   */
  private async convertWithAI(nlPolicy: string, patternPolicy: AEGISPolicy): Promise<{
    success: boolean;
    policy?: AEGISPolicy;
    confidence: number;
    aiAnalysis?: any;
  }> {
    if (!this.aiEngine) {
      return { success: false, confidence: 0 };
    }
    
    try {
      // Create a mock context for AI analysis
      const mockContext: DecisionContext = {
        agent: 'policy-converter',
        action: 'convert',
        resource: 'policy',
        time: new Date(),
        purpose: 'policy-conversion',
        environment: { conversionMode: true }
      };
      
      // Use AI to analyze the policy structure
      const analysis = await this.aiEngine.analyzePolicy(nlPolicy, mockContext);
      
      // Build ODRL policy from AI analysis
      const aiPolicy = await this.buildODRLFromAIAnalysis(nlPolicy, analysis);
      
      // Merge with pattern-based policy if available
      const mergedPolicy = this.mergePolicies(patternPolicy, aiPolicy);
      
      return {
        success: true,
        policy: mergedPolicy,
        confidence: 0.85, // AI conversions get moderate confidence
        aiAnalysis: analysis
      };
      
    } catch (error) {
      logger.error('AI conversion failed', error);
      return { success: false, confidence: 0 };
    }
  }
  
  /**
   * Build ODRL policy from AI analysis
   */
  private async buildODRLFromAIAnalysis(nlPolicy: string, analysis: any): Promise<AEGISPolicy> {
    const policy: AEGISPolicy = {
      '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
      '@type': 'Policy',
      uid: `aegis:policy:ai-${Date.now()}`,
      profile: 'https://aegis.example.com/odrl/profile',
      naturalLanguageSource: nlPolicy,
      metadata: {
        created: new Date().toISOString(),
        description: `AI-converted from: ${nlPolicy.substring(0, 100)}...`
      },
      permission: [],
      prohibition: []
    };
    
    // Convert time restrictions
    if (analysis.timeRestrictions && analysis.timeRestrictions !== '解析できませんでした') {
      const timeRule = this.createTimeRestrictionRule(analysis.timeRestrictions);
      if (timeRule) {
        policy.permission!.push(timeRule);
      }
    }
    
    // Convert agent restrictions
    if (analysis.agentRestrictions && analysis.agentRestrictions !== '解析できませんでした') {
      const agentRule = this.createAgentRestrictionRule(analysis.agentRestrictions);
      if (agentRule) {
        policy.permission!.push(agentRule);
      }
    }
    
    // Convert resource restrictions
    if (analysis.resources && analysis.resources.length > 0) {
      for (const resource of analysis.resources) {
        const resourceRule = this.createResourceRule(resource, nlPolicy);
        if (resourceRule) {
          const isProhibition = /禁止|deny|prohibit/i.test(nlPolicy);
          if (isProhibition) {
            policy.prohibition!.push(resourceRule);
          } else {
            policy.permission!.push(resourceRule);
          }
        }
      }
    }
    
    // Add constraints from AI analysis
    if (analysis.constraints && analysis.constraints.length > 0) {
      this.addConstraintsToPolicy(policy, analysis.constraints);
    }
    
    // Add obligations from AI analysis
    if (analysis.obligations && analysis.obligations.length > 0) {
      this.addObligationsToPolicy(policy, analysis.obligations);
    }
    
    return policy;
  }
  
  /**
   * Create time restriction rule from AI analysis
   */
  private createTimeRestrictionRule(timeDescription: string): Rule | null {
    // Extract time patterns from AI description
    const timeMatch = timeDescription.match(/(\d{1,2})[時:-]?(\d{1,2})?.*?[~～から](\d{1,2})[時:-]?(\d{1,2})?/);
    
    if (timeMatch) {
      const startHour = parseInt(timeMatch[1]);
      const startMin = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const endHour = parseInt(timeMatch[3]);
      const endMin = timeMatch[4] ? parseInt(timeMatch[4]) : 0;
      
      return {
        '@type': 'Permission',
        action: { value: 'resource:access' },
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
    
    return null;
  }
  
  /**
   * Create agent restriction rule from AI analysis
   */
  private createAgentRestrictionRule(agentDescription: string): Rule | null {
    // Extract agent types from AI description
    const agentMatch = agentDescription.match(/(\w+)(?:エージェント|agent|タイプ|type)/);
    
    if (agentMatch) {
      return {
        '@type': 'Permission',
        action: { value: 'resource:access' },
        constraint: [{
          '@type': 'Constraint',
          leftOperand: AEGISOperands.AGENT_TYPE,
          operator: 'eq',
          rightOperand: agentMatch[1]
        }]
      };
    }
    
    return null;
  }
  
  /**
   * Create resource rule from AI analysis
   */
  private createResourceRule(resource: string, nlPolicy: string): Rule {
    const action = this.extractAction(nlPolicy);
    
    return {
      '@type': 'Permission',
      action,
      target: { uid: resource }
    };
  }
  
  /**
   * Add constraints to policy from AI analysis
   */
  private addConstraintsToPolicy(policy: AEGISPolicy, constraints: string[]): void {
    for (const constraintText of constraints) {
      // Parse constraint text and add to appropriate rules
      if (/データ.*?匿名化/i.test(constraintText)) {
        // Add data anonymization constraint
        if (policy.permission && policy.permission.length > 0) {
          if (!policy.permission[0].duty) {
            policy.permission[0].duty = [];
          }
          policy.permission[0].duty.push({
            '@type': 'Duty',
            action: { value: 'anonymize' }
          });
        }
      }
      
      if (/ログ.*?記録/i.test(constraintText)) {
        // Add logging constraint
        if (policy.permission && policy.permission.length > 0) {
          if (!policy.permission[0].duty) {
            policy.permission[0].duty = [];
          }
          policy.permission[0].duty.push({
            '@type': 'Duty',
            action: { value: 'log' },
            target: { uid: 'access-log' }
          });
        }
      }
    }
  }
  
  /**
   * Add obligations to policy from AI analysis
   */
  private addObligationsToPolicy(policy: AEGISPolicy, obligations: string[]): void {
    if (!policy.obligation) {
      policy.obligation = [];
    }
    
    for (const obligationText of obligations) {
      if (/通知/i.test(obligationText)) {
        policy.obligation.push({
          action: { value: 'notify' },
          target: { uid: 'admin' }
        });
      }
      
      if (/削除.*?スケジュール/i.test(obligationText)) {
        policy.obligation.push({
          action: { value: 'delete' },
          constraint: [{
            '@type': 'Constraint',
            leftOperand: 'dateTime',
            operator: 'lteq',
            rightOperand: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }]
        });
      }
    }
  }
  
  /**
   * Merge pattern-based and AI-based policies
   */
  private mergePolicies(patternPolicy: AEGISPolicy, aiPolicy: AEGISPolicy): AEGISPolicy {
    const merged: AEGISPolicy = {
      ...patternPolicy,
      metadata: {
        ...patternPolicy.metadata,
        ...aiPolicy.metadata
      }
    };
    
    // Merge permissions
    if (aiPolicy.permission) {
      merged.permission = [...(merged.permission || []), ...aiPolicy.permission];
    }
    
    // Merge prohibitions
    if (aiPolicy.prohibition) {
      merged.prohibition = [...(merged.prohibition || []), ...aiPolicy.prohibition];
    }
    
    // Merge obligations
    if (aiPolicy.obligation) {
      merged.obligation = [...(merged.obligation || []), ...aiPolicy.obligation];
    }
    
    // Remove duplicates
    merged.permission = this.deduplicateRules(merged.permission || []);
    merged.prohibition = this.deduplicateRules(merged.prohibition || []);
    
    return merged;
  }
  
  /**
   * Remove duplicate rules
   */
  private deduplicateRules(rules: Rule[]): Rule[] {
    const seen = new Set<string>();
    return rules.filter(rule => {
      const key = JSON.stringify(rule);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Learn from successful AI conversion
   */
  private async learnFromConversion(
    nlPolicy: string,
    odrlPolicy: AEGISPolicy,
    aiResult: any
  ): Promise<void> {
    // Extract patterns from successful conversion
    const extractedPatterns = this.extractPatternsFromSuccess(nlPolicy, odrlPolicy);
    
    for (const pattern of extractedPatterns) {
      // Check if pattern already exists
      const existing = this.learnedPatterns.find(p => 
        p.pattern.source === pattern.pattern.source
      );
      
      if (existing) {
        // Update confidence and usage count
        existing.usageCount++;
        existing.successRate = (existing.successRate * (existing.usageCount - 1) + 1) / existing.usageCount;
        existing.confidence = Math.min(existing.confidence * 1.1, 0.95);
      } else {
        // Add new learned pattern
        this.learnedPatterns.push({
          id: `learned-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...pattern,
          confidence: 0.7,
          usageCount: 1,
          successRate: 1.0,
          source: 'learned'
        });
      }
    }
    
    // Limit learned patterns size
    if (this.learnedPatterns.length > 100) {
      // Sort by confidence * usage count and keep top 100
      this.learnedPatterns.sort((a, b) => 
        (b.confidence * b.usageCount) - (a.confidence * a.usageCount)
      );
      this.learnedPatterns = this.learnedPatterns.slice(0, 100);
    }
  }
  
  /**
   * Extract patterns from successful conversion
   */
  private extractPatternsFromSuccess(
    nlPolicy: string,
    odrlPolicy: AEGISPolicy
  ): PolicyPattern[] {
    const patterns: PolicyPattern[] = [];
    
    // This is a simplified implementation
    // In practice, this would use more sophisticated pattern extraction
    
    // Extract time patterns
    if (odrlPolicy.permission?.some(r => 
      r.constraint?.some(c => 
        'leftOperand' in c && c.leftOperand === 'timeOfDay'
      )
    )) {
      const timeMatch = nlPolicy.match(/(\d{1,2})[時:-]?(\d{1,2})?.*?[~～から](\d{1,2})[時:-]?(\d{1,2})?/);
      if (timeMatch) {
        patterns.push({
          pattern: /(\d{1,2})[時:-]?(\d{1,2})?.*?[~～から](\d{1,2})[時:-]?(\d{1,2})?.*?(許可|禁止)/,
          type: 'permission',
          extractor: (match) => ({
            '@type': 'Permission',
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
          })
        });
      }
    }
    
    return patterns;
  }
  
  /**
   * Add conversion to history
   */
  private addToHistory(
    nlPolicy: string,
    odrlPolicy: AEGISPolicy,
    result: ConversionResult
  ): void {
    const historyEntry: ConversionHistory = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      naturalLanguage: nlPolicy,
      odrlPolicy,
      confidence: result.confidence,
      conversionMethod: result.conversionMethod,
      patterns: result.patterns,
      aiAnalysis: result.aiAnalysis
    };
    
    this.conversionHistory.push(historyEntry);
    
    // Limit history size
    if (this.conversionHistory.length > this.maxHistorySize) {
      this.conversionHistory = this.conversionHistory.slice(-this.maxHistorySize);
    }
  }
  
  /**
   * Get conversion history
   */
  getHistory(limit?: number): ConversionHistory[] {
    const history = [...this.conversionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }
  
  /**
   * Get learned patterns
   */
  getLearnedPatterns(): LearnedPattern[] {
    return [...this.learnedPatterns].sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Export learned patterns for persistence
   */
  exportLearnedPatterns(): string {
    return JSON.stringify({
      version: '1.0',
      exportDate: new Date().toISOString(),
      patterns: this.learnedPatterns.map(p => ({
        ...p,
        pattern: p.pattern.source
      }))
    }, null, 2);
  }
  
  /**
   * Import learned patterns
   */
  importLearnedPatterns(data: string): void {
    try {
      const imported = JSON.parse(data);
      if (imported.version !== '1.0') {
        throw new Error('Unsupported version');
      }
      
      for (const pattern of imported.patterns) {
        this.learnedPatterns.push({
          ...pattern,
          pattern: new RegExp(pattern.pattern)
        });
      }
      
      logger.info(`Imported ${imported.patterns.length} learned patterns`);
    } catch (error) {
      logger.error('Failed to import learned patterns', error);
      throw error;
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
    
    logger.info('🧪 Testing Natural Language to ODRL Conversion\n');
    
    for (const nl of testPolicies) {
      logger.info(`Input: "${nl}"`);
      const result = await converter.convert(nl);
      
      if (result.success) {
        logger.info(`✅ Success (confidence: ${result.confidence})`);
        logger.info(`   Patterns: ${result.patterns.join(', ')}`);
        logger.info(`   Rules: ${result.policy!.permission!.length} permissions, ${result.policy!.prohibition!.length} prohibitions`);
      } else {
        logger.error(`❌ Failed: ${result.error}`);
      }
      logger.info('');
    }
  };
  
  test().catch(err => logger.error('Test failed', err));
}