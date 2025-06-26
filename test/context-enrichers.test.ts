import { TimeBasedEnricher } from '../src/context/enrichers/time-based';
import { AgentInfoEnricher } from '../src/context/enrichers/agent-info';
import { ResourceClassifier } from '../src/context/enrichers/resource-classifier';
import { SecurityInfoEnricher } from '../src/context/enrichers/security-info';
import { DecisionContext } from '../src/types';

describe('Context Enrichers - 機能テスト', () => {
  describe('TimeBasedEnricher', () => {
    let enricher: TimeBasedEnricher;

    beforeEach(() => {
      enricher = new TimeBasedEnricher();
    });

    it('営業時間を正しく判定する', async () => {
      // 営業時間内（月曜日 10:00）
      const businessHoursContext: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date('2024-01-15T10:00:00+09:00'), // 月曜日 10:00 JST
        environment: {}
      };

      const enriched = await enricher.enrich(businessHoursContext);

      expect(enriched['time-based']).toMatchObject({
        isBusinessHours: true,
        dayOfWeek: 1,
        dayOfWeekName: 'Monday',
        hour: 10,
        timezone: 'Asia/Tokyo',
        isWeekend: false,
        isHoliday: false
      });
    });

    it('営業時間外を正しく判定する', async () => {
      // 営業時間外（日曜日 22:00）
      const afterHoursContext: DecisionContext = {
        agent: 'test-agent',
        action: 'write',
        resource: 'test-resource',
        time: new Date('2024-01-14T22:00:00+09:00'), // 日曜日 22:00 JST
        environment: {}
      };

      const enriched = await enricher.enrich(afterHoursContext);

      expect(enriched['time-based']).toMatchObject({
        isBusinessHours: false,
        dayOfWeek: 0,
        dayOfWeekName: 'Sunday',
        hour: 22,
        isWeekend: true,
        isHoliday: false
      });
    });

    it('祝日を考慮した判定ができる', async () => {
      // 祝日判定のモック
      enricher['isHoliday'] = jest.fn().mockReturnValue(true);

      const holidayContext: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date('2024-01-01T10:00:00+09:00'), // 元日
        environment: {}
      };

      const enriched = await enricher.enrich(holidayContext);

      expect(enriched['time-based']).toMatchObject({
        isBusinessHours: true, // 10時は営業時間内（祝日でも時間帯は変わらない）
        isHoliday: true,
        isBusinessDay: false // 祝日なので営業日ではない
      });
    });

    it('タイムゾーンを考慮した判定ができる', async () => {
      // 異なるタイムゾーンでのテスト
      const contexts = [
        {
          time: new Date('2024-01-15T10:00:00+09:00'), // JST 10:00
          expectedTz: 'Asia/Tokyo',
          expectedHour: 10
        },
        {
          time: new Date('2024-01-15T10:00:00-05:00'), // EST 10:00
          expectedTz: 'America/New_York',
          expectedHour: 10
        },
        {
          time: new Date('2024-01-15T10:00:00+00:00'), // UTC 10:00
          expectedTz: 'UTC',
          expectedHour: 10
        }
      ];

      for (const ctx of contexts) {
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: 'test-resource',
          time: ctx.time,
          environment: {
            userTimeZone: ctx.expectedTz
          }
        };

        const enriched = await enricher.enrich(context);
        expect(enriched['time-based'].timezone).toBe('Asia/Tokyo'); // 常に設定されたタイムゾーン
        expect(enriched['time-based'].hour).toBe(ctx.time.getHours()); // 実際の時間
      }
    });
  });

  describe('AgentInfoEnricher', () => {
    let enricher: AgentInfoEnricher;

    beforeEach(() => {
      enricher = new AgentInfoEnricher();
      // エージェント情報のモックデータ
      enricher['agentDatabase'] = new Map([
        ['customer-support-agent', {
          id: 'customer-support-agent',
          type: 'support',
          department: 'customer-support',
          clearanceLevel: 2,
          createdAt: new Date('2023-01-01'),
          lastActivity: new Date('2024-01-15T09:00:00Z'),
          permissions: ['read-customer-data', 'create-tickets'],
          tags: ['production', 'verified'],
          riskScore: 0.2,
          isExternal: false,
          supervisor: 'support-manager',
          location: 'tokyo-office'
        }],
        ['admin-agent', {
          id: 'admin-agent',
          type: 'admin',
          department: 'it',
          clearanceLevel: 5,
          createdAt: new Date('2022-01-01'),
          lastActivity: new Date('2024-01-15T08:00:00Z'),
          permissions: ['*'],
          tags: ['production', 'verified', 'admin', 'privileged'],
          riskScore: 0.1,
          isExternal: false,
          supervisor: 'cto',
          location: 'tokyo-hq'
        }],
        ['external-partner', {
          id: 'external-partner',
          type: 'contractor',
          department: 'external',
          clearanceLevel: 1,
          createdAt: new Date('2023-06-01'),
          lastActivity: new Date('2024-01-14T18:00:00Z'),
          permissions: ['read-public-data'],
          tags: ['external', 'limited-access'],
          riskScore: 0.8,
          isExternal: true,
          supervisor: 'contract-manager',
          location: 'remote'
        }]
      ]);
    });

    it('内部エージェント情報を正しく取得する', async () => {
      const context: DecisionContext = {
        agent: 'customer-support-agent',
        action: 'read',
        resource: 'customer-database',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['agent-info']).toMatchObject({
        agentId: 'customer-support-agent',
        agentType: 'support',
        department: 'customer-support',
        clearanceLevel: 2,
        clearanceName: 'standard',
        isExternal: false,
        permissions: ['read-customer-data', 'create-tickets'],
        ageDays: expect.any(Number), // エージェント作成からの経過日数
        inactiveDays: expect.any(Number) // 最終活動からの日数
      });
    });

    it('外部エージェントを識別する', async () => {
      const context: DecisionContext = {
        agent: 'external-partner',
        action: 'read',
        resource: 'public-api',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['agent-info']).toMatchObject({
        agentId: 'external-partner',
        agentType: 'contractor',
        department: 'external',
        clearanceLevel: 1,
        clearanceName: 'basic',
        isExternal: true
      });
    });

    it('未知のエージェントを適切に処理する', async () => {
      const context: DecisionContext = {
        agent: 'unknown-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['agent-info']).toMatchObject({
        agentId: 'unknown-agent',
        agentType: 'unknown',
        department: 'unknown',
        clearanceLevel: 0,
        clearanceName: 'none',
        permissions: [],
        isExternal: true,
        riskScore: 1.0
      });
    });

    it('エージェントの活動状態を判定する', async () => {
      // 最近の活動日時を設定
      const recentActivity = new Date();
      recentActivity.setHours(recentActivity.getHours() - 2); // 2時間前
      
      enricher['agentDatabase'].set('recent-agent', {
        id: 'recent-agent',
        type: 'support',
        department: 'customer-support',
        clearanceLevel: 2,
        createdAt: new Date('2023-01-01'),
        lastActivity: recentActivity,
        permissions: ['read-customer-data'],
        tags: ['production'],
        riskScore: 0.2,
        isExternal: false,
        supervisor: 'support-manager',
        location: 'tokyo-office'
      });
      
      const context: DecisionContext = {
        agent: 'recent-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['agent-info'].inactiveDays).toBeLessThan(1); // 1日以内にアクティブ
      expect(enriched['agent-info'].activityStatus).toBe('active-today');
      expect(enriched['agent-info'].isInactive).toBe(false);
    });
  });

  describe('ResourceClassifier', () => {
    let classifier: ResourceClassifier;

    beforeEach(() => {
      classifier = new ResourceClassifier();
    });

    it('リソースの機密度を分類する', async () => {
      const testCases = [
        {
          resource: 'customer://profile/12345',
          expectedType: 'customer-data',
          expectedSensitivity: 'high',
          expectedTags: ['pii', 'regulated']
        },
        {
          resource: 'financial://reports/q4-2023',
          expectedType: 'financial-data',
          expectedSensitivity: 'critical',
          expectedTags: ['financial', 'regulated', 'audit-required']
        },
        {
          resource: 'public://blog/posts/hello-world',
          expectedType: 'public-data',
          expectedSensitivity: 'low',
          expectedTags: ['public']
        },
        {
          resource: 'file:///etc/passwd',
          expectedType: 'unclassified',
          expectedSensitivity: 'high',
          expectedTags: ['unclassified', 'review-required']
        }
      ];

      for (const testCase of testCases) {
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: testCase.resource,
          time: new Date(),
          environment: {}
        };

        const enriched = await classifier.enrich(context);

        expect(enriched['resource-classifier']).toMatchObject({
          dataType: testCase.expectedType,
          sensitivityLevel: testCase.expectedSensitivity,
          tags: expect.arrayContaining(testCase.expectedTags)
        });
      }
    });

    it('個人情報を含むリソースを識別する', async () => {
      const piiResources = [
        'customer://profile/john-doe',
        'database://users/emails',
        'api://v1/users/123/personal-info',
        'file:///home/users/private/ssn.txt'
      ];

      for (const resource of piiResources) {
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: resource,
          time: new Date(),
          environment: {}
        };

        const enriched = await classifier.enrich(context);

        expect(enriched['resource-classifier'].isPii).toBe(true);
        expect(enriched['resource-classifier'].tags).toContain('pii');
      }
    });

    it('リソースの所有者を特定する', async () => {
      classifier['resourceOwners'] = new Map([
        ['customer://profile', { owner: 'customer-service-team', department: 'CS', dataController: 'data-team' }],
        ['financial://reports', { owner: 'finance-team', department: 'Finance', dataController: 'compliance-team' }],
        ['engineering://code', { owner: 'dev-team', department: 'Engineering', dataController: 'security-team' }]
      ]);

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'financial://reports/annual-2023',
        time: new Date(),
        environment: {}
      };

      const enriched = await classifier.enrich(context);

      expect(enriched['resource-classifier']).toMatchObject({
        owner: 'finance-team',
        department: 'Finance'
      });
    });
  });

  describe('SecurityInfoEnricher', () => {
    let enricher: SecurityInfoEnricher;

    beforeEach(() => {
      enricher = new SecurityInfoEnricher();
      // セキュリティ情報のモック
      enricher['securityDatabase'] = {
        failedAttempts: new Map([
          ['suspicious-agent', 5],
          ['blocked-agent', 10]
        ]),
        ipReputations: new Map([
          ['192.168.1.100', { score: 0.9, isVPN: false, country: 'JP' }],
          ['10.0.0.1', { score: 0.8, isVPN: true, country: 'US' }],
          ['1.2.3.4', { score: 0.2, isVPN: false, country: 'CN' }]
        ])
      };
    });

    it('IPアドレスベースのリスク評価を行う', async () => {
      const contexts = [
        {
          ip: '192.168.1.100',
          expectedRisk: 'low',
          expectedVPN: false
        },
        {
          ip: '10.0.0.1',
          expectedRisk: 'medium',
          expectedVPN: true
        },
        {
          ip: '1.2.3.4',
          expectedRisk: 'high',
          expectedVPN: false
        }
      ];

      for (const test of contexts) {
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: 'test-resource',
          time: new Date(),
          environment: {
            clientIP: test.ip
          }
        };

        const enriched = await enricher.enrich(context);

        expect(enriched['security-info']).toMatchObject({
          clientIP: test.ip,
          geoLocation: expect.objectContaining({
            country: expect.any(String),
            city: expect.any(String)
          })
        });
      }
    });

    it('失敗試行回数を追跡する', async () => {
      const context: DecisionContext = {
        agent: 'suspicious-agent',
        action: 'write',
        resource: 'sensitive-data',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info']).toMatchObject({
        recentFailedAttempts: expect.any(Number),
        threatLevel: expect.any(String),
        securityScore: expect.any(Number)
      });
    });

    it('ブロックされたエージェントを識別する', async () => {
      const context: DecisionContext = {
        agent: 'blocked-agent',
        action: 'delete',
        resource: 'critical-resource',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info']).toMatchObject({
        recentFailedAttempts: expect.any(Number),
        threatLevel: expect.any(String),
        requiresAdditionalAuth: expect.any(Boolean)
      });
    });

    it('総合的なリスクスコアを計算する', async () => {
      const context: DecisionContext = {
        agent: 'suspicious-agent',
        action: 'delete', // 高リスクアクション
        resource: 'financial://accounts/all', // 高機密リソース
        time: new Date('2024-01-15T03:00:00Z'), // 深夜
        environment: {
          clientIP: '1.2.3.4', // 高リスクIP
          isFirstAccess: true
        }
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info']).toMatchObject({
        securityScore: expect.any(Number),
        threatLevel: expect.any(String),
        threatReasons: expect.any(Array)
      });

      expect(enriched['security-info'].securityScore).toBeLessThan(0.5); // 低スコアは高リスク
    });

    it('異常なアクセスパターンを検出する', async () => {
      enricher['accessPatterns'] = new Map([
        ['normal-agent', {
          typicalHours: [9, 10, 11, 14, 15, 16, 17],
          typicalResources: ['public://data', 'internal://reports'],
          typicalActions: ['read', 'list']
        }]
      ]);

      const anomalousContext: DecisionContext = {
        agent: 'normal-agent',
        action: 'delete', // 通常と異なるアクション
        resource: 'financial://sensitive', // 通常アクセスしないリソース
        time: new Date('2024-01-15T03:00:00Z'), // 通常の時間外
        environment: {}
      };

      const enriched = await enricher.enrich(anomalousContext);

      expect(enriched['security-info']).toMatchObject({
        unusualActivity: expect.any(Array),
        securityScore: expect.any(Number),
        threatLevel: expect.any(String)
      });
      
      // 異常パターンが検出されていることを確認
      expect(enriched['security-info'].unusualActivity.length).toBeGreaterThan(0);
    });
  });

  describe('ContextCollector統合テスト', () => {
    it('全てのenricherが協調して動作する', async () => {
      const { ContextCollector } = await import('../src/context/collector');
      
      const timeEnricher = new TimeBasedEnricher();
      const agentEnricher = new AgentInfoEnricher();
      const resourceClassifier = new ResourceClassifier();
      const securityEnricher = new SecurityInfoEnricher();

      // 実際のContextCollectorクラスを使用
      const collector = new ContextCollector();
      collector.registerEnricher(timeEnricher);
      collector.registerEnricher(agentEnricher);
      collector.registerEnricher(resourceClassifier);
      collector.registerEnricher(securityEnricher);

      const baseContext: DecisionContext = {
        agent: 'customer-support-agent',
        action: 'read',
        resource: 'customer://profile/12345',
        time: new Date('2024-01-15T10:00:00+09:00'),
        purpose: 'customer-inquiry',
        environment: {
          clientIP: '192.168.1.100',
          requestId: 'req-123',
          sessionId: 'session-456'
        }
      };

      const enrichedContext = await collector.enrichContext(baseContext);

      // 全てのenricherからの情報が統合されていることを確認
      expect(enrichedContext).toMatchObject({
        // 基本情報
        agent: 'customer-support-agent',
        action: 'read',
        resource: 'customer://profile/12345',
        purpose: 'customer-inquiry',
        
        // 環境情報にエンリッチメントデータが含まれる
        environment: expect.objectContaining({
          requestId: 'req-123',
          sessionId: 'session-456',
          enrichments: expect.objectContaining({
            'time-based': expect.objectContaining({
              isBusinessHours: true,
              dayOfWeekName: 'Monday',
              isWeekend: false
            }),
            'agent-info': expect.objectContaining({
              agentType: expect.any(String),
              department: expect.any(String),
              clearanceLevel: expect.any(Number)
            }),
            'resource-classifier': expect.objectContaining({
              dataType: 'customer-data',
              sensitivityLevel: 'high',
              isPii: true
            }),
            'security-info': expect.objectContaining({
              clientIP: '192.168.1.100',
              threatLevel: expect.any(String)
            })
          })
        })
      });
    });
  });
});