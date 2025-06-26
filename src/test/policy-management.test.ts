import { PolicyAdministrator } from '../policies/administrator';
import { PolicyMetadata, NaturalLanguagePolicyDefinition } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// ファイルシステムモジュールをモック
jest.mock('fs/promises');
jest.mock('../utils/logger');

describe('PolicyAdministrator - 機能テスト', () => {
  let administrator: PolicyAdministrator;
  const testStorageDir = './test-policies';

  beforeEach(() => {
    jest.clearAllMocks();

    // ファイルシステムのモック設定
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.readFile as jest.Mock).mockResolvedValue('{}');
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);

    administrator = new PolicyAdministrator(testStorageDir);
  });

  describe('ポリシーCRUD操作', () => {
    it('新しいポリシーを作成できる', async () => {
      const policyContent = `
        顧客データアクセスポリシー：
        
        【基本原則】
        - 顧客サポート担当者のみアクセス可能
        - 営業時間内のみ許可
        - アクセスログ必須
        
        【制限事項】
        - 外部エージェントのアクセス禁止
        - データの外部共有は一切禁止
        - 個人情報の長期保存禁止
      `;

      const policyId = await administrator.createPolicy(
        'Customer Data Access Policy',
        policyContent,
        {
          tags: ['customer', 'data-access'],
          description: '顧客データへのアクセスを制御するポリシー',
          createdBy: 'admin'
        }
      );

      expect(policyId).toMatch(/^policy-[a-f0-9-]+$/);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-policies/policy-'),
        expect.stringContaining('Customer Data Access Policy'),
        { encoding: 'utf-8' }
      );
    });

    it('ポリシーを更新できる', async () => {
      // まずポリシーを作成
      const policyId = await administrator.createPolicy(
        'Test Policy',
        '【基本原則】\nテストポリシー\n【制限事項】\nなし',
        { createdBy: 'admin' }
      );

      // 更新
      const newContent = '【基本原則】\n更新されたポリシー\n【制限事項】\n更新された制限';
      await administrator.updatePolicy(policyId, newContent, 'updater');

      const updated = await administrator.getPolicy(policyId);
      expect(updated?.policy).toBe(newContent);
      expect(updated?.metadata.version).toBe('1.0.1');
      expect(updated?.metadata.lastModifiedBy).toBe('updater');
    });

    it('ポリシーを削除できる', async () => {
      const policyId = await administrator.createPolicy(
        'Delete Test Policy',
        '【基本原則】\n削除テスト\n【制限事項】\nなし'
      );

      await administrator.deletePolicy(policyId);

      const result = await administrator.getPolicy(policyId);
      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('存在しないポリシーの更新はエラーになる', async () => {
      await expect(
        administrator.updatePolicy('non-existent-id', 'content', 'user')
      ).rejects.toThrow('not found');
    });
  });

  describe('ポリシー検証', () => {
    it('有効なポリシーを検証できる', async () => {
      const validPolicy = `
        アクセス制御ポリシー：
        
        【基本原則】
        - 認証されたユーザーのみアクセス可能
        - 役割に応じた権限制御を実施
        
        【制限事項】
        - 管理者以外の削除操作禁止
        - 夜間のアクセス制限
      `;

      const result = await administrator.validatePolicy(validPolicy);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('無効なポリシーを検出できる', async () => {
      const invalidPolicies = [
        { policy: '', error: 'ポリシーが空です' },
        { policy: '短すぎるポリシー', error: 'ポリシーが短すぎます' },
        { policy: 'A'.repeat(10001), error: 'ポリシーが長すぎます' },
        { policy: 'セクションがないポリシー内容', error: '必須セクション' }
      ];

      for (const { policy, error } of invalidPolicies) {
        const result = await administrator.validatePolicy(policy);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some(e => e.includes(error))).toBe(true);
      }
    });
  });

  describe('バージョン管理', () => {
    it('ポリシー更新時にバージョンが正しくインクリメントされる', async () => {
      const policyId = await administrator.createPolicy(
        'Version Test',
        '【基本原則】\n初期バージョン\n【制限事項】\nなし'
      );

      // 初期バージョンは1.0.0
      let policy = await administrator.getPolicy(policyId);
      expect(policy?.metadata.version).toBe('1.0.0');

      // 1回目の更新 -> 1.0.1
      await administrator.updatePolicy(policyId, '【基本原則】\n更新1\n【制限事項】\nなし');
      policy = await administrator.getPolicy(policyId);
      expect(policy?.metadata.version).toBe('1.0.1');

      // 2回目の更新 -> 1.0.2
      await administrator.updatePolicy(policyId, '【基本原則】\n更新2\n【制限事項】\nなし');
      policy = await administrator.getPolicy(policyId);
      expect(policy?.metadata.version).toBe('1.0.2');
    });

    it('ポリシーの履歴を取得できる', async () => {
      const policyId = await administrator.createPolicy(
        'History Test',
        '【基本原則】\n初期版\n【制限事項】\nなし'
      );

      // 複数回更新
      await administrator.updatePolicy(policyId, '【基本原則】\n更新1\n【制限事項】\nなし', 'user1');
      await administrator.updatePolicy(policyId, '【基本原則】\n更新2\n【制限事項】\nなし', 'user2');

      // 履歴ファイルの読み込みをモック
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('history')) {
          return Promise.resolve(JSON.stringify([
            {
              version: '1.0.0',
              policy: '【基本原則】\n初期版\n【制限事項】\nなし',
              createdAt: new Date('2024-01-01'),
              createdBy: 'system',
              changeLog: 'Initial version'
            },
            {
              version: '1.0.1',
              policy: '【基本原則】\n更新1\n【制限事項】\nなし',
              createdAt: new Date('2024-01-02'),
              createdBy: 'user1',
              changeLog: 'Updated by user1'
            },
            {
              version: '1.0.2',
              policy: '【基本原則】\n更新2\n【制限事項】\nなし',
              createdAt: new Date('2024-01-03'),
              createdBy: 'user2',
              changeLog: 'Updated by user2'
            }
          ]));
        }
        return Promise.resolve('{}');
      });

      // 履歴を再読み込み
      await administrator['loadPolicyHistory'](policyId);
      
      const history = await administrator.getPolicyHistory(policyId);
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe('1.0.2'); // 新しい順
      expect(history[2].version).toBe('1.0.0');
    });
  });

  describe('ポリシー検索とフィルタリング', () => {
    beforeEach(async () => {
      // テスト用ポリシーを作成
      await administrator.createPolicy(
        'Customer Policy',
        '【基本原則】\n顧客ポリシー\n【制限事項】\nなし',
        { tags: ['customer', 'data-access'], status: 'active' }
      );
      
      await administrator.createPolicy(
        'Financial Policy',
        '【基本原則】\n財務ポリシー\n【制限事項】\nなし',
        { tags: ['financial', 'critical'], status: 'active' }
      );
      
      await administrator.createPolicy(
        'Old Policy',
        '【基本原則】\n古いポリシー\n【制限事項】\nなし',
        { tags: ['deprecated'], status: 'deprecated' }
      );
    });

    it('ステータスでフィルタリングできる', async () => {
      const activePolicies = await administrator.listPolicies({ status: 'active' });
      expect(activePolicies.filter(p => p.status === 'active')).toHaveLength(2);

      const deprecatedPolicies = await administrator.listPolicies({ status: 'deprecated' });
      expect(deprecatedPolicies.filter(p => p.status === 'deprecated')).toHaveLength(1);
    });

    it('タグでフィルタリングできる', async () => {
      const customerPolicies = await administrator.listPolicies({ tags: ['customer'] });
      expect(customerPolicies.some(p => p.tags.includes('customer'))).toBe(true);

      const criticalPolicies = await administrator.listPolicies({ tags: ['critical'] });
      expect(criticalPolicies.some(p => p.tags.includes('critical'))).toBe(true);
    });
  });

  describe('インポート/エクスポート', () => {
    it('ポリシーをエクスポートできる', async () => {
      const policyId = await administrator.createPolicy(
        'Export Test',
        '【基本原則】\nエクスポートテスト\n【制限事項】\nなし',
        {
          tags: ['test', 'export'],
          description: 'エクスポート機能のテスト'
        }
      );

      const exported = await administrator.exportPolicy(policyId);

      expect(exported).toMatchObject({
        version: '1.0',
        exportedAt: expect.any(Date),
        exportedBy: 'system',
        policy: expect.objectContaining({
          name: 'Export Test',
          policy: expect.stringContaining('エクスポートテスト')
        })
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('exports'),
        expect.any(String),
        expect.any(String)
      );
    });

    it('ポリシーをインポートできる', async () => {
      const exportData = {
        version: '1.0',
        exportedAt: new Date('2024-01-10'),
        exportedBy: 'external-system',
        policy: {
          name: 'Imported Policy',
          description: '外部からインポートされたポリシー',
          policy: '【基本原則】\nインポートされた内容\n【制限事項】\nなし',
          examples: [],
          metadata: {
            id: 'old-id',
            name: 'Imported Policy',
            description: '外部からインポートされたポリシー',
            version: '2.0.0',
            createdAt: new Date('2023-01-01'),
            createdBy: 'external',
            lastModified: new Date('2023-12-31'),
            lastModifiedBy: 'external',
            tags: ['imported', 'external'],
            status: 'active' as const
          }
        } as NaturalLanguagePolicyDefinition,
        history: []
      };

      const newPolicyId = await administrator.importPolicy(exportData, 'importer');

      expect(newPolicyId).toMatch(/^policy-[a-f0-9-]+$/);
      
      const imported = await administrator.getPolicy(newPolicyId);
      expect(imported).toBeTruthy();
      expect(imported?.metadata.name).toBe('Imported Policy');
      expect(imported?.metadata.version).toBe('1.0.0'); // バージョンはリセット
      expect(imported?.metadata.createdBy).toBe('importer');
    });

    it('同名ポリシーのインポート時に番号を付与する', async () => {
      // 既存のポリシーを作成
      await administrator.createPolicy('Duplicate Name', '【基本原則】\n既存\n【制限事項】\nなし');

      const exportData = {
        version: '1.0',
        exportedAt: new Date(),
        exportedBy: 'system',
        policy: {
          name: 'Duplicate Name',
          description: '重複テスト',
          policy: '【基本原則】\n新規\n【制限事項】\nなし',
          examples: [],
          metadata: {
            id: 'old-id',
            name: 'Duplicate Name',
            description: '重複テスト',
            version: '1.0.0',
            createdAt: new Date(),
            createdBy: 'system',
            lastModified: new Date(),
            lastModifiedBy: 'system',
            tags: [],
            status: 'active' as const
          }
        } as NaturalLanguagePolicyDefinition
      };

      const newPolicyId = await administrator.importPolicy(exportData);
      const imported = await administrator.getPolicy(newPolicyId);
      
      expect(imported?.metadata.name).toMatch(/Duplicate Name \(\d+\)/);
    });
  });

  describe('ポリシーステータス管理', () => {
    it('ポリシーのステータスを変更できる', async () => {
      const policyId = await administrator.createPolicy(
        'Status Test',
        '【基本原則】\nステータステスト\n【制限事項】\nなし',
        { status: 'draft' }
      );

      // draft -> active
      await administrator.updatePolicyStatus(policyId, 'active', 'approver');
      let policy = await administrator.getPolicy(policyId);
      expect(policy?.metadata.status).toBe('active');

      // active -> deprecated
      await administrator.updatePolicyStatus(policyId, 'deprecated', 'admin');
      policy = await administrator.getPolicy(policyId);
      expect(policy?.metadata.status).toBe('deprecated');
    });
  });

  describe('ファイルシステム永続化', () => {
    it('起動時に既存のポリシーを読み込む', async () => {
      const mockPolicies = [
        {
          name: 'Loaded Policy 1',
          description: '読み込まれたポリシー1',
          policy: '【基本原則】\nロード1\n【制限事項】\nなし',
          examples: [],
          metadata: {
            id: 'policy-loaded-1',
            name: 'Loaded Policy 1',
            description: '読み込まれたポリシー1',
            version: '1.0.0',
            createdAt: '2024-01-01T00:00:00Z',
            createdBy: 'system',
            lastModified: '2024-01-01T00:00:00Z',
            lastModifiedBy: 'system',
            tags: ['loaded'],
            status: 'active'
          }
        }
      ];

      (fs.readdir as jest.Mock).mockResolvedValueOnce(['policy-loaded-1.json']);
      (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockPolicies[0]));

      const newAdmin = new PolicyAdministrator(testStorageDir);
      // 初期化を待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      const policies = await newAdmin.listPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('Loaded Policy 1');
    });

    it('ポリシー作成時にディスクに保存する', async () => {
      await administrator.createPolicy(
        'Persist Test',
        '【基本原則】\n永続化テスト\n【制限事項】\nなし'
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-policies/policy-'),
        expect.stringContaining('Persist Test'),
        expect.any(String)
      );
    });
  });
});