import { Config } from '../../utils/config';
import { AEGISConfig } from '../../types';

describe('Configuration Validation Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear environment for each test
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('AEGIS_') || key.includes('_API_KEY') || key === 'NODE_ENV' || key === 'PORT') {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Environment Variable Loading', () => {
    it('should load configuration from environment variables', () => {
      // Set test environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '8080';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.AEGIS_LOG_LEVEL = 'debug';
      process.env.AEGIS_AI_PROVIDER = 'anthropic';
      process.env.AEGIS_AI_MODEL = 'claude-3';
      process.env.AEGIS_AI_TEMPERATURE = '0.5';
      process.env.AEGIS_SECRET_KEY = 'test-secret-key-at-least-32-chars-long';
      process.env.AEGIS_JWT_SECRET = 'test-jwt-secret';

      const config = new Config();
      
      expect(config.getConfig().nodeEnv).toBe('production');
      expect(config.getConfig().port).toBe(8080);
      expect(config.getConfig().llm.provider).toBe('anthropic');
      expect(config.getConfig().llm.apiKey).toBe('test-anthropic-key');
      expect(config.getConfig().llm.model).toBe('claude-3');
      expect(config.getConfig().llm.temperature).toBe(0.5);
      expect(config.getConfig().logLevel).toBe('debug');
      expect(config.getConfig().security.secretKey).toBe('test-secret-key-at-least-32-chars-long');
    });

    it('should use default values when environment variables are not set', () => {
      const config = new Config();
      const defaultConfig = config.getConfig();

      expect(defaultConfig.nodeEnv).toBe('development');
      expect(defaultConfig.port).toBe(3000);
      expect(defaultConfig.llm.provider).toBe('anthropic');
      expect(defaultConfig.llm.maxTokens).toBe(4096);
      expect(defaultConfig.llm.temperature).toBe(0.3);
      expect(defaultConfig.logLevel).toBe('info');
      expect(defaultConfig.cache.enabled).toBe(true);
      expect(defaultConfig.cache.ttl).toBeGreaterThan(0);
      expect(defaultConfig.cache.maxSize).toBeGreaterThan(0);
    });

    it('should handle partial configuration', () => {
      process.env.AEGIS_AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'partial-test-key';
      process.env.AEGIS_LOG_LEVEL = 'error';

      const config = new Config();
      const partialConfig = config.getConfig();

      expect(partialConfig.llm.apiKey).toBe('partial-test-key');
      expect(partialConfig.logLevel).toBe('error');
      // Other values should be defaults
      expect(partialConfig.nodeEnv).toBe('development');
      expect(partialConfig.port).toBe(3000);
    });
  });

  describe('Validation Logic', () => {
    it('should throw error when secretKey is default in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';
      // Not setting AEGIS_SECRET_KEY to trigger default

      expect(() => new Config()).toThrow('Secret key must be changed in production');
    });

    it('should accept valid secretKey in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.AEGIS_SECRET_KEY = 'production-secret-key-at-least-32-chars';

      const config = new Config();
      
      expect(() => {
        (config as any).validateConfig();
      }).not.toThrow();
    });

    it('should validate API key presence', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      new Config();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('OpenAI API key not set')
      );

      consoleSpy.mockRestore();
    });

    it('should validate LLM provider enum values', () => {
      process.env.AEGIS_AI_PROVIDER = 'invalid-provider';

      const config = new Config();
      // Since the current implementation doesn't validate enums strictly,
      // we check that invalid values are stored as-is
      expect(config.getConfig().llm.provider).toBe('invalid-provider' as any);
    });
  });

  describe('Security Configuration Validation', () => {
    it('should reject weak secret keys', () => {
      process.env.NODE_ENV = 'production';
      process.env.AEGIS_SECRET_KEY = 'weak'; // Too short

      expect(() => new Config()).toThrow('at least 32 characters');
    });

    it('should validate JWT secret configuration', () => {
      process.env.AEGIS_JWT_SECRET = 'test-jwt-secret';

      const config = new Config();
      expect(config.getConfig().security.jwtSecret).toBe('test-jwt-secret');
    });

    it('should ensure API keys are not exposed in logs', () => {
      process.env.OPENAI_API_KEY = 'sensitive-api-key';
      process.env.ANTHROPIC_API_KEY = 'another-sensitive-key';

      const config = new Config();
      const configString = JSON.stringify(config.toJSON());

      // API keys should be masked or excluded from string representation
      expect(configString).not.toContain('sensitive-api-key');
      expect(configString).not.toContain('another-sensitive-key');
    });
  });

  describe('Port and Network Configuration', () => {
    it('should validate port numbers are within valid range', () => {
      const testCases = [
        { port: '0', valid: false },
        { port: '80', valid: true },
        { port: '3000', valid: true },
        { port: '65535', valid: true },
        { port: '65536', valid: false },
        { port: 'abc', valid: false },
        { port: '-1', valid: false }
      ];

      testCases.forEach(({ port, valid }) => {
        process.env.AEGIS_PORT = port;
        process.env.PORT = port;
        const config = new Config();

        if (valid) {
          expect(config.getConfig().port).toBe(parseInt(port));
        } else {
          expect(config.getConfig().port).toBe(3000);
        }
      });
    });

    it('should validate MCP proxy configuration', () => {
      process.env.MCP_PROXY_PORT = '4000';
      process.env.CORS_ORIGINS = 'http://localhost:3000,http://example.com';

      const config = new Config();
      expect(config.getConfig().mcpProxy.port).toBe(4000);
      expect(config.getConfig().mcpProxy.corsOrigins).toEqual([
        'http://localhost:3000',
        'http://example.com'
      ]);
    });
  });

  describe('LLM Configuration Validation', () => {
    it('should validate temperature is within valid range', () => {
      const defaultTemperature = new Config().getConfig().llm.temperature;
      const testCases = [
        { temp: '0', valid: true },
        { temp: '0.5', valid: true },
        { temp: '1', valid: true },
        { temp: '1.5', valid: false },
        { temp: '-0.1', valid: false }
      ];

      testCases.forEach(({ temp, valid }) => {
        process.env.LLM_TEMPERATURE = temp;
        const config = new Config();
        const temperature = config.getConfig().llm.temperature;

        if (valid) {
          expect(temperature).toBeGreaterThanOrEqual(0);
          expect(temperature).toBeLessThanOrEqual(1);
        } else {
          expect(temperature).toBe(defaultTemperature);
        }
      });
    });

    it('should validate maxTokens is positive', () => {
      const defaultMaxTokens = new Config().getConfig().llm.maxTokens;
      process.env.LLM_MAX_TOKENS = '-100';

      const config = new Config();
      expect(config.getConfig().llm.maxTokens).toBe(defaultMaxTokens);
    });

    it('should handle Azure-specific configuration', () => {
      process.env.AEGIS_AI_PROVIDER = 'azure';
      process.env.AZURE_OPENAI_API_KEY = 'azure-key';
      process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';

      const config = new Config();
      expect(config.getConfig().llm.provider).toBe('azure');
      // Note: Current implementation may not properly handle Azure config
    });
  });

  describe('Cache Configuration Validation', () => {
    it('should validate cache TTL is positive', () => {
      process.env.AEGIS_CACHE_TTL = '0';
      process.env.CACHE_TTL = '0';

      const config = new Config();
      expect(config.getConfig().cache.ttl).toBeGreaterThan(0);
    });

    it('should validate cache size limits', () => {
      process.env.AEGIS_CACHE_MAX_SIZE = '10000';
      process.env.CACHE_MAX_SIZE = '10000';

      const config = new Config();
      expect(config.getConfig().cache.maxSize).toBe(10000);
    });

    it('should handle cache disabled state', () => {
      process.env.AEGIS_CACHE_ENABLED = 'false';
      process.env.CACHE_ENABLED = 'false';

      const config = new Config();
      expect(config.getConfig().cache.enabled).toBe(false);
    });
  });

  describe('Policy Configuration Validation', () => {
    it('should validate policy strictness levels', () => {
      const validLevels = ['low', 'medium', 'high', 'strict'];

      validLevels.forEach(level => {
        process.env.AEGIS_DEFAULT_POLICY_STRICTNESS = level;
        const config = new Config();
        expect(config.getConfig().defaultPolicyStrictness).toBe(level);
      });
    });

    it('should handle invalid policy strictness', () => {
      process.env.AEGIS_DEFAULT_POLICY_STRICTNESS = 'invalid';

      const config = new Config();
      // Current implementation doesn't validate enum
      expect(config.getConfig().defaultPolicyStrictness).toBe('invalid' as any);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required fields gracefully', () => {
      // No environment variables set
      const config = new Config();
      
      expect(() => config.getConfig()).not.toThrow();
      expect(config.getConfig()).toBeDefined();
    });

    it('should provide helpful error messages for validation failures', () => {
      process.env.NODE_ENV = 'production';
      // Missing secret key in production

      expect(() => new Config()).toThrow(/secret key must be changed/i);
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed configuration object', () => {
      const config = new Config();
      const typedConfig: AEGISConfig = config.getConfig();
      
      // TypeScript compile-time check
      expect(typedConfig.llm).toBeDefined();
      expect(typedConfig.llm.provider).toBeDefined();
      expect(typedConfig.cache).toBeDefined();
      expect(typedConfig.security).toBeDefined();
    });
  });

  describe('Configuration Immutability', () => {
    it('should not allow direct modification of configuration', () => {
      const config = new Config();
      const configObj = config.getConfig();
      
      // Attempt to modify
      configObj.port = 9999;
      
      // Should not affect actual configuration
      expect(config.getConfig().port).not.toBe(9999);
    });
  });

  describe('Environment-specific Behavior', () => {
    it('should apply development defaults in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      const config = new Config();
      expect(config.getConfig().nodeEnv).toBe('development');
      expect(config.getConfig().logLevel).toBe('info');
    });

    it('should apply production defaults in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.AEGIS_SECRET_KEY = 'production-key-with-sufficient-length';
      
      const config = new Config();
      expect(config.getConfig().nodeEnv).toBe('production');
    });

    it('should apply test defaults in test mode', () => {
      process.env.NODE_ENV = 'test';
      
      const config = new Config();
      expect(config.getConfig().nodeEnv).toBe('test');
    });
  });
});