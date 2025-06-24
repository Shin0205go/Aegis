// ============================================================================
// AEGIS - LLM Factory
// LLMプロバイダーのファクトリーパターン実装
// ============================================================================

import type { LLMConfig } from '../types/index.js';
import { OpenAILLM } from './openai-llm.js';
import { AnthropicLLM } from './anthropic-llm.js';

/**
 * LLMプロバイダーのインターフェース
 */
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

/**
 * LLMファクトリーインターフェース
 */
export interface LLMFactory {
  create(config: LLMConfig): LLMProvider;
}

/**
 * デフォルトのLLMファクトリー実装
 */
export class DefaultLLMFactory implements LLMFactory {
  private readonly providerMap: Map<string, new (config: LLMConfig) => LLMProvider>;

  constructor() {
    this.providerMap = new Map([
      ['openai', OpenAILLM as any],
      ['anthropic', AnthropicLLM as any]
    ]);
  }

  /**
   * LLMプロバイダーを作成
   */
  create(config: LLMConfig): LLMProvider {
    const ProviderClass = this.providerMap.get(config.provider);
    
    if (!ProviderClass) {
      console.warn(`Unknown LLM provider: ${config.provider}, falling back to OpenAI`);
      return new OpenAILLM(config);
    }
    
    return new ProviderClass(config);
  }

  /**
   * カスタムプロバイダーを登録
   */
  registerProvider(name: string, providerClass: new (config: LLMConfig) => LLMProvider): void {
    this.providerMap.set(name, providerClass);
  }

  /**
   * 登録されているプロバイダー名を取得
   */
  getProviderNames(): string[] {
    return Array.from(this.providerMap.keys());
  }
}

/**
 * モックLLMプロバイダー（テスト用）
 */
export class MockLLMProvider implements LLMProvider {
  private responses: Map<string, string> = new Map();
  private defaultResponse: string;

  constructor(defaultResponse: string = '{"decision": "PERMIT", "reason": "Mock response", "confidence": 1.0}') {
    this.defaultResponse = defaultResponse;
  }

  async complete(prompt: string): Promise<string> {
    // プロンプトの一部をキーとして使用
    for (const [key, response] of this.responses) {
      if (prompt.includes(key)) {
        return response;
      }
    }
    return this.defaultResponse;
  }


  /**
   * 特定のプロンプトに対するレスポンスを設定
   */
  setResponse(promptKey: string, response: string): void {
    this.responses.set(promptKey, response);
  }

  /**
   * デフォルトレスポンスを設定
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }
}