// ============================================================================
// AEGIS - Natural Language to ODRL Converter (Refactored)
// 自然言語ポリシーをODRL形式に変換するメインクラス
// ============================================================================

import { AEGISPolicy } from './types.js';
import { logger } from '../utils/logger.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { PatternManager, LearnedPattern } from './patterns/pattern-manager.js';
import { AIConversionService } from './converters/ai-conversion-service.js';
import { PolicyBuilder } from './builders/policy-builder.js';
import { ConversionHistoryManager, ConversionHistory } from './history/conversion-history-manager.js';
import { ConversionUtilities } from './utils/conversion-utils.js';

export interface ConversionResult {
  success: boolean;
  policy?: AEGISPolicy;
  error?: string;
  confidence: number;
  patterns: string[];
  conversionMethod: 'pattern' | 'ai' | 'hybrid';
  aiAnalysis?: any;
}

export interface ConversionOptions {
  usePatternMatching?: boolean;
  useAI?: boolean;
  aiConfidenceThreshold?: number;
  maxPatternAttempts?: number;
}

export class NLToODRLConverter {
  private patternManager: PatternManager;
  private aiService?: AIConversionService;
  private policyBuilder: PolicyBuilder;
  private historyManager: ConversionHistoryManager;
  
  constructor(aiEngine?: AIJudgmentEngine) {
    this.patternManager = new PatternManager();
    this.aiService = aiEngine ? new AIConversionService(aiEngine) : undefined;
    this.policyBuilder = new PolicyBuilder();
    this.historyManager = new ConversionHistoryManager(100);
    
    logger.info('NL to ODRL Converter initialized', {
      aiEnabled: !!aiEngine,
      patternCount: this.patternManager.findMatchingPatterns('').length
    });
  }
  
  /**
   * 自然言語ポリシーをODRLに変換
   */
  async convert(
    nlPolicy: string, 
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    const {
      usePatternMatching = true,
      useAI = true,
      aiConfidenceThreshold = 0.7
    } = options;
    
    logger.info('Starting NL to ODRL conversion', { 
      policy: nlPolicy.substring(0, 50) + '...',
      options 
    });
    
    let result: ConversionResult | null = null;
    
    // 1. パターンマッチングを試行
    if (usePatternMatching) {
      result = await this.convertWithPatterns(nlPolicy);
      if (result.success && result.confidence >= aiConfidenceThreshold) {
        this.recordConversion(nlPolicy, result);
        return result;
      }
    }
    
    // 2. AIによる変換を試行
    if (useAI && this.aiService) {
      const patternResult = result;
      result = await this.aiService.convertWithAI(
        nlPolicy,
        patternResult?.policy
      );
      
      if (result.success) {
        result.conversionMethod = patternResult?.success ? 'hybrid' : 'ai';
        this.recordConversion(nlPolicy, result);
        
        // パターン学習
        if (result.policy) {
          this.patternManager.learnFromSuccess(nlPolicy, result.policy);
        }
        
        return result;
      }
    }
    
    // 3. 変換失敗
    return {
      success: false,
      error: 'Failed to convert policy using available methods',
      confidence: 0,
      patterns: [],
      conversionMethod: 'pattern'
    };
  }
  
  /**
   * パターンマッチングによる変換
   */
  private async convertWithPatterns(nlPolicy: string): Promise<ConversionResult> {
    try {
      // マッチするパターンを検索
      const matches = this.patternManager.findMatchingPatterns(nlPolicy);
      
      if (matches.length === 0) {
        return {
          success: false,
          error: 'No matching patterns found',
          confidence: 0,
          patterns: [],
          conversionMethod: 'pattern'
        };
      }
      
      // デフォルトアクションを抽出
      const defaultAction = ConversionUtilities.extractAction(nlPolicy);
      
      // ルールを抽出
      const rules = matches.map(match => {
        const ruleData = match.pattern.extractor(match.match);
        return {
          ...ruleData,
          '@type': ruleData['@type'] || 'Permission',
          action: ruleData.action || defaultAction,
          target: { uid: 'aegis:resource' }
        };
      });
      
      // ポリシーを構築
      const policy = this.policyBuilder.createPolicy(nlPolicy, rules);
      
      // 制約と義務を追加
      const constraints = ConversionUtilities.extractConstraints(nlPolicy);
      const obligations = ConversionUtilities.extractObligations(nlPolicy);
      
      if (constraints.length > 0) {
        this.policyBuilder.addConstraints(policy, constraints);
      }
      
      if (obligations.length > 0) {
        this.policyBuilder.addObligations(policy, obligations);
      }
      
      // 信頼度を計算
      const patternNames = matches.map(m => 
        m.pattern.pattern.source.substring(0, 20) + '...'
      );
      const confidence = ConversionUtilities.calculateConfidence(
        nlPolicy, 
        patternNames
      );
      
      return {
        success: true,
        policy,
        confidence,
        patterns: patternNames,
        conversionMethod: 'pattern'
      };
    } catch (error) {
      logger.error('Pattern conversion failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Pattern conversion failed',
        confidence: 0,
        patterns: [],
        conversionMethod: 'pattern'
      };
    }
  }
  
  /**
   * 変換履歴を記録
   */
  private recordConversion(nlPolicy: string, result: ConversionResult): void {
    if (!result.success || !result.policy) return;
    
    const history: ConversionHistory = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      naturalLanguage: nlPolicy,
      odrlPolicy: result.policy,
      confidence: result.confidence,
      conversionMethod: result.conversionMethod,
      patterns: result.patterns,
      aiAnalysis: result.aiAnalysis
    };
    
    this.historyManager.add(history);
  }
  
  /**
   * 変換履歴を取得
   */
  getHistory(limit?: number): ConversionHistory[] {
    return this.historyManager.getHistory(limit);
  }
  
  /**
   * 類似の変換を検索
   */
  findSimilarConversions(nlPolicy: string): ConversionHistory[] {
    return this.historyManager.findSimilarConversions(nlPolicy);
  }
  
  /**
   * 学習済みパターンを取得
   */
  getLearnedPatterns(): LearnedPattern[] {
    return this.patternManager.getLearnedPatterns();
  }
  
  /**
   * 学習済みパターンをエクスポート
   */
  exportLearnedPatterns(): string {
    return this.patternManager.exportPatterns();
  }
  
  /**
   * 学習済みパターンをインポート
   */
  importLearnedPatterns(data: string): void {
    this.patternManager.importPatterns(data);
  }
  
  /**
   * 変換履歴をエクスポート
   */
  exportHistory(): string {
    return this.historyManager.exportHistory();
  }
  
  /**
   * 変換履歴をインポート
   */
  importHistory(data: string): void {
    this.historyManager.importHistory(data);
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics() {
    return {
      history: this.historyManager.getStatistics(),
      patterns: {
        builtin: this.patternManager.findMatchingPatterns('').length,
        learned: this.getLearnedPatterns().length
      }
    };
  }
}