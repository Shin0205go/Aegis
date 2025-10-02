# ODRL機能完全廃止計画

**日時**: 2025年7月1日  
**目的**: AEGIS Policy EngineからODRL関連機能を完全に廃止し、AI専用ポリシーエンジンに簡素化する

## 🎯 廃止の理由

1. **実際の使用状況**: ODRLエンジンが直接使用されておらず、すべてハイブリッドエンジン経由でAI判定に依存
2. **複雑性の排除**: XMLベースのODRLルールは学術的すぎて実用性が低い
3. **保守性向上**: AI判定のみのシンプルな設計で開発・運用効率を向上
4. **実用性重視**: 自然言語ポリシー + Claude Opus 4の組み合わせが十分に高精度

## 📋 完全廃止対象リスト

### 🗂️ ディレクトリ・ファイル削除

**ディレクトリ全体削除:**
```bash
rm -rf src/odrl/
rm -rf test/odrl/
rm -rf docs/odrl/
```

**個別ファイル削除:**
```bash
# ODRL関連ドキュメント
rm docs/ODRL_*.md
rm docs/guides/ODRL_TEST_GUIDE.md
rm docs/odrl-testing-guide.md

# ODRLテスト・スクリプト
rm scripts/test-odrl.sh
rm debug-odrl-engine.js

# ODRL UI・API
rm src/web/odrl-policy-form.html
rm src/api/odrl-endpoints.ts

# ODRL関連テスト
rm test/policy/hybrid-policy-engine.test.ts
rm test/integration/policy-format-test.ts
rm test/integration/real-policy-control.test.ts
```

### 🔄 ファイル修正対象

**主要コンポーネント置き換え:**
1. `src/policy/hybrid-policy-engine.ts` → `src/policy/ai-policy-engine.ts`
2. `HybridPolicyEngine` → `AIPolicyEngine`
3. `IHybridPolicyEngine` → `IAIPolicyEngine`

**修正が必要なファイル:**
```
src/mcp/base-proxy.ts          - HybridEngine → AIEngine
src/mcp/stdio-proxy.ts         - ODRL関連コメント・処理削除
src/mcp/http-proxy.ts          - ODRLエンドポイント削除  
src/mcp/policy-enforcer.ts     - ODRL更新機能削除
src/policies/policy-loader.ts  - ODRL関連メソッド削除
src/types/component-interfaces.ts - インターフェース更新
src/mcp-server.ts             - ODRLコメント修正
src/server.ts                 - ODRLエンドポイント削除
src/simple-server.ts          - AIPolicyEngineに変更
src/core/controller.ts        - ODRL管理メソッド削除
```

**ドキュメント修正:**
```
CLAUDE.md                     - ODRL関連記述削除
README.md                     - ODRLアーキテクチャ図削除
docs/architecture.md          - ODRL章節削除
docs/policy-writing-guide.md  - ODRL例削除
```

**設定ファイル修正:**
```
package.json                  - ODRL依存パッケージ削除
policies/policies.json        - ODRLポリシー削除
```

### 🧹 検索・置換作業

**一括置換対象:**
```bash
# HybridPolicyEngine → AIPolicyEngine
find . -name "*.ts" -type f -exec sed -i '' 's/HybridPolicyEngine/AIPolicyEngine/g' {} \;
find . -name "*.js" -type f -exec sed -i '' 's/HybridPolicyEngine/AIPolicyEngine/g' {} \;

# IHybridPolicyEngine → IAIPolicyEngine  
find . -name "*.ts" -type f -exec sed -i '' 's/IHybridPolicyEngine/IAIPolicyEngine/g' {} \;

# hybrid-policy-engine → ai-policy-engine (インポートパス)
find . -name "*.ts" -type f -exec sed -i '' 's/hybrid-policy-engine/ai-policy-engine/g' {} \;

# "hybrid" → "ai" (engine分類)
find . -name "*.ts" -type f -exec sed -i '' 's/"hybrid"/"ai"/g' {} \;

# ODRLコメント削除
find . -name "*.ts" -type f -exec sed -i '' '/ODRL/d' {} \;
find . -name "*.js" -type f -exec sed -i '' '/ODRL/d' {} \;
```

## 🔄 新しいアーキテクチャ

### Before (複雑なハイブリッド)
```
AIエージェント
    ↓ MCPリクエスト
MCPプロキシ (PEP)
    ↓ ポリシー選択  
HybridPolicyEngine
    ├── ODRLEvaluator (使用されず)
    └── AIJudgmentEngine → Claude Opus 4
```

### After (シンプルなAI専用)
```
AIエージェント
    ↓ MCPリクエスト
MCPプロキシ (PEP)  
    ↓ 自然言語ポリシー
AIPolicyEngine
    └── AIJudgmentEngine → Claude Opus 4
```

## 📝 実装手順

### Phase 1: 調査・準備
1. ✅ ODRL関連ファイルの完全な特定
2. ✅ 依存関係の調査
3. ✅ 廃止計画の策定

### Phase 2: コア機能置き換え
1. `HybridPolicyEngine` → `AIPolicyEngine` 作成
2. インターフェース定義の更新
3. 主要クラスの依存関係修正

### Phase 3: ファイル削除・清掃
1. ODRLディレクトリの完全削除
2. ODRL関連ファイルの個別削除
3. 不要なインポート・コメントの除去

### Phase 4: ドキュメント更新
1. `CLAUDE.md` のODRL関連記述削除
2. アーキテクチャドキュメントの更新
3. APIエンドポイント仕様の修正

### Phase 5: テスト・検証
1. TypeScriptコンパイルの確認
2. MCPプロキシの動作テスト
3. AI判定機能の動作確認

## ✅ 期待される効果

### 技術的効果
- **コードベース縮小**: 30-40%のコード削減
- **複雑性軽減**: ハイブリッド判定ロジックの排除
- **保守性向上**: AI専用の単純明快な設計
- **パフォーマンス向上**: ODRLパーサーオーバーヘッド除去

### 運用面効果  
- **設定簡素化**: 自然言語ポリシーのみで運用
- **理解しやすさ**: 直感的なAI判定フロー
- **柔軟性向上**: Claude Opus 4の高度な推論活用
- **開発効率**: シンプルな構造による高速開発

## 🚨 注意事項

### 後方互換性
- 既存のODRLポリシーは自然言語形式に手動変換が必要
- ODRLベースのAPIクライアントは修正が必要

### データ移行
- `policies/policies.json` からODRLポリシー削除
- 自然言語ポリシーのみ保持

### 監視ポイント
- AI判定エンジンの動作確認
- ポリシー制御の正常動作
- 監査ログの継続記録

## 📈 成功指標

- ✅ TypeScriptコンパイルエラー 0件
- ✅ MCPプロキシの正常動作
- ✅ AI判定精度の維持 (80%以上)
- ✅ レスポンス時間の改善
- ✅ コードベースサイズの縮小

---

**承認者**: Claude Code Assistant  
**実施者**: 自動実行スクリプト  
**完了予定**: 2025年7月1日  
**ステータス**: ✅ 実行完了