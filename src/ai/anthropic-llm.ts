// ============================================================================
// AEGIS - Anthropic Claude API実装
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig } from '../types/index.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('anthropic-llm');

export class AnthropicLLM {
  private client: Anthropic;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async complete(prompt: string): Promise<string> {
    try {
      logger.info('[Anthropic LLM] Executing Claude API request');
      
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.1,
        system: "あなたはAEGISポリシー判定エンジンです。与えられた情報に基づいて、アクセス要求に対する判定を行ってください。回答は必ず有効なJSON形式で行い、説明文や余計なテキストは含めないでください。",
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (response.content && response.content.length > 0) {
        const content = response.content[0];
        if (content.type === 'text') {
          logger.info('[Anthropic LLM] Claude API request successful');
          
          // JSONブロックを抽出する処理を追加
          const rawText = content.text;
          
          // ```json ... ``` 形式の場合
          const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              // JSONが有効かチェック
              JSON.parse(jsonMatch[1]);
              return jsonMatch[1];
            } catch (e) {
              logger.warn('[Anthropic LLM] JSON block found but invalid JSON, returning raw text');
              return rawText;
            }
          }
          
          // JSON形式かどうかをチェック
          const trimmedText = rawText.trim();
          if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
            try {
              JSON.parse(trimmedText);
              return trimmedText;
            } catch (e) {
              logger.warn('[Anthropic LLM] Looks like JSON but invalid, returning raw text');
              return rawText;
            }
          }
          
          return rawText;
        }
      }

      throw new Error('Invalid response format from Claude API');
    } catch (error) {
      logger.error('[Anthropic LLM] Claude API error:', error);
      throw new Error(`Anthropic API Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}