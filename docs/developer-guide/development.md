# 開発環境・テスト

AEGISの開発環境構築、テスト戦略、CI/CDパイプライン、コーディング規約について説明します。

## 🛠️ 開発環境のセットアップ

### 前提条件

- **Node.js**: v20.0.0以上
- **npm**: v9.0.0以上
- **Git**: v2.30以上
- **Docker**: v20.10以上（オプション）
- **VSCode**: 推奨IDE

### 初期セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/youraccount/aegis-policy-engine.git
cd aegis-policy-engine

# 開発用依存関係のインストール
npm install

# 環境設定
cp .env.example .env.development
# エディタで .env.development を編集

# 開発サーバーの起動
npm run dev
```

### VSCode推奨拡張機能

`.vscode/extensions.json`:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-tslint-plugin",
    "streetsidesoftware.code-spell-checker",
    "eamodio.gitlens",
    "christian-kohler.path-intellisense",
    "aaron-bond.better-comments",
    "yzhang.markdown-all-in-one",
    "gruntfuggly.todo-tree",
    "ms-azuretools.vscode-docker"
  ]
}
```

### VSCode設定

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "dist": true,
    "coverage": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true,
    "**/*.log": true
  }
}
```

## 🧪 テスト戦略

### テストピラミッド

```
         /\
        /  \  E2Eテスト (10%)
       /----\
      /      \ 統合テスト (30%)
     /--------\
    /          \ 単体テスト (60%)
   /____________\
```

### 1. 単体テスト

```typescript
// src/core/__tests__/policy-engine.test.ts
import { PolicyEngine } from '../policy-engine';
import { MockLLMProvider } from '../../test/mocks/llm-provider';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    mockLLM = new MockLLMProvider();
    engine = new PolicyEngine(mockLLM);
  });

  describe('evaluate', () => {
    it('should permit access for valid context', async () => {
      // Arrange
      const context = {
        agent: 'test-agent',
        action: 'read',
        resource: 'public-doc',
        time: new Date('2024-01-01T10:00:00Z')
      };
      
      mockLLM.setResponse({
        decision: 'PERMIT',
        reason: 'Public resource access allowed',
        confidence: 0.95
      });

      // Act
      const result = await engine.evaluate(context);

      // Assert
      expect(result.decision).toBe('PERMIT');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(mockLLM.getLastPrompt()).toContain('public-doc');
    });

    it('should deny access for restricted resource', async () => {
      // Arrange
      const context = {
        agent: 'test-agent',
        action: 'delete',
        resource: 'system-file',
        time: new Date()
      };

      mockLLM.setResponse({
        decision: 'DENY',
        reason: 'System file deletion not allowed',
        confidence: 0.98
      });

      // Act
      const result = await engine.evaluate(context);

      // Assert
      expect(result.decision).toBe('DENY');
      expect(result.reason).toContain('not allowed');
    });

    it('should handle LLM errors gracefully', async () => {
      // Arrange
      mockLLM.setError(new Error('LLM service unavailable'));

      // Act & Assert
      await expect(engine.evaluate({} as any))
        .rejects.toThrow('Policy evaluation failed');
    });
  });
});
```

### 2. 統合テスト

```typescript
// src/integration/__tests__/mcp-proxy.test.ts
import { MCPProxy } from '../../mcp/proxy';
import { PolicyEngine } from '../../core/policy-engine';
import { TestMCPServer } from '../../test/utils/test-mcp-server';

describe('MCP Proxy Integration', () => {
  let proxy: MCPProxy;
  let testServer: TestMCPServer;

  beforeAll(async () => {
    // テスト用MCPサーバー起動
    testServer = new TestMCPServer();
    await testServer.start();

    // プロキシ設定
    proxy = new MCPProxy({
      upstreams: {
        test: {
          url: testServer.url,
          transport: 'http'
        }
      },
      policyEngine: new PolicyEngine()
    });
  });

  afterAll(async () => {
    await testServer.stop();
  });

  it('should proxy allowed requests', async () => {
    // Arrange
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    // Act
    const response = await proxy.handleRequest(request);

    // Assert
    expect(response.result).toBeDefined();
    expect(response.error).toBeUndefined();
  });

  it('should block policy violations', async () => {
    // Arrange
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'dangerous-tool',
        arguments: { command: 'rm -rf /' }
      }
    };

    // Act
    const response = await proxy.handleRequest(request);

    // Assert
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32000); // ACCESS_DENIED
  });
});
```

### 3. E2Eテスト

```typescript
// e2e/scenarios/policy-enforcement.e2e.ts
import { AEGISTestHarness } from '../utils/test-harness';
import { MCPClient } from '../utils/mcp-client';

describe('E2E: Policy Enforcement', () => {
  let harness: AEGISTestHarness;
  let client: MCPClient;

  beforeAll(async () => {
    harness = new AEGISTestHarness();
    await harness.start();
    
    client = new MCPClient({
      url: harness.url,
      apiKey: harness.apiKey
    });
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('should enforce time-based access control', async () => {
    // ポリシー設定
    await harness.setPolicy('time-based-policy', `
      営業時間外のアクセス制限：
      - 平日18時以降は読み取りのみ許可
      - 週末は管理者のみアクセス可能
    `);

    // 営業時間外をシミュレート
    harness.setSystemTime('2024-01-01T20:00:00Z'); // 月曜20時

    // 書き込み試行（拒否されるべき）
    const writeResult = await client.callTool('filesystem__write_file', {
      path: '/tmp/test.txt',
      content: 'test'
    });
    expect(writeResult.error).toBeDefined();

    // 読み取り試行（許可されるべき）
    const readResult = await client.callTool('filesystem__read_file', {
      path: '/tmp/existing.txt'
    });
    expect(readResult.result).toBeDefined();
  });
});
```

## 🏗️ CI/CDパイプライン

### GitHub Actions設定

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [20.x, 21.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: Type check
      run: npm run type-check
    
    - name: Unit tests
      run: npm run test:unit -- --coverage
    
    - name: Integration tests
      run: npm run test:integration
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
    
    - name: Build
      run: npm run build

  e2e:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20.x
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: E2E tests
      run: npm run test:e2e
      env:
        ANTHROPIC_API_KEY: ${{ secrets.TEST_ANTHROPIC_API_KEY }}

  security:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --production
    
    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### リリースワークフロー

`.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20.x
        registry-url: 'https://registry.npmjs.org'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: Run tests
      run: npm test
    
    - name: Generate changelog
      run: npm run changelog
    
    - name: Create GitHub Release
      uses: actions/create-release@v1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ github.ref }}
        release_name: Release ${{ github.ref }}
        body_path: ./CHANGELOG.md
        draft: false
        prerelease: false
    
    - name: Publish to npm
      run: npm publish
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 📝 コーディング規約

### TypeScript規約

```typescript
// ✅ 良い例：明確な型定義と命名
export interface PolicyDecision {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;
  constraints?: string[];
  obligations?: string[];
}

export class PolicyEngine {
  constructor(
    private readonly llmProvider: LLMProvider,
    private readonly logger: Logger = defaultLogger
  ) {}

  async evaluate(context: DecisionContext): Promise<PolicyDecision> {
    try {
      // 入力検証
      this.validateContext(context);
      
      // 処理
      const decision = await this.performEvaluation(context);
      
      // ログ記録
      this.logger.info('Policy evaluation completed', {
        agent: context.agent,
        decision: decision.decision
      });
      
      return decision;
    } catch (error) {
      this.logger.error('Policy evaluation failed', { error, context });
      throw new PolicyEvaluationError('Failed to evaluate policy', error);
    }
  }
}

// ❌ 悪い例：型定義なし、エラーハンドリング不足
class PolicyEngine {
  constructor(llm) {
    this.llm = llm;
  }
  
  async evaluate(ctx) {
    const result = await this.llm.evaluate(ctx);
    return result;
  }
}
```

### ファイル構成

```
src/
├── core/               # コアビジネスロジック
│   ├── policy-engine.ts
│   ├── decision-types.ts
│   └── __tests__/
├── mcp/               # MCPプロトコル実装
│   ├── proxy.ts
│   ├── transport/
│   └── __tests__/
├── api/               # REST API
│   ├── routes/
│   ├── middleware/
│   └── __tests__/
├── utils/             # ユーティリティ
│   ├── logger.ts
│   ├── cache.ts
│   └── __tests__/
└── types/             # 共通型定義
    ├── index.ts
    └── mcp.d.ts
```

### コミットメッセージ規約

```bash
# フォーマット: <type>(<scope>): <subject>

# 例
feat(policy): 自然言語ポリシーのバッチ評価機能を追加
fix(mcp): タイムアウト時のエラーハンドリングを修正
docs(api): REST APIエンドポイントのドキュメントを更新
test(core): PolicyEngineの単体テストカバレッジを向上
refactor(cache): キャッシュ戦略をLRUからLFUに変更
chore(deps): 依存関係を最新版に更新

# type一覧
# feat: 新機能
# fix: バグ修正
# docs: ドキュメントのみ
# style: フォーマット変更
# refactor: リファクタリング
# test: テスト追加・修正
# chore: ビルド、補助ツール、ライブラリ関連
```

## 🔍 デバッグとプロファイリング

### デバッグ設定

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug AEGIS",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "tsc: build - tsconfig.json",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug",
        "DEBUG": "aegis:*"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current Test",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "--runInBand",
        "--no-coverage",
        "${relativeFile}"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### パフォーマンスプロファイリング

```typescript
// src/utils/profiler.ts
export class PerformanceProfiler {
  private marks: Map<string, number> = new Map();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    if (!start) throw new Error(`Mark ${startMark} not found`);

    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (!end) throw new Error(`Mark ${endMark} not found`);

    const duration = end - start;
    
    if (process.env.PROFILE === 'true') {
      console.log(`[PROFILE] ${name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }
}

// 使用例
const profiler = new PerformanceProfiler();

profiler.mark('policy-evaluation-start');
const decision = await policyEngine.evaluate(context);
profiler.mark('policy-evaluation-end');

const duration = profiler.measure(
  'Policy Evaluation',
  'policy-evaluation-start',
  'policy-evaluation-end'
);
```

## 🚀 開発ワークフロー

### 1. 機能開発フロー

```bash
# 1. 機能ブランチ作成
git checkout -b feature/natural-language-improvements

# 2. 開発とテスト
npm run dev  # 開発サーバー起動
npm run test:watch  # テストをウォッチモード

# 3. リント・フォーマット
npm run lint:fix
npm run format

# 4. コミット
git add .
git commit -m "feat(nlp): 自然言語処理の精度向上"

# 5. プッシュとPR作成
git push origin feature/natural-language-improvements
```

### 2. リリースフロー

```bash
# 1. リリースブランチ作成
git checkout -b release/1.2.0

# 2. バージョン更新
npm version minor

# 3. ChangeLog生成
npm run changelog

# 4. テスト実行
npm run test:all

# 5. コミット・タグ
git commit -am "chore: release 1.2.0"
git tag v1.2.0

# 6. マージとプッシュ
git checkout main
git merge release/1.2.0
git push origin main --tags
```

## 📊 品質基準

### コードカバレッジ目標

- 全体: 80%以上
- コアロジック: 90%以上
- ユーティリティ: 70%以上

### パフォーマンス基準

- ポリシー評価: 95パーセンタイル < 200ms
- API レスポンス: 95パーセンタイル < 500ms
- 起動時間: < 5秒

### セキュリティ基準

- npm audit: 高・重大な脆弱性ゼロ
- 依存関係: 定期的な更新（月次）
- セキュリティスキャン: PR毎に実行

## 🛠️ 開発ツール

### 推奨ツール

```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc && tsc-alias",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:unit": "jest --testPathPattern=__tests__",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --config jest.e2e.config.js",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json}\"",
    "type-check": "tsc --noEmit",
    "analyze": "webpack-bundle-analyzer dist/stats.json",
    "profile": "node --inspect dist/src/index.js"
  }
}
```

## 📚 関連ドキュメント

- [システムアーキテクチャ](./architecture.md) - 全体設計
- [API リファレンス](./api-reference.md) - API仕様
- [拡張・カスタマイズ](./extending.md) - 機能拡張方法