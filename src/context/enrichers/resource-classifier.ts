import { ContextEnricher } from '../collector';
import { DecisionContext } from '../../types';

/**
 * リソース分類エンリッチャー
 * 
 * データ種別、機密度レベル、所有者、タグ情報などを追加
 */
export class ResourceClassifierEnricher implements ContextEnricher {
  name = 'resource-classifier';

  // リソース分類ルール
  private classificationRules: ClassificationRule[] = [
    // 開発ディレクトリ・ツール（最優先）
    {
      pattern: /\/Develop\/|filesystem__|execution-server__|history-mcp|conversation-mcp|aegis-/i,
      classification: {
        dataType: 'development-resources',
        sensitivityLevel: 'low',
        tags: ['development', 'local'],
        retentionDays: -1,
        requiresEncryption: false
      }
    },
    // 顧客データ（より具体的なパターンに変更）
    {
      pattern: /\/(customer|client|user|profile)\/(data|info|record|detail)|customer-database|user-profile|client-record/i,
      classification: {
        dataType: 'customer-data',
        sensitivityLevel: 'high',
        tags: ['pii', 'regulated'],
        retentionDays: 365,
        requiresEncryption: true
      }
    },
    // 財務データ
    {
      pattern: /financial|payment|billing|transaction|revenue/i,
      classification: {
        dataType: 'financial-data',
        sensitivityLevel: 'critical',
        tags: ['financial', 'regulated', 'audit-required'],
        retentionDays: 2555, // 7年
        requiresEncryption: true
      }
    },
    // 医療データ
    {
      pattern: /medical|health|patient|diagnosis|treatment/i,
      classification: {
        dataType: 'health-data',
        sensitivityLevel: 'critical',
        tags: ['phi', 'hipaa', 'regulated'],
        retentionDays: 2190, // 6年
        requiresEncryption: true
      }
    },
    // システムログ
    {
      pattern: /\/(logs?|audit|system|debug|error)\//i,
      classification: {
        dataType: 'system-logs',
        sensitivityLevel: 'medium',
        tags: ['operational', 'technical'],
        retentionDays: 90,
        requiresEncryption: false
      }
    },
    // 公開データ
    {
      pattern: /public|blog|article|documentation|help/i,
      classification: {
        dataType: 'public-data',
        sensitivityLevel: 'low',
        tags: ['public'],
        retentionDays: -1, // 無期限
        requiresEncryption: false
      }
    }
  ];

  // リソース所有者マッピング
  private resourceOwners: Map<string, ResourceOwner> = new Map([
    ['gmail://inbox', {
      owner: 'email-team',
      department: 'communications',
      dataController: 'data-governance-team'
    }],
    ['gdrive://documents', {
      owner: 'document-management',
      department: 'it',
      dataController: 'compliance-team'
    }],
    ['slack://channels', {
      owner: 'collaboration-team',
      department: 'it',
      dataController: 'security-team'
    }]
  ]);

  async enrich(context: DecisionContext): Promise<Record<string, any>> {
    const resource = context.resource;
    
    // リソースURIの解析
    const resourceParts = this.parseResourceUri(resource);
    
    // リソース分類の判定
    const classification = this.classifyResource(resource);
    
    // リソース所有者情報
    const ownerInfo = this.getResourceOwner(resourceParts.scheme + '://' + resourceParts.host);
    
    // データ系譜情報
    const lineageInfo = this.getDataLineage(resource);
    
    // アクセス頻度情報
    const accessFrequency = this.calculateAccessFrequency(resource);
    
    // 機密度スコアの計算
    const sensitivityScore = this.calculateSensitivityScore(classification);

    return {
      [this.name]: {
        resourceUri: resource,
        resourceScheme: resourceParts.scheme,
        resourceHost: resourceParts.host,
        resourcePath: resourceParts.path,
        dataType: classification.dataType,
        sensitivityLevel: classification.sensitivityLevel,
        sensitivityScore,
        tags: classification.tags,
        retentionDays: classification.retentionDays,
        requiresEncryption: classification.requiresEncryption,
        owner: ownerInfo.owner,
        department: ownerInfo.department,
        dataController: ownerInfo.dataController,
        isRegulated: classification.tags.includes('regulated'),
        isPii: classification.tags.includes('pii'),
        isPhi: classification.tags.includes('phi'),
        isFinancial: classification.tags.includes('financial'),
        isPublic: classification.sensitivityLevel === 'low',
        lineage: lineageInfo,
        accessFrequency,
        requiresAudit: classification.tags.includes('audit-required'),
        dataAge: this.estimateDataAge(resource)
      }
    };
  }

  private parseResourceUri(uri: string): ResourceParts {
    const match = uri.match(/^([^:]+):\/\/([^\/]+)(.*)$/);
    if (match) {
      return {
        scheme: match[1],
        host: match[2],
        path: match[3] || '/'
      };
    }
    return {
      scheme: 'unknown',
      host: 'unknown',
      path: uri
    };
  }

  private classifyResource(resource: string): ResourceClassification {
    // ルールベースの分類
    for (const rule of this.classificationRules) {
      if (rule.pattern.test(resource)) {
        return rule.classification;
      }
    }

    // デフォルト分類（開発環境では低リスクとして扱う）
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         resource.includes('tool:') || 
                         resource.includes('__');
    
    return {
      dataType: 'unclassified',
      sensitivityLevel: isDevelopment ? 'medium' : 'high',
      tags: ['unclassified', isDevelopment ? 'development' : 'review-required'],
      retentionDays: 90,
      requiresEncryption: !isDevelopment
    };
  }

  private getResourceOwner(resourceBase: string): ResourceOwner {
    return this.resourceOwners.get(resourceBase) || {
      owner: 'unknown',
      department: 'unknown',
      dataController: 'data-governance-team'
    };
  }

  private getDataLineage(resource: string): DataLineage {
    // 簡易的なデータ系譜情報（実際にはメタデータストアから取得）
    return {
      source: 'original-system',
      transformations: ['anonymized', 'aggregated'],
      lastModified: new Date().toISOString(),
      version: '1.0',
      dependencies: []
    };
  }

  private calculateAccessFrequency(resource: string): AccessFrequency {
    // 簡易的なアクセス頻度計算（実際にはログから集計）
    return {
      daily: Math.floor(Math.random() * 100),
      weekly: Math.floor(Math.random() * 500),
      monthly: Math.floor(Math.random() * 2000),
      trend: 'stable' // 'increasing', 'decreasing', 'stable'
    };
  }

  private calculateSensitivityScore(classification: ResourceClassification): number {
    const levelScores: Record<string, number> = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.5,
      'low': 0.2
    };

    let score = levelScores[classification.sensitivityLevel] || 0.5;

    // タグによる補正
    if (classification.tags.includes('pii')) score += 0.1;
    if (classification.tags.includes('phi')) score += 0.2;
    if (classification.tags.includes('financial')) score += 0.15;
    if (classification.tags.includes('regulated')) score += 0.1;

    return Math.min(1.0, score);
  }

  private estimateDataAge(resource: string): string {
    // リソースパスから推定（実際にはメタデータから取得）
    if (resource.includes('archive')) return 'archived';
    if (resource.includes('2024')) return 'recent';
    if (resource.includes('2023')) return 'last-year';
    return 'current';
  }

  /**
   * 分類ルールを追加
   */
  addClassificationRule(rule: ClassificationRule): void {
    this.classificationRules.push(rule);
  }

  /**
   * リソース所有者を登録
   */
  registerResourceOwner(resourceBase: string, owner: ResourceOwner): void {
    this.resourceOwners.set(resourceBase, owner);
  }
}

interface ResourceParts {
  scheme: string;
  host: string;
  path: string;
}

interface ClassificationRule {
  pattern: RegExp;
  classification: ResourceClassification;
}

interface ResourceClassification {
  dataType: string;
  sensitivityLevel: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  retentionDays: number;
  requiresEncryption: boolean;
}

interface ResourceOwner {
  owner: string;
  department: string;
  dataController: string;
}

interface DataLineage {
  source: string;
  transformations: string[];
  lastModified: string;
  version: string;
  dependencies: string[];
}

interface AccessFrequency {
  daily: number;
  weekly: number;
  monthly: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

// 互換性のためのエクスポート
export { ResourceClassifierEnricher as ResourceClassifier };