// ============================================================================
// AEGIS - AI判定エンジン（実装版）
// ============================================================================

import type { 
  DecisionContext, 
  PolicyDecision, 
  LLMConfig 
} from '../types/index.js';
import { OpenAILLM } from './openai-llm.js';
import { AnthropicLLM } from './anthropic-llm.js';

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
  private llm: OpenAILLM | AnthropicLLM;
  private decisionCache: LRUCache<string, PolicyDecision>;
  private promptTemplateCache = new Map<string, string>();
  private cacheCapacity: number;

  constructor(llmConfig: LLMConfig) {
    // Select LLM provider based on configuration
    console.error('[AI Judgment] Initializing with provider:', llmConfig.provider);
    switch (llmConfig.provider) {
      case 'anthropic':
        console.error('[AI Judgment] Using Anthropic Claude API for real AI judgment');
        this.llm = new AnthropicLLM(llmConfig);
        break;
      case 'openai':
      default:
        this.llm = new OpenAILLM(llmConfig);
        break;
    }
    
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
      
      // 7. 学習プロセス（非ブロッキング）
      this.learn(decision, context, naturalLanguagePolicy).catch(err => {
        console.error('[AI Judgment] Learning process failed:', err);
      });
      
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
    // timeをDateオブジェクトに変換
    const timeObj = context.time instanceof Date ? context.time : new Date(context.time);
    
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
- **時刻**: ${timeObj.toLocaleString('ja-JP')} (${this.getTimeContext(timeObj)})
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
${contexts.map((ctx, i) => {
  const timeObj = ctx.time instanceof Date ? ctx.time : new Date(ctx.time);
  return `
### 要求${i + 1}
- エージェント: ${ctx.agent}
- アクション: ${ctx.action}
- リソース: ${ctx.resource}
- 目的: ${ctx.purpose || '未指定'}
- 時刻: ${timeObj.toLocaleString('ja-JP')}
`;
}).join('\n')}

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
    // timeをDateオブジェクトに変換
    const timeObj = context.time instanceof Date ? context.time : new Date(context.time);
    const contextHash = this.hashString(JSON.stringify({
      agent: context.agent,
      action: context.action,
      resource: context.resource,
      purpose: context.purpose,
      timeHour: timeObj.getHours() // 時間は時単位でキャッシュ
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

  /**
   * ポリシーの解析（UI用）
   */
  async analyzePolicy(
    policy: string,
    context: DecisionContext
  ): Promise<any> {
    const prompt = `
あなたは自然言語ポリシーを解析するAIアシスタントです。
以下のポリシーを解析し、構造化された形式で解釈してください。

ポリシー:
${policy}

以下のJSON形式で回答してください:
{
  "type": "ポリシーのタイプ（アクセス制御、時間制限など）",
  "resources": ["対象リソースのリスト"],
  "timeRestrictions": "時間制限の説明",
  "agentRestrictions": "エージェント制限の説明",
  "constraints": ["適用される制約のリスト"],
  "obligations": ["実行される義務のリスト"]
}
`;

    try {
      const response = await this.llm.complete(prompt);
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      return JSON.parse(jsonMatch ? jsonMatch[1] : response);
    } catch (error) {
      console.error('[AI Judgment] ポリシー解析エラー', error);
      return {
        type: 'unknown',
        resources: [],
        timeRestrictions: '解析できませんでした',
        agentRestrictions: '解析できませんでした',
        constraints: [],
        obligations: []
      };
    }
  }

  // 汎用分析メソッド
  async analyze(prompt: string, options: any = {}): Promise<any> {
    try {
      const response = await this.llm.complete(prompt);
      
      if (options.responseFormat === 'json') {
        return this.parseJSONResponse(response);
      }
      
      return response;
    } catch (error) {
      console.error('[AI Analysis] Failed:', error);
      throw error;
    }
  }

  // 汎用生成メソッド
  async generate(prompt: string, options: any = {}): Promise<any> {
    try {
      const response = await this.llm.complete(prompt);
      
      if (options.responseFormat === 'json') {
        return this.parseJSONResponse(response);
      }
      
      return response;
    } catch (error) {
      console.error('[AI Generate] Failed:', error);
      throw error;
    }
  }

  // 学習メソッド（決定結果からパターンを学習）
  async learn(decision: PolicyDecision, context: DecisionContext, policy: string): Promise<void> {
    try {
      console.error('[AI Learn] Starting learning process...');
      
      // 1. 学習データの構築
      const learningEntry = {
        timestamp: new Date().toISOString(),
        policyHash: this.hashString(policy),
        context: {
          agent: context.agent,
          agentType: context.agentType,
          action: context.action,
          resource: context.resource,
          purpose: context.purpose,
          time: context.time,
          clearanceLevel: context.clearanceLevel
        },
        decision: {
          decision: decision.decision,
          confidence: decision.confidence,
          riskLevel: decision.riskLevel,
          reason: decision.reason
        },
        patterns: this.extractPatterns(context, decision)
      };
      
      // 2. 学習データの永続化
      await this.saveLearningData(learningEntry);
      
      // 3. パターンマッチングキャッシュの更新
      await this.updatePatternCache(learningEntry.patterns);
      
      // 4. しきい値調整の検討
      if (decision.confidence < 0.5 && decision.decision === "INDETERMINATE") {
        await this.adjustDecisionThresholds(learningEntry);
      }
      
      // 5. 将来的なファインチューニング用データの準備
      if (await this.shouldPrepareFinetuning()) {
        await this.prepareFinetuningData();
      }
      
      console.error('[AI Learn] Learning process completed');
    } catch (error) {
      console.error('[AI Learn] Learning failed:', error);
    }
  }
  
  // パターン抽出
  private extractPatterns(context: DecisionContext, decision: PolicyDecision): any {
    const timeObj = context.time instanceof Date ? context.time : new Date(context.time);
    const hour = timeObj.getHours();
    const isBusinessHours = hour >= 9 && hour < 18;
    
    return {
      timePattern: {
        hour,
        isBusinessHours,
        dayOfWeek: timeObj.getDay()
      },
      agentPattern: {
        type: context.agentType || 'unknown',
        hasHighClearance: typeof context.clearanceLevel === 'number' ? context.clearanceLevel >= 3 : false
      },
      resourcePattern: {
        type: this.classifyResource(context.resource),
        sensitivity: this.estimateSensitivity(context.resource)
      },
      decisionPattern: {
        wasPermitted: decision.decision === "PERMIT",
        confidence: decision.confidence,
        hadConstraints: decision.constraints && decision.constraints.length > 0
      }
    };
  }
  
  // リソース分類
  private classifyResource(resource: string): string {
    if (resource.includes('customer') || resource.includes('顧客')) return 'customer-data';
    if (resource.includes('financial') || resource.includes('財務')) return 'financial-data';
    if (resource.includes('employee') || resource.includes('従業員')) return 'employee-data';
    if (resource.includes('system') || resource.includes('システム')) return 'system-config';
    return 'general-data';
  }
  
  // 機密度推定
  private estimateSensitivity(resource: string): 'high' | 'medium' | 'low' {
    const highSensitivityKeywords = ['password', 'secret', 'key', 'token', '個人情報', '機密'];
    const mediumSensitivityKeywords = ['customer', 'financial', '顧客', '財務'];
    
    if (highSensitivityKeywords.some(kw => resource.toLowerCase().includes(kw))) {
      return 'high';
    }
    if (mediumSensitivityKeywords.some(kw => resource.toLowerCase().includes(kw))) {
      return 'medium';
    }
    return 'low';
  }
  
  // 学習データの保存
  private async saveLearningData(entry: any): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // 日付ベースのファイル名
    const date = new Date();
    const filename = `learning-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.jsonl`;
    const filepath = path.join('data', 'learning', filename);
    
    // ファイルに追記（JSON Lines形式）
    await fs.appendFile(filepath, JSON.stringify(entry) + '\n', 'utf8');
  }
  
  // パターンキャッシュの更新
  private async updatePatternCache(patterns: any): Promise<void> {
    const cacheKey = `pattern-${patterns.timePattern.isBusinessHours}-${patterns.resourcePattern.type}`;
    
    // 既存のパターン統計を取得（簡易実装）
    const existingStats = this.promptTemplateCache.get(cacheKey);
    const stats = existingStats ? JSON.parse(existingStats) : { permitCount: 0, denyCount: 0, total: 0 };
    
    // 統計を更新
    stats.total++;
    if (patterns.decisionPattern.wasPermitted) {
      stats.permitCount++;
    } else {
      stats.denyCount++;
    }
    
    // キャッシュに保存
    this.promptTemplateCache.set(cacheKey, JSON.stringify(stats));
  }
  
  // 決定しきい値の調整
  private async adjustDecisionThresholds(learningEntry: any): Promise<void> {
    console.error('[AI Learn] Low confidence detected, considering threshold adjustment');
    
    // 学習データから類似パターンを集計
    const similarPatterns = await this.findSimilarPatterns(learningEntry);
    
    if (similarPatterns.length > 10) {
      // 十分なデータがある場合、しきい値調整を検討
      const avgConfidence = similarPatterns.reduce((sum, p) => sum + p.decision.confidence, 0) / similarPatterns.length;
      console.error(`[AI Learn] Average confidence for similar patterns: ${avgConfidence}`);
    }
  }
  
  // 類似パターンの検索
  private async findSimilarPatterns(entry: any): Promise<any[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const readline = await import('readline');
    const { createReadStream } = await import('fs');
    
    const similarPatterns: any[] = [];
    const date = new Date();
    const filename = `learning-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.jsonl`;
    const filepath = path.join('data', 'learning', filename);
    
    try {
      // ファイルが存在するか確認
      await fs.access(filepath);
      
      const fileStream = createReadStream(filepath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (line) {
          const data = JSON.parse(line);
          // 類似性チェック（簡易版）
          if (data.patterns.resourcePattern.type === entry.patterns.resourcePattern.type &&
              data.patterns.timePattern.isBusinessHours === entry.patterns.timePattern.isBusinessHours) {
            similarPatterns.push(data);
          }
        }
      }
    } catch (error) {
      // ファイルが存在しない場合は空配列を返す
      console.error('[AI Learn] No learning data file found for today');
    }
    
    return similarPatterns;
  }
  
  // ファインチューニングの準備が必要かチェック
  private async shouldPrepareFinetuning(): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const learningDir = path.join('data', 'learning');
      const files = await fs.readdir(learningDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
      
      // 30日分以上のデータがある場合、ファインチューニングを検討
      return jsonlFiles.length > 30;
    } catch {
      return false;
    }
  }
  
  // ファインチューニング用データの準備
  private async prepareFinetuningData(): Promise<void> {
    console.error('[AI Learn] Preparing fine-tuning dataset...');
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const learningDir = path.join('data', 'learning');
      const files = await fs.readdir(learningDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort();
      
      const finetuningData: any[] = [];
      
      // 最新30ファイルからデータを収集
      for (const file of jsonlFiles.slice(-30)) {
        const content = await fs.readFile(path.join(learningDir, file), 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          if (line) {
            const entry = JSON.parse(line);
            // ファインチューニング用フォーマットに変換
            finetuningData.push({
              messages: [
                {
                  role: "system",
                  content: "あなたは企業のAIエージェント利用制御システムです。"
                },
                {
                  role: "user",
                  content: this.createFinetuningPrompt(entry)
                },
                {
                  role: "assistant",
                  content: JSON.stringify(entry.decision)
                }
              ]
            });
          }
        }
      }
      
      // ファインチューニング用データセットを保存
      const outputPath = path.join('data', 'learning', 'finetuning-dataset.jsonl');
      await fs.writeFile(
        outputPath,
        finetuningData.map(d => JSON.stringify(d)).join('\n'),
        'utf8'
      );
      
      console.error(`[AI Learn] Fine-tuning dataset prepared with ${finetuningData.length} examples`);
    } catch (error) {
      console.error('[AI Learn] Failed to prepare fine-tuning data:', error);
    }
  }
  
  // ファインチューニング用プロンプトの作成
  private createFinetuningPrompt(entry: any): string {
    return `エージェント ${entry.context.agent} が ${entry.context.resource} に対して ${entry.context.action} を実行しようとしています。時刻: ${entry.context.time}、目的: ${entry.context.purpose || '未指定'}`;
  }

  // パブリックメソッド：AI判定の実行
  async judge(context: DecisionContext, policyText?: string): Promise<PolicyDecision> {
    const policy = policyText || 'すべてのアクセスを適切に判定してください';
    return this.makeDecision(policy, context);
  }

  private parseJSONResponse(response: string): any {
    try {
      // JSON部分を抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // フォールバック：全体をパース
      return JSON.parse(response);
    } catch (error) {
      console.error('[AI Parse] Failed to parse JSON:', error);
      // デフォルトレスポンス
      return {};
    }
  }
}