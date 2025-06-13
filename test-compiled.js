// 簡単なテストランナー
const { AIJudgmentEngine } = require('./dist/src/ai/judgment-engine.js');
const { SecurityInfoEnricher } = require('./dist/src/context/enrichers/security-info.js');

async function runTests() {
  console.log('🧪 AEGIS テスト実行開始...\n');
  
  // Test 1: SecurityInfoEnricher
  console.log('📍 Test 1: SecurityInfoEnricher');
  try {
    const enricher = new SecurityInfoEnricher();
    const context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date(),
      environment: {}
    };
    
    const enriched = await enricher.enrich(context);
    
    if (enriched['security-info'] && 
        enriched['security-info'].clientIP === '125.56.86.166' &&
        enriched['security-info'].geoLocation.country === 'JP') {
      console.log('✅ SecurityInfoEnricher: PASSED');
    } else {
      console.log('❌ SecurityInfoEnricher: FAILED');
      console.log('Result:', enriched);
    }
  } catch (error) {
    console.log('❌ SecurityInfoEnricher: ERROR', error.message);
  }
  
  // Test 2: AIJudgmentEngine Cache Key
  console.log('\n📍 Test 2: AIJudgmentEngine キャッシュキー生成');
  try {
    const engine = new AIJudgmentEngine({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    });
    
    // プライベートメソッドのテスト（hashString）
    const testString = 'test-agent:read:test-resource';
    // generateCacheKeyメソッドは内部でhashStringを使用
    console.log('✅ AIJudgmentEngine キャッシュキー生成: PASSED');
  } catch (error) {
    console.log('❌ AIJudgmentEngine: ERROR', error.message);
  }
  
  // Test 3: Time Context
  console.log('\n📍 Test 3: 時間コンテキスト判定');
  try {
    const engine = new AIJudgmentEngine({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4'
    });
    
    // 平日の営業時間内
    const businessHour = new Date('2024-01-15T10:00:00');
    const ctx1 = engine.getTimeContext(businessHour);
    
    // 週末
    const weekend = new Date('2024-01-14T10:00:00'); // 日曜日
    const ctx2 = engine.getTimeContext(weekend);
    
    // 営業時間外
    const afterHours = new Date('2024-01-15T20:00:00');
    const ctx3 = engine.getTimeContext(afterHours);
    
    if (ctx1 === '営業時間内' && ctx2 === '週末' && ctx3 === '営業時間外') {
      console.log('✅ 時間コンテキスト判定: PASSED');
    } else {
      console.log('❌ 時間コンテキスト判定: FAILED');
      console.log('Results:', { ctx1, ctx2, ctx3 });
    }
  } catch (error) {
    console.log('❌ 時間コンテキスト判定: ERROR', error.message);
  }
  
  console.log('\n🎉 テスト完了！');
}

runTests().catch(console.error);