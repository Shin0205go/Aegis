#!/usr/bin/env tsx
/**
 * 回帰テスト実行スクリプト
 * Bash権限なしで実行可能なTypeScriptベースのテストランナー
 */

import { RegressionTestClient } from './regression-test-client';

// 環境変数の設定（テスト用）
process.env.NODE_ENV = 'test';

// カラー出力用のヘルパー
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

async function main() {
  console.log(colorize('\n🚀 AEGIS 回帰テストクライアント', 'bright'));
  console.log(colorize('========================\n', 'bright'));

  console.log('このスクリプトは以下のテストを実行します:');
  console.log(colorize('1. MCPプロキシ統合テスト', 'cyan'), '- HybridPolicyEngineの動作確認');
  console.log(colorize('2. コアコントローラーテスト', 'cyan'), '- AI→Hybrid移行の互換性');
  console.log(colorize('3. Phase 3 制約・義務テスト', 'cyan'), '- 新enforcement systemの動作');
  console.log(colorize('4. ODRL統合テスト', 'cyan'), '- ODRL+自然言語ハイブリッド判定\n');

  const startTime = Date.now();
  
  try {
    const client = new RegressionTestClient();
    await client.runAllTests();
    
    const duration = Date.now() - startTime;
    console.log(colorize(`\n✅ テスト完了 (${(duration / 1000).toFixed(2)}秒)`, 'green'));
    
  } catch (error) {
    console.error(colorize('\n❌ テスト実行エラー:', 'red'), error);
    process.exit(1);
  }
}

// 実行
main().catch(error => {
  console.error(colorize('予期しないエラー:', 'red'), error);
  process.exit(1);
});