import { z } from 'zod';

// ============================================================================
// ポリシー関連のスキーマ定義
// ============================================================================

/**
 * ポリシーメタデータのスキーマ
 */
export const policyMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'バージョンはセマンティックバージョニング形式(x.y.z)で指定してください'),
  status: z.enum(['active', 'inactive', 'draft', 'deprecated']),
  createdAt: z.date().or(z.string().datetime()),
  createdBy: z.string().min(1),
  lastModified: z.date().or(z.string().datetime()),
  lastModifiedBy: z.string().min(1),
  tags: z.array(z.string()).optional(),
  priority: z.number().min(0).max(1000).optional()
});

/**
 * 自然言語ポリシー定義のスキーマ
 */
export const naturalLanguagePolicySchema = z.object({
  metadata: policyMetadataSchema,
  policy: z.string().min(10).max(10000)
});

/**
 * ポリシー作成リクエストのスキーマ
 */
export const createPolicyRequestSchema = z.object({
  name: z.string()
    .min(1, 'ポリシー名は必須です')
    .max(100, 'ポリシー名は100文字以内で入力してください')
    .regex(/^[a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\-_]+$/, 
      'ポリシー名に使用できない文字が含まれています'),
  
  policy: z.string()
    .min(10, 'ポリシーは10文字以上で記述してください')
    .max(10000, 'ポリシーは10000文字以内で記述してください'),
  
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    createdBy: z.string().optional(),
    description: z.string().max(500).optional(),
    priority: z.number().min(0).max(1000).optional(),
    status: z.enum(['active', 'inactive', 'draft']).default('active')
  }).optional()
});

/**
 * ポリシー更新リクエストのスキーマ
 */
export const updatePolicyRequestSchema = z.object({
  policy: z.string()
    .min(10, 'ポリシーは10文字以上で記述してください')
    .max(10000, 'ポリシーは10000文字以内で記述してください'),
  
  updatedBy: z.string().optional(),
  
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    description: z.string().max(500).optional(),
    priority: z.number().min(0).max(1000).optional(),
    status: z.enum(['active', 'inactive', 'draft', 'deprecated']).optional()
  }).optional()
});

/**
 * ポリシーエクスポート形式のスキーマ
 */
export const policyExportSchema = z.object({
  version: z.string(),
  exportedAt: z.string().datetime(),
  exportedBy: z.string(),
  policies: z.array(naturalLanguagePolicySchema)
});

/**
 * ポリシー判定結果のスキーマ
 */
export const policyDecisionSchema = z.object({
  decision: z.enum(['PERMIT', 'DENY', 'INDETERMINATE']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  constraints: z.array(z.string()).optional(),
  obligations: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * 決定コンテキストのスキーマ
 */
export const decisionContextSchema = z.object({
  agent: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().min(1),
  purpose: z.string().optional(),
  time: z.date().or(z.string().datetime()),
  location: z.string().optional(),
  environment: z.record(z.any()).optional()
});

/**
 * ポリシーテストリクエストのスキーマ
 */
export const policyTestRequestSchema = z.object({
  policyId: z.string().optional(),
  policyText: z.string().optional(),
  context: decisionContextSchema
}).refine(
  data => data.policyId || data.policyText,
  'ポリシーIDまたはポリシーテキストのいずれかが必要です'
);

// 型定義のエクスポート
export type PolicyMetadata = z.infer<typeof policyMetadataSchema>;
export type NaturalLanguagePolicy = z.infer<typeof naturalLanguagePolicySchema>;
export type CreatePolicyRequest = z.infer<typeof createPolicyRequestSchema>;
export type UpdatePolicyRequest = z.infer<typeof updatePolicyRequestSchema>;
export type PolicyExport = z.infer<typeof policyExportSchema>;
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;
export type DecisionContext = z.infer<typeof decisionContextSchema>;
export type PolicyTestRequest = z.infer<typeof policyTestRequestSchema>;