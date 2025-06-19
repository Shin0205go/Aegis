#!/usr/bin/env node

// ============================================================================
// 実際のAEGISプロキシサーバーを使用したA2Aエージェントテスト
// ============================================================================

import { MCPEnabledAgent } from '../agents/simple-mcp-agent.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs';

// テストシナリオ
async function runRealAEGISTest() {
  try {
    console.log('🚀 実際のAEGISプロキシサーバーを使用したA2Aテストを開始します\n');
    
    // MCPクライアントを初期化（AEGISプロキシに接続）
    const mcpClient = new Client(
      {
        name: 'a2a-test-agent',
        version: '1.0.0',
      },
      {
        capabilities: {}
      }
    );
    
    // stdioでAEGISプロキシに接続
    console.log('🔗 AEGISプロキシサーバーに接続中...');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        path.join('/Users/shingo/Develop/aegis-policy-engine', 'dist', 'src', 'mcp-server.js'),
        '--transport', 'stdio',
        '--provider', 'openai',
        '--model', 'gpt-4'
      ],
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        LOG_LEVEL: 'info'
      }
    });
    
    await mcpClient.connect(transport);
    console.log('✅ AEGISプロキシサーバーに接続しました\n');
    
    // A2Aエージェントを初期化
    const researchAgent = new MCPEnabledAgent('research-agent', mcpClient);
    
    console.log('🤖 A2Aエージェントシステムを初期化しました\n');
    
    // テストシナリオ1: ツール一覧の取得（許可されるべき）
    console.log('📋 テスト1: ツール一覧の取得');
    try {
      const tools = await mcpClient.listTools();
      console.log(`✅ ツール一覧取得成功: ${tools.tools.length}個のツールが利用可能`);
      tools.tools.slice(0, 5).forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      if (tools.tools.length > 5) {
        console.log(`  ... 他 ${tools.tools.length - 5} 個のツール`);
      }
    } catch (error) {
      console.error('❌ ツール一覧取得失敗:', error);
    }
    
    // テストシナリオ2: リソース一覧の取得
    console.log('\n📂 テスト2: リソース一覧の取得');
    try {
      const resources = await mcpClient.listResources();
      console.log(`✅ リソース一覧取得成功: ${resources.resources.length}個のリソースが利用可能`);
      resources.resources.slice(0, 3).forEach(resource => {
        console.log(`  - ${resource.uri}: ${resource.name}`);
      });
      if (resources.resources.length > 3) {
        console.log(`  ... 他 ${resources.resources.length - 3} 個のリソース`);
      }
    } catch (error) {
      console.error('❌ リソース一覧取得失敗:', error);
    }
    
    // テストシナリオ3: ファイルシステムアクセス（ポリシー制御される）
    console.log('\n📁 テスト3: ファイルシステムアクセス');
    try {
      // filesystemツールを使用してREADMEを読む
      const fileAccess = await mcpClient.callTool({
        name: 'filesystem__read_file',
        arguments: {
          path: '/Users/shingo/Develop/aegis-policy-engine/README.md'
        }
      });
      
      if (fileAccess.content && Array.isArray(fileAccess.content) && fileAccess.content.length > 0) {
        console.log('✅ ファイルアクセス成功（ポリシーで許可）');
        const content = JSON.stringify(fileAccess.content[0]).substring(0, 100);
        console.log(`  内容の一部: ${content}...`);
      } else {
        console.log('✅ ファイルアクセス成功（ポリシーで許可）');
        console.log(`  結果: ${JSON.stringify(fileAccess).substring(0, 100)}...`);
      }
    } catch (error: any) {
      if (error.message?.includes('denied') || error.message?.includes('Access denied')) {
        console.log('✅ ファイルアクセスが適切に拒否されました（ポリシー違反）');
        console.log(`  理由: ${error.message}`);
      } else {
        console.error('❌ ファイルアクセスエラー:', error.message || error);
      }
    }
    
    // テストシナリオ4: 高リスク操作（拒否されるべき）
    console.log('\n⚠️ テスト4: 高リスク操作（ファイル削除）');
    try {
      // 存在しないファイルを削除しようとする（安全のため）
      const deleteOperation = await mcpClient.callTool({
        name: 'filesystem__delete_file',
        arguments: {
          path: '/tmp/test-file-that-does-not-exist.txt'
        }
      });
      
      console.log('⚠️ 高リスク操作が許可されました（ポリシー違反の可能性）');
      console.log('  結果:', deleteOperation);
    } catch (error: any) {
      console.log('✅ 高リスク操作が正しく拒否されました');
      console.log(`  理由: ${error.message || error}`);
    }
    
    // テストシナリオ5: MCPエージェントタスクの実行
    console.log('\n🔄 テスト5: MCPエージェントタスクの実行');
    const agentTask = await researchAgent.executeTask({
      type: 'research',
      description: 'AEGISプロキシのCLAUDE.mdを読み取る',
      data: { 
        toolName: 'filesystem__read_file',
        arguments: { path: '/Users/shingo/Develop/aegis-policy-engine/CLAUDE.md' }
      }
    });
    
    console.log('\n📊 タスクの結果:');
    if (agentTask.status === 'completed') {
      console.log('✅ タスク完了');
      console.log(`  結果: ${JSON.stringify(agentTask.result).substring(0, 200)}...`);
    } else {
      console.log('❌ タスク失敗');
      console.log(`  エラー: ${agentTask.error}`);
    }
    
    // 監査ログの確認（ファイルから）
    console.log('\n📝 監査ログの確認');
    const auditLogDir = '/Users/shingo/Develop/aegis-policy-engine/logs/audit';
    try {
      const today = new Date().toISOString().split('T')[0];
      const auditLogFile = path.join(auditLogDir, `audit_${today}.json`);
      
      if (fs.existsSync(auditLogFile)) {
        const logContent = fs.readFileSync(auditLogFile, 'utf-8');
        const logs = logContent.trim().split('\n').map(line => JSON.parse(line));
        
        console.log(`✅ 本日の監査ログエントリ: ${logs.length}件`);
        // 最新の5件を表示
        const recentLogs = logs.slice(-5);
        recentLogs.forEach((entry: any, index: number) => {
          console.log(`  ${index + 1}. ${entry.timestamp} - ${entry.context.action} - ${entry.decision.decision} - ${entry.context.agent}`);
        });
      } else {
        console.log('⚠️ 本日の監査ログファイルが見つかりません');
      }
    } catch (error) {
      console.log('⚠️ 監査ログの読み取りに失敗しました:', error);
    }
    
    // クリーンアップ
    await mcpClient.close();
    console.log('\n✅ テスト完了');
    
  } catch (error) {
    console.error('\n❌ テスト中にエラーが発生しました:', error);
    throw error;
  }
}

// メイン実行部分
async function main() {
  console.log('🚀 実際のAEGISプロキシサーバーを使用したA2Aテストを開始します\n');
  
  // APIキーのチェック
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ エラー: OPENAI_API_KEY が設定されていません');
    console.error('以下のコマンドでAPIキーを設定してください:');
    console.error('export OPENAI_API_KEY="your-api-key-here"');
    process.exit(1);
  }
  
  try {
    await runRealAEGISTest();
    console.log('\n✅ 全テスト完了');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ テスト実行エラー:', error);
    process.exit(1);
  }
}

// スクリプトとして実行された場合のみmainを実行
main();