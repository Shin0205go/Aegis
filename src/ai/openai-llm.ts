// ============================================================================
// AEGIS - OpenAI LLM実装
// ============================================================================

import OpenAI from 'openai';
import type { LLMConfig } from '../types/index.js';

export class OpenAILLM {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
  }

  async complete(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      return content;
    } catch (error) {
      console.error('[OpenAI LLM] Error:', error);
      throw new Error(`OpenAI API Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async batchComplete(prompts: string[]): Promise<string[]> {
    const promises = prompts.map(prompt => this.complete(prompt));
    return await Promise.all(promises);
  }

  // ストリーミング対応（将来的な拡張用）
  async *streamComplete(prompt: string): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.3,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('[OpenAI LLM] Stream Error:', error);
      throw new Error(`OpenAI Stream API Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // モデル情報取得
  getModelInfo(): { provider: string; model: string; maxTokens?: number } {
    return {
      provider: 'openai',
      model: this.config.model,
      maxTokens: this.config.maxTokens
    };
  }

  // トークン数推定（簡易版）
  estimateTokens(text: string): number {
    // 簡易的な推定（実際にはtiktokenライブラリを使用するのが理想）
    return Math.ceil(text.length / 4);
  }
}