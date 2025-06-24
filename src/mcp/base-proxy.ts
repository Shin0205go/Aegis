// ============================================================================
// AEGIS - MCP Policy Enforcement Point 基底クラス
// トランスポート共通のポリシー制御ロジック
// ============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { 
  DecisionContext, 
  AccessControlResult,
  AEGISConfig,
  PolicyDecision 
} from '../types/index.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { Logger } from '../utils/logger.js';
import { 
  ContextCollector,
  TimeBasedEnricher,
  AgentInfoEnricher,
  ResourceClassifierEnricher,
  SecurityInfoEnricher
} from '../context/index.js';
import { EnforcementSystem } from '../core/enforcement.js';
import { AdvancedAuditSystem } from '../audit/advanced-audit-system.js';
import { AuditDashboardDataProvider } from '../audit/audit-dashboard-data.js';
import { HybridPolicyEngine } from '../policy/hybrid-policy-engine.js';

export abstract class MCPPolicyProxyBase {
  protected server: Server;
  protected config: AEGISConfig;
  protected logger: Logger;
  protected judgmentEngine: AIJudgmentEngine | null;
  protected hybridPolicyEngine: HybridPolicyEngine;
  protected contextCollector: ContextCollector;
  protected enforcementSystem: EnforcementSystem;
  
  // Phase 3: 高度な監査システム
  protected advancedAuditSystem: AdvancedAuditSystem;
  protected auditDashboardProvider: AuditDashboardDataProvider;
  
  // ポリシー管理
  protected policies = new Map<string, string>();

  constructor(config: AEGISConfig, logger: Logger, judgmentEngine: AIJudgmentEngine | null) {
    this.config = config;
    this.logger = logger;
    this.judgmentEngine = judgmentEngine;
    
    // ハイブリッドポリシーエンジン初期化
    // @ts-ignore - judgmentEngineがnullの場合も許可
    this.hybridPolicyEngine = new HybridPolicyEngine(judgmentEngine, {
      useODRL: true,
      useAI: judgmentEngine !== null,
      aiThreshold: parseFloat(process.env.AEGIS_AI_THRESHOLD || '0.7'),
      cacheEnabled: true,
      cacheTTL: 300000 // 5分
    });
    
    // コンテキストコレクター初期化
    this.contextCollector = new ContextCollector();
    this.setupContextEnrichers();
    
    // 制約・義務実施システム初期化
    this.enforcementSystem = new EnforcementSystem();
    
    // Phase 3: 高度な監査システム初期化
    this.advancedAuditSystem = new AdvancedAuditSystem();
    
    this.auditDashboardProvider = new AuditDashboardDataProvider(
      this.advancedAuditSystem
    );
    
    // MCPサーバー作成
    this.server = new Server(
      {
        name: 'aegis-proxy',
        version: '1.0.0'
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {}
        }
      }
    );
  }

  /**
   * コンテキストエンリッチャーの設定（共通）
   */
  protected setupContextEnrichers(): void {
    // 時間ベースのエンリッチャー
    this.contextCollector.registerEnricher(new TimeBasedEnricher());
    this.logger.info('エンリッチャー登録: time-based');
    
    // エージェント情報エンリッチャー
    this.contextCollector.registerEnricher(new AgentInfoEnricher());
    this.logger.info('エンリッチャー登録: agent-info');
    
    // リソース分類エンリッチャー
    this.contextCollector.registerEnricher(new ResourceClassifierEnricher());
    this.logger.info('エンリッチャー登録: resource-classifier');
    
    // セキュリティ情報エンリッチャー
    this.contextCollector.registerEnricher(new SecurityInfoEnricher());
    this.logger.info('エンリッチャー登録: security-info');
    
    this.logger.info('Context enrichers registered successfully');
  }

  /**
   * 適用可能なポリシーの選択（共通ロジック）
   */
  protected async selectApplicablePolicy(context: DecisionContext): Promise<string | null> {
    // リソースタイプに基づいてポリシーを選択
    const resource = context.resource.toLowerCase();
    
    // Phase 2: 時間ベースのポリシー選択
    const currentHour = new Date().getHours();
    const isAfterHours = currentHour < 9 || currentHour >= 18;
    
    if (isAfterHours && this.policies.has('after-hours-policy')) {
      this.logger.info('After-hours policy selected');
      return 'after-hours-policy';
    }
    
    if (resource.includes('customer') || resource.includes('personal')) {
      return 'customer-data-policy';
    } else if (resource.includes('email') || resource.includes('mail')) {
      return 'email-access-policy';
    } else if (resource.includes('file') || resource.includes('document')) {
      return 'file-system-policy';
    } else if (context.action === 'delete' || context.action === 'modify' || 
               context.action === 'execute' || context.action === 'admin') {
      return 'high-risk-operations-policy';
    }
    
    return 'default-policy';
  }

  /**
   * 制約の適用（共通ロジック）
   */
  protected async applyConstraints(
    result: AccessControlResult,
    request: any,
    response: any
  ): Promise<any> {
    if (!result.constraints || result.constraints.length === 0) {
      return response;
    }

    let modifiedResponse = response;

    for (const constraint of result.constraints) {
      this.logger.info(`Applying constraint: ${constraint}`);
      
      // Phase 3: EnforcementSystemを使用して制約を適用
      try {
        // applyConstraintsはデータを直接返す
        modifiedResponse = await this.enforcementSystem.applyConstraints(
          [constraint],
          modifiedResponse,
          result.context as DecisionContext
        );
        
        this.logger.info(`Constraint applied successfully: ${constraint}`);
      } catch (error) {
        this.logger.error(`Failed to apply constraint ${constraint}:`, error);
        // 制約の適用に失敗した場合はアクセスを拒否
        throw new Error(`Constraint enforcement failed: ${constraint}`);
      }
    }

    return modifiedResponse;
  }

  /**
   * 義務の実行（共通ロジック）
   */
  protected async executeObligations(
    result: AccessControlResult,
    context: DecisionContext
  ): Promise<void> {
    if (!result.obligations || result.obligations.length === 0) {
      return;
    }

    // Phase 3: EnforcementSystemを使用して義務を実行
    try {
      // executeObligationsは戻り値なし
      await this.enforcementSystem.executeObligations(
        result.obligations,
        context,
        result as PolicyDecision
      );
      
      result.obligations.forEach((obligation) => {
        this.logger.info(`Obligation executed: ${obligation}`);
      });
    } catch (error) {
      this.logger.error('Failed to execute obligations:', error);
    }
  }

  /**
   * ポリシーの追加
   */
  addPolicy(name: string, policy: string): void {
    this.policies.set(name, policy);
    
    // HybridPolicyEngineにも追加
    try {
      this.hybridPolicyEngine.addPolicy({
        uid: `aegis:policy:${name}`,
        '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
        '@type': 'Policy',
        profile: 'https://aegis.example.com/odrl/profile',
        permission: [],
        naturalLanguageSource: policy
      });
      this.logger.info(`Policy added: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to add policy ${name} to hybrid engine:`, error);
    }
  }

  /**
   * パフォーマンス統計の取得（共通）
   */
  getSystemPerformanceStats(): {
    audit: any;
    cache?: any;
    batch?: any;
    anomaly?: any;
  } {
    return {
      audit: {} // 統計情報は現在未実装
    };
  }

  // 抽象メソッド（サブクラスで実装）
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  protected abstract setupHandlers(): void;
}