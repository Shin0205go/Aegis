const { DataAnonymizerProcessor } = require('./dist/core/constraints/processors/data-anonymizer');

async function test() {
  const processor = new DataAnonymizerProcessor();
  await processor.initialize({});
  
  const data = {
    name: 'Jane Smith',
    email: 'jane@example.com',
    ssn: '123-45-6789'
  };
  
  const context = {
    agent: 'test-agent',
    action: 'read',
    resource: 'test-resource',
    time: new Date(),
    environment: {}
  };
  
  console.log('Original data:', data);
  
  // Apply first constraint
  const result1 = await processor.apply('個人情報を匿名化', data, context);
  console.log('After 個人情報を匿名化:', result1);
  
  // Apply second constraint on the result
  const result2 = await processor.apply('SSNをマスク', result1, context);
  console.log('After SSNをマスク:', result2);
  
  await processor.cleanup();
}

test().catch(console.error);
