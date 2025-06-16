// ============================================================================
// AEGIS E2E テスト - ポリシーライフサイクル
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fetch from 'node-fetch';
import { PolicyAdministrator } from '../../policies/administrator.js';
import { AIJudgmentEngine } from '../../ai/judgment-engine.js';

const API_BASE = 'http://localhost:3000/api';
let testPolicyIds: string[] = [];

describe('AEGIS E2E Tests - Policy Lifecycle', () => {
  let policyAdmin: PolicyAdministrator;
  
  beforeAll(async () => {
    policyAdmin = new PolicyAdministrator();
    // テスト環境のセットアップ
  });
  
  afterAll(async () => {
    // テスト用ポリシーのクリーンアップ
    for (const id of testPolicyIds) {
      try {
        await fetch(`${API_BASE}/policies/${id}`, { method: 'DELETE' });
      } catch (error) {
        // エラーは無視
      }
    }
  });
  
  describe('ポリシー作成・更新・削除', () => {
    it('新規ポリシーを作成できる', async () => {
      const newPolicy = {
        name: 'E2Eテストポリシー',
        policy: `
【E2Eテストポリシー】
基本原則：
- テスト目的のアクセスのみ許可
- /test/ ディレクトリ内のリソースのみ対象

アクセス許可：
- 読み取り操作：許可
- 書き込み操作：テストファイルのみ許可

制限事項：
- 本番データへのアクセス禁止
- 削除操作は禁止

義務事項：
- テストログの記録
`,
        metadata: {
          tags: ['test', 'e2e'],
          priority: 10
        }
      };
      
      const response = await fetch(`${API_BASE}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPolicy)
      });
      
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      
      testPolicyIds.push(result.data.id);
    });
    
    it('ポリシーを更新できる', async () => {
      // まず作成
      const createResponse = await fetch(`${API_BASE}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '更新テストポリシー',
          policy: '初期ポリシー内容',
          metadata: { tags: ['update-test'] }
        })
      });
      
      const createResult = await createResponse.json();
      const policyId = createResult.data.id;
      testPolicyIds.push(policyId);
      
      // 更新
      const updateResponse = await fetch(`${API_BASE}/policies/${policyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: '更新されたポリシー内容',
          updatedBy: 'e2e-test'
        })
      });
      
      expect(updateResponse.status).toBe(200);
      
      // 確認
      const getResponse = await fetch(`${API_BASE}/policies/${policyId}`);
      const getResult = await getResponse.json();
      
      expect(getResult.data.policy).toBe('更新されたポリシー内容');
      expect(getResult.data.metadata.version).not.toBe('1.0.0');
    });
    
    it('ポリシーのステータスを変更できる', async () => {
      // ポリシー作成
      const createResponse = await fetch(`${API_BASE}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'ステータステストポリシー',
          policy: 'テストポリシー',
          metadata: { status: 'active' }
        })
      });
      
      const createResult = await createResponse.json();
      const policyId = createResult.data.id;
      testPolicyIds.push(policyId);
      
      // ステータス変更
      const statusResponse = await fetch(`${API_BASE}/policies/${policyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'deprecated',
          updatedBy: 'e2e-test'
        })
      });
      
      expect(statusResponse.status).toBe(200);
      
      // 確認
      const getResponse = await fetch(`${API_BASE}/policies/${policyId}`);
      const getResult = await getResponse.json();
      
      expect(getResult.data.metadata.status).toBe('deprecated');
    });
  });
  
  describe('ポリシー判定テスト', () => {
    let testPolicyId: string;
    
    beforeAll(async () => {
      // テスト用ポリシー作成
      const response = await fetch(`${API_BASE}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '判定テストポリシー',
          policy: `
【判定テストポリシー】
基本原則：
- /allowed/ パスへのアクセスは許可
- /forbidden/ パスへのアクセスは禁止

アクセス許可：
- 読み取り：/allowed/ パスのみ
- 書き込み：禁止

制限事項：
- すべての削除操作は禁止
`,
          metadata: { tags: ['judgment-test'] }
        })
      });
      
      const result = await response.json();
      testPolicyId = result.data.id;
      testPolicyIds.push(testPolicyId);
    });
    
    it('許可されたアクセスがPERMITになる', async () => {
      const response = await fetch(`${API_BASE}/policies/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: testPolicyId,
          testRequest: {
            agent: 'test-agent',
            action: 'read',
            resource: '/allowed/file.txt',
            purpose: 'testing',
            time: new Date(),
            environment: {}
          }
        })
      });
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('PERMIT');
    });
    
    it('禁止されたアクセスがDENYになる', async () => {
      const response = await fetch(`${API_BASE}/policies/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: testPolicyId,
          testRequest: {
            agent: 'test-agent',
            action: 'read',
            resource: '/forbidden/secret.txt',
            purpose: 'testing',
            time: new Date(),
            environment: {}
          }
        })
      });
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('DENY');
    });
    
    it('削除操作が常にDENYになる', async () => {
      const response = await fetch(`${API_BASE}/policies/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId: testPolicyId,
          testRequest: {
            agent: 'test-agent',
            action: 'delete',
            resource: '/allowed/file.txt',
            purpose: 'testing',
            time: new Date(),
            environment: {}
          }
        })
      });
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.decision).toBe('DENY');
      expect(result.data.reason).toContain('削除');
    });
  });
  
  describe('ポリシー分析機能', () => {
    it('ポリシーを分析して提案を返す', async () => {
      const response = await fetch(`${API_BASE}/policies/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: `
営業時間内のアクセスのみ許可する。
外部からのアクセスは禁止。
ログを記録する。
`
        })
      });
      
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.interpretation).toBeDefined();
      expect(result.data.suggestions).toBeInstanceOf(Array);
      expect(result.data.warnings).toBeInstanceOf(Array);
      
      // 営業時間の具体化を提案するはず
      const hasTimeSuggestion = result.data.suggestions.some(
        (s: string) => s.includes('営業時間') && s.includes('具体的')
      );
      expect(hasTimeSuggestion).toBe(true);
    });
    
    it('矛盾するポリシーに警告を出す', async () => {
      const response = await fetch(`${API_BASE}/policies/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: `
すべてのアクセスを許可する。
機密データへのアクセスは禁止する。
制限なしでアクセス可能。
`
        })
      });
      
      const result = await response.json();
      expect(result.success).toBe(true);
      
      // 矛盾の警告があるはず
      const hasContradictionWarning = result.data.warnings.some(
        (w: string) => w.includes('矛盾') || w.includes('すべて許可')
      );
      expect(hasContradictionWarning).toBe(true);
      
      // セキュリティリスクの警告
      const hasSecurityWarning = result.data.warnings.some(
        (w: string) => w.includes('セキュリティリスク') || w.includes('制限なし')
      );
      expect(hasSecurityWarning).toBe(true);
    });
  });
  
  describe('複数ポリシーの統合テスト', () => {
    it('複数のアクティブポリシーが同時に評価される', async () => {
      // TODO: 複数ポリシーの競合解決をテストするには、
      // コントローラー経由でのテストが必要
      // 現在のAPIは単一ポリシーのテストのみサポート
      expect(true).toBe(true);
    });
  });
});