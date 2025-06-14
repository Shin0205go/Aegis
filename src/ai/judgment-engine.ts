// ============================================================================
// AEGIS - AI判定エンジン（実装版）
// ============================================================================

import type { 
  DecisionContext, 
  PolicyDecision, 
  LLMConfig 
} from '../types/index.js';
import { OpenAILLM } from './openai-llm.js';

interface LRUCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
}

class SimpleLRUCache<K, V> implements LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
}

export class AIJudgmentEngine {
  private llm: OpenAILLM;
  private decisionCache: LRUCache<string, PolicyDecision>;
  private promptTemplateCache = new Map<string, string>();
  private cacheCapacity: number;

  constructor(llmConfig: LLMConfig) {
    this.llm = new OpenAILLM(llmConfig);
    this.cacheCapacity = 1000;
    this.decisionCache = new SimpleLRUCache<string, PolicyDecision>(this.cacheCapacity);
  }

  // メイン判定メソッド
  async makeDecision(
    naturalLanguagePolicy: string,
    context: DecisionContext,
    additionalContext?: Record<string, any>
  ): Promise<PolicyDecision> {
    
    try {
      // 1. キャッシュチェック
      const cacheKey = this.generateCacheKey(naturalLanguagePolicy, context);
      const cachedDecision = this.decisionCache.get(cacheKey);
      if (cachedDecision) {
        console.error('[AI Judgment] Using cached decision');
        return cachedDecision;
      }

      // 2. ポリシー分析プロンプト生成
      const analysisPrompt = this.buildAnalysisPrompt(naturalLanguagePolicy, context);
      
      // 3. AI判定実行
      console.error('[AI Judgment] Executing AI decision...');
      const rawResponse = await this.llm.complete(analysisPrompt);
      
      // 4. 結果パース・検証
      const decision = this.parseAndValidateDecision(rawResponse);
      
      // 5. キャッシュ保存
      this.decisionCache.set(cacheKey, decision);
      
      // 6. ログ記録
      this.logDecision(context, decision, naturalLanguagePolicy);
      
      return decision;
    } catch (error) {
      console.error('[AI Judgment] Decision error:', error);
      return {
        decision: "INDETERMINATE",
        reason: `AI判定エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.0,
        riskLevel: "HIGH",
        constraints: ["手動確認が必要"],
        obligations: ["システム管理者に報告"],
        monitoringRequirements: ["AI判定エラーとして記録"],
        metadata: { aiError: true }
      };
    }
  }

  // ポリシー分析プロンプト構築
  private buildAnalysisPrompt(policy: string, context: DecisionContext): string {
    return `
# AI利用制御判定システム

あなたは企業のAIエージェント利用制御システムです。以下のポリシーに基づいて、アクセス要求を厳密に判定してください。

## 適用ポリシー
\`\`\`
${policy}
\`\`\`

## 判定対象の要求
- **エージェント**: ${context.agent} (タイプ: ${context.agentType || '不明'})
- **要求アクション**: ${context.action}
- **対象リソース**: ${context.resource}
- **業務目的**: ${context.purpose || '未指定'}
- **時刻**: ${context.time.toLocaleString('ja-JP')} (${this.getTimeContext(context.time)})
- **場所**: ${context.location || '不明'}
- **クリアランスレベル**: ${context.clearanceLevel || '不明'}
- **過去の違反履歴**: ${context.violationHistory || 'なし'}

## 環境情報
\`\`\`json
${JSON.stringify(context.environment, null, 2)}
\`\`\`

## 判定要件
1. ポリシーを詳細に分析し、要求が適合するかを判定
2. セキュリティリスクを評価
3. 必要な制約や義務を特定
4. 信頼度スコアを算出（0.0-1.0）

## 応答形式
以下のJSON形式で厳密に回答してください：

\`\`\`json
{
  "decision": "PERMIT" | "DENY" | "INDETERMINATE",
  "reason": "判定理由の詳細説明（ポリシーの該当部分を引用）",
  "confidence": 0.85,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "constraints": [
    "適用すべき制約条件があれば配列で列挙"
  ],
  "obligations": [
    "実行すべき義務があれば配列で列挙"
  ],
  "monitoringRequirements": [
    "監視要件があれば配列で列挙"
  ],
  "validityPeriod": "判定の有効期間（ISO8601形式）",
  "metadata": {
    "policySection": "該当するポリシー箇所",
    "alternatives": "代替案があれば記載",
    "escalationRequired": true/false
  }
}
\`\`\`

判定を開始してください：
`;
  }

  // 時間的コンテキスト取得
  private getTimeContext(time: Date): string {
    const hour = time.getHours();
    const day = time.getDay();
    const isWeekend = day === 0 || day === 6;
    const isBusinessHours = !isWeekend && hour >= 9 && hour < 18;
    
    if (isBusinessHours) return "営業時間内";
    if (isWeekend) return "週末";
    return "営業時間外";
  }

  // 結果パース・検証
  private parseAndValidateDecision(rawResponse: string): PolicyDecision {
    try {
      const jsonMatch = rawResponse.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawResponse;
      
      const parsed = JSON.parse(jsonStr);
      
      // 必須フィールド検証
      if (!["PERMIT", "DENY", "INDETERMINATE"].includes(parsed.decision)) {
        throw new Error("Invalid decision value");
      }
      
      if (!parsed.reason || typeof parsed.reason !== 'string') {
        throw new Error("Reason is required");
      }
      
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error("Invalid confidence score");
      }
      
      return {
        decision: parsed.decision,
        reason: parsed.reason,
        confidence: parsed.confidence,
        riskLevel: parsed.riskLevel || "MEDIUM",
        constraints: parsed.constraints || [],
        obligations: parsed.obligations || [],
        monitoringRequirements: parsed.monitoringRequirements || [],
        validityPeriod: parsed.validityPeriod,
        metadata: parsed.metadata || {}
      };
      
    } catch (error) {
      console.error('[AI Judgment] Parse error:', error);
      return {
        decision: "INDETERMINATE",
        reason: `判定処理エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.0,
        riskLevel: "HIGH",
        constraints: ["手動確認が必要"],
        obligations: ["システム管理者に報告"],
        monitoringRequirements: ["異常判定として記録"],
        metadata: { parseError: true }
      };
    }
  }

  // バッチ判定（複数要求の効率的処理）
  async batchDecision(
    policy: string,
    contexts: DecisionContext[]
  ): Promise<PolicyDecision[]> {
    
    const batchPrompt = `
# AI利用制御バッチ判定システム

以下のポリシーに基づいて、複数のアクセス要求を同時に判定してください。

## 適用ポリシー
\`\`\`
${policy}
\`\`\`

## 判定対象（${contexts.length}件）
${contexts.map((ctx, i) => `
### 要求${i + 1}
- エージェント: ${ctx.agent}
- アクション: ${ctx.action}
- リソース: ${ctx.resource}
- 目的: ${ctx.purpose || '未指定'}
- 時刻: ${ctx.time.toLocaleString('ja-JP')}
`).join('\n')}

## 応答形式
各要求について前述のJSON形式で判定し、配列として返してください：

\`\`\`json
[
  { /* 要求1の判定結果 */ },
  { /* 要求2の判定結果 */ },
  ...
]
\`\`\`
`;

    const response = await this.llm.complete(batchPrompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
    const results = JSON.parse(jsonMatch ? jsonMatch[1] : response);
    
    return results.map((result: any, index: number) => 
      this.parseAndValidateDecision(JSON.stringify(result))
    );
  }

  // キャッシュキー生成
  private generateCacheKey(policy: string, context: DecisionContext): string {
    const policyHash = this.hashString(policy);
    const contextHash = this.hashString(JSON.stringify({
      agent: context.agent,
      action: context.action,
      resource: context.resource,
      purpose: context.purpose,
      timeHour: context.time.getHours() // 時間は時単位でキャッシュ
    }));
    
    return `${policyHash}-${contextHash}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return Math.abs(hash).toString(36);
  }

  private logDecision(context: DecisionContext, decision: PolicyDecision, policy: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      context: {
        agent: context.agent,
        action: context.action,
        resource: context.resource
      },
      decision: decision.decision,
      confidence: decision.confidence,
      riskLevel: decision.riskLevel,
      reason: decision.reason.substring(0, 200), // ログサイズ制限
      policyHash: this.hashString(policy)
    };
    
    console.error(`[AI_JUDGMENT] ${JSON.stringify(logEntry)}`);
  }

  // 判定統計情報取得
  getStats(): { cacheHitRate: number; totalDecisions: number } {
    // 簡易実装（実際はより詳細な統計を管理）
    return {
      cacheHitRate: 0.25, // モック値
      totalDecisions: 100  // モック値
    };
  }

  // キャッシュクリア
  clearCache(): void {
    this.decisionCache = new SimpleLRUCache(this.cacheCapacity);
  }

  // エイリアス（互換性のため）
  makeDecisionBatch = this.batchDecision;
}