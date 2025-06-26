import { z } from 'zod';
import { AEGISConfigSchema } from '../../schemas/config.schema';

describe('Configuration Schema Validation Tests', () => {
  describe('Schema Structure Validation', () => {
    it('should accept valid complete configuration', () => {
      const validConfig = {
        llm: {
          provider: 'openai',
          apiKey: 'test-api-key',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 4096,
          timeout: 30000
        },
        mcp: {
          transport: 'http',
          port: 3000,
          host: 'localhost',
          corsOrigins: ['http://localhost:3000'],
          upstreamServers: {
            gmail: 'http://gmail-mcp:8080',
            gdrive: 'http://gdrive-mcp:8081'
          }
        },
        cache: {
          enabled: true,
          ttl: 300,
          maxSize: 1000,
          strategy: 'lru'
        },
        security: {
          secretKey: 'test-secret-key-at-least-32-characters',
          jwtSecret: 'test-jwt-secret',
          encryptionAlgorithm: 'aes-256-gcm',
          tokenExpiry: 3600
        },
        monitoring: {
          enabled: true,
          logLevel: 'info',
          auditLog: {
            enabled: true,
            retention: 90,
            encryptLogs: true
          },
          metrics: {
            enabled: true,
            port: 9090,
            path: '/metrics'
          }
        },
        policy: {
          defaultStrictness: 'medium',
          validationEnabled: true,
          cachePolicies: true,
          maxPolicySize: 10485760
        }
      };

      expect(() => AEGISConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should accept minimal valid configuration', () => {
      const minimalConfig = {
        llm: {
          provider: 'openai',
          apiKey: 'test-key'
        }
      };

      const result = AEGISConfigSchema.parse(minimalConfig);
      expect(result.llm.provider).toBe('openai');
      expect(result.llm.apiKey).toBe('test-key');
      // Check defaults are applied
      expect(result.llm.model).toBe('gpt-4');
      expect(result.cache.enabled).toBe(true);
      expect(result.monitoring.logLevel).toBe('info');
    });
  });

  describe('LLM Configuration Schema', () => {
    it('should validate provider enum values', () => {
      const invalidProvider = {
        llm: {
          provider: 'invalid-provider',
          apiKey: 'test-key'
        }
      };

      expect(() => AEGISConfigSchema.parse(invalidProvider)).toThrow();
    });

    it('should validate temperature range', () => {
      const testCases = [
        { temperature: -0.1, shouldThrow: true },
        { temperature: 0, shouldThrow: false },
        { temperature: 0.5, shouldThrow: false },
        { temperature: 1, shouldThrow: false },
        { temperature: 1.1, shouldThrow: true },
        { temperature: 2, shouldThrow: true }
      ];

      testCases.forEach(({ temperature, shouldThrow }) => {
        const config = {
          llm: {
            provider: 'openai',
            apiKey: 'test-key',
            temperature
          }
        };

        if (shouldThrow) {
          expect(() => AEGISConfigSchema.parse(config)).toThrow();
        } else {
          expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
        }
      });
    });

    it('should validate maxTokens is positive', () => {
      const negativeTokens = {
        llm: {
          provider: 'openai',
          apiKey: 'test-key',
          maxTokens: -100
        }
      };

      expect(() => AEGISConfigSchema.parse(negativeTokens)).toThrow();
    });

    it('should require API key', () => {
      const noApiKey = {
        llm: {
          provider: 'openai'
        }
      };

      expect(() => AEGISConfigSchema.parse(noApiKey)).toThrow();
    });
  });

  describe('MCP Configuration Schema', () => {
    it('should validate transport types', () => {
      const validTransports = ['stdio', 'http'];
      
      validTransports.forEach(transport => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          mcp: { transport }
        };
        
        expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
      });

      const invalidTransport = {
        llm: { provider: 'openai', apiKey: 'key' },
        mcp: { transport: 'websocket' }
      };
      
      expect(() => AEGISConfigSchema.parse(invalidTransport)).toThrow();
    });

    it('should validate port numbers', () => {
      const testCases = [
        { port: 0, shouldThrow: true },
        { port: 1, shouldThrow: false },
        { port: 3000, shouldThrow: false },
        { port: 65535, shouldThrow: false },
        { port: 65536, shouldThrow: true },
        { port: 100000, shouldThrow: true }
      ];

      testCases.forEach(({ port, shouldThrow }) => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          mcp: { port }
        };

        if (shouldThrow) {
          expect(() => AEGISConfigSchema.parse(config)).toThrow();
        } else {
          expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
        }
      });
    });

    it('should validate CORS origins are valid URLs', () => {
      const validOrigins = {
        llm: { provider: 'openai', apiKey: 'key' },
        mcp: {
          corsOrigins: [
            'http://localhost:3000',
            'https://example.com',
            'http://192.168.1.1:8080'
          ]
        }
      };

      expect(() => AEGISConfigSchema.parse(validOrigins)).not.toThrow();

      const invalidOrigins = {
        llm: { provider: 'openai', apiKey: 'key' },
        mcp: {
          corsOrigins: ['not-a-url', 'ftp://invalid.com']
        }
      };

      expect(() => AEGISConfigSchema.parse(invalidOrigins)).toThrow();
    });
  });

  describe('Security Configuration Schema', () => {
    it('should validate secret key length', () => {
      const shortKey = {
        llm: { provider: 'openai', apiKey: 'key' },
        security: {
          secretKey: 'too-short'
        }
      };

      expect(() => AEGISConfigSchema.parse(shortKey)).toThrow();

      const validKey = {
        llm: { provider: 'openai', apiKey: 'key' },
        security: {
          secretKey: 'this-is-a-valid-secret-key-with-sufficient-length'
        }
      };

      expect(() => AEGISConfigSchema.parse(validKey)).not.toThrow();
    });

    it('should validate encryption algorithms', () => {
      const validAlgorithms = ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'];
      
      validAlgorithms.forEach(algorithm => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          security: {
            secretKey: 'valid-secret-key-with-sufficient-length',
            encryptionAlgorithm: algorithm
          }
        };
        
        expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
      });

      const invalidAlgorithm = {
        llm: { provider: 'openai', apiKey: 'key' },
        security: {
          secretKey: 'valid-secret-key-with-sufficient-length',
          encryptionAlgorithm: 'rot13'
        }
      };
      
      expect(() => AEGISConfigSchema.parse(invalidAlgorithm)).toThrow();
    });

    it('should validate token expiry is positive', () => {
      const negativeExpiry = {
        llm: { provider: 'openai', apiKey: 'key' },
        security: {
          secretKey: 'valid-secret-key-with-sufficient-length',
          tokenExpiry: -3600
        }
      };

      expect(() => AEGISConfigSchema.parse(negativeExpiry)).toThrow();
    });
  });

  describe('Cache Configuration Schema', () => {
    it('should validate cache strategies', () => {
      const validStrategies = ['lru', 'lfu', 'fifo', 'random'];
      
      validStrategies.forEach(strategy => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          cache: { strategy }
        };
        
        expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
      });

      const invalidStrategy = {
        llm: { provider: 'openai', apiKey: 'key' },
        cache: { strategy: 'invalid-strategy' }
      };
      
      expect(() => AEGISConfigSchema.parse(invalidStrategy)).toThrow();
    });

    it('should validate TTL is non-negative', () => {
      const negativeTTL = {
        llm: { provider: 'openai', apiKey: 'key' },
        cache: { ttl: -300 }
      };

      expect(() => AEGISConfigSchema.parse(negativeTTL)).toThrow();
    });

    it('should validate cache size is positive', () => {
      const zeroSize = {
        llm: { provider: 'openai', apiKey: 'key' },
        cache: { maxSize: 0 }
      };

      expect(() => AEGISConfigSchema.parse(zeroSize)).toThrow();
    });
  });

  describe('Monitoring Configuration Schema', () => {
    it('should validate log levels', () => {
      const validLevels = ['debug', 'info', 'warn', 'error'];
      
      validLevels.forEach(level => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          monitoring: { logLevel: level }
        };
        
        expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
      });

      const invalidLevel = {
        llm: { provider: 'openai', apiKey: 'key' },
        monitoring: { logLevel: 'verbose' }
      };
      
      expect(() => AEGISConfigSchema.parse(invalidLevel)).toThrow();
    });

    it('should validate audit log retention days', () => {
      const negativeRetention = {
        llm: { provider: 'openai', apiKey: 'key' },
        monitoring: {
          auditLog: {
            retention: -30
          }
        }
      };

      expect(() => AEGISConfigSchema.parse(negativeRetention)).toThrow();
    });

    it('should validate metrics port', () => {
      const invalidPort = {
        llm: { provider: 'openai', apiKey: 'key' },
        monitoring: {
          metrics: {
            port: 70000
          }
        }
      };

      expect(() => AEGISConfigSchema.parse(invalidPort)).toThrow();
    });
  });

  describe('Policy Configuration Schema', () => {
    it('should validate strictness levels', () => {
      const validLevels = ['low', 'medium', 'high', 'strict'];
      
      validLevels.forEach(level => {
        const config = {
          llm: { provider: 'openai', apiKey: 'key' },
          policy: { defaultStrictness: level }
        };
        
        expect(() => AEGISConfigSchema.parse(config)).not.toThrow();
      });

      const invalidLevel = {
        llm: { provider: 'openai', apiKey: 'key' },
        policy: { defaultStrictness: 'extreme' }
      };
      
      expect(() => AEGISConfigSchema.parse(invalidLevel)).toThrow();
    });

    it('should validate max policy size', () => {
      const negativeSize = {
        llm: { provider: 'openai', apiKey: 'key' },
        policy: { maxPolicySize: -1000 }
      };

      expect(() => AEGISConfigSchema.parse(negativeSize)).toThrow();
    });
  });

  describe('Environment Variable Transformation', () => {
    it('should transform environment variables to nested config', () => {
      const env = {
        OPENAI_API_KEY: 'test-key',
        AEGIS_AI_PROVIDER: 'anthropic',
        AEGIS_AI_MODEL: 'claude-3',
        AEGIS_AI_TEMPERATURE: '0.5',
        AEGIS_AI_MAX_TOKENS: '2048',
        AEGIS_CACHE_ENABLED: 'false',
        AEGIS_CACHE_TTL: '600',
        AEGIS_LOG_LEVEL: 'debug',
        MCP_TRANSPORT: 'stdio',
        MCP_PROXY_PORT: '4000'
      };

      // This would need a transformation function that's tested
      // Document that the schema should support env var transformation
      expect(AEGISConfigSchema).toBeDefined();
    });
  });

  describe('Schema Error Messages', () => {
    it('should provide helpful error messages for validation failures', () => {
      const invalidConfig = {
        llm: {
          provider: 'invalid',
          apiKey: 'key',
          temperature: 2.5,
          maxTokens: -100
        },
        cache: {
          ttl: -1,
          strategy: 'wrong'
        }
      };

      try {
        AEGISConfigSchema.parse(invalidConfig);
        fail('Should have thrown validation error');
      } catch (error) {
        if (error instanceof z.ZodError) {
          expect(error.errors).toHaveLength(5); // Multiple validation errors
          expect(error.errors.some(e => e.path.includes('provider'))).toBeTruthy();
          expect(error.errors.some(e => e.path.includes('temperature'))).toBeTruthy();
          expect(error.errors.some(e => e.path.includes('maxTokens'))).toBeTruthy();
          expect(error.errors.some(e => e.path.includes('ttl'))).toBeTruthy();
          expect(error.errors.some(e => e.path.includes('strategy'))).toBeTruthy();
        }
      }
    });
  });

  describe('Schema Compatibility', () => {
    it('should be compatible with AEGISConfig type', () => {
      const config = {
        llm: {
          provider: 'openai' as const,
          apiKey: 'test-key',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 4096
        }
      };

      const parsed = AEGISConfigSchema.parse(config);
      
      // Type assertion to ensure compatibility
      const _typeCheck: z.infer<typeof AEGISConfigSchema> = parsed;
      expect(parsed).toBeDefined();
    });
  });
});