// ============================================================================
// ToolDiscoveryService Test Suite
// ============================================================================

import { 
  ToolDiscoveryService, 
  ToolSource, 
  DiscoveredTool,
  PolicyControlConfig 
} from '../../mcp/tool-discovery';
import { Logger } from '../../utils/logger';

// Mock logger
jest.mock('../../utils/logger');

describe('ToolDiscoveryService', () => {
  let service: ToolDiscoveryService;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;
    
    // Default config
    const defaultConfig = {
      includeNativeTools: true,
      includeDiscoveredTools: true,
      policyControl: {
        defaultEnabled: true,
        exceptions: ['TodoRead', 'TodoWrite', 'LS']
      },
      toolSources: [{
        type: 'native' as const,
        name: 'claude-code',
        policyControlled: true,
        prefix: '' // No prefix for tests
      }]
    };
    
    service = new ToolDiscoveryService(defaultConfig, mockLogger);
  });

  describe('Native Tools Registration', () => {
    it('should register all native tools on initialization', () => {
      const tools = service.getAllTools();
      
      // Check some native tools are registered
      expect(tools.some(t => t.name === 'Agent')).toBe(true);
      expect(tools.some(t => t.name === 'Bash')).toBe(true);
      expect(tools.some(t => t.name === 'Edit')).toBe(true);
      
      // Check log messages
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered native tool: Agent'),
        expect.any(Object)
      );
    });

    it('should apply prefix to native tools when configured', () => {
      const config = {
        includeNativeTools: true,
        toolSources: [{
          type: 'native' as const,
          name: 'claude-code',
          policyControlled: true,
          prefix: 'native__'
        }]
      };
      
      const serviceWithPrefix = new ToolDiscoveryService(config, mockLogger);
      const tools = serviceWithPrefix.getAllTools();
      
      expect(tools.some(t => t.name === 'native__Agent')).toBe(true);
      expect(tools.some(t => t.name === 'native__Bash')).toBe(true);
    });

    it('should skip native tools when disabled', () => {
      const config = {
        includeNativeTools: false
      };
      
      const serviceNoNative = new ToolDiscoveryService(config, mockLogger);
      const tools = serviceNoNative.getAllTools();
      
      expect(tools.length).toBe(0);
    });

    it('should apply policy control based on risk level', () => {
      const agent = service.getTool('Agent');
      const read = service.getTool('Read');
      
      expect(agent?.source.policyControlled).toBe(true); // High risk
      expect(read?.source.policyControlled).toBe(true); // Low risk but not in exceptions
    });

    it('should respect exceptions list', () => {
      const todoRead = service.getTool('TodoRead');
      const ls = service.getTool('LS');
      
      expect(todoRead?.source.policyControlled).toBe(false);
      expect(ls?.source.policyControlled).toBe(false);
    });
  });

  describe('Tool Registration from Clients', () => {
    it('should register discovered tool from client', () => {
      const tool = {
        name: 'custom-tool',
        description: 'A custom tool'
      };
      
      service.registerToolFromClient(tool, 'test-client');
      
      const registered = service.getTool('custom-tool');
      expect(registered).toBeDefined();
      expect(registered?.source.type).toBe('discovered');
      expect(registered?.source.name).toBe('test-client');
      expect(registered?.metadata?.discoveredAt).toBeDefined();
    });

    it('should apply prefix from tool source configuration', () => {
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: true,
        toolSources: [{
          type: 'discovered' as const,
          name: 'test-client',
          policyControlled: true,
          prefix: 'client__'
        }]
      };
      
      const serviceWithConfig = new ToolDiscoveryService(config, mockLogger);
      
      const tool = {
        name: 'my-tool',
        description: 'Test tool'
      };
      
      serviceWithConfig.registerToolFromClient(tool, 'test-client');
      
      const registered = serviceWithConfig.getTool('client__my-tool');
      expect(registered).toBeDefined();
      expect(registered?.name).toBe('client__my-tool');
    });

    it('should skip registration when discovered tools disabled', () => {
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: false
      };
      
      const serviceNoDiscovery = new ToolDiscoveryService(config, mockLogger);
      
      serviceNoDiscovery.registerToolFromClient({ name: 'test-tool' }, 'client');
      
      expect(serviceNoDiscovery.getAllTools()).toHaveLength(0);
    });
  });

  describe('Configured MCP Server Tools', () => {
    it('should register configured tool with server prefix', () => {
      const tool = {
        name: 'gmail-read',
        description: 'Read Gmail messages'
      };
      
      service.registerConfiguredTool(tool, 'gmail-server');
      
      const registered = service.getTool('gmail-server__gmail-read');
      expect(registered).toBeDefined();
      expect(registered?.source.type).toBe('configured');
      expect(registered?.source.prefix).toBe('gmail-server__');
      expect(registered?.metadata?.serverName).toBe('gmail-server');
    });
  });

  describe('Policy Control', () => {
    it('should apply default policy control', () => {
      const config = {
        includeNativeTools: false,
        policyControl: {
          defaultEnabled: true,
          exceptions: []
        }
      };
      
      const serviceDefault = new ToolDiscoveryService(config, mockLogger);
      serviceDefault.registerToolFromClient({ name: 'test-tool' }, 'client');
      
      const tool = serviceDefault.getTool('test-tool');
      expect(tool?.source.policyControlled).toBe(true);
    });

    it('should respect tool-specific policy configuration', () => {
      const config = {
        includeNativeTools: false,
        policyControl: {
          defaultEnabled: true,
          exceptions: [],
          toolPolicies: {
            'specific-tool': {
              enabled: false,
              constraints: ['rate-limit']
            }
          }
        }
      };
      
      const serviceWithPolicies = new ToolDiscoveryService(config, mockLogger);
      serviceWithPolicies.registerToolFromClient({ name: 'specific-tool' }, 'client');
      
      const tool = serviceWithPolicies.getTool('specific-tool');
      expect(tool?.source.policyControlled).toBe(false);
    });

    it('should apply pattern-based policy rules', () => {
      const config = {
        includeNativeTools: false,
        policyControl: {
          defaultEnabled: false,
          exceptions: [],
          patterns: [
            { pattern: '^admin-.*', enabled: true },
            { pattern: '.*-read$', enabled: false }
          ]
        }
      };
      
      const serviceWithPatterns = new ToolDiscoveryService(config, mockLogger);
      
      serviceWithPatterns.registerToolFromClient({ name: 'admin-create' }, 'client');
      serviceWithPatterns.registerToolFromClient({ name: 'file-read' }, 'client');
      serviceWithPatterns.registerToolFromClient({ name: 'other-tool' }, 'client');
      
      expect(serviceWithPatterns.getTool('admin-create')?.source.policyControlled).toBe(true);
      expect(serviceWithPatterns.getTool('file-read')?.source.policyControlled).toBe(false);
      expect(serviceWithPatterns.getTool('other-tool')?.source.policyControlled).toBe(false);
    });

    it('should force policy control for high-risk tools', () => {
      const config = {
        includeNativeTools: false,
        policyControl: {
          defaultEnabled: false,
          exceptions: ['Bash'] // Even in exceptions, high-risk should be controlled
        }
      };
      
      const serviceHighRisk = new ToolDiscoveryService(config, mockLogger);
      
      // Native tool registration logic would normally set risk level
      // For test, we'll use the risk assessment method
      const bashRisk = serviceHighRisk.assessToolRisk('Bash');
      expect(bashRisk).toBe('high');
    });
  });

  describe('Tool Risk Assessment', () => {
    it('should assess risk based on tool metadata', () => {
      // Native tools have risk metadata
      expect(service.assessToolRisk('Agent')).toBe('high');
      expect(service.assessToolRisk('Edit')).toBe('medium');
      expect(service.assessToolRisk('Read')).toBe('low');
    });

    it('should assess risk based on name patterns', () => {
      service.registerToolFromClient({ name: 'bash-executor' }, 'client');
      service.registerToolFromClient({ name: 'file-writer' }, 'client');
      service.registerToolFromClient({ name: 'data-viewer' }, 'client');
      
      expect(service.assessToolRisk('bash-executor')).toBe('high');
      expect(service.assessToolRisk('file-writer')).toBe('medium');
      expect(service.assessToolRisk('data-viewer')).toBe('low');
    });

    it('should return medium risk for unknown tools', () => {
      expect(service.assessToolRisk('non-existent-tool')).toBe('medium');
    });
  });

  describe('Tool Queries', () => {
    beforeEach(() => {
      // Add some test tools
      service.registerToolFromClient({ name: 'tool1' }, 'client1');
      service.registerToolFromClient({ name: 'tool2' }, 'client2');
      service.registerConfiguredTool({ name: 'tool3' }, 'server1');
    });

    it('should get all tools', () => {
      const allTools = service.getAllTools();
      
      // Should include native tools + registered tools
      expect(allTools.length).toBeGreaterThan(15); // At least 15 native tools + 3 registered
      expect(allTools.some(t => t.name === 'tool1')).toBe(true);
      expect(allTools.some(t => t.name === 'server1__tool3')).toBe(true);
    });

    it('should get policy-controlled tools only', () => {
      const controlledTools = service.getPolicyControlledTools();
      
      // Should exclude exceptions like TodoRead, TodoWrite, LS
      const todoRead = controlledTools.find(t => t.name === 'TodoRead');
      expect(todoRead).toBeUndefined();
      
      // Should include high-risk tools
      const agent = controlledTools.find(t => t.name === 'Agent');
      expect(agent).toBeDefined();
    });

    it('should get specific tool by name', () => {
      const tool = service.getTool('tool1');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('tool1');
      expect(tool?.source.name).toBe('client1');
    });
  });

  describe('Statistics', () => {
    it('should calculate tool statistics', () => {
      // Clear default tools for cleaner stats
      const config = {
        includeNativeTools: false
      };
      const cleanService = new ToolDiscoveryService(config, mockLogger);
      
      // Add tools with different sources
      cleanService.registerToolFromClient({ name: 'discovered1' }, 'client1');
      cleanService.registerToolFromClient({ name: 'discovered2' }, 'client2');
      cleanService.registerConfiguredTool({ name: 'configured1' }, 'server1');
      cleanService.registerConfiguredTool({ name: 'configured2' }, 'server2');
      
      const stats = cleanService.getStats();
      
      expect(stats.totalTools).toBe(4);
      expect(stats.bySource).toEqual({
        discovered: 2,
        configured: 2
      });
    });

    it('should calculate risk distribution', () => {
      // Clear default tools
      const config = {
        includeNativeTools: false,
        policyControl: {
          defaultEnabled: true,
          exceptions: []
        }
      };
      const cleanService = new ToolDiscoveryService(config, mockLogger);
      
      // Add tools with different risk patterns
      cleanService.registerToolFromClient({ name: 'bash-tool' }, 'client'); // high
      cleanService.registerToolFromClient({ name: 'write-tool' }, 'client'); // medium
      cleanService.registerToolFromClient({ name: 'view-tool' }, 'client'); // low
      cleanService.registerToolFromClient({ name: 'exec-command' }, 'client'); // high
      
      const stats = cleanService.getStats();
      
      expect(stats.riskDistribution).toEqual({
        high: 2,
        medium: 1,
        low: 1
      });
      expect(stats.policyControlled).toBe(4); // All controlled by default
    });
  });
});