/**
 * AI-Powered Natural Language to ODRL Converter Extensions
 * Enhances the NLToODRLConverter with advanced AI capabilities
 */

import { AIJudgmentEngine } from '../ai/judgment-engine';
import { AEGISPolicy, Rule, Constraint } from './types';
import { logger } from '../utils/logger';

export interface AIConversionPrompt {
  naturalLanguage: string;
  examples?: Array<{
    input: string;
    output: AEGISPolicy;
  }>;
  hints?: string[];
}

export interface AIAnalysisResult {
  timeRestrictions?: string;
  agentRestrictions?: string;
  resources?: string[];
  constraints?: string[];
  obligations?: string[];
  actions?: string[];
  confidence: number;
  reasoning?: string;
}

export class AIConverterExtension {
  constructor(private aiEngine: AIJudgmentEngine) {}

  /**
   * Analyze natural language policy using AI
   */
  async analyzePolicy(nlPolicy: string): Promise<AIAnalysisResult> {
    const prompt = this.buildAnalysisPrompt(nlPolicy);
    
    try {
      const response = await this.aiEngine.analyze(prompt, {
        temperature: 0.3, // Low temperature for consistent analysis
        maxTokens: 1000,
        responseFormat: 'json'
      });

      return this.parseAnalysisResponse(response);
    } catch (error) {
      logger.error('AI policy analysis failed', error);
      throw error;
    }
  }

  /**
   * Generate ODRL policy using AI
   */
  async generateODRLPolicy(nlPolicy: string, analysis: AIAnalysisResult): Promise<AEGISPolicy> {
    const prompt = this.buildGenerationPrompt(nlPolicy, analysis);
    
    try {
      const response = await this.aiEngine.generate(prompt, {
        temperature: 0.2,
        maxTokens: 2000,
        responseFormat: 'json'
      });

      const odrlPolicy = this.parseODRLResponse(response);
      
      // Validate and enhance the generated policy
      return this.enhanceGeneratedPolicy(odrlPolicy, nlPolicy, analysis);
    } catch (error) {
      logger.error('AI ODRL generation failed', error);
      throw error;
    }
  }

  /**
   * Learn from conversion feedback
   */
  async learnFromFeedback(
    nlPolicy: string, 
    odrlPolicy: AEGISPolicy, 
    feedback: 'success' | 'failure',
    details?: string
  ): Promise<void> {
    const learningPrompt = `
以下の変換結果から学習してください：

自然言語ポリシー: "${nlPolicy}"

ODRL変換結果:
${JSON.stringify(odrlPolicy, null, 2)}

フィードバック: ${feedback}
詳細: ${details || 'なし'}

今後の変換精度向上のため、このパターンを記憶してください。
`;

    await this.aiEngine.learn(learningPrompt);
  }

  private buildAnalysisPrompt(nlPolicy: string): string {
    return `
自然言語のアクセス制御ポリシーを分析してください。

入力ポリシー: "${nlPolicy}"

以下の要素を抽出してください：

1. 時間制限（例：営業時間内、特定の時間帯）
2. エージェント制限（例：特定のエージェントタイプ、信頼スコア）
3. リソース（例：ファイル、ツール、API）
4. 制約条件（例：地理的制限、ネットワーク制限）
5. 義務（例：ログ記録、通知、削除）
6. アクション（例：読み取り、書き込み、実行）

JSON形式で回答してください：
{
  "timeRestrictions": "時間に関する制限の説明",
  "agentRestrictions": "エージェントに関する制限の説明",
  "resources": ["対象リソース1", "対象リソース2"],
  "constraints": ["制約1", "制約2"],
  "obligations": ["義務1", "義務2"],
  "actions": ["許可/禁止するアクション"],
  "confidence": 0.0-1.0,
  "reasoning": "分析の根拠"
}

注意事項：
- 明示されていない要素は null または空配列にしてください
- 日本語の表現を正確に理解してください（例：「のみ」「以上」「まで」）
- 緊急時の例外条件にも注意してください
`;
  }

  private buildGenerationPrompt(nlPolicy: string, analysis: AIAnalysisResult): string {
    return `
自然言語ポリシーをODRL形式に変換してください。

入力ポリシー: "${nlPolicy}"

分析結果:
${JSON.stringify(analysis, null, 2)}

ODRL変換例:
{
  "@context": ["http://www.w3.org/ns/odrl/2/", "https://aegis.example.com/odrl/"],
  "@type": "Policy",
  "uid": "生成されたID",
  "profile": "https://aegis.example.com/odrl/profile",
  "permission": [
    {
      "@type": "Permission",
      "action": {"value": "アクション"},
      "constraint": [
        {
          "@type": "Constraint",
          "leftOperand": "オペランド",
          "operator": "演算子",
          "rightOperand": "値"
        }
      ]
    }
  ],
  "prohibition": [],
  "obligation": []
}

AEGIS拡張オペランド:
- aegis:trustScore - エージェントの信頼スコア
- aegis:agentType - エージェントのタイプ
- aegis:emergency - 緊急フラグ
- aegis:resourceClassification - リソース分類
- aegis:delegationDepth - 委譲深度

変換ルール:
1. 「〜のみ」→ 等価制約（eq）
2. 「〜以上」→ 以上制約（gteq）
3. 「〜まで」→ 以下制約（lteq）
4. 時間範囲 → LogicalConstraint with "and"
5. 「許可」→ Permission、「禁止」→ Prohibition

W3C ODRL 2.2標準に準拠した有効なJSONを生成してください。
`;
  }

  private parseAnalysisResponse(response: any): AIAnalysisResult {
    try {
      // AI応答をパース
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      
      return {
        timeRestrictions: parsed.timeRestrictions || undefined,
        agentRestrictions: parsed.agentRestrictions || undefined,
        resources: parsed.resources || [],
        constraints: parsed.constraints || [],
        obligations: parsed.obligations || [],
        actions: parsed.actions || [],
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || undefined
      };
    } catch (error) {
      logger.error('Failed to parse AI analysis response', error);
      return {
        confidence: 0,
        resources: [],
        constraints: [],
        obligations: [],
        actions: []
      };
    }
  }

  private parseODRLResponse(response: any): AEGISPolicy {
    try {
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      
      // 基本的な検証
      if (!parsed['@context'] || !parsed['@type'] || !parsed.uid) {
        throw new Error('Invalid ODRL structure');
      }
      
      return parsed as AEGISPolicy;
    } catch (error) {
      logger.error('Failed to parse AI ODRL response', error);
      throw new Error('AI generated invalid ODRL policy');
    }
  }

  private enhanceGeneratedPolicy(
    policy: AEGISPolicy, 
    nlPolicy: string, 
    analysis: AIAnalysisResult
  ): AEGISPolicy {
    // メタデータを追加
    policy.naturalLanguageSource = nlPolicy;
    policy.metadata = {
      ...policy.metadata,
      created: new Date().toISOString(),
      description: `AI-generated from: ${nlPolicy.substring(0, 100)}...`
    };
    
    // Store AI-specific metadata separately in the policy object
    (policy as any).conversionMethod = 'ai';
    (policy as any).aiConfidence = analysis.confidence;
    (policy as any).aiReasoning = analysis.reasoning;
    
    // 優先度を設定（AI生成は中程度の優先度）
    policy.priority = policy.priority || 500;
    
    // UIDを確実に設定
    if (!policy.uid || policy.uid === '生成されたID') {
      policy.uid = `aegis:policy:ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    return policy;
  }

  /**
   * Extract patterns from successful conversions
   */
  extractPattern(nlPolicy: string, odrlPolicy: AEGISPolicy): {
    pattern: string;
    template: any;
    confidence: number;
  } | null {
    try {
      // シンプルなパターンを抽出
      const patterns = [];
      
      // 時間パターン
      const timeMatch = nlPolicy.match(/(\d+)[時:-]?(\d+)?.*?[~～から].*?(\d+)[時:-]?(\d+)?/);
      if (timeMatch) {
        patterns.push({
          type: 'time_range',
          pattern: timeMatch[0],
          start: `${timeMatch[1]}:${timeMatch[2] || '00'}`,
          end: `${timeMatch[3]}:${timeMatch[4] || '00'}`
        });
      }
      
      // 信頼スコアパターン
      const trustMatch = nlPolicy.match(/信頼スコア.*?(\d+\.?\d*).*?(以上|以下)/);
      if (trustMatch) {
        patterns.push({
          type: 'trust_score',
          pattern: trustMatch[0],
          value: parseFloat(trustMatch[1]),
          operator: trustMatch[2] === '以上' ? 'gteq' : 'lteq'
        });
      }
      
      // エージェントタイプパターン
      const agentMatch = nlPolicy.match(/([\w-]+)(?:エージェント|agent).*?のみ/i);
      if (agentMatch) {
        patterns.push({
          type: 'agent_type',
          pattern: agentMatch[0],
          agentType: agentMatch[1]
        });
      }
      
      if (patterns.length > 0) {
        return {
          pattern: nlPolicy,
          template: {
            patterns,
            odrlStructure: this.simplifyODRLStructure(odrlPolicy)
          },
          confidence: 0.8
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to extract pattern', error);
      return null;
    }
  }

  private simplifyODRLStructure(policy: AEGISPolicy): any {
    // ODRLポリシーの構造を簡略化してテンプレートとして保存
    return {
      permissions: policy.permission?.map(p => ({
        action: p.action,
        constraintTypes: p.constraint?.map(c => c['@type']) || []
      })) || [],
      prohibitions: policy.prohibition?.map(p => ({
        action: p.action,
        constraintTypes: p.constraint?.map(c => c['@type']) || []
      })) || [],
      hasObligations: (policy.obligation?.length || 0) > 0
    };
  }
}

// Export for enhanced AI judgment engine
export interface EnhancedAIJudgmentEngine extends AIJudgmentEngine {
  analyzePolicy(nlPolicy: string, context: any): Promise<AIAnalysisResult>;
  analyze(prompt: string, options: any): Promise<any>;
  generate(prompt: string, options: any): Promise<any>;
  learn(prompt: string): Promise<void>;
}