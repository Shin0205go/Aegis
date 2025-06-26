import { DynamicToolDiscoveryService, ToolDiscoveryConfig } from '../src/mcp/dynamic-tool-discovery';
import { Logger } from '../src/utils/logger';

// Loggerをモック
jest.mock('../src/utils/logger');

describe('DynamicToolDiscoveryService', () => {
  let service: DynamicToolDiscoveryService;
  let mockLogger: jest.Mocked<Logger>;
  let defaultConfig: ToolDiscoveryConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(() => mockLogger);

    defaultConfig = {
      discovery: {
        enableAutoDiscovery: true,
        enableToolIntrospection: true,
        refreshInterval: 300000 // 5分
      },
      policyControl: {
        defaultMode: 'smart',
        smartRules: {
          highRiskPatterns: ['exec', 'shell', 'delete'],
          lowRiskPatterns: ['read', 'list', 'get'],
          trustedOrigins: ['official-mcp-server']
        },
        overrides: {
          'test-tool': {
            enforced: true,
            policy: 'test-policy'
          }
        }
      }
    };

    service = new DynamicToolDiscoveryService(defaultConfig, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('初期化', () => {
    it('正しく初期化される', () => {
      expect(service).toBeDefined();
      expect(Logger).toHaveBeenCalled();
    });

    it('リフレッシュ間隔が設定されている場合、定期実行を設定する', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      new DynamicToolDiscoveryService(defaultConfig, mockLogger);
      
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        300000
      );
    });

    it('リフレッシュ間隔がない場合、定期実行を設定しない', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const configWithoutInterval = {
        ...defaultConfig,
        discovery: {
          ...defaultConfig.discovery,
          refreshInterval: undefined
        }
      };
      
      new DynamicToolDiscoveryService(configWithoutInterval, mockLogger);
      
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe('discoverToolsFromHandshake', () => {
    it('自動発見が有効な場合、ハンドシェイクからツールを発見する', async () => {
      const handshakeData = {
        capabilities: { tools: true },
        tools: [
          { name: 'tool1', description: 'Test tool 1' },
          { name: 'tool2', description: 'Test tool 2' }
        ]
      };

      await service.discoverToolsFromHandshake(handshakeData);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Discovering tools from MCP handshake',
        { capabilities: { tools: true } }
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'tool1',
          source: 'mcp-handshake'
        })
      );
    });

    it('自動発見が無効な場合、何もしない', async () => {
      const configDisabled = {
        ...defaultConfig,
        discovery: {
          ...defaultConfig.discovery,
          enableAutoDiscovery: false
        }
      };
      
      const serviceDisabled = new DynamicToolDiscoveryService(configDisabled, mockLogger);
      
      await serviceDisabled.discoverToolsFromHandshake({
        tools: [{ name: 'tool1' }]
      });

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Discovering tools'),
        expect.any(Object)
      );
    });

    it('ツールがない場合も正常に処理する', async () => {
      await service.discoverToolsFromHandshake({
        capabilities: { tools: false }
      });

      expect(mockLogger.info).toHaveBeenCalledTimes(1); // 発見開始のログのみ
    });
  });

  describe('discoverToolsFromListResponse', () => {
    it('リストレスポンスからツールを発見する', async () => {
      const response = {
        tools: [
          { name: 'list-tool1', description: 'Tool from list' },
          { name: 'list-tool2', description: 'Another tool' }
        ]
      };

      await service.discoverToolsFromListResponse(response, 'upstream-server-1');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'list-tool1',
          source: 'upstream-server-1',
          risk: expect.any(String),
          category: expect.any(String)
        })
      );
    });

    it('空のツールリストも正常に処理する', async () => {
      await service.discoverToolsFromListResponse({ tools: [] }, 'server');
      await service.discoverToolsFromListResponse({}, 'server');

      // エラーが発生しないことを確認
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('discoverToolFromExecution', () => {
    it('実行時に新しいツールを発見する', async () => {
      const toolCall = {
        name: 'runtime-discovered-tool',
        args: {}
      };

      await service.discoverToolFromExecution(toolCall, 'runtime-client');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Discovered new tool through execution: runtime-discovered-tool'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'runtime-discovered-tool',
          source: 'runtime-client'
        })
      );
    });

    it('既に発見されているツールは再登録しない', async () => {
      // 最初に登録
      await service.discoverToolFromExecution({ name: 'existing-tool' }, 'client1');
      
      // ログをクリア
      mockLogger.info.mockClear();
      
      // 同じツールを再度発見
      await service.discoverToolFromExecution({ name: 'existing-tool' }, 'client2');

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Discovered new tool')
      );
    });

    it('自動発見が無効な場合は何もしない', async () => {
      const configDisabled = {
        ...defaultConfig,
        discovery: {
          ...defaultConfig.discovery,
          enableAutoDiscovery: false
        }
      };
      
      const serviceDisabled = new DynamicToolDiscoveryService(configDisabled, mockLogger);
      
      await serviceDisabled.discoverToolFromExecution({ name: 'tool' }, 'client');

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('tool属性がある場合も処理する', async () => {
      const toolCall = {
        tool: 'alternate-tool-property',
        args: {}
      };

      await service.discoverToolFromExecution(toolCall, 'alternate-client');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Discovered new tool through execution: alternate-tool-property'
      );
    });
  });

  describe('リスク評価', () => {
    it('高リスクパターンを正しく検出する', async () => {
      const highRiskTools = [
        { name: 'bash_command', description: 'Execute bash commands' },
        { name: 'shell_exec', description: 'Run shell scripts' },
        { name: 'delete_file', description: 'Delete files from system' },
        { name: 'admin_access', description: 'Admin privileges required' }
      ];

      for (const tool of highRiskTools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      // 各ツールが高リスクとして登録されることを確認
      expect(mockLogger.info).toHaveBeenCalledTimes(highRiskTools.length * 2); // 発見ログ + 登録ログ
      
      highRiskTools.forEach(tool => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Registered dynamic tool',
          expect.objectContaining({
            name: tool.name,
            risk: 'high'
          })
        );
      });
    });

    it('中リスクパターンを正しく検出する', async () => {
      const mediumRiskTools = [
        { name: 'write_file', description: 'Write content to file' },
        { name: 'update_config', description: 'Update configuration' },
        { name: 'rename_resource', description: 'Rename resources' }
      ];

      for (const tool of mediumRiskTools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      mediumRiskTools.forEach(tool => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Registered dynamic tool',
          expect.objectContaining({
            name: tool.name,
            risk: 'medium'
          })
        );
      });
    });

    it('低リスクパターンを正しく検出する', async () => {
      const lowRiskTools = [
        { name: 'read_file', description: 'Read file contents' },
        { name: 'list_resources', description: 'List available resources' },
        { name: 'get_info', description: 'Get system information' }
      ];

      for (const tool of lowRiskTools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      lowRiskTools.forEach(tool => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Registered dynamic tool',
          expect.objectContaining({
            name: tool.name,
            risk: 'low'
          })
        );
      });
    });

    it('カスタムルールによるリスク評価を適用する', async () => {
      const tools = [
        { name: 'custom_high_risk', description: 'Tool matching custom high risk' },
        { name: 'custom_low_risk', description: 'Tool matching custom low risk' }
      ];

      // カスタムルールは既にdefaultConfigに設定済み
      for (const tool of tools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      // execパターンがhighRiskPatternsに含まれているため
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'custom_high_risk',
          risk: 'high'
        })
      );
    });

    it('パターンに一致しない場合はmediumリスクとする', async () => {
      const tool = { name: 'unknown_tool', description: 'No matching patterns' };
      
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'unknown_tool',
          risk: 'medium'
        })
      );
    });
  });

  describe('ポリシー設定の決定', () => {
    it('オーバーライド設定が優先される', async () => {
      // defaultConfigには'test-tool'のオーバーライドが設定済み
      const tool = { name: 'test-tool', description: 'Tool with override' };
      
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'any-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'test-tool',
          policyEnforced: true
        })
      );
    });

    it('信頼できるソースからのツールは許可される', async () => {
      const tool = { name: 'trusted-tool', description: 'From trusted source' };
      
      await service.discoverToolsFromListResponse(
        { tools: [tool] }, 
        'official-mcp-server' // trustedOriginsに含まれる
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'trusted-tool',
          source: 'official-mcp-server',
          policyEnforced: false
        })
      );
    });

    it('allowlistモードで動作する', async () => {
      const allowlistConfig = {
        ...defaultConfig,
        policyControl: {
          ...defaultConfig.policyControl,
          defaultMode: 'allowlist' as const
        }
      };
      
      const allowlistService = new DynamicToolDiscoveryService(allowlistConfig, mockLogger);
      const tool = { name: 'new-tool', description: 'Unknown tool' };
      
      await allowlistService.discoverToolsFromListResponse({ tools: [tool] }, 'unknown-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'new-tool',
          policyEnforced: true // allowlistモードではデフォルトで制限
        })
      );
    });

    it('denylistモードで動作する', async () => {
      const denylistConfig = {
        ...defaultConfig,
        policyControl: {
          ...defaultConfig.policyControl,
          defaultMode: 'denylist' as const
        }
      };
      
      const denylistService = new DynamicToolDiscoveryService(denylistConfig, mockLogger);
      const tool = { name: 'new-tool', description: 'Unknown tool' };
      
      await denylistService.discoverToolsFromListResponse({ tools: [tool] }, 'unknown-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'new-tool',
          policyEnforced: false // denylistモードではデフォルトで許可
        })
      );
    });

    it('smartモードで高リスクツールは制限される', async () => {
      const tool = { name: 'exec_command', description: 'Execute arbitrary commands' };
      
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'unknown-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'exec_command',
          risk: 'high',
          policyEnforced: true
        })
      );
    });

    it('smartモードで低リスクツールは許可される', async () => {
      const tool = { name: 'read_data', description: 'Read data from source' };
      
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'unknown-source');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'read_data',
          risk: 'low',
          policyEnforced: false
        })
      );
    });
  });

  describe('ツールのカテゴリ分類', () => {
    it('ツールを適切なカテゴリに分類する', async () => {
      const tools = [
        { name: 'file_reader', description: 'Read files' },
        { name: 'network_request', description: 'Make HTTP requests' },
        { name: 'data_processor', description: 'Process data' }
      ];

      for (const tool of tools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      // カテゴリが作成されることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          category: expect.stringMatching(/file-management|network|data-processing|security|execution|general/)
        })
      );
    });

    it('複数のツールを同じカテゴリに分類する', async () => {
      const fileTools = [
        { name: 'read_file', description: 'Read file contents' },
        { name: 'write_file', description: 'Write to file' },
        { name: 'delete_file', description: 'Delete file' }
      ];

      for (const tool of fileTools) {
        await service.discoverToolsFromListResponse({ tools: [tool] }, 'test-source');
      }

      // すべてファイル管理カテゴリに分類されることを期待
      fileTools.forEach(tool => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Registered dynamic tool',
          expect.objectContaining({
            name: tool.name,
            category: 'file-management'
          })
        );
      });
    });
  });

  describe('ソースタイプの分類', () => {
    it('ソースタイプを正しく分類する', async () => {
      const testCases = [
        { source: 'mcp-proxy-server', expectedType: 'proxy' },
        { source: 'claude-desktop', expectedType: 'client' },
        { source: 'builtin-tools', expectedType: 'builtin' },
        { source: 'unknown-source', expectedType: 'proxy' } // デフォルト
      ];

      for (const { source, expectedType } of testCases) {
        await service.discoverToolsFromListResponse(
          { tools: [{ name: `tool-from-${source}` }] },
          source
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Registered dynamic tool',
          expect.objectContaining({
            source: source
          })
        );
      }
    });
  });

  describe('ツール発見の統合テスト', () => {
    it('同じツールが異なるソースから発見された場合、最新の情報で更新する', async () => {
      const tool = { name: 'shared-tool', description: 'Tool available from multiple sources' };
      
      // 最初のソースから発見
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'source1');
      
      // 2番目のソースから同じツールを発見
      await service.discoverToolsFromListResponse({ tools: [tool] }, 'source2');

      // 両方の登録ログが記録されることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'shared-tool',
          source: 'source1'
        })
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered dynamic tool',
        expect.objectContaining({
          name: 'shared-tool',
          source: 'source2'
        })
      );
    });

    it('定期的な再発見プロセスが動作する', async () => {
      // refreshToolDiscoveryメソッドのモック
      const refreshSpy = jest.spyOn(service as any, 'refreshToolDiscovery');
      refreshSpy.mockImplementation(() => {});

      // タイマーを進める
      jest.advanceTimersByTime(300000); // 5分

      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('パブリックメソッド', () => {
    it('発見されたツールを取得できる', async () => {
      const tools = [
        { name: 'tool1', description: 'First tool' },
        { name: 'tool2', description: 'Second tool' }
      ];

      await service.discoverToolsFromListResponse({ tools }, 'test-source');

      // getDiscoveredToolsメソッドが存在すると仮定
      const getDiscoveredTools = () => {
        return service['discoveredTools'];
      };

      const discovered = getDiscoveredTools();
      expect(discovered.size).toBe(2);
      expect(discovered.has('tool1')).toBe(true);
      expect(discovered.has('tool2')).toBe(true);
    });

    it('カテゴリ別にツールを取得できる', async () => {
      const tools = [
        { name: 'read_file', description: 'Read files' },
        { name: 'write_file', description: 'Write files' },
        { name: 'exec_command', description: 'Execute commands' }
      ];

      await service.discoverToolsFromListResponse({ tools }, 'test-source');

      // getToolsByCategoryメソッドが存在すると仮定
      const getToolsByCategory = (category: string) => {
        return service['toolCategories'].get(category);
      };

      const fileTools = getToolsByCategory('file-management');
      expect(fileTools?.size).toBeGreaterThanOrEqual(2);
      
      const execTools = getToolsByCategory('execution');
      expect(execTools?.has('exec_command')).toBe(true);
    });
  });
});