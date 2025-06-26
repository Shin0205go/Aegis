import { DataAnonymizerProcessor } from '../../../src/core/constraints/processors/data-anonymizer';
import { DecisionContext } from '../../../src/types';

describe('DataAnonymizerProcessor', () => {
  let processor: DataAnonymizerProcessor;
  let context: DecisionContext;
  
  beforeEach(() => {
    processor = new DataAnonymizerProcessor();
    context = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      purpose: 'testing',
      time: new Date(),
      environment: {}
    };
  });
  
  afterEach(async () => {
    await processor.cleanup();
  });
  
  describe('初期化', () => {
    it('プロセッサが正しく初期化される', async () => {
      await processor.initialize({
        hashAlgorithm: 'sha512',
        preserveFormat: false,
        sensitiveFields: ['email', 'phone']
      });
      
      expect(processor.name).toBe('DataAnonymizer');
      expect(processor.supportedTypes).toContain('anonymize');
    });
  });
  
  describe('canProcess', () => {
    it('サポートされる制約を認識する', () => {
      expect(processor.canProcess('個人情報を匿名化')).toBe(true);
      expect(processor.canProcess('anonymize personal data')).toBe(true);
      expect(processor.canProcess('データをマスク')).toBe(true);
      expect(processor.canProcess('redact sensitive info')).toBe(true);
    });
    
    it('サポートされない制約を認識しない', () => {
      expect(processor.canProcess('レート制限')).toBe(false);
      expect(processor.canProcess('地理的制限')).toBe(false);
    });
  });
  
  describe('匿名化処理', () => {
    it('個人情報を匿名化はemailのみマスク形式を使用する', async () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };
      
      const result = await processor.apply('個人情報を匿名化', data, context);
      
      expect(result.name).toBe('[REDACTED]'); // nameはREDACTED
      expect(result.email).toBe('****@example.com'); // emailは固定4文字のマスク
      expect(result.age).toBe(30); // 非センシティブフィールドはそのまま
    });
    
    it('マスクメソッドでフォーマットを保持する', async () => {
      const data = {
        email: 'john.doe@example.com',
        phone: '+1-234-567-8900',
        creditCard: '1234-5678-9012-3456'
      };
      
      const result = await processor.apply('マスク処理', data, context);
      
      expect(result.email).toBe('****@example.com');
      expect(result.phone).toMatch(/8900$/);
      expect(result.creditCard).toMatch(/3456$/);
    });
    
    it('トークン化で一意なトークンを生成する', async () => {
      const data = {
        ssn: '123-45-6789',
        taxId: 'TAX123456'
      };
      
      const result1 = await processor.apply('トークン化', data, context);
      const result2 = await processor.apply('トークン化', data, context);
      
      expect(result1.ssn).toMatch(/^TKN_[A-F0-9]{32}$/);
      expect(result1.taxId).toMatch(/^TKN_[A-F0-9]{32}$/);
      
      // 同じ値には同じトークンが生成される
      expect(result1.ssn).toBe(result2.ssn);
      expect(result1.taxId).toBe(result2.taxId);
    });
    
    it('ネストされたデータを処理する', async () => {
      const data = {
        user: {
          name: 'Jane Doe',
          contact: {
            email: 'jane@example.com',
            phone: '555-1234'
          }
        },
        publicInfo: 'This is public'
      };
      
      const result = await processor.apply('個人情報を匿名化', data, context);
      
      expect(result.user.name).toBe('[REDACTED]'); // nameはREDACTED
      expect(result.user.contact.email).toBe('****@example.com'); // emailは固定4文字のマスク
      expect(result.user.contact.phone).toBe('[REDACTED]'); // phoneはREDACTED
      expect(result.publicInfo).toBe('This is public');
    });
    
    it('配列データを処理する', async () => {
      const data = [
        { name: 'User 1', email: 'user1@example.com' },
        { name: 'User 2', email: 'user2@example.com' }
      ];
      
      const result = await processor.apply('匿名化', data, context);
      
      expect(result[0].name).toBe('[REDACTED]');
      expect(result[0].email).toBe('[REDACTED]');
      expect(result[1].name).toBe('[REDACTED]');
      expect(result[1].email).toBe('[REDACTED]');
    });
    
    it('特定フィールドのみを匿名化する', async () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        publicId: 'PUB123',
        internalId: 'INT456'
      };
      
      const result = await processor.apply('フィールド：name,emailを匿名化', data, context);
      
      expect(result.name).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.publicId).toBe('PUB123');
      expect(result.internalId).toBe('INT456');
    });
  });
});