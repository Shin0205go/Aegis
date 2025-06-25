// ============================================================================
// AEGIS - Conversion History Manager
// 変換履歴の管理
// ============================================================================

import { AEGISPolicy } from '../types.js';
import { logger } from '../../utils/logger.js';

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

export class ConversionHistoryManager {
  private history: ConversionHistory[] = [];
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  /**
   * 履歴エントリを追加
   */
  add(entry: ConversionHistory): void {
    // 新しいエントリを先頭に追加
    this.history.unshift(entry);
    
    // 最大サイズを超えたら古いものを削除
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(0, this.maxSize);
    }
    
    logger.debug('Added conversion history entry', { 
      id: entry.id, 
      confidence: entry.confidence 
    });
  }
  
  /**
   * 履歴を取得
   */
  getHistory(limit?: number): ConversionHistory[] {
    if (limit && limit > 0) {
      return this.history.slice(0, limit);
    }
    return [...this.history];
  }
  
  /**
   * 類似の変換を検索
   */
  findSimilarConversions(nlPolicy: string, threshold: number = 0.7): ConversionHistory[] {
    const similar: ConversionHistory[] = [];
    const inputWords = this.tokenize(nlPolicy);
    
    this.history.forEach(entry => {
      const entryWords = this.tokenize(entry.naturalLanguage);
      const similarity = this.calculateSimilarity(inputWords, entryWords);
      
      if (similarity >= threshold) {
        similar.push(entry);
      }
    });
    
    // 類似度の高い順にソート
    return similar.sort((a, b) => {
      const simA = this.calculateSimilarity(
        inputWords, 
        this.tokenize(a.naturalLanguage)
      );
      const simB = this.calculateSimilarity(
        inputWords, 
        this.tokenize(b.naturalLanguage)
      );
      return simB - simA;
    });
  }
  
  /**
   * 履歴をエクスポート
   */
  exportHistory(): string {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      entries: this.history.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * 履歴をインポート
   */
  importHistory(data: string): void {
    try {
      const imported = JSON.parse(data);
      
      if (imported.version !== '1.0') {
        throw new Error(`Unsupported version: ${imported.version}`);
      }
      
      const newEntries: ConversionHistory[] = imported.entries.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp)
      }));
      
      // 既存の履歴とマージ（重複を避ける）
      const existingIds = new Set(this.history.map(h => h.id));
      const uniqueNew = newEntries.filter(e => !existingIds.has(e.id));
      
      this.history = [...uniqueNew, ...this.history].slice(0, this.maxSize);
      
      logger.info(`Imported ${uniqueNew.length} conversion history entries`);
    } catch (error) {
      logger.error('Failed to import conversion history', error);
      throw new Error('Invalid history data format');
    }
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(): {
    totalConversions: number;
    averageConfidence: number;
    methodDistribution: Record<string, number>;
    patternUsage: Record<string, number>;
  } {
    const stats = {
      totalConversions: this.history.length,
      averageConfidence: 0,
      methodDistribution: {
        pattern: 0,
        ai: 0,
        hybrid: 0
      },
      patternUsage: {} as Record<string, number>
    };
    
    if (this.history.length === 0) {
      return stats;
    }
    
    let totalConfidence = 0;
    
    this.history.forEach(entry => {
      totalConfidence += entry.confidence;
      stats.methodDistribution[entry.conversionMethod]++;
      
      entry.patterns.forEach(pattern => {
        stats.patternUsage[pattern] = (stats.patternUsage[pattern] || 0) + 1;
      });
    });
    
    stats.averageConfidence = totalConfidence / this.history.length;
    
    return stats;
  }
  
  /**
   * 特定のIDの履歴を取得
   */
  getById(id: string): ConversionHistory | undefined {
    return this.history.find(h => h.id === id);
  }
  
  /**
   * 履歴をクリア
   */
  clear(): void {
    this.history = [];
    logger.info('Conversion history cleared');
  }
  
  /**
   * テキストをトークン化
   */
  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2)
    );
  }
  
  /**
   * 類似度を計算（Jaccard係数）
   */
  private calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / union.size;
  }
}