// ============================================================================
// AEGIS - Policy Conflict Resolver
// 複数ポリシーの競合解決メカニズム
// ============================================================================

import { 
  NaturalLanguagePolicyDefinition,
  PolicyDecision,
  DecisionContext
} from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';

export interface PolicyConflictResolution {
  finalDecision: PolicyDecision;
  appliedPolicies: Array<{
    policyId: string;
    policyName: string;
    decision: PolicyDecision;
    priority: number;
  }>;
  conflictDetails?: {
    conflictingPolicies: string[];
    resolutionMethod: 'priority' | 'consensus' | 'strict' | 'permissive';
    reason: string;
  };
}

export interface PolicyResolutionStrategy {
  name: string;
  resolve(decisions: Array<{
    policy: NaturalLanguagePolicyDefinition;
    decision: PolicyDecision;
  }>): PolicyDecision;
}

/**
 * ポリシー競合解決エンジン
 */
export class PolicyConflictResolver {
  private logger: Logger;
  private strategies = new Map<string, PolicyResolutionStrategy>();
  
  constructor() {
    this.logger = new Logger('PolicyResolver');
    this.initializeStrategies();
  }

  /**
   * 標準的な解決戦略を初期化
   */
  private initializeStrategies(): void {
    // 優先度ベースの解決戦略
    this.strategies.set('priority', {
      name: 'Priority-Based Resolution',
      resolve: (decisions) => {
        // 優先度が最も高いポリシーの判定を採用
        const sorted = decisions.sort((a, b) => 
          (b.policy.metadata.priority || 0) - (a.policy.metadata.priority || 0)
        );
        return sorted[0].decision;
      }
    });

    // 最も厳格な判定を採用する戦略
    this.strategies.set('strict', {
      name: 'Most Restrictive Resolution',
      resolve: (decisions) => {
        // DENY > INDETERMINATE > PERMIT の順で厳格
        const hasDeny = decisions.some(d => d.decision.decision === 'DENY');
        if (hasDeny) {
          const denyDecision = decisions.find(d => d.decision.decision === 'DENY');
          return denyDecision!.decision;
        }
        
        const hasIndeterminate = decisions.some(d => d.decision.decision === 'INDETERMINATE');
        if (hasIndeterminate) {
          const indeterminateDecision = decisions.find(d => d.decision.decision === 'INDETERMINATE');
          return indeterminateDecision!.decision;
        }
        
        return decisions[0].decision;
      }
    });

    // 最も寛容な判定を採用する戦略
    this.strategies.set('permissive', {
      name: 'Most Permissive Resolution',
      resolve: (decisions) => {
        // PERMIT > INDETERMINATE > DENY の順で寛容
        const hasPermit = decisions.some(d => d.decision.decision === 'PERMIT');
        if (hasPermit) {
          const permitDecision = decisions.find(d => d.decision.decision === 'PERMIT');
          return permitDecision!.decision;
        }
        
        const hasIndeterminate = decisions.some(d => d.decision.decision === 'INDETERMINATE');
        if (hasIndeterminate) {
          const indeterminateDecision = decisions.find(d => d.decision.decision === 'INDETERMINATE');
          return indeterminateDecision!.decision;
        }
        
        return decisions[0].decision;
      }
    });

    // コンセンサスベースの解決戦略
    this.strategies.set('consensus', {
      name: 'Consensus-Based Resolution',
      resolve: (decisions) => {
        // 多数決で判定
        const votes = {
          PERMIT: 0,
          DENY: 0,
          INDETERMINATE: 0
        };
        
        decisions.forEach(d => {
          votes[d.decision.decision]++;
        });
        
        // 最も多い判定を採用
        const maxVotes = Math.max(...Object.values(votes));
        const winner = Object.entries(votes).find(([_, count]) => count === maxVotes);
        
        if (winner) {
          const winningDecision = decisions.find(d => d.decision.decision === winner[0]);
          if (winningDecision) {
            return {
              ...winningDecision.decision,
              reason: `Consensus decision: ${winner[0]} (${winner[1]}/${decisions.length} policies)`
            };
          }
        }
        
        // 同票の場合は優先度で決定
        return this.strategies.get('priority')!.resolve(decisions);
      }
    });
  }

  /**
   * 複数のポリシー判定結果を解決
   */
  async resolveConflicts(
    decisions: Array<{
      policy: NaturalLanguagePolicyDefinition;
      decision: PolicyDecision;
    }>,
    strategy: string = 'priority'
  ): Promise<PolicyConflictResolution> {
    this.logger.info(`Resolving conflicts among ${decisions.length} policies using ${strategy} strategy`);

    // 競合があるかチェック
    const uniqueDecisions = new Set(decisions.map(d => d.decision.decision));
    const hasConflict = uniqueDecisions.size > 1;

    // 選択された戦略で解決
    const resolver = this.strategies.get(strategy) || this.strategies.get('priority')!;
    const finalDecision = resolver.resolve(decisions);

    // 結果を構築
    const resolution: PolicyConflictResolution = {
      finalDecision,
      appliedPolicies: decisions.map(d => ({
        policyId: d.policy.metadata.id,
        policyName: d.policy.name,
        decision: d.decision,
        priority: d.policy.metadata.priority || 0
      }))
    };

    // 競合がある場合は詳細を追加
    if (hasConflict) {
      const conflictingPolicies = decisions
        .filter(d => d.decision.decision !== finalDecision.decision)
        .map(d => d.policy.name);

      resolution.conflictDetails = {
        conflictingPolicies,
        resolutionMethod: strategy as any,
        reason: `Resolved using ${resolver.name} strategy`
      };

      this.logger.warn(
        `Policy conflict detected: ${uniqueDecisions.size} different decisions. ` +
        `Resolved to ${finalDecision.decision} using ${strategy} strategy`
      );
    }

    return resolution;
  }

  /**
   * カスタム解決戦略を追加
   */
  addStrategy(name: string, strategy: PolicyResolutionStrategy): void {
    this.strategies.set(name, strategy);
    this.logger.info(`Added custom resolution strategy: ${name}`);
  }

  /**
   * 利用可能な解決戦略のリストを取得
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 推奨される解決戦略を提案
   */
  suggestStrategy(context: DecisionContext): string {
    // リソースの種類に基づいて戦略を提案
    if (context.resource.includes('sensitive') || 
        context.resource.includes('confidential') ||
        context.resource.includes('.env') ||
        context.resource.includes('secret')) {
      return 'strict'; // 機密リソースには厳格な戦略
    }
    
    if (context.action === 'read' && !context.resource.includes('private')) {
      return 'permissive'; // 一般的な読み取りには寛容な戦略
    }
    
    if (context.action === 'delete' || context.action === 'write') {
      return 'strict'; // 破壊的操作には厳格な戦略
    }
    
    // デフォルトは優先度ベース
    return 'priority';
  }
}

/**
 * ポリシー適用フィルター
 */
export class PolicyApplicabilityFilter {
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger('PolicyFilter');
  }

  /**
   * コンテキストに適用可能なポリシーをフィルタリング
   */
  filterApplicablePolicies(
    policies: NaturalLanguagePolicyDefinition[],
    context: DecisionContext
  ): NaturalLanguagePolicyDefinition[] {
    return policies.filter(policy => {
      // タグベースのフィルタリング
      if (policy.metadata.tags && policy.metadata.tags.length > 0) {
        // filesystem タグがある場合、ファイルシステム関連のアクセスのみ適用
        if (policy.metadata.tags.includes('filesystem') && 
            !context.resource.startsWith('/') && 
            !context.resource.includes('file')) {
          return false;
        }
        
        // api タグがある場合、API関連のアクセスのみ適用
        if (policy.metadata.tags.includes('api') && 
            !context.resource.includes('api') && 
            !context.resource.includes('http')) {
          return false;
        }
      }
      
      // ステータスチェック
      if (policy.metadata.status !== 'active') {
        this.logger.debug(`Skipping inactive policy: ${policy.name}`);
        return false;
      }
      
      return true;
    });
  }

  /**
   * ポリシーの適用条件をチェック
   */
  checkPolicyConditions(
    policy: NaturalLanguagePolicyDefinition,
    context: DecisionContext
  ): boolean {
    // 時間ベースの条件チェック
    if (policy.conditions?.timeRange) {
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour < policy.conditions.timeRange.start || 
          currentHour >= policy.conditions.timeRange.end) {
        return false;
      }
    }
    
    // エージェントタイプの条件チェック
    if (policy.conditions?.agentTypes && 
        !policy.conditions.agentTypes.includes(context.environment.agentType)) {
      return false;
    }
    
    // リソースパターンの条件チェック
    if (policy.conditions?.resourcePatterns) {
      const matches = policy.conditions.resourcePatterns.some(pattern => {
        const regex = new RegExp(pattern);
        return regex.test(context.resource);
      });
      
      if (!matches) {
        return false;
      }
    }
    
    return true;
  }
}