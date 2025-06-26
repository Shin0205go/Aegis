import { GeoRestrictorProcessor, GeoRestrictionError } from '../../../core/constraints/processors/geo-restrictor';
import { DecisionContext } from '../../../types';

describe('GeoRestrictorProcessor', () => {
  let processor: GeoRestrictorProcessor;
  let context: DecisionContext;
  
  beforeEach(() => {
    processor = new GeoRestrictorProcessor();
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
        cacheExpireMs: 1800000,
        defaultAction: 'block',
        ipCountryMapping: {
          '192.168.': 'JP',
          '10.': 'JP'
        }
      });
      
      expect(processor.name).toBe('GeoRestrictor');
      expect(processor.supportedTypes).toContain('geo-restriction');
    });
  });
  
  describe('canProcess', () => {
    it('サポートされる制約を認識する', () => {
      expect(processor.canProcess('地理的制限')).toBe(true);
      expect(processor.canProcess('geo restriction')).toBe(true);
      expect(processor.canProcess('国内のみ')).toBe(true);
      expect(processor.canProcess('国外からブロック')).toBe(true);
      expect(processor.canProcess('country: JP only')).toBe(true);
    });
    
    it('サポートされない制約を認識しない', () => {
      expect(processor.canProcess('レート制限')).toBe(false);
      expect(processor.canProcess('匿名化')).toBe(false);
    });
  });
  
  describe('IP情報なしの処理', () => {
    it('IP情報がない場合はデフォルトアクションを適用する', async () => {
      const data = { value: 'test' };
      
      // デフォルトがallowの場合
      await processor.initialize({ 
        cacheExpireMs: 3600000, 
        defaultAction: 'allow',
        ipCountryMapping: {}
      });
      
      const result = await processor.apply('国内のみ', data, context);
      expect(result).toEqual(data);
    });
    
    it('デフォルトがblockの場合はエラーになる', async () => {
      const data = { value: 'test' };
      
      await processor.initialize({ 
        cacheExpireMs: 3600000, 
        defaultAction: 'block',
        ipCountryMapping: {}
      });
      
      await expect(processor.apply('国内のみ', data, context))
        .rejects.toThrow(GeoRestrictionError);
    });
  });
  
  describe('国別制限', () => {
    it('「国内のみ」制約で日本からのアクセスを許可する', async () => {
      const data = { value: 'test' };
      const jpContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' } // JP
      };
      
      const result = await processor.apply('国内のみ', data, jpContext);
      
      expect(result.value).toBe('test');
      expect(result._geoMetadata).toBeDefined();
      expect(result._geoMetadata.country).toBe('JP');
    });
    
    it('「国内のみ」制約で海外からのアクセスをブロックする', async () => {
      const data = { value: 'test' };
      const usContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' } // US
      };
      
      await expect(processor.apply('国内のみ', data, usContext))
        .rejects.toThrow(GeoRestrictionError);
    });
    
    it('「国外からブロック」制約で日本以外をブロックする', async () => {
      const data = { value: 'test' };
      const jpContext = {
        ...context,
        environment: { clientIP: '202.1.2.3' } // JP
      };
      const usContext = {
        ...context,
        environment: { clientIP: '1.1.1.1' } // US
      };
      
      // 日本からはOK
      const result = await processor.apply('国外からブロック', data, jpContext);
      expect(result.value).toBe('test');
      
      // USからはブロック
      await expect(processor.apply('国外からブロック', data, usContext))
        .rejects.toThrow(GeoRestrictionError);
    });
  });
  
  describe('特定国指定', () => {
    it('許可する国を指定できる', async () => {
      const data = { value: 'test' };
      const jpContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' } // JP
      };
      const usContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' } // US
      };
      
      // JP, USを許可
      const jpResult = await processor.apply('許可: JP, US', data, jpContext);
      expect(jpResult.value).toBe('test');
      
      const usResult = await processor.apply('許可: JP, US', data, usContext);
      expect(usResult.value).toBe('test');
    });
    
    it('ブロックする国を指定できる', async () => {
      const data = { value: 'test' };
      const jpContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' } // JP
      };
      const usContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' } // US
      };
      
      // USをブロック
      const jpResult = await processor.apply('ブロック: US', data, jpContext);
      expect(jpResult.value).toBe('test');
      
      await expect(processor.apply('ブロック: US', data, usContext))
        .rejects.toThrow(GeoRestrictionError);
    });
  });
  
  describe('地域制限', () => {
    it('地域単位での制限ができる', async () => {
      const data = { value: 'test' };
      const asiaContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' } // JP -> Asia
      };
      const naContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' } // US -> North America
      };
      
      // アジアのみ許可
      const asiaResult = await processor.apply('地域: Asia', data, asiaContext);
      expect(asiaResult.value).toBe('test');
      
      // 北米からはアクセスできない
      await expect(processor.apply('地域: Asia', data, naContext))
        .rejects.toThrow(GeoRestrictionError);
    });
  });
  
  describe('IPキャッシュ', () => {
    it('同じIPの位置情報をキャッシュする', async () => {
      const data = { value: 'test' };
      const jpContext = {
        ...context,
        environment: { clientIP: '133.1.2.3' }
      };
      
      // 1回目
      const result1 = await processor.apply('国内のみ', data, jpContext);
      expect(result1._geoMetadata.country).toBe('JP');
      
      // 2回目（キャッシュから）
      const result2 = await processor.apply('国内のみ', data, jpContext);
      expect(result2._geoMetadata.country).toBe('JP');
    });
  });
  
  describe('エラー情報', () => {
    it('GeoRestrictionErrorに適切なメタデータが含まれる', async () => {
      const data = { value: 'test' };
      const usContext = {
        ...context,
        environment: { clientIP: '8.8.8.8' }
      };
      
      try {
        await processor.apply('国内のみ', data, usContext);
        fail('Expected GeoRestrictionError');
      } catch (error) {
        expect(error).toBeInstanceOf(GeoRestrictionError);
        const geoError = error as GeoRestrictionError;
        
        expect(geoError.metadata.clientIP).toBe('8.8.8.8');
        expect(geoError.metadata.location).toBeDefined();
        expect(geoError.metadata.location.country).toBe('US');
        expect(geoError.metadata.restriction).toBeDefined();
      }
    });
  });
  
  describe('プライベートIPアドレス', () => {
    it('プライベートIPアドレスを正しく処理する', async () => {
      const data = { value: 'test' };
      
      // プライベートIPは日本として扱う（設定による）
      const privateContext = {
        ...context,
        environment: { clientIP: '192.168.1.100' }
      };
      
      const result = await processor.apply('国内のみ', data, privateContext);
      expect(result._geoMetadata.country).toBe('JP');
    });
  });
});