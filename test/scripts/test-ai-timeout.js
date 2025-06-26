// AI判定タイムアウトのテスト

import('../../../dist/src/utils/config.js').then(async () => {
  const { AIJudgmentEngine } = await import('../../../dist/src/ai/judgment-engine.js');
  
  console.log('🧪 AI判定タイムアウトテスト...\n');
  
  try {
    // 設定を確認
    console.log('環境変数確認:');
    console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '設定済み' : '未設定');
    console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '設定済み' : '未設定');
    
    // AI判定エンジンを初期化
    const aiJudgment = new AIJudgmentEngine();
    
    const testContext = {
      agent: 'mcp-client',
      action: 'execute',
      resource: 'file:/Users/shingo/Develop/aegis-policy-engine/README.md',
      purpose: 'documentation-access',
      time: new Date(),
      environment: {
        transport: 'mcp-tool',
        toolName: 'filesystem__read_file'
      }
    };
    
    console.log('\n📝 テストケース:');
    console.log(`   エージェント: ${testContext.agent}`);
    console.log(`   リソース: ${testContext.resource}`);
    
    console.log('\n⏱️  AI判定を実行中...');
    const startTime = Date.now();
    
    // 判定を実行（タイムアウトなし）
    const decision = await aiJudgment.makeDecision(
      testContext,
      `Claude Desktop アクセスポリシー：
      
      【基本原則】
      - Claude Desktop (mcp-client) からのアクセスは基本的に許可
      - ただし、個人情報を含む可能性があるファイルは慎重に扱う
      
      【制限事項】
      - README.mdなどのドキュメントファイルは通常許可
      - ただし、セキュリティコンテキストによっては追加確認が必要`
    );
    
    const endTime = Date.now();
    
    console.log(`\n✅ AI判定完了！`);
    console.log(`   判定: ${decision.decision}`);
    console.log(`   理由: ${decision.reason}`);
    console.log(`   処理時間: ${endTime - startTime}ms`);
    
  } catch (error) {
    console.error('\n❌ エラー発生:', error.message);
    console.error('スタックトレース:', error.stack);
  }
  
  process.exit(0);
});