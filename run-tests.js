// SecurityInfoEnricherのテスト（OpenAI依存なし）
const { SecurityInfoEnricher } = require('./dist/src/context/enrichers/security-info.js');

console.log('Loaded SecurityInfoEnricher:', SecurityInfoEnricher);

async function runTests() {
  console.log('🧪 AEGIS テスト実行開始...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: SecurityInfoEnricher - 日本のIPアドレス
  console.log('📍 Test 1: SecurityInfoEnricher - 日本のIPアドレス');
  try {
    const enricher = new SecurityInfoEnricher();
    const context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date(),
      environment: {
        clientIP: '125.56.86.166'
      }
    };
    
    const enriched = await enricher.enrich(context);
    
    if (enriched && 
        enriched.clientIP === '125.56.86.166' &&
        enriched.geoLocation.country === 'JP' &&
        enriched.geoLocation.city === 'Tokyo' &&
        enriched.geoLocation.timezone === 'Asia/Tokyo' &&
        enriched.geoLocation.isHighRisk === false &&
        enriched.threatLevel === 'low') {
      console.log('✅ PASSED: 日本のIPが正しく認識されました');
      passed++;
    } else {
      console.log('❌ FAILED: 日本のIP認識エラー');
      console.log('Result:', JSON.stringify(enriched, null, 2));
      failed++;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    failed++;
  }
  
  // Test 2: SecurityInfoEnricher - デフォルトIP
  console.log('\n📍 Test 2: SecurityInfoEnricher - デフォルトIP');
  try {
    const enricher = new SecurityInfoEnricher();
    const context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date(),
      environment: {}  // IPなし
    };
    
    const enriched = await enricher.enrich(context);
    
    if (enriched && enriched.clientIP === '125.56.86.166') {
      console.log('✅ PASSED: デフォルトIPが正しく設定されました');
      passed++;
    } else {
      console.log('❌ FAILED: デフォルトIP設定エラー');
      console.log('Result:', enriched?.clientIP);
      failed++;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    failed++;
  }
  
  // Test 3: SecurityInfoEnricher - セキュリティスコア
  console.log('\n📍 Test 3: SecurityInfoEnricher - セキュリティスコア');
  try {
    const enricher = new SecurityInfoEnricher();
    const context = {
      agent: 'trusted-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date(),
      environment: {}
    };
    
    const enriched = await enricher.enrich(context);
    
    if (enriched && 
        typeof enriched.securityScore === 'number' &&
        enriched.securityScore >= 0 &&
        enriched.securityScore <= 1) {
      console.log('✅ PASSED: セキュリティスコアが正しい範囲内です');
      console.log(`   Score: ${enriched.securityScore}`);
      passed++;
    } else {
      console.log('❌ FAILED: セキュリティスコアエラー');
      console.log('Result:', enriched?.securityScore);
      failed++;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    failed++;
  }
  
  // Test 4: SecurityInfoEnricher - 脅威検出
  console.log('\n📍 Test 4: SecurityInfoEnricher - 脅威IP検出');
  try {
    const enricher = new SecurityInfoEnricher();
    const context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date(),
      environment: {
        clientIP: '192.0.2.100'  // 脅威リストに含まれるIP
      }
    };
    
    const enriched = await enricher.enrich(context);
    
    if (enriched && enriched.threatLevel === 'critical' && enriched.isThreatIP === true) {
      console.log('✅ PASSED: 脅威IPが正しく検出されました');
      console.log(`   Threat Level: ${enriched.threatLevel}`);
      console.log(`   Threat Reasons: ${enriched.threatReasons.join(', ')}`);
      passed++;
    } else {
      console.log('❌ FAILED: 脅威IP検出エラー');
      console.log('Result:', { 
        threatLevel: enriched?.threatLevel, 
        isThreatIP: enriched?.isThreatIP,
        reasons: enriched?.threatReasons 
      });
      failed++;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    failed++;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 テスト完了！`);
  console.log(`✅ 成功: ${passed}`);
  console.log(`❌ 失敗: ${failed}`);
  console.log('='.repeat(50));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('テスト実行エラー:', error);
  process.exit(1);
});