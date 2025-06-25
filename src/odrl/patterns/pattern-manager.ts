// ============================================================================
// AEGIS - Pattern Manager
// パターンの管理と学習機能
// ============================================================================

import { Rule, AEGISPolicy } from '../types.js';
import { PolicyPattern, getAllPatterns } from './pattern-definitions.js';
import { logger } from '../../utils/logger.js';

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

export interface MatchResult {
  pattern: PolicyPattern | LearnedPattern;
  match: RegExpMatchArray;
  confidence: number;
}

export class PatternManager {
  private patterns: PolicyPattern[];
  private learnedPatterns: Map<string, LearnedPattern> = new Map();
  
  constructor() {
    this.patterns = getAllPatterns();
  }
  
  /**
   * パターンを追加
   */
  addPattern(pattern: PolicyPattern): void {
    this.patterns.push(pattern);
  }
  
  /**
   * 自然言語ポリシーにマッチするパターンを検索
   */
  findMatchingPatterns(nlPolicy: string): MatchResult[] {
    const results: MatchResult[] = [];
    
    // 組み込みパターンをチェック
    for (const pattern of this.patterns) {
      const match = nlPolicy.match(pattern.pattern);
      if (match) {
        results.push({
          pattern,
          match,
          confidence: 0.8
        });
      }
    }
    
    // 学習済みパターンをチェック
    for (const learned of this.learnedPatterns.values()) {
      const match = nlPolicy.match(learned.pattern);
      if (match) {
        results.push({
          pattern: learned,
          match,
          confidence: learned.confidence
        });
      }
    }
    
    return results;
  }
  
  /**
   * 学習済みパターンを取得
   */
  getLearnedPatterns(): LearnedPattern[] {
    return Array.from(this.learnedPatterns.values());
  }
  
  /**
   * 成功した変換から学習
   */
  learnFromSuccess(nlPolicy: string, odrlPolicy: AEGISPolicy): void {
    const existingPatterns = this.findMatchingPatterns(nlPolicy);
    
    // 既存パターンの信頼度を上げる
    existingPatterns.forEach(result => {
      if ('id' in result.pattern) {
        const learned = result.pattern as LearnedPattern;
        learned.usageCount++;
        learned.successRate = (learned.successRate * (learned.usageCount - 1) + 1) / learned.usageCount;
        learned.confidence = Math.min(0.95, learned.confidence + 0.01);
      }
    });
    
    // 新しいパターンの可能性を探る
    if (existingPatterns.length === 0) {
      this.extractNewPattern(nlPolicy, odrlPolicy);
    }
  }
  
  /**
   * 新しいパターンを抽出
   */
  private extractNewPattern(nlPolicy: string, odrlPolicy: AEGISPolicy): void {
    // 時間制約パターンを探す
    const timeConstraints = this.findTimeConstraints(odrlPolicy);
    if (timeConstraints.length > 0) {
      const timeMatch = nlPolicy.match(/(\d+).*?(\d+).*?(時|hour)/i);
      if (timeMatch) {
        const patternId = `learned_time_${Date.now()}`;
        const newPattern: LearnedPattern = {
          id: patternId,
          pattern: new RegExp(timeMatch[0].replace(/\d+/g, '(\\d+)'), 'i'),
          type: 'permission',
          extractor: (match) => ({
            constraint: timeConstraints
          }),
          confidence: 0.7,
          usageCount: 1,
          successRate: 1.0,
          source: 'learned'
        };
        this.learnedPatterns.set(patternId, newPattern);
        logger.info('Learned new time pattern', { pattern: newPattern.pattern.source });
      }
    }
  }
  
  /**
   * 時間制約を検索
   */
  private findTimeConstraints(policy: AEGISPolicy): any[] {
    const constraints: any[] = [];
    
    const checkRule = (rule: Rule) => {
      if (rule.constraint) {
        rule.constraint.forEach(c => {
          if (c.leftOperand === 'timeOfDay' || c.leftOperand === 'dateTime') {
            constraints.push(c);
          }
        });
      }
    };
    
    policy.permission?.forEach(checkRule);
    policy.prohibition?.forEach(checkRule);
    
    return constraints;
  }
  
  /**
   * パターンをエクスポート
   */
  exportPatterns(): string {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      patterns: Array.from(this.learnedPatterns.values()).map(p => ({
        id: p.id,
        pattern: p.pattern.source,
        type: p.type,
        confidence: p.confidence,
        usageCount: p.usageCount,
        successRate: p.successRate,
        source: p.source
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * パターンをインポート
   */
  importPatterns(data: string): void {
    try {
      const imported = JSON.parse(data);
      
      if (imported.version !== '1.0') {
        throw new Error(`Unsupported version: ${imported.version}`);
      }
      
      imported.patterns.forEach((p: any) => {
        const pattern: LearnedPattern = {
          id: p.id,
          pattern: new RegExp(p.pattern),
          type: p.type,
          extractor: () => ({}), // シンプルな実装
          confidence: p.confidence,
          usageCount: p.usageCount,
          successRate: p.successRate,
          source: p.source
        };
        
        this.learnedPatterns.set(pattern.id, pattern);
      });
      
      logger.info(`Imported ${imported.patterns.length} patterns`);
    } catch (error) {
      logger.error('Failed to import patterns', error);
      throw new Error('Invalid pattern data format');
    }
  }
}