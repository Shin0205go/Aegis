// ============================================================================
// ToolDiscoveryService Test Suite
// ============================================================================

import { 
  ToolDiscoveryService, 
  ToolSource, 
  DiscoveredTool,
  PolicyControlConfig 
} from '../../src/mcp/tool-discovery';
import { Logger } from '../../src/utils/logger';

// Mock logger
jest.mock('../../src/utils/logger');

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
      toolSources: []
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
      expect(tools.some(t => t.name === 'Read')).toBe(true);
      
      // Check tools have correct source
      const bashTool = tools.find(t => t.name === 'Bash');
      expect(bashTool?.source).toBe(ToolSource.NATIVE);
    });

    it('should apply policy control to native tools', () => {
      const tools = service.getAllTools();
      
      // Default enabled tools should have policy control
      const bashTool = tools.find(t => t.name === 'Bash');
      expect(bashTool?.policyControlled).toBe(true);
      
      // Exception tools should not have policy control
      const todoRead = tools.find(t => t.name === 'TodoRead');
      expect(todoRead?.policyControlled).toBe(false);
    });

    it('should skip native tools when includeNativeTools is false', () => {
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: true,
        policyControl: { defaultEnabled: true, exceptions: [] },
        toolSources: []
      };
      
      service = new ToolDiscoveryService(config, mockLogger);
      const tools = service.getAllTools();
      
      // Should have no native tools
      expect(tools.filter(t => t.source === ToolSource.NATIVE)).toHaveLength(0);
    });
  });

  describe('Tool Discovery', () => {
    it('should discover tools from configured sources', async () => {
      const mockSource: ToolSource = {
        name: 'test-source',
        endpoint: 'http://test.example.com',
        headers: { 'Authorization': 'Bearer test' }
      };
      
      // Mock fetch response
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'custom-tool-1', description: 'Custom Tool 1' },
            { name: 'custom-tool-2', description: 'Custom Tool 2' }
          ]
        })
      } as Response);
      
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: true,
        policyControl: { defaultEnabled: true, exceptions: [] },
        toolSources: [mockSource]
      };
      
      service = new ToolDiscoveryService(config, mockLogger);
      await service.discoverTools();
      
      const tools = service.getAllTools();
      
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('custom-tool-1');
      expect(tools[0].source).toBe(ToolSource.DISCOVERED);
      expect(tools[0].policyControlled).toBe(true);
    });

    it('should handle discovery errors gracefully', async () => {
      const mockSource: ToolSource = {
        name: 'failing-source',
        endpoint: 'http://fail.example.com'
      };
      
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
      
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: true,
        policyControl: { defaultEnabled: true, exceptions: [] },
        toolSources: [mockSource]
      };
      
      service = new ToolDiscoveryService(config, mockLogger);
      await service.discoverTools();
      
      // Should log error but not throw
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to discover tools from failing-source:',
        expect.any(Error)
      );
      
      // Should still return empty array
      expect(service.getAllTools()).toHaveLength(0);
    });

    it('should apply policy control based on exceptions', async () => {
      const mockSource: ToolSource = {
        name: 'test-source',
        endpoint: 'http://test.example.com'
      };
      
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'policy-tool', description: 'Should have policy' },
            { name: 'no-policy-tool', description: 'Should not have policy' }
          ]
        })
      } as Response);
      
      const config = {
        includeNativeTools: false,
        includeDiscoveredTools: true,
        policyControl: { 
          defaultEnabled: true, 
          exceptions: ['no-policy-tool'] 
        },
        toolSources: [mockSource]
      };
      
      service = new ToolDiscoveryService(config, mockLogger);
      await service.discoverTools();
      
      const tools = service.getAllTools();
      
      const policyTool = tools.find(t => t.name === 'policy-tool');
      const noPolicyTool = tools.find(t => t.name === 'no-policy-tool');
      
      expect(policyTool?.policyControlled).toBe(true);
      expect(noPolicyTool?.policyControlled).toBe(false);
    });
  });

  describe('Tool Filtering', () => {
    it('should filter tools by policy control status', () => {
      const policyControlledTools = service.getPolicyControlledTools();
      const nonPolicyControlledTools = service.getNonPolicyControlledTools();
      
      // All policy controlled tools should have policyControlled = true
      policyControlledTools.forEach(tool => {
        expect(tool.policyControlled).toBe(true);
      });
      
      // All non-policy controlled tools should have policyControlled = false
      nonPolicyControlledTools.forEach(tool => {
        expect(tool.policyControlled).toBe(false);
      });
      
      // Combined should equal all tools
      const allTools = service.getAllTools();
      expect(policyControlledTools.length + nonPolicyControlledTools.length)
        .toBe(allTools.length);
    });

    it('should get tool by name', () => {
      const bashTool = service.getToolByName('Bash');
      expect(bashTool).toBeDefined();
      expect(bashTool?.name).toBe('Bash');
      
      const nonExistent = service.getToolByName('NonExistentTool');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('Tool Prefixing', () => {
    it('should check if tool name has prefix', () => {
      expect(service.hasToolPrefix('filesystem__read_file')).toBe(true);
      expect(service.hasToolPrefix('execution-server__run_command')).toBe(true);
      expect(service.hasToolPrefix('simple_tool')).toBe(false);
    });

    it('should extract prefix from tool name', () => {
      expect(service.getToolPrefix('filesystem__read_file')).toBe('filesystem');
      expect(service.getToolPrefix('execution-server__run_command'))
        .toBe('execution-server');
      expect(service.getToolPrefix('simple_tool')).toBeNull();
    });

    it('should strip prefix from tool name', () => {
      expect(service.stripToolPrefix('filesystem__read_file')).toBe('read_file');
      expect(service.stripToolPrefix('execution-server__run_command'))
        .toBe('run_command');
      expect(service.stripToolPrefix('simple_tool')).toBe('simple_tool');
    });
  });

  describe('Configuration Updates', () => {
    it('should update policy control configuration', () => {
      // Initial state
      let bashTool = service.getToolByName('Bash');
      expect(bashTool?.policyControlled).toBe(true);
      
      // Update config to exclude Bash
      service.updatePolicyControl({
        defaultEnabled: true,
        exceptions: ['Bash']
      });
      
      // Check updated state
      bashTool = service.getToolByName('Bash');
      expect(bashTool?.policyControlled).toBe(false);
    });

    it('should handle defaultEnabled = false correctly', () => {
      service.updatePolicyControl({
        defaultEnabled: false,
        exceptions: ['Bash'] // This should be enabled as exception
      });
      
      const bashTool = service.getToolByName('Bash');
      const editTool = service.getToolByName('Edit');
      
      // Bash is exception, so should be enabled when default is false
      expect(bashTool?.policyControlled).toBe(true);
      // Edit is not exception, so should be disabled
      expect(editTool?.policyControlled).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow', async () => {
      const mockSource: ToolSource = {
        name: 'integration-source',
        endpoint: 'http://integration.example.com'
      };
      
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'integration-tool', description: 'Integration Test Tool' }
          ]
        })
      } as Response);
      
      const config = {
        includeNativeTools: true,
        includeDiscoveredTools: true,
        policyControl: { 
          defaultEnabled: true, 
          exceptions: ['TodoRead', 'integration-tool'] 
        },
        toolSources: [mockSource]
      };
      
      service = new ToolDiscoveryService(config, mockLogger);
      await service.discoverTools();
      
      const allTools = service.getAllTools();
      const nativeTools = allTools.filter(t => t.source === ToolSource.NATIVE);
      const discoveredTools = allTools.filter(t => t.source === ToolSource.DISCOVERED);
      
      // Should have both native and discovered tools
      expect(nativeTools.length).toBeGreaterThan(0);
      expect(discoveredTools.length).toBe(1);
      
      // Check policy control applied correctly
      const todoRead = service.getToolByName('TodoRead');
      const integrationTool = service.getToolByName('integration-tool');
      const bashTool = service.getToolByName('Bash');
      
      expect(todoRead?.policyControlled).toBe(false); // Exception
      expect(integrationTool?.policyControlled).toBe(false); // Exception
      expect(bashTool?.policyControlled).toBe(true); // Default
    });
  });
});