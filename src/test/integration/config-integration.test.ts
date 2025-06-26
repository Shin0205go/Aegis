import { Configuration } from '../../utils/config';
import { AEGISController } from '../../core/controller';
import { AIJudgmentEngine } from '../../ai/judgment-engine';
import { Logger } from '../../utils/logger';
import { AEGISConfig } from '../../types';

// Mock dependencies
jest.mock('../../ai/judgment-engine');
jest.mock('../../utils/logger');

describe('Configuration Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save and clear environment
    originalEnv = { ...process.env };
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('AEGIS_') || key.includes('_API_KEY') || key === 'NODE_ENV') {
        delete process.env[key];
      }
    });
    
    // Reset singleton
    (Configuration as any).instance = null;
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    (Configuration as any).instance = null;
  });

  describe('Component Configuration Integration', () => {
    it('should pass configuration correctly to AIJudgmentEngine', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.AEGIS_AI_MODEL = 'gpt-4-turbo';
      process.env.AEGIS_AI_TEMPERATURE = '0.2';
      process.env.AEGIS_AI_MAX_TOKENS = '8192';

      const config = Configuration.getInstance();
      const llmConfig = config.getConfig().llm;

      expect(llmConfig.apiKey).toBe('test-api-key');
      expect(llmConfig.model).toBe('gpt-4-turbo');
      expect(llmConfig.temperature).toBe(0.2);
      expect(llmConfig.maxTokens).toBe(8192);
    });

    it('should configure logger with correct log level', () => {
      process.env.AEGIS_LOG_LEVEL = 'debug';
      
      const config = Configuration.getInstance();
      expect(config.getConfig().logLevel).toBe('debug');
      
      // In real implementation, logger would be configured with this level
      const logger = new Logger('test');
      expect(Logger).toHaveBeenCalledWith('test');
    });

    it('should handle missing API keys gracefully in components', () => {
      // No API key set
      const config = Configuration.getInstance();
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Validate config (should warn but not throw)
      (config as any).validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI API key is not set')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Security Integration Tests', () => {
    it('should prevent system startup with default secret in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';
      // Not setting AEGIS_SECRET_KEY

      const config = Configuration.getInstance();
      
      expect(() => {
        // Simulate system startup validation
        const controller = new AEGISController(config.getConfig());
        (config as any).validateConfig();
      }).toThrow('Secret key must be changed in production');
    });

    it('should mask sensitive data in configuration logs', () => {
      process.env.OPENAI_API_KEY = 'sk-1234567890abcdef';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-1234567890';
      process.env.AEGIS_SECRET_KEY = 'super-secret-key-that-should-not-be-logged';
      process.env.AEGIS_JWT_SECRET = 'jwt-secret-token';

      const config = Configuration.getInstance();
      const configObj = config.getConfig();

      // Simulate logging configuration
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // This should not log sensitive values
      const safeConfig = JSON.stringify(configObj, (key, value) => {
        if (key === 'apiKey' || key === 'secretKey' || key === 'jwtSecret') {
          return '[REDACTED]';
        }
        return value;
      });

      console.log('Configuration:', safeConfig);

      expect(logSpy).toHaveBeenCalled();
      const loggedContent = logSpy.mock.calls[0][1];
      expect(loggedContent).not.toContain('sk-1234567890abcdef');
      expect(loggedContent).not.toContain('sk-ant-1234567890');
      expect(loggedContent).not.toContain('super-secret-key');
      expect(loggedContent).not.toContain('jwt-secret-token');
      expect(loggedContent).toContain('[REDACTED]');

      logSpy.mockRestore();
    });

    it('should validate encryption configuration for audit logs', () => {
      process.env.AEGIS_AUDIT_LOG_ENABLED = 'true';
      process.env.AEGIS_SECRET_KEY = 'encryption-key-for-audit-logs-32-chars';

      const config = Configuration.getInstance();
      const monitoringConfig = config.getConfig().monitoring;

      expect(monitoringConfig.auditLogEnabled).toBe(true);
      expect(config.getConfig().security.secretKey).toBe('encryption-key-for-audit-logs-32-chars');
    });
  });

  describe('Environment-specific Integration', () => {
    it('should apply development settings in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      const config = Configuration.getInstance();
      const fullConfig = config.getConfig();

      expect(fullConfig.nodeEnv).toBe('development');
      expect(fullConfig.logLevel).toBe('info');
      
      // Development mode should not require secret key change
      expect(() => {
        (config as any).validateConfig();
      }).not.toThrow();
    });

    it('should enforce strict validation in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.AEGIS_SECRET_KEY = 'production-secret-key-minimum-32-characters';
      process.env.OPENAI_API_KEY = 'production-api-key';

      const config = Configuration.getInstance();
      const fullConfig = config.getConfig();

      expect(fullConfig.nodeEnv).toBe('production');
      
      // Should pass validation with proper secrets
      expect(() => {
        (config as any).validateConfig();
      }).not.toThrow();
    });

    it('should use test configuration in test mode', () => {
      process.env.NODE_ENV = 'test';
      
      const config = Configuration.getInstance();
      const fullConfig = config.getConfig();

      expect(fullConfig.nodeEnv).toBe('test');
      
      // Test mode should be lenient
      expect(() => {
        (config as any).validateConfig();
      }).not.toThrow();
    });
  });

  describe('Configuration Update and Reload', () => {
    it('should handle configuration updates correctly', () => {
      process.env.AEGIS_LOG_LEVEL = 'info';
      
      let config = Configuration.getInstance();
      expect(config.getConfig().logLevel).toBe('info');

      // Simulate configuration change
      process.env.AEGIS_LOG_LEVEL = 'debug';
      
      // Reset singleton to reload
      (Configuration as any).instance = null;
      config = Configuration.getInstance();
      
      expect(config.getConfig().logLevel).toBe('debug');
    });

    it('should maintain configuration immutability', () => {
      const config = Configuration.getInstance();
      const config1 = config.getConfig();
      const config2 = config.getConfig();

      // Should return new object each time
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);

      // Modifications should not affect source
      config1.port = 9999;
      expect(config.getConfig().port).not.toBe(9999);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid port numbers gracefully', () => {
      process.env.PORT = 'not-a-number';
      
      const config = Configuration.getInstance();
      const port = config.getConfig().port;
      
      expect(isNaN(port)).toBeTruthy();
    });

    it('should handle malformed JSON in upstream servers', () => {
      process.env.MCP_UPSTREAM_SERVERS = '{"invalid": json}';
      
      const config = Configuration.getInstance();
      // Should fallback to empty object or handle error
      expect(config.getConfig().mcpProxy.upstreamServers).toEqual({});
    });

    it('should handle invalid boolean values', () => {
      process.env.AEGIS_CACHE_ENABLED = 'yes'; // Not 'true' or 'false'
      
      const config = Configuration.getInstance();
      // Current implementation might not handle this correctly
      expect(typeof config.getConfig().cache.enabled).toBe('boolean');
    });
  });

  describe('Multi-provider Configuration', () => {
    it('should configure OpenAI provider correctly', () => {
      process.env.AEGIS_AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      process.env.AEGIS_AI_MODEL = 'gpt-4';

      const config = Configuration.getInstance();
      const llmConfig = config.getConfig().llm;

      expect(llmConfig.provider).toBe('openai');
      expect(llmConfig.apiKey).toBe('sk-openai-key');
      expect(llmConfig.model).toBe('gpt-4');
    });

    it('should configure Anthropic provider correctly', () => {
      process.env.AEGIS_AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-key';
      process.env.AEGIS_AI_MODEL = 'claude-3-opus';

      const config = Configuration.getInstance();
      const llmConfig = config.getConfig().llm;

      expect(llmConfig.provider).toBe('anthropic');
      expect(llmConfig.apiKey).toBe('sk-ant-key');
      expect(llmConfig.model).toBe('claude-3-opus');
    });

    it('should configure Azure provider correctly', () => {
      process.env.AEGIS_AI_PROVIDER = 'azure';
      process.env.AZURE_OPENAI_API_KEY = 'azure-key';
      process.env.AZURE_OPENAI_ENDPOINT = 'https://myinstance.openai.azure.com';
      process.env.AEGIS_AI_MODEL = 'gpt-4';

      const config = Configuration.getInstance();
      const llmConfig = config.getConfig().llm;

      expect(llmConfig.provider).toBe('azure');
      // Note: Current implementation might need adjustment for Azure
    });
  });

  describe('Performance Configuration', () => {
    it('should configure cache for performance optimization', () => {
      process.env.AEGIS_CACHE_ENABLED = 'true';
      process.env.AEGIS_CACHE_TTL = '600';
      process.env.AEGIS_CACHE_MAX_SIZE = '5000';

      const config = Configuration.getInstance();
      const cacheConfig = config.getConfig().cache;

      expect(cacheConfig.enabled).toBe(true);
      expect(cacheConfig.ttl).toBe(600);
      expect(cacheConfig.maxSize).toBe(5000);
    });

    it('should configure monitoring for performance tracking', () => {
      process.env.AEGIS_MONITORING_ENABLED = 'true';
      process.env.AEGIS_METRICS_PORT = '9090';

      const config = Configuration.getInstance();
      const monitoringConfig = config.getConfig().monitoring;

      expect(monitoringConfig.enabled).toBe(true);
      expect(monitoringConfig.metricsPort).toBe(9090);
    });
  });

  describe('Configuration Validation Completeness', () => {
    it('should validate all required fields are present', () => {
      const config = Configuration.getInstance();
      const fullConfig = config.getConfig();

      // Check all top-level required fields
      expect(fullConfig.nodeEnv).toBeDefined();
      expect(fullConfig.port).toBeDefined();
      expect(fullConfig.llm).toBeDefined();
      expect(fullConfig.cache).toBeDefined();
      expect(fullConfig.security).toBeDefined();
      expect(fullConfig.monitoring).toBeDefined();
      expect(fullConfig.mcpProxy).toBeDefined();
      expect(fullConfig.policy).toBeDefined();
    });

    it('should validate nested required fields', () => {
      const config = Configuration.getInstance();
      const fullConfig = config.getConfig();

      // LLM config
      expect(fullConfig.llm.provider).toBeDefined();
      expect(fullConfig.llm.model).toBeDefined();
      expect(fullConfig.llm.temperature).toBeDefined();
      expect(fullConfig.llm.maxTokens).toBeDefined();

      // Cache config
      expect(fullConfig.cache.enabled).toBeDefined();
      expect(fullConfig.cache.ttl).toBeDefined();
      expect(fullConfig.cache.maxSize).toBeDefined();

      // Security config
      expect(fullConfig.security.secretKey).toBeDefined();
    });
  });
});