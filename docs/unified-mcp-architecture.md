# 統一MCPアーキテクチャ

## 概要

統一MCPアーキテクチャは、GitHub Copilot、Gemini CLI、Claude Codeといった複数のAIコーディングエージェント間で一貫した構成を提供するための「シックサーバー・シンクライアント」設計パターンです。

このアーキテクチャにより：
- **構成の一元管理**: 1つのマスター構成から全プラットフォーム用の設定を生成
- **動的更新**: `list_changed`通知によるリアルタイムのツール・リソース更新
- **意味論的委譲**: プロンプトとリソースをサーバー側「Source of Truth」として管理
- **AGENTS.md統合**: プロジェクト固有の指示をMCPリソースとして自動提供

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                    AIエージェント層                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │GitHub       │ │Gemini CLI   │ │Claude Code /            │ │
│  │Copilot      │ │             │ │Claude Desktop           │ │
│  └──────┬──────┘ └──────┬──────┘ └────────────┬────────────┘ │
│         │               │                      │              │
│         │  薄いクライアント設定（接続情報のみ）  │              │
│         └───────────────┼──────────────────────┘              │
│                         ▼                                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│            AEGIS 統一ゲートウェイサーバー                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ UnifiedGatewayServer                                    │ │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │ │
│  │ │Notification │ │Semantic     │ │AGENTS.md            │ │ │
│  │ │Manager      │ │Delegation   │ │Loader               │ │ │
│  │ │             │ │Provider     │ │                     │ │ │
│  │ │- list_changed│ │- Prompts   │ │- Build commands     │ │ │
│  │ │- roots      │ │- Resources  │ │- Test commands      │ │ │
│  │ │- subscribe  │ │- Templates  │ │- Guidelines         │ │ │
│  │ └─────────────┘ └─────────────┘ └─────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ CrossPlatformConfigGenerator                            │ │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │ │
│  │ │VS Code      │ │Gemini       │ │Claude               │ │ │
│  │ │mcp.json     │ │settings.json│ │claude_desktop_      │ │ │
│  │ │             │ │             │ │config.json          │ │ │
│  │ └─────────────┘ └─────────────┘ └─────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    上流MCPサーバー群                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │Filesystem   │ │GitHub       │ │PostgreSQL              │ │
│  │Server       │ │Server       │ │Server                  │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## コンポーネント

### 1. CrossPlatformConfigGenerator

マスター構成ファイル（`mcp-config.yaml`）から各プラットフォーム固有の設定ファイルを生成します。

```typescript
import { CrossPlatformConfigGenerator } from 'aegis-policy-engine';

const generator = new CrossPlatformConfigGenerator();

// マスター構成を読み込み
await generator.loadMasterConfig('mcp-config.yaml');

// 全プラットフォーム用の設定を生成
const configs = generator.generateAllConfigs({
  platforms: ['vscode', 'gemini', 'claude']
});

// ファイルに書き出し
await generator.writeConfigs(configs, './');
```

### 2. DynamicNotificationManager

MCP仕様に準拠した動的通知を管理します。

```typescript
import { DynamicNotificationManager } from 'aegis-policy-engine';

const manager = new DynamicNotificationManager();

// クライアント登録
manager.registerClient({
  id: 'client-1',
  type: 'claude',
  transport: 'stdio',
  connectedAt: new Date(),
  lastActivity: new Date(),
  capabilities: {
    supportsListChanged: true,
    supportsRoots: false,
    supportsSubscriptions: false,
    supportedPromptTemplates: true
  }
});

// ツールリスト変更を通知
await manager.notifyToolsListChanged();

// リソース更新を通知（サブスクライバーのみ）
await manager.notifyResourceUpdated('aegis://guidelines');
```

### 3. SemanticDelegationProvider

プロンプトとリソースをサーバー側で一元管理します。

```typescript
import { SemanticDelegationProvider } from 'aegis-policy-engine';

const provider = new SemanticDelegationProvider();

// プロンプト登録
provider.registerPrompt({
  name: 'code_review',
  description: 'コードレビューを実行',
  template: 'レビュー対象: {{code}}\n@{aegis://guidelines}',
  arguments: [
    { name: 'code', description: 'レビュー対象のコード', required: true, type: 'string' }
  ],
  resourceRefs: ['aegis://guidelines']
});

// プロンプトをレンダリング（引数とリソース参照を解決）
const rendered = await provider.renderPrompt(
  provider.getPrompt('code_review')!,
  { code: 'function foo() {}' }
);

// リソース登録
provider.registerResource({
  uri: 'aegis://guidelines',
  name: 'ガイドライン',
  content: '# コーディング規約...'
});
```

### 4. AgentsMdLoader

AGENTS.mdファイルを読み込み、MCPリソースとして提供します。

```typescript
import { AgentsMdLoader } from 'aegis-policy-engine';

const loader = new AgentsMdLoader();

// AGENTS.mdを読み込み
const content = await loader.loadAgentsMd('./');

// 内容を確認
console.log(content?.buildCommands);  // ['npm install', 'npm run build']
console.log(content?.testCommands);   // ['npm test']

// ファイル変更を監視
loader.watchAgentsMd('./');
```

### 5. UnifiedGatewayServer

全コンポーネントを統合したゲートウェイサーバーです。

```typescript
import { UnifiedGatewayServer } from 'aegis-policy-engine';

const gateway = new UnifiedGatewayServer(logger, {
  name: 'my-gateway',
  version: '1.0.0',
  port: 3000,
  enablePrompts: true,
  enableResources: true,
  enableSubscriptions: true,
  enableAgentsMd: true,
  projectDir: './'
});

// カスタムツールを登録
gateway.registerTool(
  'my_tool',
  'カスタムツール',
  { type: 'object', properties: { input: { type: 'string' } } },
  async (args) => ({ result: `Processed: ${args.input}` })
);

// MCPサーバーを取得してトランスポートに接続
const server = gateway.getServer();
```

## 使用方法

### 1. マスター構成ファイルの作成

`mcp-config.yaml`をプロジェクトルートに作成：

```yaml
version: "1.0.0"

servers:
  - name: "filesystem"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    envVars: []
    transport: "stdio"
    clients:
      copilot: true
      gemini: true
      claude: true

prompts:
  - name: "system_instruction"
    description: "初期化指示"
    template: "あなたはコーディングアシスタントです..."

resources:
  - uri: "aegis://guidelines"
    name: "ガイドライン"
    content: "# コーディング規約..."

globalSettings:
  defaultClients:
    copilot: true
    gemini: true
    claude: true
```

### 2. プラットフォーム固有設定の生成

```bash
# AEGISプロキシを起動し、設定を生成
node dist/src/mcp-server.js --generate-configs
```

生成されるファイル：
- `.vscode/mcp.json` - VS Code / GitHub Copilot用
- `.gemini/settings.json` - Gemini CLI用
- `claude_desktop_config.json` - Claude Desktop用
- `setup-claude-mcp.sh` - Claude Code CLI用セットアップスクリプト

### 3. 薄いクライアント設定

各プラットフォームの設定ファイルには、ゲートウェイへの接続情報のみを記述します：

```json
{
  "mcpServers": {
    "aegis-gateway": {
      "url": "http://localhost:3000/sse",
      "transport": "sse"
    }
  }
}
```

クライアント側のエージェント定義（agent.mdなど）：

```markdown
# Backend Architect

このエージェントは `aegis-gateway` MCPサーバーに接続されています。

## 初期化

1. サーバーから `system_instruction` プロンプトを読み込んでください
2. `aegis://guidelines` リソースの内容に従ってください
3. `notifications/tools/list_changed` 通知時はツールリストを更新してください
```

## クライアント別対応状況

| 機能 | GitHub Copilot | Gemini CLI | Claude Code |
|------|---------------|------------|-------------|
| list_changed通知 | ○ | ◎ | △ |
| roots機能 | ○ | ○ | × |
| サブスクリプション | ○ | ◎ | × |
| プロンプトテンプレート | ○ | ◎ | ○ |

- ◎: 完全対応
- ○: 対応
- △: 限定的（手動リロード必要な場合あり）
- ×: 未対応

## AGENTS.md統合

プロジェクトのAGENTS.mdファイルがあれば、自動的にMCPリソースとして提供されます：

```markdown
# My Project

## Build

```bash
npm install
npm run build
```

## Test

```bash
npm test
```

## Coding Style

- Use TypeScript
- Follow ESLint rules
- Write unit tests
```

これは以下のリソースとして自動登録されます：
- `aegis://agents-md/raw` - 生のAGENTS.md内容
- `aegis://agents-md/build-commands` - ビルドコマンド
- `aegis://agents-md/test-commands` - テストコマンド
- `aegis://agents-md/coding-guidelines` - コーディング規約

## ベストプラクティス

### 1. 構成の一元化

すべてのMCPサーバー設定は`mcp-config.yaml`で管理し、クライアント固有のファイルは自動生成に任せます。

### 2. プロンプトのサーバー側管理

複雑なプロンプトテンプレートはサーバー側で管理し、クライアントは`prompts/get`で取得します。

### 3. 動的通知の活用

ツールやリソースの追加・変更時は必ず`list_changed`通知を送信し、クライアントの再起動なしで反映させます。

### 4. AGENTS.mdの活用

プロジェクト固有の情報はAGENTS.mdに記述し、AEGISが自動的にリソース化します。

## トラブルシューティング

### 通知が反映されない

Claude Codeでは`list_changed`通知が即座に反映されない場合があります。`/mcp refresh`コマンドを使用してください。

### 設定ファイルの競合

各プラットフォームの設定ファイルは自動生成されるため、手動編集は避けてください。カスタマイズはマスター構成で行います。

### AGENTS.mdが読み込まれない

AGENTS.mdファイルはプロジェクトルート、`.github/`、または`docs/`ディレクトリに配置してください。
