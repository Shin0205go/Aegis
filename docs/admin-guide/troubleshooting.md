# トラブルシューティングガイド

AEGISの運用中に発生する可能性のある問題と、その解決方法について説明します。

## 🔍 一般的な診断手順

### 1. システム状態の確認

```bash
# AEGISプロセスの確認
ps aux | grep aegis

# ポート使用状況
netstat -tlnp | grep 3000

# システムリソース
free -h
df -h
top -n 1

# サービス状態
systemctl status aegis

# 最近のログ確認
tail -n 100 /opt/aegis/logs/application.log | jq '.'
```

### 2. ヘルスチェック

```bash
# 基本ヘルスチェック
curl -s http://localhost:3000/health | jq '.'

# 詳細診断
curl -s http://localhost:3000/api/admin/diagnostics \
  -H "Authorization: Bearer $API_AUTH_TOKEN" | jq '.'

# 応答時間テスト
time curl -s http://localhost:3000/health
```

## ⚠️ よくある問題と解決方法

### 起動時の問題

#### 問題: サービスが起動しない

**症状**:
```
systemctl start aegis
Job for aegis.service failed
```

**診断**:
```bash
# システムログ確認
journalctl -u aegis -n 50

# 起動ログ確認
tail -f /opt/aegis/logs/mcp-launcher.log
```

**解決方法**:

1. **ポート競合**
```bash
# 使用中のポート確認
lsof -i :3000

# 別のポートで起動
PORT=3001 node mcp-launcher.js
```

2. **権限不足**
```bash
# ファイル権限確認
ls -la /opt/aegis/

# 権限修正
sudo chown -R aegis:aegis /opt/aegis/
sudo chmod -R 750 /opt/aegis/
```

3. **依存関係の問題**
```bash
# Node.jsバージョン確認
node --version  # v20以上が必要

# 依存関係の再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

### API関連の問題

#### 問題: LLM APIタイムアウト

**症状**:
```json
{
  "error": "LLM_TIMEOUT",
  "message": "Request to LLM provider timed out after 15000ms"
}
```

**解決方法**:

1. **タイムアウト値の調整**
```bash
# .envファイルで調整
LLM_TIMEOUT=30000  # 30秒に増加
REQUEST_TIMEOUT=60000  # 全体のタイムアウトも調整
```

2. **APIキーの確認**
```bash
# APIキーが正しく設定されているか確認
echo $ANTHROPIC_API_KEY | head -c 10

# APIキーのテスト
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [{"role": "user", "content": "test"}], "max_tokens": 10}'
```

3. **ネットワーク接続**
```bash
# API エンドポイントへの接続確認
curl -I https://api.anthropic.com
ping -c 4 api.anthropic.com
traceroute api.anthropic.com
```

#### 問題: 認証エラー

**症状**:
```
401 Unauthorized: Invalid or missing API token
```

**解決方法**:

```bash
# トークン生成
export API_AUTH_TOKEN=$(openssl rand -hex 32)

# .envに追加
echo "API_AUTH_TOKEN=$API_AUTH_TOKEN" >> .env

# サービス再起動
systemctl restart aegis
```

### パフォーマンス問題

#### 問題: レスポンスが遅い

**診断**:
```bash
# CPU使用率確認
top -p $(pgrep -f aegis)

# メモリ使用量
ps aux | grep aegis | awk '{print $6/1024 " MB"}'

# スロークエリログ
grep -E "duration.*[0-9]{4,}" /opt/aegis/logs/application.log
```

**解決方法**:

1. **キャッシュの有効化**
```bash
# .envで設定
CACHE_ENABLED=true
CACHE_TTL=3600
CACHE_MAX_SIZE=5000
```

2. **Node.js最適化**
```bash
# メモリ割り当て増加
NODE_OPTIONS="--max-old-space-size=8192"

# ガベージコレクション最適化
NODE_OPTIONS="--max-old-space-size=8192 --optimize-for-size"
```

3. **バッチ処理の調整**
```bash
BATCH_ENABLED=true
BATCH_SIZE=20  # 同時処理数を増加
BATCH_TIMEOUT=200  # タイムアウトを延長
```

### ポリシー関連の問題

#### 問題: ポリシーが適用されない

**診断**:
```bash
# ポリシーファイルの確認
ls -la /opt/aegis/policies/

# ポリシーのロード状態
curl http://localhost:3000/api/policies | jq '.'

# 最近のポリシー判定ログ
tail -f /opt/aegis/logs/audit/*.json | jq 'select(.decision != null)'
```

**解決方法**:

1. **ポリシーファイルの検証**
```typescript
// ポリシー構文チェック
npm run validate-policies

// 手動でポリシーをテスト
curl -X POST http://localhost:3000/api/policy/test \
  -H "Content-Type: application/json" \
  -d '{
    "policyName": "test-policy",
    "context": {
      "agent": "test-agent",
      "action": "read",
      "resource": "test-resource"
    }
  }'
```

2. **ポリシーのリロード**
```bash
# ポリシーの再読み込み
curl -X POST http://localhost:3000/api/admin/reload-policies \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

### ログ関連の問題

#### 問題: ログが出力されない

**診断**:
```bash
# ログディレクトリの権限
ls -la /opt/aegis/logs/

# ディスク容量
df -h /opt/aegis/logs/

# ログ設定確認
grep LOG /opt/aegis/.env
```

**解決方法**:

1. **ログディレクトリの作成**
```bash
mkdir -p /opt/aegis/logs/audit
chown -R aegis:aegis /opt/aegis/logs/
```

2. **ログローテーション設定**
```bash
# logrotateが動作しているか確認
logrotate -d /etc/logrotate.d/aegis

# 手動でローテーション実行
logrotate -f /etc/logrotate.d/aegis
```

## 🚨 緊急時の対応

### サービス完全停止時

```bash
#!/bin/bash
# emergency-restart.sh

echo "=== AEGIS緊急再起動スクリプト ==="

# 1. 現在のプロセスを強制終了
echo "既存プロセスの停止..."
pkill -f aegis
sleep 2

# 2. ポート解放の確認
echo "ポート解放確認..."
fuser -k 3000/tcp 2>/dev/null

# 3. ログのバックアップ
echo "ログのバックアップ..."
tar -czf /backup/aegis-logs-$(date +%Y%m%d-%H%M%S).tar.gz /opt/aegis/logs/

# 4. キャッシュクリア
echo "キャッシュクリア..."
rm -rf /opt/aegis/cache/*

# 5. サービス再起動
echo "サービス再起動..."
systemctl start aegis

# 6. 起動確認
sleep 5
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✓ サービスが正常に起動しました"
else
    echo "✗ サービス起動に失敗しました"
    journalctl -u aegis -n 50
fi
```

### データ破損時の復旧

```bash
# バックアップからの復旧
#!/bin/bash

# ポリシーファイルの復旧
cp -r /backup/policies/* /opt/aegis/policies/

# 設定ファイルの復旧
cp /backup/aegis-config/* /opt/aegis/

# 権限の再設定
chown -R aegis:aegis /opt/aegis/

# 整合性チェック
npm run validate-config
npm run validate-policies

# サービス再起動
systemctl restart aegis
```

## 🔧 高度なデバッグ

### デバッグモードの有効化

```bash
# 環境変数でデバッグモード設定
export DEBUG=aegis:*
export LOG_LEVEL=debug
export NODE_ENV=development

# 対話的デバッグ
node --inspect mcp-launcher.js

# Chrome DevToolsでデバッグ
# chrome://inspect にアクセス
```

### パケットキャプチャ

```bash
# HTTPトラフィックの監視
tcpdump -i any -A -s0 'tcp port 3000'

# 特定のAPIエンドポイントのみ
tcpdump -i any -A -s0 'tcp port 3000 and (tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x47455420 or tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x504f5354)'
```

### メモリダンプ解析

```javascript
// メモリ使用状況のスナップショット
const v8 = require('v8');
const fs = require('fs');

// ヒープスナップショットの取得
v8.writeHeapSnapshot('/tmp/aegis-heap.heapsnapshot');

// メモリ統計
console.log(v8.getHeapStatistics());
```

## 📊 パフォーマンスプロファイリング

### CPU プロファイリング

```bash
# Node.js内蔵プロファイラ
node --prof mcp-launcher.js

# プロファイル結果の解析
node --prof-process isolate-*.log > profile.txt
```

### 負荷テスト

```bash
# Apache Benchでの負荷テスト
ab -n 1000 -c 10 -H "Authorization: Bearer $API_AUTH_TOKEN" \
   http://localhost:3000/api/policy/evaluate

# 詳細な負荷テスト（k6使用）
cat > load-test.js << EOF
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
};

export default function() {
  let response = http.get('http://localhost:3000/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
EOF

k6 run load-test.js
```

## 📝 問題報告テンプレート

問題が解決しない場合は、以下の情報を含めて報告してください：

```markdown
## 問題の概要
[問題の簡潔な説明]

## 環境情報
- AEGIS バージョン: 
- Node.js バージョン: 
- OS: 
- デプロイ方法: [Docker/Systemd/K8s]

## 再現手順
1. 
2. 
3. 

## 期待される動作
[正常な場合の動作]

## 実際の動作
[発生している問題]

## エラーログ
```
[関連するログを貼り付け]
```

## 試した解決方法
- [ ] 
- [ ] 

## 追加情報
[その他関連する情報]
```

## 🔗 サポートリソース

- **ナレッジベース**: 内部Wiki参照
- **コミュニティフォーラム**: [https://community.aegis.example](https://community.aegis.example)
- **緊急サポート**: security-oncall@example.com
- **Slackチャンネル**: #aegis-support

## 📚 関連ドキュメント

- [詳細設定](./configuration.md) - 設定オプションの詳細
- [監視・ログ管理](./monitoring.md) - ログの詳細な分析方法
- [FAQ](../reference/faq.md) - よくある質問と回答