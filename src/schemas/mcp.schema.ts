import { z } from 'zod';

// ============================================================================
// MCP (Model Context Protocol) 関連のスキーマ定義
// ============================================================================

/**
 * MCP JSONRPCリクエストの基本スキーマ
 */
export const mcpRequestBaseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.any().optional()
});

/**
 * ツール呼び出しリクエストのスキーマ
 */
export const toolCallRequestSchema = mcpRequestBaseSchema.extend({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string().min(1),
    arguments: z.record(z.any()).optional()
  })
});

/**
 * リソース読み取りリクエストのスキーマ
 */
export const resourceReadRequestSchema = mcpRequestBaseSchema.extend({
  method: z.literal('resources/read'),
  params: z.object({
    uri: z.string().url()
  })
});

/**
 * ツール一覧取得リクエストのスキーマ
 */
export const toolListRequestSchema = mcpRequestBaseSchema.extend({
  method: z.literal('tools/list'),
  params: z.object({}).optional()
});

/**
 * リソース一覧取得リクエストのスキーマ
 */
export const resourceListRequestSchema = mcpRequestBaseSchema.extend({
  method: z.literal('resources/list'),
  params: z.object({}).optional()
});

/**
 * MCPレスポンスの基本スキーマ
 */
export const mcpResponseBaseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional()
});

/**
 * ツール定義のスキーマ
 */
export const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional()
  })
});

/**
 * リソース定義のスキーマ
 */
export const resourceDefinitionSchema = z.object({
  uri: z.string().url(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional()
});

/**
 * MCPサーバー設定のスキーマ
 */
export const mcpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  timeout: z.number().min(0).optional()
});

/**
 * 上流MCPサーバー設定のスキーマ
 */
export const upstreamServersConfigSchema = z.object({
  mcpServers: z.record(mcpServerConfigSchema)
});

/**
 * MCPプロキシ設定のスキーマ
 */
export const mcpProxyConfigSchema = z.object({
  transport: z.enum(['stdio', 'http', 'websocket']).default('stdio'),
  port: z.number().min(1).max(65535).optional(),
  host: z.string().optional(),
  enableLogging: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  timeout: z.number().min(0).default(30000),
  maxConcurrentRequests: z.number().min(1).default(10),
  cacheEnabled: z.boolean().default(true),
  cacheTTL: z.number().min(0).default(3600)
});

/**
 * MCPリクエストのバリデーション関数
 */
export function validateMCPRequest(data: unknown): z.infer<typeof mcpRequestBaseSchema> | null {
  try {
    return mcpRequestBaseSchema.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * 特定のMCPメソッドリクエストのバリデーション
 */
export function validateMethodRequest(method: string, data: unknown) {
  switch (method) {
    case 'tools/call':
      return toolCallRequestSchema.parse(data);
    case 'resources/read':
      return resourceReadRequestSchema.parse(data);
    case 'tools/list':
      return toolListRequestSchema.parse(data);
    case 'resources/list':
      return resourceListRequestSchema.parse(data);
    default:
      return mcpRequestBaseSchema.parse(data);
  }
}

// 型定義のエクスポート
export type MCPRequest = z.infer<typeof mcpRequestBaseSchema>;
export type ToolCallRequest = z.infer<typeof toolCallRequestSchema>;
export type ResourceReadRequest = z.infer<typeof resourceReadRequestSchema>;
export type ToolListRequest = z.infer<typeof toolListRequestSchema>;
export type ResourceListRequest = z.infer<typeof resourceListRequestSchema>;
export type MCPResponse = z.infer<typeof mcpResponseBaseSchema>;
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;
export type MCPServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type UpstreamServersConfig = z.infer<typeof upstreamServersConfigSchema>;
export type MCPProxyConfig = z.infer<typeof mcpProxyConfigSchema>;