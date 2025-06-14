import { ContextEnricher } from '../collector';
import { DecisionContext } from '../../types';

/**
 * データ系譜エンリッチャー
 * 
 * データの出所、加工履歴、依存リソース、アクセス履歴などの情報を追加
 */
export class DataLineageEnricher implements ContextEnricher {
  name = 'data-lineage';

  // データ系譜情報のモックデータベース
  private lineageDatabase: Map<string, DataLineageInfo> = new Map([
    ['gmail://inbox/message/123', {
      origin: {
        system: 'gmail',
        importedAt: new Date('2024-12-01'),
        importedBy: 'email-integration-agent',
        originalFormat: 'email/rfc822'
      },
      transformations: [
        {
          type: 'parse',
          timestamp: new Date('2024-12-01T10:00:00Z'),
          agent: 'email-parser',
          description: 'Extracted text content and metadata'
        },
        {
          type: 'anonymize',
          timestamp: new Date('2024-12-01T10:01:00Z'),
          agent: 'privacy-filter',
          description: 'Removed PII from email content'
        }
      ],
      dependencies: [
        'gmail://contacts/sender-profile',
        'gmail://attachments/file-123'
      ],
      derivedResources: [
        'analytics://email-insights/report-456'
      ],
      accessHistory: {
        firstAccess: new Date('2024-12-01T10:05:00Z'),
        lastAccess: new Date('2024-12-15T14:30:00Z'),
        totalAccesses: 23,
        uniqueAgents: 5
      }
    }],
    ['gdrive://documents/financial-report', {
      origin: {
        system: 'gdrive',
        importedAt: new Date('2024-11-15'),
        importedBy: 'finance-automation',
        originalFormat: 'application/vnd.google-apps.spreadsheet'
      },
      transformations: [
        {
          type: 'aggregate',
          timestamp: new Date('2024-11-15T09:00:00Z'),
          agent: 'finance-aggregator',
          description: 'Aggregated monthly financial data'
        },
        {
          type: 'validate',
          timestamp: new Date('2024-11-15T09:30:00Z'),
          agent: 'finance-validator',
          description: 'Validated financial calculations and compliance'
        }
      ],
      dependencies: [
        'database://finance/transactions',
        'gdrive://templates/financial-template'
      ],
      derivedResources: [
        'gdrive://reports/quarterly-summary',
        'analytics://finance/dashboard'
      ],
      accessHistory: {
        firstAccess: new Date('2024-11-15T10:00:00Z'),
        lastAccess: new Date('2024-12-20T16:45:00Z'),
        totalAccesses: 156,
        uniqueAgents: 12
      }
    }]
  ]);

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    const resource = context.resource;
    const lineageInfo = this.lineageDatabase.get(resource) || this.createDefaultLineage(resource);

    // データの経過時間を計算
    const now = new Date();
    const dataAgeHours = Math.floor((now.getTime() - lineageInfo.origin.importedAt.getTime()) / (1000 * 60 * 60));
    const lastAccessHours = Math.floor((now.getTime() - lineageInfo.accessHistory.lastAccess.getTime()) / (1000 * 60 * 60));

    // データの信頼性スコアを計算
    const trustScore = this.calculateDataTrustScore(lineageInfo);

    // データの完全性チェック
    const integrityCheck = this.checkDataIntegrity(lineageInfo);

    // 変換の複雑度
    const transformationComplexity = this.calculateTransformationComplexity(lineageInfo);

    return {
      [this.name]: {
        origin: {
          system: lineageInfo.origin.system,
          importedAt: lineageInfo.origin.importedAt.toISOString(),
          importedBy: lineageInfo.origin.importedBy,
          originalFormat: lineageInfo.origin.originalFormat
        },
        transformations: lineageInfo.transformations.map(t => ({
          type: t.type,
          timestamp: t.timestamp.toISOString(),
          agent: t.agent,
          description: t.description
        })),
        transformationCount: lineageInfo.transformations.length,
        transformationComplexity,
        dependencies: lineageInfo.dependencies,
        dependencyCount: lineageInfo.dependencies.length,
        derivedResources: lineageInfo.derivedResources,
        derivedCount: lineageInfo.derivedResources.length,
        accessHistory: {
          firstAccess: lineageInfo.accessHistory.firstAccess.toISOString(),
          lastAccess: lineageInfo.accessHistory.lastAccess.toISOString(),
          totalAccesses: lineageInfo.accessHistory.totalAccesses,
          uniqueAgents: lineageInfo.accessHistory.uniqueAgents,
          accessFrequency: this.calculateAccessFrequency(lineageInfo.accessHistory)
        },
        dataAgeHours,
        lastAccessHours,
        isStale: dataAgeHours > 720, // 30日以上
        isFrequentlyAccessed: lineageInfo.accessHistory.totalAccesses > 50,
        trustScore,
        integrityCheck,
        hasTransformations: lineageInfo.transformations.length > 0,
        hasDependencies: lineageInfo.dependencies.length > 0,
        isDerived: lineageInfo.transformations.some(t => ['aggregate', 'merge', 'join'].includes(t.type)),
        isAnonymized: lineageInfo.transformations.some(t => t.type === 'anonymize'),
        isValidated: lineageInfo.transformations.some(t => t.type === 'validate')
      }
    };
  }

  private createDefaultLineage(resource: string): DataLineageInfo {
    const now = new Date();
    return {
      origin: {
        system: this.extractSystem(resource),
        importedAt: now,
        importedBy: 'unknown',
        originalFormat: 'unknown'
      },
      transformations: [],
      dependencies: [],
      derivedResources: [],
      accessHistory: {
        firstAccess: now,
        lastAccess: now,
        totalAccesses: 1,
        uniqueAgents: 1
      }
    };
  }

  private extractSystem(resource: string): string {
    const match = resource.match(/^([^:]+):/);
    return match ? match[1] : 'unknown';
  }

  private calculateDataTrustScore(lineage: DataLineageInfo): number {
    let score = 1.0;

    // 変換が多いほど信頼性が下がる
    score -= lineage.transformations.length * 0.05;

    // 検証済みなら信頼性が上がる
    if (lineage.transformations.some(t => t.type === 'validate')) {
      score += 0.2;
    }

    // 匿名化されていれば信頼性が少し下がる（情報が失われる可能性）
    if (lineage.transformations.some(t => t.type === 'anonymize')) {
      score -= 0.1;
    }

    // 依存関係が多いと複雑性が増す
    score -= lineage.dependencies.length * 0.02;

    // アクセス頻度が高いと信頼性が上がる（よく使われている）
    if (lineage.accessHistory.totalAccesses > 100) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  private checkDataIntegrity(lineage: DataLineageInfo): DataIntegrityCheck {
    const hasValidation = lineage.transformations.some(t => t.type === 'validate');
    const hasChecksum = lineage.transformations.some(t => t.type === 'checksum');
    const hasSigning = lineage.transformations.some(t => t.type === 'sign');

    return {
      isValidated: hasValidation,
      hasChecksum: hasChecksum,
      isSigned: hasSigning,
      integrityLevel: this.getIntegrityLevel(hasValidation, hasChecksum, hasSigning)
    };
  }

  private getIntegrityLevel(validated: boolean, checksum: boolean, signed: boolean): string {
    if (signed) return 'high';
    if (validated && checksum) return 'medium';
    if (validated || checksum) return 'low';
    return 'none';
  }

  private calculateTransformationComplexity(lineage: DataLineageInfo): string {
    const count = lineage.transformations.length;
    const hasComplexTransforms = lineage.transformations.some(t => 
      ['aggregate', 'merge', 'join', 'machine-learning'].includes(t.type)
    );

    if (count === 0) return 'none';
    if (count <= 2 && !hasComplexTransforms) return 'simple';
    if (count <= 5 || hasComplexTransforms) return 'moderate';
    return 'complex';
  }

  private calculateAccessFrequency(history: AccessHistory): string {
    const daysSinceFirst = (new Date().getTime() - history.firstAccess.getTime()) / (1000 * 60 * 60 * 24);
    const accessesPerDay = history.totalAccesses / Math.max(1, daysSinceFirst);

    if (accessesPerDay > 10) return 'very-high';
    if (accessesPerDay > 5) return 'high';
    if (accessesPerDay > 1) return 'moderate';
    if (accessesPerDay > 0.1) return 'low';
    return 'very-low';
  }

  /**
   * データ系譜情報を更新
   */
  updateLineage(resource: string, lineage: Partial<DataLineageInfo>): void {
    const existing = this.lineageDatabase.get(resource);
    if (existing) {
      this.lineageDatabase.set(resource, this.mergeLineage(existing, lineage));
    } else {
      this.lineageDatabase.set(resource, {
        ...this.createDefaultLineage(resource),
        ...lineage
      } as DataLineageInfo);
    }
  }

  private mergeLineage(existing: DataLineageInfo, update: Partial<DataLineageInfo>): DataLineageInfo {
    return {
      origin: update.origin || existing.origin,
      transformations: update.transformations || existing.transformations,
      dependencies: update.dependencies || existing.dependencies,
      derivedResources: update.derivedResources || existing.derivedResources,
      accessHistory: update.accessHistory || existing.accessHistory
    };
  }

  /**
   * 変換を記録
   */
  recordTransformation(resource: string, transformation: Transformation): void {
    const lineage = this.lineageDatabase.get(resource) || this.createDefaultLineage(resource);
    lineage.transformations.push(transformation);
    this.lineageDatabase.set(resource, lineage);
  }

  /**
   * アクセスを記録
   */
  recordAccess(resource: string, agent: string): void {
    const lineage = this.lineageDatabase.get(resource) || this.createDefaultLineage(resource);
    lineage.accessHistory.lastAccess = new Date();
    lineage.accessHistory.totalAccesses++;
    // 簡易的なユニークエージェント数のカウント（実際にはSetなどで管理）
    this.lineageDatabase.set(resource, lineage);
  }
}

interface DataLineageInfo {
  origin: {
    system: string;
    importedAt: Date;
    importedBy: string;
    originalFormat: string;
  };
  transformations: Transformation[];
  dependencies: string[];
  derivedResources: string[];
  accessHistory: AccessHistory;
}

interface Transformation {
  type: string;
  timestamp: Date;
  agent: string;
  description: string;
}

interface AccessHistory {
  firstAccess: Date;
  lastAccess: Date;
  totalAccesses: number;
  uniqueAgents: number;
}

interface DataIntegrityCheck {
  isValidated: boolean;
  hasChecksum: boolean;
  isSigned: boolean;
  integrityLevel: string;
}