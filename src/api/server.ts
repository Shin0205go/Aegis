// ============================================================================
// AEGIS Policy Management Web UI - Express Server
// 自然言語ポリシー管理のためのWebインターフェース
// ============================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { PolicyAdministrator } from '../policies/administrator.js';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import { Logger } from '../utils/logger.js';
import {
  validate,
  createPolicySchema,
  updatePolicySchema,
  analyzePolicySchema,
  testPolicySchema,
  toolCallSchema
} from './validation.js';

const __dirname = path.resolve();

const app = express();
const logger = new Logger('policy-ui-server');
const PORT = process.env.POLICY_UI_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'web/public')));

// Services
const policyAdmin = new PolicyAdministrator('./policies');
const config = {
  provider: 'anthropic' as 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.LLM_MODEL || 'claude-3-sonnet-20240229',
  temperature: 0.3,
  maxTokens: 4096
};
const judgmentEngine = new AIJudgmentEngine(config);

// ============================================================================
// Policy Management API Routes
// ============================================================================

// Get all policies
app.get('/api/policies', async (req, res) => {
  try {
    const policies = await policyAdmin.listPolicies();
    res.json({ success: true, data: policies });
  } catch (error) {
    logger.error('Failed to list policies', error);
    res.status(500).json({ success: false, error: 'Failed to list policies' });
  }
});

// Get single policy
app.get('/api/policies/:id', async (req, res) => {
  try {
    const policy = await policyAdmin.getPolicy(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, data: policy });
  } catch (error) {
    logger.error('Failed to get policy', error);
    res.status(500).json({ success: false, error: 'Failed to get policy' });
  }
});

// Create new policy
app.post('/api/policies', validate(createPolicySchema), async (req, res) => {
  try {
    const { name, policy, metadata } = (req as any).validatedData;
    const id = await policyAdmin.createPolicy(name, policy, metadata);
    res.json({ success: true, data: { id } });
  } catch (error) {
    logger.error('Failed to create policy', error);
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
});

// Update policy
app.put('/api/policies/:id', validate(updatePolicySchema), async (req, res) => {
  try {
    const { policy, updatedBy } = (req as any).validatedData;
    await policyAdmin.updatePolicy(req.params.id, policy, updatedBy);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update policy', error);
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
});

// Delete policy
app.delete('/api/policies/:id', async (req, res) => {
  try {
    await policyAdmin.deletePolicy(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete policy', error);
    res.status(500).json({ success: false, error: 'Failed to delete policy' });
  }
});

// Update policy status (enable/disable)
app.patch('/api/policies/:id/status', async (req, res) => {
  try {
    const { status, updatedBy } = req.body;
    
    // Validate status
    if (!['draft', 'active', 'deprecated'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status. Must be one of: draft, active, deprecated' 
      });
    }
    
    await policyAdmin.updatePolicyStatus(req.params.id, status, updatedBy);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update policy status', error);
    res.status(500).json({ success: false, error: 'Failed to update policy status' });
  }
});

// ============================================================================
// Policy Analysis & Testing API Routes
// ============================================================================

// Analyze policy (AI interpretation)
app.post('/api/policies/analyze', validate(analyzePolicySchema), async (req, res) => {
  try {
    const { policy } = (req as any).validatedData;
    
    // AIエンジンを使ってポリシーを解析
    const testContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      purpose: 'policy-analysis',
      time: new Date(),
      environment: {}
    };
    
    // ポリシーの解釈を取得
    const interpretation = await judgmentEngine.analyzePolicy(policy, testContext);
    
    res.json({ 
      success: true, 
      data: {
        interpretation,
        suggestions: generatePolicySuggestions(policy),
        warnings: detectPolicyWarnings(policy)
      }
    });
  } catch (error) {
    logger.error('Failed to analyze policy', error);
    res.status(500).json({ success: false, error: 'Failed to analyze policy' });
  }
});

// Test policy with sample request
app.post('/api/policies/test', async (req, res) => {
  try {
    const { policyId, testRequest } = req.body;
    
    // ポリシーを取得
    const policyData = await policyAdmin.getPolicy(policyId);
    if (!policyData) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    
    // テストリクエストで判定を実行
    const decision = await judgmentEngine.makeDecision(
      policyData.policy,
      testRequest,
      testRequest.environment || {}
    );
    
    res.json({ 
      success: true, 
      data: {
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        constraints: decision.constraints,
        obligations: decision.obligations
      }
    });
  } catch (error) {
    logger.error('Failed to test policy', error);
    res.status(500).json({ success: false, error: 'Failed to test policy' });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function generatePolicySuggestions(policy: string): string[] {
  const suggestions = [];
  
  // 時間指定の曖昧さをチェック
  if (policy.includes('営業時間') && !policy.match(/\d+時/)) {
    suggestions.push('「営業時間」を「平日9時から18時」のように具体的に指定することをお勧めします');
  }
  
  // 対象の明確化
  if (policy.includes('外部') && !policy.includes('外部エージェント')) {
    suggestions.push('「外部」が何を指すか明確にしてください（例：外部エージェント、外部ネットワーク）');
  }
  
  // 義務の明確化
  if (policy.includes('ログ') && !policy.match(/\d+日/)) {
    suggestions.push('ログの保存期間を明確に指定してください（例：30日間）');
  }
  
  return suggestions;
}

function detectPolicyWarnings(policy: string): string[] {
  const warnings = [];
  
  // 矛盾チェック
  if (policy.includes('すべて許可') && policy.includes('禁止')) {
    warnings.push('「すべて許可」と「禁止」が同じポリシー内に存在します。矛盾している可能性があります');
  }
  
  // セキュリティ警告
  if (policy.includes('制限なし') || policy.includes('無制限')) {
    warnings.push('セキュリティリスク: 無制限なアクセスは推奨されません');
  }
  
  // 曖昧な表現
  const ambiguousTerms = ['適切に', '必要に応じて', '場合によって'];
  ambiguousTerms.forEach(term => {
    if (policy.includes(term)) {
      warnings.push(`曖昧な表現「${term}」が含まれています。具体的な条件を指定してください`);
    }
  });
  
  return warnings;
}

// ============================================================================
// Static files for React app
// ============================================================================

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'web/public/index.html'));
});

// ============================================================================
// Start server
// ============================================================================

app.listen(PORT, () => {
  logger.info(`🚀 AEGIS Policy Management UI running at http://localhost:${PORT}`);
});

export { app };