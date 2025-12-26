// ============================================================================
// 統一MCPアーキテクチャ - 意味論的委譲プロバイダー
// プロンプトとリソースをサーバー側「Source of Truth」として管理
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import type {
  UnifiedPromptDefinition,
  UnifiedResourceDefinition,
  PromptArgument,
  ResourceGenerator
} from './types.js';
import { Logger } from '../utils/logger.js';
import { DynamicNotificationManager } from './notification-manager.js';

/**
 * プロンプトテンプレートエンジン
 * 引数を受け取り、動的にプロンプトを構築
 */
interface PromptTemplate {
  name: string;
  description: string;
  arguments: PromptArgument[];
  render: (args: Record<string, any>) => Promise<string>;
}

/**
 * 意味論的委譲プロバイダー
 *
 * クライアント側の設定ファイルを極限まで薄くするため、
 * プロンプトとリソースをサーバー側で一元管理する
 */
export class SemanticDelegationProvider {
  private logger: Logger;
  private notificationManager?: DynamicNotificationManager;

  // プロンプト管理
  private prompts: Map<string, UnifiedPromptDefinition> = new Map();
  private promptTemplates: Map<string, PromptTemplate> = new Map();

  // リソース管理
  private resources: Map<string, UnifiedResourceDefinition> = new Map();
  private resourceCache: Map<string, { content: string; timestamp: number }> = new Map();

  // 変更トラッキング
  private lastPromptsChange: Date = new Date();
  private lastResourcesChange: Date = new Date();

  constructor(logger?: Logger, notificationManager?: DynamicNotificationManager) {
    this.logger = logger || new Logger('info');
    this.notificationManager = notificationManager;
  }

  // ============================================================================
  // プロンプト管理
  // ============================================================================

  /**
   * プロンプトを登録
   */
  registerPrompt(definition: UnifiedPromptDefinition): void {
    this.prompts.set(definition.name, definition);
    this.lastPromptsChange = new Date();

    // プロンプトテンプレートを作成
    this.promptTemplates.set(definition.name, {
      name: definition.name,
      description: definition.description,
      arguments: definition.arguments || [],
      render: async (args) => this.renderPrompt(definition, args)
    });

    this.logger.info(`Prompt registered: ${definition.name}`);

    // 変更を通知
    this.notificationManager?.notifyPromptsListChanged();
  }

  /**
   * プロンプトを取得
   */
  getPrompt(name: string): UnifiedPromptDefinition | undefined {
    return this.prompts.get(name);
  }

  /**
   * 全プロンプトを取得
   */
  listPrompts(): UnifiedPromptDefinition[] {
    return Array.from(this.prompts.values());
  }

  /**
   * プロンプトを削除
   */
  removePrompt(name: string): boolean {
    const result = this.prompts.delete(name);
    if (result) {
      this.promptTemplates.delete(name);
      this.lastPromptsChange = new Date();
      this.notificationManager?.notifyPromptsListChanged();
      this.logger.info(`Prompt removed: ${name}`);
    }
    return result;
  }

  /**
   * プロンプトをレンダリング（引数を適用）
   */
  async renderPrompt(
    definition: UnifiedPromptDefinition,
    args: Record<string, any> = {}
  ): Promise<string> {
    let rendered = definition.template;

    // 引数の検証と適用
    for (const arg of definition.arguments || []) {
      const value = args[arg.name] ?? arg.default;

      if (arg.required && value === undefined) {
        throw new Error(`Required argument missing: ${arg.name}`);
      }

      if (value !== undefined) {
        // プレースホルダーを置換 {{argName}}
        const placeholder = new RegExp(`\\{\\{\\s*${arg.name}\\s*\\}\\}`, 'g');
        rendered = rendered.replace(placeholder, String(value));
      }
    }

    // リソース参照を解決
    if (definition.resourceRefs) {
      for (const resourceUri of definition.resourceRefs) {
        const resourceContent = await this.getResourceContent(resourceUri);
        if (resourceContent) {
          // リソースプレースホルダーを置換 @{resourceUri}
          const resourcePlaceholder = new RegExp(
            `@\\{\\s*${resourceUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}`,
            'g'
          );
          rendered = rendered.replace(resourcePlaceholder, resourceContent);
        }
      }
    }

    return rendered;
  }

  /**
   * MCP prompts/list 形式でプロンプト一覧を取得
   */
  getMCPPromptsList(): Array<{
    name: string;
    description?: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }> {
    return this.listPrompts().map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments?.map(a => ({
        name: a.name,
        description: a.description,
        required: a.required
      }))
    }));
  }

  /**
   * MCP prompts/get 形式でプロンプトを取得
   */
  async getMCPPrompt(
    name: string,
    args: Record<string, any> = {}
  ): Promise<{
    description?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
  } | null> {
    const prompt = this.prompts.get(name);
    if (!prompt) return null;

    const rendered = await this.renderPrompt(prompt, args);

    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: rendered
          }
        }
      ]
    };
  }

  // ============================================================================
  // リソース管理
  // ============================================================================

  /**
   * リソースを登録
   */
  registerResource(definition: UnifiedResourceDefinition): void {
    this.resources.set(definition.uri, definition);
    this.lastResourcesChange = new Date();
    this.logger.info(`Resource registered: ${definition.uri}`);

    // 変更を通知
    this.notificationManager?.notifyResourcesListChanged();
  }

  /**
   * リソースを取得
   */
  getResource(uri: string): UnifiedResourceDefinition | undefined {
    return this.resources.get(uri);
  }

  /**
   * 全リソースを取得
   */
  listResources(): UnifiedResourceDefinition[] {
    return Array.from(this.resources.values());
  }

  /**
   * リソースを削除
   */
  removeResource(uri: string): boolean {
    const result = this.resources.delete(uri);
    if (result) {
      this.resourceCache.delete(uri);
      this.lastResourcesChange = new Date();
      this.notificationManager?.notifyResourcesListChanged();
      this.logger.info(`Resource removed: ${uri}`);
    }
    return result;
  }

  /**
   * リソースコンテンツを取得（キャッシュ対応）
   */
  async getResourceContent(uri: string): Promise<string | null> {
    const resource = this.resources.get(uri);
    if (!resource) return null;

    // 静的コンテンツ
    if (resource.content) {
      return resource.content;
    }

    // キャッシュチェック
    const cached = this.resourceCache.get(uri);
    if (cached && resource.generator?.cache?.enabled) {
      const ttl = resource.generator.cache.ttl * 1000;
      if (Date.now() - cached.timestamp < ttl) {
        return cached.content;
      }
    }

    // 動的生成
    if (resource.generator) {
      const content = await this.generateResourceContent(resource.generator);
      if (content) {
        this.resourceCache.set(uri, {
          content,
          timestamp: Date.now()
        });
      }
      return content;
    }

    return null;
  }

  /**
   * リソースコンテンツを動的に生成
   */
  private async generateResourceContent(generator: ResourceGenerator): Promise<string | null> {
    switch (generator.type) {
      case 'file':
        return this.generateFromFile(generator);
      case 'database':
        return this.generateFromDatabase(generator);
      case 'api':
        return this.generateFromAPI(generator);
      case 'custom':
        return this.generateCustom(generator);
      default:
        return null;
    }
  }

  private async generateFromFile(generator: ResourceGenerator): Promise<string | null> {
    try {
      const filePath = path.isAbsolute(generator.source)
        ? generator.source
        : path.join(process.cwd(), generator.source);

      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Resource file not found: ${filePath}`);
        return null;
      }

      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to read resource file:`, error);
      return null;
    }
  }

  private async generateFromDatabase(_generator: ResourceGenerator): Promise<string | null> {
    // データベース接続は将来の拡張で実装
    this.logger.warn('Database resource generation not yet implemented');
    return null;
  }

  private async generateFromAPI(generator: ResourceGenerator): Promise<string | null> {
    try {
      const response = await fetch(generator.source);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      this.logger.error(`Failed to fetch API resource:`, error);
      return null;
    }
  }

  private async generateCustom(_generator: ResourceGenerator): Promise<string | null> {
    // カスタム生成は将来の拡張で実装
    this.logger.warn('Custom resource generation not yet implemented');
    return null;
  }

  /**
   * リソースコンテンツを更新（サブスクリプション通知付き）
   */
  async updateResourceContent(uri: string, content: string): Promise<void> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    resource.content = content;
    this.resourceCache.delete(uri);
    this.lastResourcesChange = new Date();

    // サブスクライバーに通知
    await this.notificationManager?.notifyResourceUpdated(uri);

    this.logger.info(`Resource updated: ${uri}`);
  }

  /**
   * MCP resources/list 形式でリソース一覧を取得
   */
  getMCPResourcesList(): Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }> {
    return this.listResources().map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    }));
  }

  /**
   * MCP resources/read 形式でリソースを取得
   */
  async getMCPResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
    }>;
  } | null> {
    const resource = this.resources.get(uri);
    if (!resource) return null;

    const content = await this.getResourceContent(uri);
    if (!content) return null;

    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: content
        }
      ]
    };
  }

  // ============================================================================
  // 組み込みプロンプト・リソース
  // ============================================================================

  /**
   * デフォルトのシステムプロンプトを登録
   */
  registerDefaultPrompts(): void {
    // システム指示プロンプト
    this.registerPrompt({
      name: 'system_instruction',
      description: 'エージェントの初期化指示を取得',
      template: `あなたはAEGISポリシーエンジンに接続されたアシスタントです。

以下のガイドラインに従ってください：

1. すべての操作はサーバー側のポリシーに従って制御されます
2. ツールの使用前に、必ず適切な権限があることを確認してください
3. センシティブなデータの取り扱いには注意してください
4. エラーが発生した場合は、明確なメッセージをユーザーに提供してください

@{aegis://guidelines}`,
      resourceRefs: ['aegis://guidelines']
    });

    // 使用ガイドプロンプト
    this.registerPrompt({
      name: 'usage_guide',
      description: 'ツールの使用方法ガイドを取得',
      template: `# ツール使用ガイド

## 利用可能なツール

サーバーに接続されたツールの一覧は \`tools/list\` で確認できます。

## 使用上の注意

- 高リスク操作（削除、管理者操作など）は追加の承認が必要な場合があります
- ファイルシステムへのアクセスは許可されたディレクトリのみに制限されています
- すべての操作は監査ログに記録されます

## トラブルシューティング

操作が拒否された場合：
1. エラーメッセージを確認してください
2. 必要な権限があるか確認してください
3. ポリシー管理者に連絡してください`,
      arguments: []
    });

    // コードレビュープロンプト
    this.registerPrompt({
      name: 'code_review',
      description: 'コードレビューを実行',
      template: `以下のコードをレビューしてください：

\`\`\`{{language}}
{{code}}
\`\`\`

レビュー観点：
- コードの可読性
- パフォーマンス
- セキュリティ
- ベストプラクティスへの準拠

@{aegis://coding-guidelines}`,
      arguments: [
        {
          name: 'language',
          description: 'プログラミング言語',
          required: true,
          type: 'string'
        },
        {
          name: 'code',
          description: 'レビュー対象のコード',
          required: true,
          type: 'string'
        }
      ],
      resourceRefs: ['aegis://coding-guidelines']
    });

    this.logger.info('Default prompts registered');
  }

  /**
   * デフォルトのリソースを登録
   */
  registerDefaultResources(): void {
    // システムガイドライン
    this.registerResource({
      uri: 'aegis://guidelines',
      name: 'システムガイドライン',
      description: 'エージェントが従うべき基本ガイドライン',
      mimeType: 'text/markdown',
      content: `# AEGIS システムガイドライン

## セキュリティ

- センシティブなデータ（パスワード、APIキー、個人情報）を出力に含めないでください
- ファイル操作は許可されたディレクトリ内でのみ行ってください
- 外部サービスへの接続は承認されたものに限定してください

## データ保護

- 顧客データは業務目的でのみアクセスしてください
- 不要なデータの長期保存は避けてください
- データの外部共有は厳禁です

## 監査

- すべての操作は記録されます
- 異常なアクセスパターンは自動検出されます
`,
      subscription: {
        enabled: true,
        updateInterval: 60000
      }
    });

    // コーディングガイドライン
    this.registerResource({
      uri: 'aegis://coding-guidelines',
      name: 'コーディングガイドライン',
      description: 'コード品質に関するガイドライン',
      mimeType: 'text/markdown',
      content: `# コーディングガイドライン

## 一般原則

- DRY (Don't Repeat Yourself)
- KISS (Keep It Simple, Stupid)
- YAGNI (You Ain't Gonna Need It)

## セキュリティ

- 入力値は常に検証する
- SQLインジェクション対策を行う
- XSS対策を行う

## パフォーマンス

- N+1クエリを避ける
- 適切なインデックスを使用する
- キャッシュを活用する
`
    });

    // プロジェクト構成情報（動的生成）
    this.registerResource({
      uri: 'aegis://project-structure',
      name: 'プロジェクト構成',
      description: '現在のプロジェクトのディレクトリ構成',
      mimeType: 'text/plain',
      generator: {
        type: 'file',
        source: '.aegis/project-structure.txt',
        cache: {
          enabled: true,
          ttl: 300 // 5分キャッシュ
        }
      }
    });

    this.logger.info('Default resources registered');
  }

  // ============================================================================
  // 統計・状態
  // ============================================================================

  /**
   * 統計情報を取得
   */
  getStats(): {
    promptsCount: number;
    resourcesCount: number;
    cacheSize: number;
    lastPromptsChange: Date;
    lastResourcesChange: Date;
  } {
    return {
      promptsCount: this.prompts.size,
      resourcesCount: this.resources.size,
      cacheSize: this.resourceCache.size,
      lastPromptsChange: this.lastPromptsChange,
      lastResourcesChange: this.lastResourcesChange
    };
  }
}

export default SemanticDelegationProvider;
