import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// Web API バリデーションスキーマ
// ============================================================================

/**
 * ポリシー作成リクエストのバリデーション
 */
export const createPolicySchema = z.object({
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
    priority: z.number().min(0).max(1000).optional()
  }).optional()
});

/**
 * ポリシー更新リクエストのバリデーション
 */
export const updatePolicySchema = z.object({
  policy: z.string()
    .min(10, 'ポリシーは10文字以上で記述してください')
    .max(10000, 'ポリシーは10000文字以内で記述してください'),
  
  updatedBy: z.string().optional()
});

/**
 * ポリシー解析リクエストのバリデーション
 */
export const analyzePolicySchema = z.object({
  policy: z.string()
    .min(1, 'ポリシーは必須です')
    .max(10000, 'ポリシーは10000文字以内で記述してください')
});

/**
 * ポリシーテストリクエストのバリデーション
 */
export const testPolicySchema = z.object({
  agent: z.string()
    .min(1, 'エージェントIDは必須です')
    .max(100, 'エージェントIDは100文字以内で入力してください'),
  
  action: z.enum(['read', 'write', 'delete', 'execute', 'list'], {
    errorMap: () => ({ message: '無効なアクションです' })
  }),
  
  resource: z.string()
    .min(1, 'リソースは必須です')
    .max(500, 'リソースは500文字以内で入力してください'),
  
  purpose: z.string()
    .max(200, '目的は200文字以内で入力してください')
    .optional(),
  
  context: z.object({
    time: z.string().datetime().optional(),
    location: z.string().optional(),
    environment: z.record(z.any()).optional()
  }).optional()
});

/**
 * MCPツール呼び出しのバリデーション
 */
export const toolCallSchema = z.object({
  tool: z.string()
    .min(1, 'ツール名は必須です')
    .max(100, 'ツール名は100文字以内で入力してください'),
  
  arguments: z.record(z.any()).optional()
});

/**
 * バリデーションエラーレスポンスの型
 */
export interface ValidationErrorResponse {
  success: false;
  error: string;
  details?: z.ZodError['errors'];
}

/**
 * バリデーションヘルパー関数
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationErrorResponse } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          success: false,
          error: 'バリデーションエラー',
          details: error.errors
        }
      };
    }
    return {
      success: false,
      error: {
        success: false,
        error: '不明なエラーが発生しました'
      }
    };
  }
}

/**
 * Express用バリデーションミドルウェア
 */
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
    }
  }
}

export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = validateRequest(schema, req.body);
    
    if (!result.success) {
      return res.status(400).json(result.error);
    }
    
    req.validatedData = result.data;
    next();
  };
}