# 詳細設定ガイド

AEGISの詳細な設定オプションと、環境に応じた最適な設定方法を説明します。

## 🔧 環境変数

### 必須設定

#### LLMプロバイダー設定
```bash
# LLMプロバイダーの選択
LLM_PROVIDER=anthropic  # または openai

# Anthropic使用時
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# OpenAI使用時
OPENAI_API_KEY=sk-xxxxx

# モデル指定（オプション）
LLM_MODEL=claude-opus-4-20250514  # デフォルト
# または
LLM_MODEL=gpt-4-turbo-preview
```

### サーバー設定

```bash
# ポート番号
PORT=3000  # デフォルト: 3000

# ホスト
HOST=0.0.0.0  # デフォルト: localhost

# 環境モード
NODE_ENV=production  # production, development, test

# ログレベル
LOG_LEVEL=info  # debug, info, warn, error

# ログディレクトリ
LOG_DIR=/var/log/aegis  # デフォルト: ./logs
```

### パフォーマンス設定

```bash
# キャッシュ設定
CACHE_ENABLED=true
CACHE_TTL=3600  # 秒単位（デフォルト: 3600 = 1時間）
CACHE_MAX_SIZE=1000  # 最大エントリ数

# バッチ処理設定
BATCH_ENABLED=true
BATCH_SIZE=10  # 一度に処理する最大リクエスト数
BATCH_TIMEOUT=100  # ミリ秒単位

# 同時実行数制限
MAX_CONCURRENT_REQUESTS=50
MAX_REQUESTS_PER_MINUTE=1000

# タイムアウト設定
REQUEST_TIMEOUT=30000  # ミリ秒（デフォルト: 30秒）
LLM_TIMEOUT=15000  # LLM判定のタイムアウト
```

### セキュリティ設定

```bash
# API認証
API_AUTH_ENABLED=true
API_AUTH_TOKEN=your-secure-token

# CORS設定
CORS_ENABLED=true
CORS_ORIGINS=https://example.com,https://app.example.com

# HTTPS設定（本番環境推奨）
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# 監査ログ暗号化
AUDIT_LOG_ENCRYPTION=true
AUDIT_LOG_ENCRYPTION_KEY=your-32-char-encryption-key
```

## 📁 設定ファイル

### aegis-mcp-config.json

MCPサーバーの設定ファイルです：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "transport": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  "proxySettings": {
    "includeNativeTools": true,
    "enableDynamicDiscovery": true,
    "policyControl": {
      "defaultEnabled": true,
      "defaultDecision": "DENY",
      "exceptions": ["TodoRead", "TodoWrite"],
      "cacheEnabled": true,
      "cacheTTL": 300
    }
  }
}
```

### ポリシー設定ディレクトリ

```bash
policies/
├── claude-desktop-policy.ts    # Claude Desktop用ポリシー
├── tool-control-policy.ts      # ツール制御ポリシー
├── sample-policies.ts          # サンプルポリシー集
└── custom/                     # カスタムポリシー配置場所
    ├── dev-team-policy.ts
    └── production-policy.ts
```

## ⚙️ 詳細設定オプション

### 1. LLM詳細設定

```bash
# モデル固有のパラメータ
LLM_TEMPERATURE=0.3  # 0-1 (低いほど確定的)
LLM_MAX_TOKENS=1000  # 最大トークン数
LLM_TOP_P=0.95  # トップPサンプリング

# リトライ設定
LLM_MAX_RETRIES=3
LLM_RETRY_DELAY=1000  # ミリ秒

# フォールバック設定
LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDER=openai  # プライマリが失敗した場合
```

### 2. 監査ログ詳細設定

```bash
# ログローテーション
AUDIT_LOG_ROTATION=daily  # daily, weekly, monthly
AUDIT_LOG_MAX_FILES=30  # 保持する最大ファイル数
AUDIT_LOG_MAX_SIZE=100M  # ファイルサイズ上限

# ログフォーマット
AUDIT_LOG_FORMAT=json  # json, csv
AUDIT_LOG_PRETTY=false  # 開発時はtrueで見やすく

# ログフィルタリング
AUDIT_LOG_LEVEL=all  # all, errors-only, policy-violations
AUDIT_LOG_EXCLUDE_AGENTS=system,test  # 除外するエージェント
```

### 3. 通知設定

```bash
# Slack通知
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
SLACK_CHANNEL=#aegis-alerts
SLACK_NOTIFY_ON=deny,error,high-risk

# Email通知
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=your-app-password
EMAIL_FROM=aegis@example.com
EMAIL_TO=security-team@example.com

# Webhook通知
WEBHOOK_URL=https://your-system.com/aegis-webhook
WEBHOOK_SECRET=shared-secret-key
WEBHOOK_RETRY_COUNT=3
```

### 4. 高度なポリシー設定

```bash
# ポリシー評価設定
POLICY_EVALUATION_MODE=strict  # strict, permissive
POLICY_DEFAULT_DECISION=DENY  # PERMIT, DENY, INDETERMINATE
POLICY_TIMEOUT=5000  # ミリ秒

# ポリシーキャッシュ
POLICY_CACHE_ENABLED=true
POLICY_CACHE_TTL=600  # 10分
POLICY_CACHE_INVALIDATE_ON_UPDATE=true

# ポリシーバージョン管理
POLICY_VERSIONING_ENABLED=true
POLICY_MAX_VERSIONS=10
POLICY_AUTO_BACKUP=true
```

## 🎯 環境別推奨設定

### 開発環境

```bash
NODE_ENV=development
LOG_LEVEL=debug
CACHE_ENABLED=false
LLM_PROVIDER=openai  # コスト削減
LLM_MODEL=gpt-4-turbo-preview
AUDIT_LOG_PRETTY=true
API_AUTH_ENABLED=false
```

### ステージング環境

```bash
NODE_ENV=staging
LOG_LEVEL=info
CACHE_ENABLED=true
CACHE_TTL=300  # 5分
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-20250514  # 高精度モデル
API_AUTH_ENABLED=true
AUDIT_LOG_ENCRYPTION=true
```

### 本番環境

```bash
NODE_ENV=production
LOG_LEVEL=warn
CACHE_ENABLED=true
CACHE_TTL=3600  # 1時間
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-20250514  # 最高精度
API_AUTH_ENABLED=true
HTTPS_ENABLED=true
AUDIT_LOG_ENCRYPTION=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx
```

## 🔒 セキュリティのベストプラクティス

### 1. APIキーの管理

```bash
# 環境変数から読み込む（推奨）
export ANTHROPIC_API_KEY=$(cat /secure/path/api-key)

# AWS Secrets Managerの使用
export ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id aegis/anthropic-api-key \
  --query SecretString --output text)

# HashiCorp Vaultの使用
export ANTHROPIC_API_KEY=$(vault kv get -field=api_key secret/aegis)
```

### 2. ネットワークセキュリティ

```nginx
# Nginx設定例
server {
    listen 443 ssl http2;
    server_name aegis.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # IPアドレス制限
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 3. 最小権限の原則

```bash
# 専用ユーザーで実行
useradd -r -s /bin/false aegis
chown -R aegis:aegis /opt/aegis
```

## 📊 パフォーマンスチューニング

### 1. メモリ最適化

```bash
# Node.jsメモリ設定
NODE_OPTIONS="--max-old-space-size=4096"  # 4GB

# キャッシュサイズ調整
CACHE_MAX_SIZE=5000  # 大規模環境
CACHE_TTL=7200  # 2時間（安定環境）
```

### 2. 並行処理最適化

```bash
# CPUコア数に応じて調整
MAX_CONCURRENT_REQUESTS=100  # 8コア以上
BATCH_SIZE=20  # 大量処理時
```

### 3. データベース接続プール

```bash
# 将来の拡張用
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
```

## 🔍 設定の検証

### 設定チェックコマンド

```bash
# 設定の検証
npm run validate-config

# 環境変数の確認
npm run show-config

# 設定のエクスポート（機密情報除く）
npm run export-config > config-backup.json
```

### ヘルスチェック

```bash
# 基本的なヘルスチェック
curl http://localhost:3000/health

# 詳細な診断
curl http://localhost:3000/api/admin/diagnostics \
  -H "Authorization: Bearer ${API_AUTH_TOKEN}"
```

## 📚 関連ドキュメント

- [本番環境展開](./deployment.md) - プロダクション環境への展開
- [監視・ログ管理](./monitoring.md) - ログとメトリクスの詳細
- [トラブルシューティング](./troubleshooting.md) - 設定関連の問題解決