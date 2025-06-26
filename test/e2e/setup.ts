// ============================================================================
// E2Eテストセットアップ
// ============================================================================

import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';

let apiProcess: ChildProcess | null = null;

// グローバルセットアップ
beforeAll(async () => {
  console.log('🚀 E2Eテスト環境をセットアップ中...');
  
  // APIサーバーを起動
  apiProcess = spawn('npm', ['run', 'start:api'], {
    detached: false,
    stdio: 'pipe'
  });
  
  // サーバーが起動するまで待機
  await waitForServer('http://localhost:3000/api/policies', 30000);
  
  console.log('✅ APIサーバーが起動しました');
});

// グローバルクリーンアップ
afterAll(async () => {
  console.log('🧹 E2Eテスト環境をクリーンアップ中...');
  
  if (apiProcess) {
    // プロセスグループ全体を終了
    process.kill(-apiProcess.pid!, 'SIGTERM');
    apiProcess = null;
  }
  
  // 少し待機してからプロセスが終了したことを確認
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ クリーンアップ完了');
});

// サーバーの起動を待つヘルパー関数
async function waitForServer(url: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // サーバーがまだ起動していない
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`サーバーが ${timeout}ms 以内に起動しませんでした`);
}

// テスト用の環境変数設定
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // テスト中はエラーログのみ

// グローバルなfetch設定
(global as any).fetch = fetch;