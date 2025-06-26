import { Config } from '../utils/config';
import dotenv from 'dotenv';

// dotenvをモック
jest.mock('dotenv');

describe('Config', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // 環境変数をバックアップ
    originalEnv = { ...process.env };
    
    // console.errorをモック
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // dotenvのモック設定
    (dotenv.config as jest.Mock).mockReturnValue({});
  });

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv;
    
    // モックをクリア
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('基本設定', () => {
    it('デフォルト値で初期化される', () => {
      const config = new Config();

      expect(config.nodeEnv).toBe('development');
      expect(config.port).toBe(3000);
      expect(config.logLevel).toBe('info');
    });

    it('環境変数から値を読み込む', () => {
      process.env.AEGIS_NODE_ENV = 'production';
      process.env.AEGIS_PORT = '8080';
      process.env.AEGIS_LOG_LEVEL = 'debug';

      const config = new Config();

      expect(config.nodeEnv).toBe('production');
      expect(config.port).toBe(8080);
      expect(config.logLevel).toBe('debug');
    });

    it('オーバーライドで値を上書きできる', () => {
      const config = new Config({
        nodeEnv: 'test',
        port: 9000,
        logLevel: 'warn'
      });

      expect(config.nodeEnv).toBe('test');
      expect(config.port).toBe(9000);
      expect(config.logLevel).toBe('warn');
    });
  });

  describe('LLM設定', () => {
    it('デフォルトのLLM設定を使用する', () => {
      const config = new Config();

      expect(config.llm).toEqual({
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.3,
        baseURL: undefined
      });
    });

    it('環境変数からLLM設定を読み込む', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.LLM_MODEL = 'claude-3';
      process.env.LLM_MAX_TOKENS = '8192';
      process.env.LLM_TEMPERATURE = '0.7';
      process.env.LLM_BASE_URL = 'https://api.example.com';

      const config = new Config();

      expect(config.llm).toEqual({
        provider: 'anthropic',
        apiKey: 'test-anthropic-key',
        model: 'claude-3',
        maxTokens: 8192,
        temperature: 0.7,
        baseURL: 'https://api.example.com'
      });
    });

    it('OpenAI APIキーを正しく取得する', () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.LLM_PROVIDER = 'openai';

      const config = new Config();

      expect(config.llm.apiKey).toBe('test-openai-key');
    });

    it('Anthropic APIキーを正しく取得する', () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.LLM_PROVIDER = 'anthropic';

      const config = new Config();

      expect(config.llm.apiKey).toBe('test-anthropic-key');
    });

    it('プロバイダーのオーバーライドでも適切なAPIキーを取得する', () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const config = new Config({ llm: { provider: 'anthropic' } });

      expect(config.llm.apiKey).toBe('test-anthropic-key');
    });
  });

  describe('キャッシュ設定', () => {
    it('デフォルトのキャッシュ設定を使用する', () => {
      const config = new Config();

      expect(config.cache).toEqual({
        enabled: true,
        ttl: 300,
        maxSize: 1000
      });
    });

    it('環境変数でキャッシュを無効化できる', () => {
      process.env.CACHE_ENABLED = 'false';
      process.env.CACHE_TTL = '600';
      process.env.CACHE_MAX_SIZE = '5000';

      const config = new Config();

      expect(config.cache).toEqual({
        enabled: false,
        ttl: 600,
        maxSize: 5000
      });
    });
  });

  describe('MCPプロキシ設定', () => {
    it('デフォルトのMCPプロキシ設定を使用する', () => {
      const config = new Config();

      expect(config.mcpProxy).toEqual({
        port: 3000,
        upstreamServers: {},
        corsOrigins: ['http://localhost:3000']
      });
    });

    it('環境変数からMCPプロキシ設定を読み込む', () => {
      process.env.AEGIS_MANAGEMENT_PORT = '4000';
      process.env.MCP_UPSTREAM_SERVERS = 'server1:http://server1.com,server2:http://server2.com:8080';
      process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';

      const config = new Config();

      expect(config.mcpProxy).toEqual({
        port: 4000,
        upstreamServers: {
          server1: 'http://server1.com',
          server2: 'http://server2.com:8080'
        },
        corsOrigins: ['http://localhost:3000', 'http://localhost:3001']
      });
    });

    it('MCP_PROXY_PORTも読み込む', () => {
      process.env.MCP_PROXY_PORT = '5000';

      const config = new Config();

      expect(config.mcpProxy.port).toBe(5000);
    });

    it('AEGIS_MANAGEMENT_PORTがMCP_PROXY_PORTより優先される', () => {
      process.env.AEGIS_MANAGEMENT_PORT = '6000';
      process.env.MCP_PROXY_PORT = '5000';

      const config = new Config();

      expect(config.mcpProxy.port).toBe(6000);
    });
  });

  describe('モニタリング設定', () => {
    it('デフォルトのモニタリング設定を使用する', () => {
      const config = new Config();

      expect(config.monitoring).toEqual({
        enabled: true,
        metricsPort: 9090,
        healthCheckPath: '/health',
        auditLogEnabled: true
      });
    });

    it('環境変数でモニタリングを設定できる', () => {
      process.env.MONITORING_ENABLED = 'false';
      process.env.METRICS_PORT = '9999';
      process.env.HEALTH_CHECK_ENDPOINT = '/healthz';
      process.env.AUDIT_LOG_ENABLED = 'false';

      const config = new Config();

      expect(config.monitoring).toEqual({
        enabled: false,
        metricsPort: 9999,
        healthCheckPath: '/healthz',
        auditLogEnabled: false
      });
    });
  });

  describe('ポリシー設定', () => {
    it('デフォルトのポリシー設定を使用する', () => {
      const config = new Config();

      expect(config.defaultPolicyStrictness).toBe('medium');
      expect(config.policyValidationEnabled).toBe(true);
    });

    it('環境変数からポリシー設定を読み込む', () => {
      process.env.DEFAULT_POLICY_STRICTNESS = 'high';
      process.env.POLICY_VALIDATION_ENABLED = 'false';

      const config = new Config();

      expect(config.defaultPolicyStrictness).toBe('high');
      expect(config.policyValidationEnabled).toBe(false);
    });
  });

  describe('セキュリティ設定', () => {
    it('デフォルトのセキュリティ設定を使用する', () => {
      const config = new Config();

      expect(config.secretKey).toBe('default-secret-key-change-in-production');
      expect(config.jwtSecret).toBeUndefined();
    });

    it('環境変数からセキュリティ設定を読み込む', () => {
      process.env.AEGIS_SECRET_KEY = 'my-secret-key';
      process.env.JWT_SECRET = 'my-jwt-secret';

      const config = new Config();

      expect(config.secretKey).toBe('my-secret-key');
      expect(config.jwtSecret).toBe('my-jwt-secret');
    });

    it('本番環境でデフォルトのシークレットキーを使用するとエラーになる', () => {
      process.env.AEGIS_NODE_ENV = 'production';

      expect(() => new Config()).toThrow(
        '[Config] Secret key must be changed in production environment'
      );
    });

    it('本番環境でカスタムシークレットキーを使用すると正常に動作する', () => {
      process.env.AEGIS_NODE_ENV = 'production';
      process.env.AEGIS_SECRET_KEY = 'production-secret-key';

      expect(() => new Config()).not.toThrow();
    });
  });

  describe('上流サーバーのパース', () => {
    it('単一のサーバーを正しくパースする', () => {
      process.env.MCP_UPSTREAM_SERVERS = 'myserver:http://example.com';

      const config = new Config();

      expect(config.mcpProxy.upstreamServers).toEqual({
        myserver: 'http://example.com'
      });
    });

    it('複数のサーバーを正しくパースする', () => {
      process.env.MCP_UPSTREAM_SERVERS = 'server1:http://server1.com,server2:https://server2.com:8443';

      const config = new Config();

      expect(config.mcpProxy.upstreamServers).toEqual({
        server1: 'http://server1.com',
        server2: 'https://server2.com:8443'
      });
    });

    it('空白を含む設定も処理する', () => {
      process.env.MCP_UPSTREAM_SERVERS = ' server1 : http://server1.com , server2 : http://server2.com ';

      const config = new Config();

      expect(config.mcpProxy.upstreamServers).toEqual({
        server1: 'http://server1.com',
        server2: 'http://server2.com'
      });
    });

    it('不正な形式は無視する', () => {
      process.env.MCP_UPSTREAM_SERVERS = 'validserver:http://valid.com,invalidserver,another:valid:http://another.com';

      const config = new Config();

      expect(config.mcpProxy.upstreamServers).toEqual({
        validserver: 'http://valid.com',
        another: 'valid:http://another.com'
      });
    });

    it('空の文字列は空のオブジェクトを返す', () => {
      process.env.MCP_UPSTREAM_SERVERS = '';

      const config = new Config();

      expect(config.mcpProxy.upstreamServers).toEqual({});
    });
  });

  describe('環境チェックメソッド', () => {
    it('isDevelopmentが正しく動作する', () => {
      process.env.AEGIS_NODE_ENV = 'development';
      const config = new Config();
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(false);
    });

    it('isProductionが正しく動作する', () => {
      process.env.AEGIS_NODE_ENV = 'production';
      process.env.AEGIS_SECRET_KEY = 'production-key';
      const config = new Config();
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(true);
      expect(config.isTest).toBe(false);
    });

    it('isTestが正しく動作する', () => {
      process.env.AEGIS_NODE_ENV = 'test';
      const config = new Config();
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(true);
    });
  });

  describe('設定検証', () => {
    it('APIキーが設定されていない場合に警告を出力する', () => {
      process.env.OPENAI_API_KEY = '';
      process.env.LOG_SILENT = undefined;

      new Config();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Config] Warning: OpenAI API key not set. Set OPENAI_API_KEY environment variable.'
      );
    });

    it('stdioモードでは警告を出力しない', () => {
      process.env.OPENAI_API_KEY = '';
      process.env.MCP_TRANSPORT = 'stdio';

      new Config();

      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Warning: OpenAI API key not set')
      );
    });

    it('--stdioフラグでも警告を出力しない', () => {
      process.env.OPENAI_API_KEY = '';
      process.argv.push('--stdio');

      new Config();

      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Warning: OpenAI API key not set')
      );

      // process.argvをクリーンアップ
      process.argv.pop();
    });

    it('LOG_SILENT=trueで警告を出力しない', () => {
      process.env.OPENAI_API_KEY = '';
      process.env.LOG_SILENT = 'true';

      new Config();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('設定が正常にロードされたことをログ出力する', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.LOG_SILENT = undefined;

      new Config();

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Config] Configuration loaded successfully');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Config] Environment: development');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Config] LLM Provider: openai');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Config] LLM Model: gpt-4');
    });
  });

  describe('toJSON', () => {
    it('機密情報をマスクして出力する', () => {
      process.env.OPENAI_API_KEY = 'secret-api-key';
      process.env.AEGIS_SECRET_KEY = 'secret-key';
      process.env.JWT_SECRET = 'jwt-secret';

      const config = new Config();
      const json = config.toJSON();

      expect(json.llm?.apiKey).toBe('[REDACTED]');
      expect(json.secretKey).toBe('[REDACTED]');
      expect(json.jwtSecret).toBe('[REDACTED]');
    });

    it('未設定の値を[NOT_SET]として表示する', () => {
      process.env.OPENAI_API_KEY = '';
      process.env.JWT_SECRET = undefined;

      const config = new Config();
      const json = config.toJSON();

      expect(json.llm?.apiKey).toBe('[NOT_SET]');
      expect(json.jwtSecret).toBe('[NOT_SET]');
    });

    it('その他の設定は通常通り出力する', () => {
      const config = new Config({
        nodeEnv: 'test',
        port: 4000,
        logLevel: 'debug'
      });

      const json = config.toJSON();

      expect(json.nodeEnv).toBe('test');
      expect(json.port).toBe(4000);
      expect(json.logLevel).toBe('debug');
    });
  });

  describe('dotenv設定', () => {
    it('dotenv.configがoverride: falseで呼ばれる', () => {
      new Config();

      expect(dotenv.config).toHaveBeenCalledWith({ override: false });
    });
  });
});