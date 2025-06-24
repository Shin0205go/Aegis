// ============================================================================
// AEGIS - AI Prompt Templates
// AI判定エンジン用のプロンプトテンプレート管理
// ============================================================================

export const PROMPT_TEMPLATES = {
  /**
   * ポリシー分析用プロンプト
   */
  POLICY_ANALYSIS: `# AI利用制御判定システム

あなたは組織のAI利用に関するセキュリティポリシーを評価する専門家です。
提供されたコンテキスト情報とポリシーに基づいて、AIエージェントのリクエストを判定してください。

## 判定基準
1. エージェントの権限とリソースへのアクセス権
2. 操作の目的と組織のポリシーとの整合性  
3. セキュリティリスクの評価
4. 時間的・地理的制約の確認

## コンテキスト情報
{context}

## 適用ポリシー
{policy}

## 判定対象
エージェント: {agent}
アクション: {action}
リソース: {resource}
目的: {purpose}

## 出力形式
以下のJSON形式で回答してください：
{
  "decision": "PERMIT" | "DENY" | "INDETERMINATE",
  "reason": "判定理由の詳細説明",
  "confidence": 0.0-1.0の信頼度スコア,
  "constraints": ["適用すべき制約のリスト"],
  "obligations": ["実行すべき義務のリスト"],
  "metadata": {
    "risk_level": "LOW" | "MEDIUM" | "HIGH",
    "policy_violations": ["違反したポリシー項目"],
    "recommendations": ["推奨事項"]
  }
}`,

  /**
   * バッチ判定用プロンプト
   */
  BATCH_DECISION: `# AI利用制御バッチ判定システム

複数のアクセスリクエストをまとめて判定してください。
各リクエストは独立して評価し、他のリクエストの結果に影響されないようにしてください。

## 判定基準
{criteria}

## バッチリクエスト
{requests}

## 出力形式
以下のJSON形式で、各リクエストに対する判定を配列で返してください：
[
  {
    "requestId": "リクエストID",
    "decision": "PERMIT" | "DENY" | "INDETERMINATE",
    "reason": "判定理由",
    "confidence": 0.0-1.0,
    "constraints": [],
    "obligations": []
  }
]`,

  /**
   * ポリシー構造解析用プロンプト
   */
  POLICY_STRUCTURE_ANALYSIS: `あなたは自然言語ポリシーを解析するAIアシスタントです。
以下のポリシーを分析し、構造化された情報を抽出してください。

## ポリシー
{policyText}

## 抽出する情報
1. 主要なルール（許可/禁止事項）
2. 適用対象（エージェント、リソース、アクション）
3. 条件（時間、場所、その他の制約）
4. 義務事項（ログ記録、通知など）
5. 例外事項

## 出力形式
{
  "rules": [
    {
      "type": "permission" | "prohibition",
      "subject": "対象エージェント",
      "action": "アクション",
      "resource": "リソース",
      "conditions": ["条件のリスト"],
      "exceptions": ["例外のリスト"]
    }
  ],
  "obligations": ["義務事項のリスト"],
  "metadata": {
    "summary": "ポリシーの要約",
    "risk_areas": ["リスク領域"],
    "key_restrictions": ["主要な制限事項"]
  }
}`,

  /**
   * リスク評価用プロンプト
   */
  RISK_ASSESSMENT: `# セキュリティリスク評価

以下のアクセスリクエストのリスクレベルを評価してください。

## リクエスト情報
{request}

## 評価基準
- データの機密性
- 操作の不可逆性
- 影響範囲
- 悪用の可能性

## 出力形式
{
  "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "risk_factors": ["リスク要因のリスト"],
  "mitigation_measures": ["リスク軽減策"],
  "monitoring_requirements": ["監視要件"]
}`
};

/**
 * プロンプトテンプレートエンジン
 */
export class PromptTemplateEngine {
  private templates: Record<string, string>;

  constructor(customTemplates?: Record<string, string>) {
    this.templates = { ...PROMPT_TEMPLATES, ...customTemplates };
  }

  /**
   * テンプレートをレンダリング
   */
  render(templateName: string, context: Record<string, any>): string {
    const template = this.templates[templateName];
    
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    return this.replaceVariables(template, context);
  }

  /**
   * カスタムテンプレートを追加
   */
  addTemplate(name: string, template: string): void {
    this.templates[name] = template;
  }

  /**
   * テンプレート変数を置換
   */
  private replaceVariables(template: string, context: Record<string, any>): string {
    return template.replace(/{(\w+)}/g, (match, key) => {
      if (key in context) {
        const value = context[key];
        return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      }
      return match;
    });
  }

  /**
   * 利用可能なテンプレート名を取得
   */
  getTemplateNames(): string[] {
    return Object.keys(this.templates);
  }

  /**
   * テンプレートの存在確認
   */
  hasTemplate(name: string): boolean {
    return name in this.templates;
  }
}