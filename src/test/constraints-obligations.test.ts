import { ConstraintExecutor, ObligationExecutor } from '../core/enforcement';
import { PolicyDecision, DecisionContext } from '../types';

// モックモジュール
jest.mock('../utils/logger');

describe('制約・義務処理 - Phase2機能テスト', () => {
  describe('ConstraintExecutor - 制約の実行', () => {
    let executor: ConstraintExecutor;

    beforeEach(() => {
      executor = new ConstraintExecutor();
    });

    describe('データ匿名化制約', () => {
      it('個人情報を含むJSONデータを匿名化する', () => {
        const originalData = {
          name: '山田太郎',
          email: 'yamada.taro@example.com',
          phone: '090-1234-5678',
          address: '東京都千代田区1-1-1',
          age: 30,
          company: 'Example Corp'
        };

        const constraint = '個人情報を匿名化';
        const result = executor.applyConstraint(constraint, originalData);

        expect(result).toMatchObject({
          name: '[REDACTED]',
          email: expect.stringMatching(/\*{4}@example\.com/),
          phone: '[REDACTED]',
          address: expect.stringContaining('[REDACTED]'),
          age: 30, // 年齢は個人情報として扱わない
          company: 'Example Corp'
        });
      });

      it('ネストされたオブジェクトの個人情報も匿名化する', () => {
        const originalData = {
          user: {
            profile: {
              name: '田中花子',
              email: 'tanaka@example.com',
              creditCard: '1234-5678-9012-3456'
            },
            settings: {
              notifications: true
            }
          },
          metadata: {
            created: '2024-01-15'
          }
        };

        const constraint = '個人情報を匿名化';
        const result = executor.applyConstraint(constraint, originalData);

        expect(result.user.profile.name).toBe('[REDACTED]');
        expect(result.user.profile.creditCard).toBe('[REDACTED]');
        expect(result.user.settings.notifications).toBe(true);
      });

      it('配列内の個人情報も処理する', () => {
        const originalData = {
          users: [
            { name: '佐藤', email: 'sato@example.com' },
            { name: '鈴木', email: 'suzuki@example.com' },
            { name: '高橋', email: 'takahashi@example.com' }
          ]
        };

        const constraint = '個人情報を匿名化';
        const result = executor.applyConstraint(constraint, originalData);

        result.users.forEach(user => {
          expect(user.name).toBe('[REDACTED]');
          expect(user.email).toMatch(/\*{4}@example\.com/);
        });
      });
    });

    describe('アクセス範囲制限', () => {
      it('指定フィールドのみを含むデータに制限する', () => {
        const originalData = {
          id: '12345',
          name: '商品A',
          price: 1000,
          cost: 600,
          supplier: 'Supplier X',
          internalNotes: '利益率40%'
        };

        const constraint = 'フィールド制限: id,name,price';
        const result = executor.applyConstraint(constraint, originalData);

        expect(result).toEqual({
          id: '12345',
          name: '商品A',
          price: 1000
        });
        expect(result).not.toHaveProperty('cost');
        expect(result).not.toHaveProperty('supplier');
        expect(result).not.toHaveProperty('internalNotes');
      });

      it('レコード数を制限する', () => {
        const originalData = {
          records: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            value: `Record ${i + 1}`
          }))
        };

        const constraint = 'レコード数制限: 10';
        const result = executor.applyConstraint(constraint, originalData);

        expect(result.records).toHaveLength(10);
        expect(result.records[0].id).toBe(1);
        expect(result.records[9].id).toBe(10);
        expect(result._truncated).toBe(true);
        expect(result._originalCount).toBe(100);
      });
    });

    describe('時間制限', () => {
      it('実行時間が制限を超えた場合に処理を中断する', async () => {
        const longRunningProcess = async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { result: 'completed' };
        };

        const constraint = '実行時間制限: 1秒';
        
        const startTime = Date.now();
        const result = await executor.applyTimeConstraint(
          constraint,
          longRunningProcess
        );
        const elapsed = Date.now() - startTime;

        expect(elapsed).toBeLessThan(1500); // 1秒 + バッファ
        expect(result).toMatchObject({
          error: 'TIMEOUT',
          message: expect.stringContaining('実行時間制限'),
          limit: 1000
        });
      });
    });

    describe('データサイズ制限', () => {
      it('大きなデータを指定サイズに切り詰める', () => {
        const largeText = 'A'.repeat(10000); // 10KB
        const originalData = {
          content: largeText,
          metadata: {
            size: 'large'
          }
        };

        const constraint = 'データサイズ制限: 1KB';
        const result = executor.applyConstraint(constraint, originalData);

        expect(result.content.length).toBeLessThanOrEqual(1024);
        expect(result.content).toEndWith('[TRUNCATED]');
        expect(result._truncated).toBe(true);
        expect(result._originalSize).toBe(10000);
      });
    });

    describe('複数制約の組み合わせ', () => {
      it('複数の制約を順番に適用する', () => {
        const originalData = {
          users: Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            name: `User ${i + 1}`,
            email: `user${i + 1}@example.com`,
            password: 'secret123',
            role: 'user'
          }))
        };

        const constraints = [
          '個人情報を匿名化',
          'フィールド制限: id,name,role',
          'レコード数制限: 5'
        ];

        let result = originalData;
        for (const constraint of constraints) {
          result = executor.applyConstraint(constraint, result);
        }

        expect(result.users).toHaveLength(5);
        expect(result.users[0]).toEqual({
          id: 1,
          name: '[REDACTED]',
          role: 'user'
        });
        expect(result.users[0]).not.toHaveProperty('email');
        expect(result.users[0]).not.toHaveProperty('password');
      });
    });
  });

  describe('ObligationExecutor - 義務の実行', () => {
    let executor: ObligationExecutor;

    beforeEach(() => {
      jest.clearAllMocks();
      executor = new ObligationExecutor();
      
      // 外部サービスのモック
      executor['auditLogger'] = {
        log: jest.fn().mockResolvedValue(true)
      };
      executor['notificationService'] = {
        send: jest.fn().mockResolvedValue(true)
      };
      executor['scheduler'] = {
        schedule: jest.fn().mockResolvedValue('job-123')
      };
    });

    describe('監査ログ記録', () => {
      it('アクセスログを記録する', async () => {
        const context: DecisionContext = {
          agent: 'user-123',
          action: 'read',
          resource: 'customer://profile/456',
          purpose: 'customer-support',
          time: new Date('2024-01-15T10:00:00Z'),
          environment: {
            clientIP: '192.168.1.100',
            sessionId: 'session-789'
          }
        };

        const decision: PolicyDecision = {
          decision: 'PERMIT',
          reason: 'Valid access during business hours',
          confidence: 0.95
        };

        await executor.executeObligation('アクセスログ記録', context, decision);

        expect(executor['auditLogger'].log).toHaveBeenCalledWith({
          timestamp: expect.any(Date),
          agent: 'user-123',
          action: 'read',
          resource: 'customer://profile/456',
          decision: 'PERMIT',
          reason: 'Valid access during business hours',
          purpose: 'customer-support',
          clientIP: '192.168.1.100',
          sessionId: 'session-789'
        });
      });

      it('機密データアクセスの詳細ログを記録する', async () => {
        const context: DecisionContext = {
          agent: 'admin-user',
          action: 'export',
          resource: 'financial://reports/annual-2023',
          time: new Date(),
          environment: {
            resourceSensitivity: 'critical',
            dataClassification: 'confidential'
          }
        };

        const decision: PolicyDecision = {
          decision: 'PERMIT',
          reason: 'Admin access permitted',
          confidence: 0.98,
          constraints: ['暗号化必須']
        };

        await executor.executeObligation('機密アクセス詳細ログ', context, decision);

        expect(executor['auditLogger'].log).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 'critical',
            sensitivityLevel: 'critical',
            dataClassification: 'confidential',
            additionalContext: expect.any(Object)
          })
        );
      });
    });

    describe('通知送信', () => {
      it('管理者への通知を送信する', async () => {
        const context: DecisionContext = {
          agent: 'suspicious-user',
          action: 'delete',
          resource: 'database://customers/all',
          time: new Date(),
          environment: {
            riskScore: 0.9
          }
        };

        await executor.executeObligation('管理者への通知', context, {} as PolicyDecision);

        expect(executor['notificationService'].send).toHaveBeenCalledWith({
          to: 'admin@example.com',
          subject: expect.stringContaining('高リスクアクセス検出'),
          body: expect.stringContaining('suspicious-user'),
          priority: 'high'
        });
      });

      it('データ所有者への通知を送信する', async () => {
        const context: DecisionContext = {
          agent: 'external-partner',
          action: 'read',
          resource: 'customer://profile/789',
          time: new Date(),
          environment: {
            resourceOwner: 'customer-team',
            ownerEmail: 'customer-team@example.com'
          }
        };

        await executor.executeObligation('データ所有者への通知', context, {} as PolicyDecision);

        expect(executor['notificationService'].send).toHaveBeenCalledWith({
          to: 'customer-team@example.com',
          subject: expect.stringContaining('データアクセス通知'),
          body: expect.stringContaining('external-partner'),
          priority: 'normal'
        });
      });
    });

    describe('自動削除スケジューリング', () => {
      it('30日後の削除をスケジュールする', async () => {
        const context: DecisionContext = {
          agent: 'temp-agent',
          action: 'create',
          resource: 'temp://data/xyz',
          time: new Date('2024-01-15T10:00:00Z'),
          environment: {}
        };

        await executor.executeObligation('30日後削除スケジュール設定', context, {} as PolicyDecision);

        const expectedDate = new Date('2024-02-14T10:00:00Z');
        
        expect(executor['scheduler'].schedule).toHaveBeenCalledWith({
          jobType: 'delete-resource',
          resource: 'temp://data/xyz',
          scheduledAt: expectedDate,
          metadata: {
            reason: 'ポリシーによる自動削除',
            createdBy: 'temp-agent',
            createdAt: expect.any(Date)
          }
        });
      });

      it('カスタム期間での削除をスケジュールする', async () => {
        const context: DecisionContext = {
          agent: 'user-123',
          action: 'upload',
          resource: 'uploads://file/abc',
          time: new Date('2024-01-15T10:00:00Z'),
          environment: {}
        };

        await executor.executeObligation('7日後削除スケジュール設定', context, {} as PolicyDecision);

        const expectedDate = new Date('2024-01-22T10:00:00Z');
        
        expect(executor['scheduler'].schedule).toHaveBeenCalledWith(
          expect.objectContaining({
            scheduledAt: expectedDate
          })
        );
      });
    });

    describe('レポート生成', () => {
      it('アクセスレポートを生成する', async () => {
        const context: DecisionContext = {
          agent: 'analyst-user',
          action: 'analyze',
          resource: 'analytics://customer-data',
          time: new Date(),
          environment: {
            analysisType: 'customer-behavior',
            reportFormat: 'pdf'
          }
        };

        executor['reportGenerator'] = {
          generate: jest.fn().mockResolvedValue({
            reportId: 'report-123',
            path: '/reports/report-123.pdf'
          })
        };

        await executor.executeObligation('アクセスレポート生成', context, {} as PolicyDecision);

        expect(executor['reportGenerator'].generate).toHaveBeenCalledWith({
          type: 'access-report',
          context: context,
          format: 'pdf',
          includeDetails: true
        });
      });
    });

    describe('複数義務の並列実行', () => {
      it('複数の義務を効率的に並列実行する', async () => {
        const context: DecisionContext = {
          agent: 'important-user',
          action: 'modify',
          resource: 'critical://system-config',
          time: new Date(),
          environment: {}
        };

        const decision: PolicyDecision = {
          decision: 'PERMIT',
          reason: 'Authorized modification',
          confidence: 0.99,
          obligations: [
            'アクセスログ記録',
            '管理者への通知',
            'バックアップ作成',
            '変更レポート生成'
          ]
        };

        const startTime = Date.now();
        await executor.executeObligations(decision.obligations!, context, decision);
        const elapsed = Date.now() - startTime;

        // 全ての義務が実行されたことを確認
        expect(executor['auditLogger'].log).toHaveBeenCalled();
        expect(executor['notificationService'].send).toHaveBeenCalled();

        // 並列実行により、順次実行より高速であることを確認
        expect(elapsed).toBeLessThan(1000); // 各義務が200ms程度と仮定
      });
    });

    describe('エラーハンドリング', () => {
      it('義務実行エラーをログに記録するが処理は継続する', async () => {
        const context: DecisionContext = {
          agent: 'test-user',
          action: 'read',
          resource: 'test://resource',
          time: new Date(),
          environment: {}
        };

        // 通知送信をエラーにする
        executor['notificationService'].send.mockRejectedValueOnce(
          new Error('Notification service unavailable')
        );

        const obligations = ['アクセスログ記録', '管理者への通知'];

        await executor.executeObligations(obligations, context, {} as PolicyDecision);

        // エラーが発生しても他の義務は実行される
        expect(executor['auditLogger'].log).toHaveBeenCalled();
      });

      it('未知の義務を安全にスキップする', async () => {
        const context: DecisionContext = {
          agent: 'test-user',
          action: 'read',
          resource: 'test://resource',
          time: new Date(),
          environment: {}
        };

        const obligations = ['未知の義務タイプ', 'アクセスログ記録'];

        await executor.executeObligations(obligations, context, {} as PolicyDecision);

        // 未知の義務はスキップされ、既知の義務は実行される
        expect(executor['auditLogger'].log).toHaveBeenCalled();
      });
    });
  });

  describe('制約と義務の統合テスト', () => {
    it('PERMITの判定で制約と義務が両方適用される', async () => {
      const constraintExecutor = new ConstraintExecutor();
      const obligationExecutor = new ObligationExecutor();

      const context: DecisionContext = {
        agent: 'user-123',
        action: 'read',
        resource: 'customer://sensitive-data',
        time: new Date(),
        environment: {}
      };

      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Conditional access granted',
        confidence: 0.93,
        constraints: ['個人情報を匿名化', 'レコード数制限: 100'],
        obligations: ['アクセスログ記録', '24時間後削除スケジュール設定']
      };

      // データに制約を適用
      const originalData = {
        customers: Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          name: `Customer ${i + 1}`,
          email: `customer${i + 1}@example.com`,
          creditScore: 700 + i
        }))
      };

      let constrainedData = originalData;
      for (const constraint of decision.constraints!) {
        constrainedData = constraintExecutor.applyConstraint(constraint, constrainedData);
      }

      // 制約が適用されたことを確認
      expect(constrainedData.customers).toHaveLength(100);
      expect(constrainedData.customers[0].name).toBe('[REDACTED]');
      expect(constrainedData.customers[0].email).toMatch(/\*{4}@example\.com/);

      // 義務を実行
      obligationExecutor['auditLogger'] = { log: jest.fn().mockResolvedValue(true) };
      obligationExecutor['scheduler'] = { schedule: jest.fn().mockResolvedValue('job-456') };

      await obligationExecutor.executeObligations(decision.obligations!, context, decision);

      // 義務が実行されたことを確認
      expect(obligationExecutor['auditLogger'].log).toHaveBeenCalled();
      expect(obligationExecutor['scheduler'].schedule).toHaveBeenCalled();
    });
  });
});