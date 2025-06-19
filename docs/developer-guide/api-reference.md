# API リファレンス

AEGISのREST APIとSDKの詳細な仕様書です。

## 🔑 認証

### APIキー認証

すべてのAPIリクエストには認証が必要です（ヘルスチェックを除く）。

```bash
# Authorizationヘッダーで認証
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  http://localhost:3000/api/policies
```

### 環境変数設定

```bash
# .env ファイル
API_AUTH_ENABLED=true
API_AUTH_TOKEN=your-secure-api-token-here
```

## 🌐 APIエンドポイント

### システム管理

#### GET /health
ヘルスチェックエンドポイント（認証不要）

**レスポンス例**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

#### GET /api/admin/diagnostics
詳細な診断情報を取得

**レスポンス例**:
```json
{
  "system": {
    "memory": {
      "used": "256MB",
      "total": "4GB",
      "percentage": 6.25
    },
    "cpu": {
      "usage": 15.5,
      "cores": 8
    }
  },
  "services": {
    "policyEngine": "operational",
    "mcpProxy": "operational",
    "auditLogger": "operational"
  },
  "configuration": {
    "llmProvider": "anthropic",
    "cacheEnabled": true,
    "policiesLoaded": 12
  }
}
```

### ポリシー管理

#### GET /api/policies
すべてのポリシーを取得

**クエリパラメータ**:
- `status` (optional): "active" | "draft" | "deprecated"
- `tags` (optional): カンマ区切りのタグリスト

**レスポンス例**:
```json
{
  "policies": [
    {
      "id": "pol-123",
      "name": "customer-data-policy",
      "status": "active",
      "version": "1.2.0",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastModified": "2024-01-15T00:00:00Z",
      "tags": ["data-protection", "gdpr"]
    }
  ],
  "total": 12,
  "page": 1,
  "pageSize": 50
}
```

#### GET /api/policies/:id
特定のポリシーを取得

**レスポンス例**:
```json
{
  "id": "pol-123",
  "name": "customer-data-policy",
  "content": "【顧客データアクセスポリシー】\n\n基本原則：\n...",
  "metadata": {
    "version": "1.2.0",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z",
    "createdBy": "admin@example.com",
    "lastModified": "2024-01-15T00:00:00Z",
    "lastModifiedBy": "security@example.com",
    "tags": ["data-protection", "gdpr"],
    "reviewCycle": "quarterly"
  }
}
```

#### POST /api/policies
新しいポリシーを作成

**リクエストボディ**:
```json
{
  "name": "new-policy",
  "content": "【新規ポリシー】\n\n基本原則：\n...",
  "metadata": {
    "tags": ["security", "access-control"],
    "reviewCycle": "monthly"
  }
}
```

**レスポンス例**:
```json
{
  "id": "pol-456",
  "message": "Policy created successfully",
  "version": "1.0.0"
}
```

#### PUT /api/policies/:id
ポリシーを更新

**リクエストボディ**:
```json
{
  "content": "【更新されたポリシー】\n\n基本原則：\n...",
  "reason": "GDPR要件の更新に対応"
}
```

#### DELETE /api/policies/:id
ポリシーを削除（実際には非アクティブ化）

### ポリシー評価

#### POST /api/policy/evaluate
ポリシー評価を実行

**リクエストボディ**:
```json
{
  "context": {
    "agent": "claude-desktop-001",
    "action": "tools/call",
    "resource": "filesystem__read_file",
    "metadata": {
      "path": "/etc/passwd",
      "purpose": "system-check"
    }
  }
}
```

**レスポンス例**:
```json
{
  "decision": "DENY",
  "reason": "システムファイルへのアクセスは禁止されています",
  "confidence": 0.95,
  "appliedPolicies": ["system-security-policy"],
  "constraints": [],
  "obligations": ["security-alert"],
  "processingTime": 145
}
```

#### POST /api/policy/test
ポリシーのテスト実行（ドライラン）

**リクエストボディ**:
```json
{
  "policyName": "test-policy",
  "policyContent": "【テストポリシー】\n...",
  "testContext": {
    "agent": "test-agent",
    "action": "read",
    "resource": "test-resource"
  }
}
```

### 監査ログ

#### GET /api/audit/stats
監査統計を取得

**クエリパラメータ**:
- `period` (optional): "hour" | "day" | "week" | "month"
- `from` (optional): ISO 8601形式の開始日時
- `to` (optional): ISO 8601形式の終了日時

**レスポンス例**:
```json
{
  "totalRequests": 15234,
  "permits": 14567,
  "denials": 667,
  "errors": 12,
  "denyRate": 0.0438,
  "averageResponseTime": 145,
  "topAgents": [
    {
      "agent": "claude-desktop-001",
      "requests": 5432,
      "permits": 5201,
      "denials": 231
    }
  ],
  "topResources": [
    {
      "resource": "filesystem__read_file",
      "requests": 3421,
      "permits": 3350,
      "denials": 71
    }
  ]
}
```

#### GET /api/audit/requests
個別のリクエストログを取得

**クエリパラメータ**:
- `limit` (optional): 返却する最大件数（デフォルト: 50）
- `offset` (optional): オフセット（ページネーション用）
- `filter` (optional): 検索フィルター
- `decision` (optional): "PERMIT" | "DENY" | "INDETERMINATE"
- `agent` (optional): エージェント名でフィルタ
- `from` (optional): 開始日時
- `to` (optional): 終了日時

**レスポンス例**:
```json
{
  "requests": [
    {
      "id": "req-789",
      "timestamp": "2024-01-01T12:00:00Z",
      "agent": "claude-desktop-001",
      "action": "tools/call",
      "resource": "Bash",
      "decision": "PERMIT",
      "reason": "低リスクコマンドの実行",
      "constraints": ["command-logging"],
      "obligations": ["audit-log"],
      "processingTime": 125,
      "metadata": {
        "ip": "192.168.1.100",
        "userAgent": "Claude-Desktop/1.0"
      }
    }
  ],
  "total": 523,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/audit/export
監査ログをエクスポート

**クエリパラメータ**:
- `format`: "json" | "csv"
- `from`: 開始日時（必須）
- `to`: 終了日時（必須）
- `compress`: "true" | "false"（デフォルト: false）

**レスポンス**: ファイルダウンロード（Content-Disposition: attachment）

### 管理操作

#### POST /api/admin/reload-policies
ポリシーを再読み込み

**レスポンス例**:
```json
{
  "message": "Policies reloaded successfully",
  "policiesLoaded": 12,
  "errors": []
}
```

#### POST /api/admin/clear-cache
キャッシュをクリア

**リクエストボディ**（オプション）:
```json
{
  "cacheType": "all" | "decisions" | "policies"
}
```

#### GET /metrics
Prometheusメトリクスを取得（認証不要）

**レスポンス例**:
```
# HELP aegis_requests_total Total number of requests
# TYPE aegis_requests_total counter
aegis_requests_total 15234

# HELP aegis_decision_duration_seconds Decision latency in seconds
# TYPE aegis_decision_duration_seconds histogram
aegis_decision_duration_seconds_bucket{le="0.1"} 12543
aegis_decision_duration_seconds_bucket{le="0.5"} 14890
aegis_decision_duration_seconds_bucket{le="1"} 15100
```

## 🔌 WebSocket/SSE接続

### Server-Sent Events (SSE)

リアルタイムイベントのストリーミング：

```javascript
const eventSource = new EventSource('/api/events', {
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN'
  }
});

eventSource.addEventListener('decision', (event) => {
  const data = JSON.parse(event.data);
  console.log('Decision made:', data);
});

eventSource.addEventListener('alert', (event) => {
  const alert = JSON.parse(event.data);
  console.log('Security alert:', alert);
});
```

### WebSocket接続

双方向通信（将来実装予定）：

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'YOUR_API_TOKEN'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});
```

## 🛠️ SDK使用方法

### Node.js SDK

```typescript
import { AEGISClient } from '@aegis/sdk';

// クライアント初期化
const client = new AEGISClient({
  baseURL: 'http://localhost:3000',
  apiToken: process.env.AEGIS_API_TOKEN,
  timeout: 30000
});

// ポリシー評価
async function checkAccess() {
  try {
    const decision = await client.evaluatePolicy({
      agent: 'my-agent',
      action: 'read',
      resource: 'customer-data',
      metadata: {
        purpose: 'report-generation'
      }
    });
    
    if (decision.decision === 'PERMIT') {
      console.log('Access granted');
      // 制約を適用
      for (const constraint of decision.constraints) {
        await applyConstraint(constraint);
      }
    } else {
      console.log('Access denied:', decision.reason);
    }
  } catch (error) {
    console.error('Policy evaluation failed:', error);
  }
}

// ポリシー管理
async function managePolicies() {
  // ポリシー一覧取得
  const policies = await client.listPolicies({
    status: 'active',
    tags: ['security']
  });
  
  // 新規ポリシー作成
  const newPolicy = await client.createPolicy({
    name: 'api-access-policy',
    content: '【APIアクセスポリシー】...',
    metadata: {
      tags: ['api', 'security']
    }
  });
  
  // ポリシー更新
  await client.updatePolicy(newPolicy.id, {
    content: '【更新されたポリシー】...',
    reason: 'セキュリティ要件の変更'
  });
}

// 監査ログ取得
async function getAuditLogs() {
  const stats = await client.getAuditStats({
    period: 'day'
  });
  
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Deny rate: ${stats.denyRate * 100}%`);
  
  // 詳細ログ取得
  const logs = await client.getAuditRequests({
    decision: 'DENY',
    limit: 100
  });
  
  for (const log of logs.requests) {
    console.log(`${log.timestamp}: ${log.agent} - ${log.decision} - ${log.reason}`);
  }
}
```

### Python SDK（計画中）

```python
from aegis import AEGISClient

# クライアント初期化
client = AEGISClient(
    base_url='http://localhost:3000',
    api_token=os.environ['AEGIS_API_TOKEN']
)

# ポリシー評価
decision = client.evaluate_policy({
    'agent': 'python-app',
    'action': 'write',
    'resource': 'database',
    'metadata': {
        'table': 'customers',
        'operation': 'insert'
    }
})

if decision['decision'] == 'PERMIT':
    print('Access granted')
else:
    print(f'Access denied: {decision["reason"]}')
```

## 📊 エラーハンドリング

### エラーレスポンス形式

```json
{
  "error": {
    "code": "POLICY_NOT_FOUND",
    "message": "Policy with ID 'pol-999' not found",
    "details": {
      "policyId": "pol-999",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 標準エラーコード

| コード | HTTP Status | 説明 |
|--------|-------------|------|
| `AUTH_REQUIRED` | 401 | 認証が必要 |
| `AUTH_INVALID` | 401 | 無効な認証トークン |
| `ACCESS_DENIED` | 403 | アクセス拒否 |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `VALIDATION_ERROR` | 400 | リクエストの検証エラー |
| `POLICY_NOT_FOUND` | 404 | ポリシーが存在しない |
| `POLICY_INVALID` | 400 | ポリシーの形式が不正 |
| `RATE_LIMITED` | 429 | レート制限超過 |
| `INTERNAL_ERROR` | 500 | 内部エラー |
| `LLM_ERROR` | 503 | LLMプロバイダーエラー |

### エラーハンドリング例

```typescript
try {
  const result = await client.evaluatePolicy(context);
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // レート制限の場合はリトライ
    await sleep(error.retryAfter * 1000);
    return retry();
  } else if (error.code === 'AUTH_INVALID') {
    // 認証エラーの場合は再認証
    await refreshToken();
  } else {
    // その他のエラー
    logger.error('API error:', error);
    throw error;
  }
}
```

## 🔧 API設定

### レート制限

デフォルトのレート制限：
- 認証なし: 10リクエスト/分
- 認証あり: 1000リクエスト/分
- 管理API: 100リクエスト/分

カスタムレート制限の設定：
```bash
# .env
RATE_LIMIT_WINDOW=60000  # ミリ秒
RATE_LIMIT_MAX_REQUESTS=1000
```

### CORS設定

```bash
# .env
CORS_ENABLED=true
CORS_ORIGINS=https://app.example.com,https://admin.example.com
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true
```

### タイムアウト設定

```bash
# .env
REQUEST_TIMEOUT=30000  # 全体のタイムアウト（ミリ秒）
LLM_TIMEOUT=15000     # LLM判定のタイムアウト
```

## 📚 関連ドキュメント

- [システムアーキテクチャ](./architecture.md) - 内部設計の詳細
- [MCP統合詳細](./mcp-integration.md) - MCPプロトコルの実装
- [拡張・カスタマイズ](./extending.md) - APIの拡張方法