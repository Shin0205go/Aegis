// README.mdアクセスのポリシーテスト

import('../../../dist/src/ai/judgment-engine.js').then(async ({ AIJudgmentEngine }) => {
  const { AdvancedAuditSystem } = await import('../../../dist/src/audit/advanced-audit-system.js');
  
  console.log('🧪 README.mdアクセスのポリシーテスト...\n');

  const auditSystem = new AdvancedAuditSystem();
  const aiJudgment = new AIJudgmentEngine();

  const testContext = {
    agent: 'mcp-client',
    action: 'read',
    resource: 'file:///Users/shingo/Develop/aegis-policy-engine/README.md',
    purpose: 'documentation-access',
    time: new Date(),
    environment: {
      transport: 'mcp-tool',
      toolName: 'filesystem__read_file',
      clientInfo: {
        userAgent: 'Claude-Code/1.0'
      }
    }
  };

  console.log('📝 テスト: README.mdへのアクセス');
  console.log(`   エージェント: ${testContext.agent}`);
  console.log(`   リソース: ${testContext.resource}`);
  console.log(`   時刻: ${testContext.time.toLocaleTimeString()}`);
  
  try {
    // AI判定を実行
    const decision = await aiJudgment.makeDecision(
      testContext,
      `ファイルシステムアクセスポリシー：
      
      基本原則：
      - Claude Desktop (mcp-client) からのアクセスは基本的に許可
      - ただし、個人情報を含む可能性があるファイルは慎重に扱う
      
      制限事項：
      - README.mdなどのドキュメントファイルは通常許可
      - ただし、セキュリティコンテキストによっては追加確認が必要`
    );
    
    console.log(`   判定: ${decision.decision}`);
    console.log(`   理由: ${decision.reason}`);
    console.log(`   信頼度: ${decision.confidence}`);
    
    // 監査ログに記録
    await auditSystem.recordAccess({
      ...testContext,
      decision,
      responseTime: 150
    });
    
    console.log('\n✅ 監査ログに記録しました');
    
    // 監査エントリを確認
    const entries = auditSystem.getAuditEntries();
    const readmeEntries = entries.filter(e => e.context.resource.includes('README.md'));
    console.log(`\n📊 README.mdへのアクセス記録: ${readmeEntries.length}件`);
    
  } catch (error) {
    console.error(`   エラー: ${error.message}`);
  }

  console.log('\n✅ テスト完了！');
  console.log('📍 ダッシュボードで確認: http://localhost:8080/public/audit-dashboard.html');
  
  // プロセスを終了
  process.exit(0);
});