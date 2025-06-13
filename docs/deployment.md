# AEGIS デプロイメントガイド

## 📋 目次

1. [前提条件](#前提条件)
2. [環境準備](#環境準備)
3. [ローカル開発環境](#ローカル開発環境)
4. [本番環境デプロイ](#本番環境デプロイ)
5. [Docker構成](#docker構成)
6. [Kubernetes構成](#kubernetes構成)
7. [監視とログ設定](#監視とログ設定)
8. [トラブルシューティング](#トラブルシューティング)

## 前提条件

### システム要件

- **Node.js**: v18.0.0以上
- **npm**: v8.0.0以上
- **メモリ**: 最小2GB、推奨4GB以上
- **ディスク**: 最小10GB

### 必要なサービス

- **LLMプロバイダー**: OpenAI API または Anthropic Claude API
- **Redis**: キャッシュ用（オプション）
- **PostgreSQL**: ポリシー永続化用（オプション）

### APIキー

以下のいずれかのAPIキーが必要です：

- OpenAI API Key
- Anthropic API Key

## 環境準備

### 1. リポジトリのクローン

```bash
git clone https://github.com/your-org/aegis-policy-engine.git
cd aegis-policy-engine
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`を作成：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```env
# LLM設定
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
# または
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-anthropic-api-key

# サーバー設定
PORT=3000
HOST=0.0.0.0

# ログ設定
LOG_LEVEL=info
LOG_FORMAT=json

# キャッシュ設定（オプション）
CACHE_ENABLED=true
CACHE_TTL=3600
REDIS_URL=redis://localhost:6379

# データベース設定（オプション）
DATABASE_URL=postgresql://user:password@localhost:5432/aegis

# 上流MCPサーバー設定
# 方法1: Config経由で設定（全体設定）
MCP_UPSTREAM_SERVERS=gmail:ws://localhost:8081/mcp,gdrive:ws://localhost:8082/mcp

# 方法2: server.ts起動時に設定（個別設定）
UPSTREAM_SERVERS=gmail:ws://localhost:8081/mcp,gdrive:ws://localhost:8082/mcp
```

## ローカル開発環境

### 開発サーバーの起動

```bash
# TypeScriptの監視モードで起動
npm run dev

# または個別に起動
npm run build:watch  # 別ターミナルで
npm run start:dev
```

### テストの実行

```bash
# 全テスト実行
npm test

# 監視モードでテスト
npm run test:watch

# カバレッジレポート
npm run test:coverage
```

### デモの実行

```bash
# 基本的なデモ
npm run demo

# インタラクティブデモ
npm run demo:interactive
```

## 本番環境デプロイ

### 1. ビルド

```bash
# プロダクションビルド
npm run build

# 最適化ビルド
npm run build:prod
```

### 2. プロセスマネージャー（PM2）での起動

PM2をインストール：

```bash
npm install -g pm2
```

PM2設定ファイル（`ecosystem.config.js`）：

```javascript
module.exports = {
  apps: [{
    name: 'aegis',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

起動：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. Nginx設定（リバースプロキシ）

```nginx
server {
    listen 80;
    server_name aegis.example.com;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name aegis.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /mcp {
        proxy_pass http://localhost:3000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

## Docker構成

### Dockerfile

```dockerfile
# ビルドステージ
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# 実行ステージ
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/policies ./policies

EXPOSE 3000

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  aegis:
    build: .
    container_name: aegis-policy-engine
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LLM_PROVIDER=${LLM_PROVIDER}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://aegis:aegis@postgres:5432/aegis
      # 上流MCPサーバー設定
      - MCP_UPSTREAM_SERVERS=gmail:ws://gmail-mcp:8080/mcp,gdrive:ws://gdrive-mcp:8080/mcp
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    networks:
      - aegis-network

  redis:
    image: redis:7-alpine
    container_name: aegis-redis
    volumes:
      - redis-data:/data
    networks:
      - aegis-network

  postgres:
    image: postgres:15-alpine
    container_name: aegis-postgres
    environment:
      - POSTGRES_USER=aegis
      - POSTGRES_PASSWORD=aegis
      - POSTGRES_DB=aegis
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - aegis-network

volumes:
  redis-data:
  postgres-data:

networks:
  aegis-network:
    driver: bridge
```

### ビルドと起動

```bash
# ビルド
docker-compose build

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f aegis

# 停止
docker-compose down
```

## Kubernetes構成

### 1. ConfigMap（設定）

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aegis-config
  namespace: aegis
data:
  NODE_ENV: "production"
  LLM_PROVIDER: "openai"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  CACHE_ENABLED: "true"
  CACHE_TTL: "3600"
```

### 2. Secret（機密情報）

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: aegis-secrets
  namespace: aegis
type: Opaque
stringData:
  OPENAI_API_KEY: "your-api-key"
  DATABASE_URL: "postgresql://user:pass@postgres:5432/aegis"
  REDIS_URL: "redis://redis:6379"
```

### 3. Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aegis
  namespace: aegis
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
      containers:
      - name: aegis
        image: aegis/policy-engine:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: aegis-config
        - secretRef:
            name: aegis-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
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
```

### 4. Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: aegis-service
  namespace: aegis
spec:
  selector:
    app: aegis
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: ClusterIP
```

### 5. Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aegis-ingress
  namespace: aegis
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/websocket-services: aegis-service
spec:
  tls:
  - hosts:
    - aegis.example.com
    secretName: aegis-tls
  rules:
  - host: aegis.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: aegis-service
            port:
              number: 80
```

### デプロイコマンド

```bash
# 名前空間作成
kubectl create namespace aegis

# デプロイ
kubectl apply -f k8s/

# 状態確認
kubectl get all -n aegis

# ログ確認
kubectl logs -f deployment/aegis -n aegis
```

## 監視とログ設定

### Prometheus設定

```yaml
# prometheus-config.yaml
scrape_configs:
  - job_name: 'aegis'
    static_configs:
      - targets: ['aegis-service:3000']
    metrics_path: '/metrics'
```

### Grafanaダッシュボード

主要メトリクス：

- アクセス判定数（許可/拒否）
- 平均応答時間
- エラー率
- キャッシュヒット率
- LLM API使用量

### ログ集約（Elasticsearch）

```yaml
# filebeat.yml
filebeat.inputs:
- type: container
  paths:
    - /var/lib/docker/containers/*/*.log
  processors:
    - add_kubernetes_metadata:
        host: ${NODE_NAME}
        matchers:
        - logs_path:
            logs_path: "/var/lib/docker/containers/"

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "aegis-%{+yyyy.MM.dd}"
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. LLM API接続エラー

**症状**: `Error: Failed to connect to OpenAI API`

**解決方法**:
```bash
# APIキーの確認
echo $OPENAI_API_KEY

# ネットワーク接続確認
curl https://api.openai.com/v1/models

# プロキシ設定確認
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

#### 2. メモリ不足エラー

**症状**: `FATAL ERROR: Reached heap limit Allocation failed`

**解決方法**:
```bash
# Node.jsのメモリ制限を増やす
NODE_OPTIONS="--max-old-space-size=4096" npm start

# またはDockerの場合
docker run -m 4g aegis/policy-engine
```

#### 3. ポート競合

**症状**: `Error: listen EADDRINUSE: address already in use :::3000`

**解決方法**:
```bash
# 使用中のプロセスを確認
lsof -i :3000

# 別のポートを使用
PORT=3001 npm start
```

#### 4. Redis接続エラー

**症状**: `Error: Redis connection to localhost:6379 failed`

**解決方法**:
```bash
# Redisの起動確認
redis-cli ping

# Redisの起動
docker run -d -p 6379:6379 redis:alpine
```

### デバッグモード

詳細なログを有効化：

```bash
# 環境変数で設定
LOG_LEVEL=debug npm start

# または実行時に設定
DEBUG=aegis:* npm start
```

### ヘルスチェック

```bash
# 基本的なヘルスチェック
curl http://localhost:3000/health

# 詳細なヘルスチェック
curl http://localhost:3000/health/detailed
```

## まとめ

AEGISのデプロイは、環境に応じて柔軟に構成できます：

1. **開発環境**: npm run devで簡単に起動
2. **本番環境**: PM2やDockerで安定運用
3. **大規模環境**: Kubernetesでスケーラブルな構成
4. **監視**: Prometheus/Grafanaで包括的な監視

各環境の要件に応じて、適切な構成を選択してください。