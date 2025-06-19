# 本番環境展開ガイド

AEGISを本番環境に安全かつ効率的に展開するための詳細なガイドです。

## 📋 展開前チェックリスト

### システム要件
- [ ] Node.js v20以上がインストール済み
- [ ] 十分なメモリ（最小4GB、推奨8GB以上）
- [ ] ディスク容量（最小10GB、ログ保存用）
- [ ] ネットワーク接続（LLM APIへのアクセス）

### セキュリティ要件
- [ ] ファイアウォール設定の準備
- [ ] SSL証明書の取得
- [ ] APIキーの安全な管理方法確立
- [ ] バックアップ戦略の策定

### 運用要件
- [ ] 監視システムの準備
- [ ] ログ収集システムの準備
- [ ] インシデント対応手順の文書化
- [ ] ロールバック計画の作成

## 🚀 基本的な展開手順

### 1. プロダクションビルド

```bash
# ソースコードの取得
git clone https://github.com/youraccount/aegis-policy-engine.git
cd aegis-policy-engine

# 本番用タグをチェックアウト
git checkout tags/v1.0.0

# 依存関係のインストール（本番用）
npm ci --production

# TypeScriptのビルド
npm run build

# ビルド結果の確認
npm run validate-build
```

### 2. 環境設定

```bash
# 本番用環境変数ファイルの作成
cp .env.production.example .env

# 環境変数の設定
cat > .env << EOF
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# LLM設定
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
LLM_MODEL=claude-3-opus-20240229

# セキュリティ設定
API_AUTH_ENABLED=true
API_AUTH_TOKEN=$(openssl rand -hex 32)
AUDIT_LOG_ENCRYPTION=true
AUDIT_LOG_ENCRYPTION_KEY=$(openssl rand -hex 16)

# パフォーマンス設定
CACHE_ENABLED=true
CACHE_TTL=3600
MAX_CONCURRENT_REQUESTS=100
EOF

# 設定ファイルの権限設定
chmod 600 .env
```

### 3. systemdサービス設定

```bash
# サービスファイルの作成
sudo tee /etc/systemd/system/aegis.service << EOF
[Unit]
Description=AEGIS Policy Engine
After=network.target

[Service]
Type=simple
User=aegis
Group=aegis
WorkingDirectory=/opt/aegis
ExecStart=/usr/bin/node /opt/aegis/mcp-launcher.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=aegis
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=4096"

# セキュリティ設定
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/aegis/logs /opt/aegis/cache

[Install]
WantedBy=multi-user.target
EOF

# サービスの有効化と起動
sudo systemctl daemon-reload
sudo systemctl enable aegis
sudo systemctl start aegis
```

## 🔧 高度な展開オプション

### 1. Dockerコンテナ展開

```dockerfile
# Dockerfile
FROM node:20-alpine

# セキュリティアップデート
RUN apk update && apk upgrade

# アプリケーションユーザー作成
RUN addgroup -g 1001 -S aegis && \
    adduser -S -u 1001 -G aegis aegis

# 作業ディレクトリ
WORKDIR /app

# 依存関係のコピーとインストール
COPY package*.json ./
RUN npm ci --production

# アプリケーションのコピー
COPY --chown=aegis:aegis dist ./dist
COPY --chown=aegis:aegis policies ./policies
COPY --chown=aegis:aegis web ./web

# 実行ユーザー切り替え
USER aegis

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 起動
EXPOSE 3000
CMD ["node", "mcp-launcher.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  aegis:
    build: .
    container_name: aegis-policy-engine
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
      - ./policies:/app/policies:ro
    networks:
      - aegis-network
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

networks:
  aegis-network:
    driver: bridge
```

### 2. Kubernetes展開

```yaml
# aegis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aegis-policy-engine
  labels:
    app: aegis
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aegis
  template:
    metadata:
      labels:
        app: aegis
    spec:
      serviceAccountName: aegis
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: aegis
        image: aegis-policy-engine:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: aegis-secrets
              key: anthropic-api-key
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: logs
          mountPath: /app/logs
        - name: policies
          mountPath: /app/policies
      volumes:
      - name: logs
        persistentVolumeClaim:
          claimName: aegis-logs-pvc
      - name: policies
        configMap:
          name: aegis-policies
```

### 3. 高可用性構成

```nginx
# nginx.conf - ロードバランサー設定
upstream aegis_backend {
    least_conn;
    server aegis1.internal:3000 max_fails=3 fail_timeout=30s;
    server aegis2.internal:3000 max_fails=3 fail_timeout=30s;
    server aegis3.internal:3000 max_fails=3 fail_timeout=30s;
    
    # ヘルスチェック
    check interval=3000 rise=2 fall=5 timeout=1000 type=http;
    check_http_send "GET /health HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
}

server {
    listen 443 ssl http2;
    server_name aegis.example.com;
    
    # SSL設定
    ssl_certificate /etc/nginx/ssl/aegis.crt;
    ssl_certificate_key /etc/nginx/ssl/aegis.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    
    # セキュリティヘッダー
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    
    location / {
        proxy_pass http://aegis_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # タイムアウト設定
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## 📊 監視設定

### 1. Prometheusメトリクス

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'aegis'
    static_configs:
      - targets: ['aegis1:3000', 'aegis2:3000', 'aegis3:3000']
    metrics_path: '/metrics'
```

### 2. Grafanaダッシュボード

```json
{
  "dashboard": {
    "title": "AEGIS Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(aegis_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Decision Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, aegis_decision_duration_seconds_bucket)"
          }
        ]
      },
      {
        "title": "Deny Rate",
        "targets": [
          {
            "expr": "rate(aegis_denials_total[5m]) / rate(aegis_requests_total[5m])"
          }
        ]
      }
    ]
  }
}
```

### 3. アラート設定

```yaml
# alerting-rules.yml
groups:
  - name: aegis_alerts
    rules:
      - alert: HighDenyRate
        expr: rate(aegis_denials_total[5m]) / rate(aegis_requests_total[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High deny rate detected"
          description: "Deny rate is {{ $value | humanizePercentage }}"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, aegis_decision_duration_seconds_bucket) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High decision latency"
          description: "95th percentile latency is {{ $value }}s"
```

## 🔄 デプロイメント戦略

### 1. Blue-Green デプロイメント

```bash
#!/bin/bash
# blue-green-deploy.sh

# 新バージョンをグリーン環境にデプロイ
kubectl apply -f aegis-deployment-green.yaml

# ヘルスチェック
for i in {1..30}; do
  if curl -f http://aegis-green/health; then
    echo "Green environment is healthy"
    break
  fi
  sleep 10
done

# トラフィックを切り替え
kubectl patch service aegis -p '{"spec":{"selector":{"version":"green"}}}'

# 古いバージョンを削除
kubectl delete deployment aegis-blue
```

### 2. カナリアリリース

```yaml
# istio-canary.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: aegis-canary
spec:
  hosts:
  - aegis.example.com
  http:
  - match:
    - headers:
        canary:
          exact: "true"
    route:
    - destination:
        host: aegis
        subset: canary
      weight: 100
  - route:
    - destination:
        host: aegis
        subset: stable
      weight: 90
    - destination:
        host: aegis
        subset: canary
      weight: 10
```

## 🛡️ セキュリティ強化

### 1. ネットワークポリシー

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: aegis-network-policy
spec:
  podSelector:
    matchLabels:
      app: aegis
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS for LLM APIs
  - to:
    - podSelector:
        matchLabels:
          app: prometheus
    ports:
    - protocol: TCP
      port: 9090
```

### 2. シークレット管理

```bash
# HashiCorp Vault統合
vault kv put secret/aegis \
  anthropic_api_key="${ANTHROPIC_API_KEY}" \
  api_auth_token="$(openssl rand -hex 32)" \
  encryption_key="$(openssl rand -hex 16)"

# Kubernetes Secretとの同期
kubectl create secret generic aegis-secrets \
  --from-literal=anthropic-api-key="${ANTHROPIC_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 📋 運用チェックリスト

### デプロイ後の確認
- [ ] すべてのヘルスチェックが正常
- [ ] ログが正しく出力されている
- [ ] メトリクスが収集されている
- [ ] アラートが設定されている
- [ ] バックアップが動作している

### 定期メンテナンス
- [ ] セキュリティパッチの適用
- [ ] 依存関係の更新
- [ ] ログのローテーション
- [ ] パフォーマンスの最適化
- [ ] 災害復旧テスト

## 📚 関連ドキュメント

- [詳細設定](./configuration.md) - 環境変数と設定の詳細
- [監視・ログ管理](./monitoring.md) - 監視システムの詳細設定
- [トラブルシューティング](./troubleshooting.md) - デプロイ時の問題解決