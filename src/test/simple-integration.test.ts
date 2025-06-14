// シンプルな統合テスト（Node.js v14互換）

import { AIJudgmentEngine } from '../ai/judgment-engine';
import { PolicyAdministrator } from '../policies/administrator';
import { ContextCollector } from '../context/collector';
import { DecisionContext } from '../types';

// 基本的なモック設定
const mockApiCall = jest.fn();
jest.mock('../ai/openai-llm', () => ({
  OpenAILLM: jest.fn().mockImplementation(() => ({
    complete: mockApiCall,
    batchComplete: jest.fn()
  }))
}));

jest.mock('../utils/logger');
jest.mock('fs/promises');

describe('AEGIS Policy Engine - 基本統合テスト', () => {
  let judgmentEngine: AIJudgmentEngine;
  let policyAdmin: PolicyAdministrator;
  let contextCollector: ContextCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    
    judgmentEngine = new AIJudgmentEngine({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4'
    });
    
    policyAdmin = new PolicyAdministrator('./test-policies');
    contextCollector = new ContextCollector();
  });

  test('基本的なアクセス制御フローが動作する', async () => {
    // AI判定のモック
    mockApiCall.mockResolvedValueOnce(JSON.stringify({
      decision: 'PERMIT',
      reason: 'テスト許可',
      confidence: 0.95
    }));

    // ポリシーを作成
    const policyId = await policyAdmin.createPolicy(
      'Test Policy',
      '【基本原則】\nテストポリシー\n【制限事項】\nなし'
    );

    // コンテキストを作成
    const context: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test://resource',
      time: new Date(),
      environment: {}
    };

    // 判定を実行
    const policy = await policyAdmin.getPolicy(policyId);
    const decision = await judgmentEngine.makeDecision(
      policy!.policy,
      context,
      {}
    );

    expect(decision.decision).toBe('PERMIT');
    expect(decision.confidence).toBe(0.95);
  });

  test('コンテキスト収集が動作する', async () => {
    const baseContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test://resource',
      time: new Date(),
      environment: {}
    };

    const enrichedContext = await contextCollector.enrichContext(baseContext);
    
    expect(enrichedContext).toBeDefined();
    expect(enrichedContext.agent).toBe('test-agent');
    expect(enrichedContext.action).toBe('read');
  });

  test('ポリシー管理のCRUD操作が動作する', async () => {
    // Create
    const policyId = await policyAdmin.createPolicy(
      'CRUD Test Policy',
      '【基本原則】\nCRUDテスト\n【制限事項】\nなし'
    );
    expect(policyId).toMatch(/^policy-/);

    // Read
    const policy = await policyAdmin.getPolicy(policyId);
    expect(policy).toBeDefined();
    expect(policy!.metadata.name).toBe('CRUD Test Policy');

    // Update
    await policyAdmin.updatePolicy(
      policyId,
      '【基本原則】\n更新されたポリシー\n【制限事項】\nなし'
    );
    const updatedPolicy = await policyAdmin.getPolicy(policyId);
    expect(updatedPolicy!.policy).toContain('更新されたポリシー');

    // Delete
    await policyAdmin.deletePolicy(policyId);
    const deletedPolicy = await policyAdmin.getPolicy(policyId);
    expect(deletedPolicy).toBeNull();
  });

  test('エラー時にINDETERMINATEを返す', async () => {
    // AIエラーのモック
    mockApiCall.mockRejectedValueOnce(new Error('API Error'));

    const context: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test://resource',
      time: new Date(),
      environment: {}
    };

    const decision = await judgmentEngine.makeDecision(
      'Test policy',
      context,
      {}
    );

    expect(decision.decision).toBe('INDETERMINATE');
    expect(decision.reason).toContain('エラー');
  });
});

// テスト実行のヘルパー
if (require.main === module) {
  console.log('Running simple integration tests...');
  require('jest').run();
}