// ============================================================================
// AEGIS - Policy Enforcer
// ポリシー判定処理を責務ごとに分離
// ============================================================================

import type { 
  DecisionContext, 
  AccessControlResult,
  PolicyDecision 
} from '../types/index.js';
import type {
  IContextCollector,
  IIntelligentCacheSystem,
  IAIPolicyEngine,
  IAdvancedAuditSystem,
  IRealTimeAnomalyDetector,
  IPolicyLoader
} from '../types/component-interfaces.js';
import { Logger } from '../utils/logger.js';
import { TIMEOUTS, ERROR_MESSAGES } from '../constants/index.js';

export class PolicyEnforcer {
  constructor(
    private logger: Logger,
    private contextCollector: IContextCollector,
    private intelligentCacheSystem: IIntelligentCacheSystem | null,
    private aiPolicyEngine: IAIPolicyEngine,
    private advancedAuditSystem: IAdvancedAuditSystem,
    private realTimeAnomalyDetector: IRealTimeAnomalyDetector | null
  ) {}

  /**
   * ポリシー判定の実行（メインメソッド）
   */
  async enforcePolicy(
    action: string, 
    resource: string, 
    context: Record<string, any>,
    policyLoader?: IPolicyLoader
  ): Promise<AccessControlResult> {
    const startTime = Date.now();
    
    try {
      // 1. コンテキストの準備
      const enrichedContext = await this.prepareContext(action, resource, context);
      
      // 2. ポリシーの選択
      const policy = await this.selectPolicy(enrichedContext, policyLoader);
      
      // 3. キャッシュチェック
      const cachedResult = await this.checkCache(enrichedContext, policy);
      if (cachedResult) {
        await this.recordAudit(enrichedContext, cachedResult, 'cached-result', startTime);
        return {
          ...cachedResult,
          processingTime: Date.now() - startTime,
          policyUsed: policy || 'default-policy'
        } as AccessControlResult;
      }
      
      // 4. ポリシー判定の実行
      const decision = await this.executeDecision(enrichedContext, policy);
      
      // 5. 結果の処理
      const result = this.processResult(decision, startTime, policy);
      
      // 6. 監査とキャッシュ
      await this.postProcess(enrichedContext, result, policy);
      
      return result;
    } catch (error) {
      this.logger.error('Policy enforcement error:', error);
      throw error;
    }
  }

  /**
   * コンテキストの準備と拡張
   */
  private async prepareContext(
    action: string,
    resource: string,
    context: Record<string, any>
  ): Promise<DecisionContext> {
    const baseContext: DecisionContext = {
      agent: context.agent || 'mcp-client',
      action,
      resource,
      purpose: context.request?.params?.purpose || 'general-operation',
      time: new Date(),
      environment: {
        transport: context.transport || 'stdio',
        ...context
      }
    };
    
    return await this.contextCollector.enrichContext(baseContext);
  }

  /**
   * 適用するポリシーの選択
   */
  private async selectPolicy(
    context: DecisionContext,
    policyLoader?: IPolicyLoader
  ): Promise<string | null> {
    if (!policyLoader) {
      return null;
    }

    const activePolicies = policyLoader.getActivePolicies();
    if (activePolicies.length === 0) {
      this.logger.warn('No active policies found, using default policy');
      return null;
    }

    // コンテキストベースのポリシー選択ロジック
    const selectedPolicy = this.selectBestMatchingPolicy(context, activePolicies);
    
    if (selectedPolicy) {
      this.logger.info(`Selected policy: ${selectedPolicy.name} (priority: ${selectedPolicy.metadata.priority}) based on context`, {
        agent: context.agent,
        action: context.action,
        resource: context.resource,
        matchReason: this.getMatchReason(context, selectedPolicy)
      });
      
      // フォーマット済みポリシーテキストを取得
      const formattedPolicy = policyLoader.formatPolicyForAI(selectedPolicy);
      
      // デバッグ用にフォーマット済みポリシーの一部をログ出力
      this.logger.debug('Formatted policy for AI:', {
        policyId: selectedPolicy.id,
        policyName: selectedPolicy.name,
        policyPreview: formattedPolicy.substring(0, 200) + '...'
      });
      
      return formattedPolicy;
    }

    // フォールバック: 優先度が最も高いポリシーを使用
    const fallbackPolicy = activePolicies[0];
    this.logger.info(`Using fallback policy: ${fallbackPolicy.name} (priority: ${fallbackPolicy.metadata.priority})`);
    return policyLoader.formatPolicyForAI(fallbackPolicy);
  }

  /**
   * コンテキストに最も適したポリシーを選択
   */
  private selectBestMatchingPolicy(
    context: DecisionContext,
    policies: any[]
  ): any | null {
    // 0. 開発ディレクトリの判定（最優先）
    if (this.isDevelopDirectory(context.resource)) {
      const devPolicy = policies.find(p => 
        p.id === 'dev-permissive-policy' ||
        p.metadata.tags?.includes('develop-directory')
      );
      if (devPolicy) {
        this.logger.info('Using development policy for ~/Develop directory access');
        return devPolicy;
      }
    }
    
    // 1. 時間ベースの選択
    const currentHour = new Date().getHours();
    const isAfterHours = currentHour < 8 || currentHour >= 18;
    
    if (isAfterHours) {
      const afterHoursPolicy = policies.find(p => 
        p.id === 'after-hours-policy' || 
        p.metadata.tags?.includes('after-hours')
      );
      if (afterHoursPolicy) return afterHoursPolicy;
    }

    // 2. エージェントベースの選択
    if (context.agent === 'claude-desktop' || context.agent === 'mcp-client') {
      const claudePolicy = policies.find(p => 
        p.id === 'claude-desktop-policy' ||
        p.metadata.tags?.includes('claude-desktop')
      );
      if (claudePolicy) return claudePolicy;
    }

    // 3. アクション/リソースベースの選択
    const { action, resource } = context;
    
    // 高リスク操作の判定
    const isHighRiskAction = this.isHighRiskAction(action, resource);
    if (isHighRiskAction) {
      const highRiskPolicy = policies.find(p => 
        p.id === 'high-risk-operations-policy' ||
        p.metadata.tags?.includes('high-risk')
      );
      if (highRiskPolicy) return highRiskPolicy;
    }

    // ツール実行の判定
    if (action === 'tools/call' || resource.startsWith('tool:')) {
      const toolPolicy = policies.find(p => 
        p.id === 'tool-control-policy' ||
        p.metadata.tags?.includes('tools') ||
        p.metadata.tags?.includes('mcp')
      );
      if (toolPolicy) return toolPolicy;
    }

    // ファイルシステムアクセスの判定
    if (this.isFileSystemAccess(action, resource)) {
      const filePolicy = policies.find(p => 
        p.id === 'file-system-policy' ||
        p.metadata.tags?.includes('files') ||
        p.metadata.tags?.includes('filesystem')
      );
      if (filePolicy) return filePolicy;
    }

    // 顧客データアクセスの判定
    if (this.isCustomerDataAccess(resource)) {
      const customerPolicy = policies.find(p => 
        p.id === 'customer-data-policy' ||
        p.metadata.tags?.includes('customer-data')
      );
      if (customerPolicy) return customerPolicy;
    }

    // メールアクセスの判定
    if (resource.includes('gmail') || resource.includes('email')) {
      const emailPolicy = policies.find(p => 
        p.id === 'email-access-policy' ||
        p.metadata.tags?.includes('email')
      );
      if (emailPolicy) return emailPolicy;
    }

    // 開発環境の判定
    if (context.environment?.isDevelopment || process.env.NODE_ENV === 'development') {
      const devPolicy = policies.find(p => 
        p.id === 'dev-permissive-policy' ||
        p.metadata.tags?.includes('development')
      );
      if (devPolicy) return devPolicy;
    }

    return null;
  }

  /**
   * ポリシー選択理由の取得
   */
  private getMatchReason(context: DecisionContext, policy: any): string {
    const reasons: string[] = [];

    // 開発ポリシー
    if (policy.id === 'dev-permissive-policy' || policy.metadata.tags?.includes('develop-directory')) {
      if (this.isDevelopDirectory(context.resource)) {
        reasons.push('~/Develop directory access - permissive policy');
      } else {
        reasons.push('development mode - permissive policy');
      }
    }

    // 時間ベース
    const currentHour = new Date().getHours();
    if ((currentHour < 8 || currentHour >= 18) && 
        (policy.id === 'after-hours-policy' || policy.metadata.tags?.includes('after-hours'))) {
      reasons.push('after-hours access');
    }

    // エージェントベース
    if ((context.agent === 'claude-desktop' || context.agent === 'mcp-client') &&
        (policy.id === 'claude-desktop-policy' || policy.metadata.tags?.includes('claude-desktop'))) {
      reasons.push('Claude Desktop agent');
    }

    // リスクベース
    if (this.isHighRiskAction(context.action, context.resource) &&
        (policy.id === 'high-risk-operations-policy' || policy.metadata.tags?.includes('high-risk'))) {
      reasons.push('high-risk operation');
    }

    // リソースタイプベース
    if (context.resource.includes('gmail') || context.resource.includes('email')) {
      reasons.push('email resource access');
    } else if (this.isFileSystemAccess(context.action, context.resource)) {
      reasons.push('file system access');
    } else if (context.action === 'tools/call') {
      reasons.push('tool execution');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'default selection';
  }

  /**
   * 高リスクアクションの判定
   */
  private isHighRiskAction(action: string, resource: string): boolean {
    const highRiskPatterns = [
      /delete|remove|destroy/i,
      /admin|root|sudo/i,
      /system|config/i,
      /database|db/i,
      /credential|password|key/i,
      /exec|execute|bash|shell|cmd/i
    ];

    return highRiskPatterns.some(pattern => 
      pattern.test(action) || pattern.test(resource)
    );
  }

  /**
   * ファイルシステムアクセスの判定
   */
  private isFileSystemAccess(action: string, resource: string): boolean {
    const filePatterns = [
      /^(Read|Write|Edit|Delete|Create)$/,
      /file|dir|path|folder/i,
      /\.txt|\.json|\.xml|\.csv|\.log/i
    ];

    return filePatterns.some(pattern => 
      pattern.test(action) || pattern.test(resource)
    );
  }

  /**
   * 顧客データアクセスの判定
   */
  private isCustomerDataAccess(resource: string): boolean {
    const customerPatterns = [
      /customer|client|user/i,
      /personal|private/i,
      /pii|gdpr/i
    ];

    return customerPatterns.some(pattern => pattern.test(resource));
  }

  /**
   * 開発ディレクトリアクセスの判定
   */
  private isDevelopDirectory(resource: string): boolean {
    // リソースパスを正規化
    const normalizedPath = resource.replace(/^file:\/\//, '').replace(/^\//, '');
    
    // ホームディレクトリのパスパターン
    const homeDir = process.env.HOME || '/Users/shingo';
    const developPaths = [
      `${homeDir}/Develop/`,
      '/Users/shingo/Develop/',
      'Develop/',
      '~/Develop/'
    ];
    
    // history-mcp などの開発関連ツールも含める
    const developTools = [
      'history-mcp',
      'conversation-mcp',
      'aegis-',
      'filesystem__',  // filesystem MCPツール
      'execution-server__'  // execution MCPツール
    ];
    
    // パスチェック
    const isInDevelopDir = developPaths.some(path => 
      resource.includes(path) || normalizedPath.startsWith(path.replace('~/', ''))
    );
    
    // ツールチェック
    const isDevelopTool = developTools.some(tool => resource.includes(tool));
    
    const result = isInDevelopDir || isDevelopTool;
    
    // デバッグログ追加
    this.logger.debug('isDevelopDirectory check:', {
      resource,
      normalizedPath,
      isInDevelopDir,
      isDevelopTool,
      result
    });
    
    return result;
  }

  /**
   * キャッシュからの結果取得
   */
  private async checkCache(
    context: DecisionContext,
    policy: string | null
  ): Promise<PolicyDecision | null> {
    if (!this.intelligentCacheSystem) return null;
    
    const cachedResult = await this.intelligentCacheSystem.get(
      context, 
      policy || '', 
      context.environment
    );
    
    if (cachedResult) {
      this.logger.debug('Using cached decision result', {
        action: context.action,
        resource: context.resource,
        decision: cachedResult.decision,
        confidence: cachedResult.confidence
      });
    }
    
    return cachedResult;
  }

  /**
   * ポリシー判定の実行
   */
  private async executeDecision(
    context: DecisionContext,
    policy: string | null
  ): Promise<PolicyDecision> {
    const timeoutPromise = new Promise<PolicyDecision>((_, reject) => {
      setTimeout(() => reject(new Error('Policy decision timeout')), TIMEOUTS.POLICY_DECISION);
    });
    
    const decisionPromise = this.aiPolicyEngine.decide(context, policy || undefined);
    
    return await Promise.race([decisionPromise, timeoutPromise]);
  }

  /**
   * 判定結果の処理
   */
  private processResult(
    decision: PolicyDecision,
    startTime: number,
    policy: string | null
  ): AccessControlResult {
    return {
      ...decision,
      processingTime: Date.now() - startTime,
      policyUsed: policy ? 'custom-policy' : 'default-policy',
      context: undefined  // context is optional in AccessControlResult
    };
  }

  /**
   * 後処理（監査、キャッシュ、異常検知）
   */
  private async postProcess(
    context: DecisionContext,
    result: AccessControlResult,
    policy: string | null
  ): Promise<void> {
    // 並列実行可能な処理
    await Promise.all([
      this.recordAudit(context, result, policy || 'default', Date.now() - result.processingTime),
      this.updateCache(context, result, policy),
      this.detectAnomalies(context, result)
    ]);
  }

  /**
   * 監査ログの記録
   */
  private async recordAudit(
    context: DecisionContext,
    decision: PolicyDecision,
    policyName: string,
    startTime: number
  ): Promise<void> {
    try {
      const outcome = decision.decision === 'PERMIT' ? 'SUCCESS' : 
                     decision.decision === 'DENY' ? 'FAILURE' : 'ERROR';
      
      await this.advancedAuditSystem.recordAuditEntry(
        context,
        decision,
        policyName,
        Date.now() - startTime,
        outcome,
        {
          requestType: context.action,
          resourcePath: context.resource,
          transport: context.environment?.transport || 'unknown'
        }
      );
    } catch (error) {
      this.logger.error('Failed to record audit entry', error);
    }
  }

  /**
   * キャッシュの更新
   */
  private async updateCache(
    context: DecisionContext,
    result: AccessControlResult,
    policy: string | null
  ): Promise<void> {
    if (!this.intelligentCacheSystem) return;
    
    try {
      await this.intelligentCacheSystem.set(
        context,
        policy || '',
        result,
        context.environment
      );
      
      this.logger.debug('Decision result cached', {
        action: context.action,
        resource: context.resource,
        decision: result.decision
      });
    } catch (error) {
      this.logger.error('Failed to cache decision result', error);
    }
  }

  /**
   * 異常検知
   */
  private async detectAnomalies(
    context: DecisionContext,
    result: AccessControlResult
  ): Promise<void> {
    if (!this.realTimeAnomalyDetector) return;
    
    try {
      await this.realTimeAnomalyDetector.analyzeDecision(
        context,
        result,
        {
          timestamp: new Date(),
          source: 'policy-enforcement'
        }
      );
    } catch (error) {
      this.logger.error('Failed to analyze decision for anomalies', error);
    }
  }
}