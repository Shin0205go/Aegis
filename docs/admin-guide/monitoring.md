# 監視・ログ管理ガイド

AEGISの監視システムとログ管理の設定・運用方法について説明します。

## 📊 監視の概要

### 監視対象

1. **システムメトリクス**
   - CPU使用率
   - メモリ使用量
   - ディスクI/O
   - ネットワークトラフィック

2. **アプリケーションメトリクス**
   - リクエスト数/秒
   - レスポンスタイム
   - エラー率
   - 判定結果の分布

3. **ビジネスメトリクス**
   - ポリシー違反率
   - エージェント別アクセス数
   - リソース別アクセス頻度
   - 異常検知アラート

## 📝 ログ管理

### ログの種類

#### 1. アプリケーションログ
```bash
# 場所: logs/application.log
# フォーマット: JSON

{
  "timestamp": "2024-01-01T10:00:00Z",
  "level": "info",
  "service": "aegis",
  "component": "mcp-proxy",
  "message": "Request processed",
  "requestId": "uuid-1234",
  "duration": 145
}
```

#### 2. 監査ログ
```bash
# 場所: logs/audit/audit_YYYY-MM-DD.json
# フォーマット: 構造化JSON

{
  "timestamp": "2024-01-01T10:00:00Z",
  "agent": "claude-desktop-001",
  "action": "tools/call",
  "resource": "filesystem__read_file",
  "decision": "PERMIT",
  "reason": "低リスクツールかつ営業時間内",
  "context": {
    "time": "2024-01-01T10:00:00Z",
    "ip": "192.168.1.100",
    "clearanceLevel": "standard"
  },
  "constraints": ["ログ記録"],
  "obligations": [],
  "processingTime": 145
}
```

#### 3. エラーログ
```bash
# 場所: logs/error.log
# フォーマット: スタックトレース付き

{
  "timestamp": "2024-01-01T10:00:00Z",
  "level": "error",
  "error": {
    "message": "LLM API timeout",
    "code": "LLM_TIMEOUT",
    "stack": "Error: LLM API timeout\n    at ...",
    "context": {
      "provider": "anthropic",
      "model": "claude-3-opus",
      "timeout": 15000
    }
  }
}
```

### ログローテーション設定

```bash
# logrotate設定: /etc/logrotate.d/aegis
/opt/aegis/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 aegis aegis
    sharedscripts
    postrotate
        systemctl reload aegis > /dev/null 2>&1 || true
    endscript
}

/opt/aegis/logs/audit/*.json {
    daily
    rotate 365  # 1年間保持
    compress
    delaycompress
    missingok
    notifempty
    create 0640 aegis aegis
}
```

## 🔍 メトリクス収集

### Prometheusメトリクス

```yaml
# prometheus-config.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aegis'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'aegis_.*'
        action: keep
```

### カスタムメトリクス

```typescript
// 実装されているメトリクス
const metrics = {
  // カウンター
  'aegis_requests_total': 'Total number of requests',
  'aegis_permits_total': 'Total number of permits',
  'aegis_denials_total': 'Total number of denials',
  'aegis_errors_total': 'Total number of errors',
  
  // ヒストグラム
  'aegis_decision_duration_seconds': 'Decision latency in seconds',
  'aegis_request_duration_seconds': 'Total request duration',
  
  // ゲージ
  'aegis_active_connections': 'Number of active connections',
  'aegis_cache_size': 'Current cache size',
  'aegis_policy_count': 'Number of loaded policies'
};
```

## 📈 ダッシュボード設定

### Grafanaダッシュボード

```json
{
  "dashboard": {
    "title": "AEGIS Policy Engine Monitoring",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(aegis_requests_total[5m])",
          "legendFormat": "Requests/sec"
        }]
      },
      {
        "id": 2,
        "title": "Decision Distribution",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum(aegis_permits_total)",
            "legendFormat": "Permits"
          },
          {
            "expr": "sum(aegis_denials_total)",
            "legendFormat": "Denials"
          }
        ]
      },
      {
        "id": 3,
        "title": "Response Time (95th percentile)",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(aegis_decision_duration_seconds_bucket[5m]))",
          "legendFormat": "p95 latency"
        }]
      },
      {
        "id": 4,
        "title": "Error Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(aegis_errors_total[5m])",
          "legendFormat": "Errors/sec"
        }]
      }
    ]
  }
}
```

### カスタムダッシュボード

```javascript
// Web UIダッシュボードのカスタマイズ
const customDashboard = {
  widgets: [
    {
      type: 'realtime-chart',
      title: 'リアルタイムアクセス',
      dataSource: '/api/metrics/realtime',
      refreshInterval: 1000
    },
    {
      type: 'heatmap',
      title: 'アクセスヒートマップ',
      dataSource: '/api/metrics/heatmap',
      dimensions: ['hour', 'dayOfWeek']
    },
    {
      type: 'top-list',
      title: 'アクティブエージェント',
      dataSource: '/api/metrics/top-agents',
      limit: 10
    }
  ]
};
```

## 🚨 アラート設定

### Prometheusアラートルール

```yaml
# alerting-rules.yml
groups:
  - name: aegis_critical
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(aegis_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "エラー率が高い"
          description: "過去5分間のエラー率が5%を超えています: {{ $value | humanizePercentage }}"
      
      - alert: HighDenyRate
        expr: |
          rate(aegis_denials_total[5m]) /
          rate(aegis_requests_total[5m]) > 0.3
        for: 10m
        labels:
          severity: warning
          team: security
        annotations:
          summary: "拒否率が高い"
          description: "拒否率が30%を超えています: {{ $value | humanizePercentage }}"
      
      - alert: SlowResponse
        expr: |
          histogram_quantile(0.95,
            rate(aegis_decision_duration_seconds_bucket[5m])
          ) > 5
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "レスポンスが遅い"
          description: "95パーセンタイルレスポンスタイム: {{ $value }}秒"
      
      - alert: ServiceDown
        expr: up{job="aegis"} == 0
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "AEGISサービスダウン"
          description: "インスタンス {{ $labels.instance }} が応答していません"
```

### Slackアラート設定

```yaml
# alertmanager.yml
global:
  slack_api_url: 'YOUR_SLACK_WEBHOOK_URL'

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
    - match:
        severity: warning
      receiver: 'slack-warnings'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#aegis-alerts'
        title: 'AEGIS Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ .Annotations.description }}{{ end }}'
        
  - name: 'slack-warnings'
    slack_configs:
      - channel: '#aegis-warnings'
        send_resolved: true
        
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

## 📊 ログ分析

### ELKスタック統合

```json
// logstash.conf
input {
  file {
    path => "/opt/aegis/logs/audit/*.json"
    type => "aegis-audit"
    codec => "json"
  }
}

filter {
  if [type] == "aegis-audit" {
    date {
      match => [ "timestamp", "ISO8601" ]
    }
    
    mutate {
      add_field => {
        "risk_score" => 0
      }
    }
    
    if [decision] == "DENY" {
      mutate {
        replace => { "risk_score" => 10 }
      }
    }
    
    if [action] =~ /delete|remove|destroy/ {
      mutate {
        replace => { "risk_score" => 8 }
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "aegis-audit-%{+YYYY.MM.dd}"
  }
}
```

### ログクエリ例

```bash
# 特定エージェントの拒否履歴
curl -X GET "localhost:9200/aegis-audit-*/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "term": { "agent": "suspicious-agent-001" } },
        { "term": { "decision": "DENY" } }
      ]
    }
  },
  "sort": [{ "timestamp": { "order": "desc" } }]
}'

# 高リスクアクセスの検出
curl -X GET "localhost:9200/aegis-audit-*/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "range": {
      "risk_score": { "gte": 7 }
    }
  },
  "aggs": {
    "by_agent": {
      "terms": { "field": "agent.keyword" }
    }
  }
}'
```

## 🔧 パフォーマンス監視

### APM (Application Performance Monitoring)

```javascript
// New Relic統合例
const newrelic = require('newrelic');

// カスタムメトリクス
newrelic.recordMetric('Custom/AEGIS/DecisionTime', decisionTime);
newrelic.recordMetric('Custom/AEGIS/CacheHitRate', cacheHitRate);

// カスタムイベント
newrelic.recordCustomEvent('PolicyDecision', {
  agent: request.agent,
  decision: result.decision,
  processingTime: processingTime,
  cacheHit: cacheHit
});
```

### リソース監視

```bash
# CPU/メモリ監視スクリプト
#!/bin/bash
# monitor-resources.sh

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  CPU=$(ps aux | grep node | grep aegis | awk '{print $3}')
  MEM=$(ps aux | grep node | grep aegis | awk '{print $4}')
  
  echo "{\"timestamp\":\"$TIMESTAMP\",\"cpu\":$CPU,\"memory\":$MEM}" >> /opt/aegis/logs/resources.log
  
  # アラート条件
  if (( $(echo "$CPU > 80" | bc -l) )); then
    curl -X POST $SLACK_WEBHOOK -d "{\"text\":\"High CPU usage: $CPU%\"}"
  fi
  
  sleep 60
done
```

## 📈 レポート生成

### 定期レポート

```typescript
// 日次レポート生成
async function generateDailyReport() {
  const report = {
    date: new Date().toISOString().split('T')[0],
    summary: {
      totalRequests: await getTotalRequests(24),
      permitRate: await getPermitRate(24),
      topAgents: await getTopAgents(10),
      topResources: await getTopResources(10),
      anomalies: await getAnomalies(24)
    },
    details: {
      hourlyBreakdown: await getHourlyStats(24),
      policyViolations: await getPolicyViolations(24),
      performanceMetrics: await getPerformanceStats(24)
    }
  };
  
  // レポート送信
  await sendReport(report, ['security-team@example.com']);
  
  // アーカイブ保存
  await saveReport(report, '/opt/aegis/reports/');
}
```

### 監査レポート

```sql
-- 月次監査レポート用クエリ
SELECT 
  DATE(timestamp) as date,
  agent,
  COUNT(*) as total_requests,
  SUM(CASE WHEN decision = 'PERMIT' THEN 1 ELSE 0 END) as permits,
  SUM(CASE WHEN decision = 'DENY' THEN 1 ELSE 0 END) as denials,
  AVG(processing_time) as avg_response_time
FROM audit_logs
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
GROUP BY DATE(timestamp), agent
ORDER BY date DESC, total_requests DESC;
```

## 🛠️ トラブルシューティング用監視

### デバッグログ有効化

```bash
# 一時的にデバッグログを有効化
export LOG_LEVEL=debug
systemctl restart aegis

# 特定コンポーネントのデバッグ
export DEBUG=aegis:mcp-proxy,aegis:policy-engine
```

### リアルタイムログ監視

```bash
# すべてのログをリアルタイム監視
tail -f /opt/aegis/logs/*.log | jq '.'

# エラーのみをフィルタ
tail -f /opt/aegis/logs/application.log | jq 'select(.level == "error")'

# 特定エージェントの監視
tail -f /opt/aegis/logs/audit/*.json | jq 'select(.agent == "target-agent")'
```

## 📚 関連ドキュメント

- [詳細設定](./configuration.md) - ログ設定の詳細
- [トラブルシューティング](./troubleshooting.md) - ログを使った問題解決
- [ガバナンス運用](./governance.md) - 監査要件とコンプライアンス