// ============================================================================
// ポリシー形式自動検出のテスト
// ============================================================================

import { PolicyFormatDetector } from '../../src/policy/policy-detector';

describe('PolicyFormatDetector', () => {
  describe('ODRL形式の検出', () => {
    test('標準的なODRLポリシーオブジェクトを正しく検出', () => {
      const odrlPolicy = {
        "@context": "http://www.w3.org/ns/odrl/2/",
        "@type": "Policy",
        "uid": "test-policy",
        "permission": [{
          "action": "read",
          "target": "data:test"
        }]
      };

      const result = PolicyFormatDetector.detect(odrlPolicy);
      
      expect(result.format).toBe('ODRL');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.indicators).toContain('@context field present');
      expect(result.indicators).toContain('@type is Policy');
      expect(result.indicators).toContain('ODRL namespace detected');
    });

    test('JSON文字列形式のODRLポリシーを検出', () => {
      const odrlString = JSON.stringify({
        "@context": "http://www.w3.org/ns/odrl/2/",
        "@type": "Policy",
        "prohibition": [{
          "action": "write",
          "target": "sensitive-data"
        }]
      });

      const result = PolicyFormatDetector.detect(odrlString);
      
      expect(result.format).toBe('ODRL');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    test('ODRL制約構文を含むポリシーを検出', () => {
      const odrlWithConstraints = {
        "@type": "Policy",
        "permission": [{
          "action": "read",
          "constraint": [{
            "leftOperand": "dateTime",
            "operator": "gteq",
            "rightOperand": "09:00:00"
          }]
        }]
      };

      const result = PolicyFormatDetector.detect(odrlWithConstraints);
      
      expect(result.format).toBe('ODRL');
      expect(result.indicators).toContain('constraint field present');
    });
  });

  describe('自然言語形式の検出', () => {
    test('日本語の自然言語ポリシーを検出', () => {
      const nlPolicy = `
        アクセス制御ポリシー：
        - 管理者は全てのリソースにアクセス可能
        - 一般ユーザーは読み取りのみ許可
        - 営業時間外のアクセスは禁止
      `;

      const result = PolicyFormatDetector.detect(nlPolicy);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.indicators).toContain('Japanese text detected');
      expect(result.indicators).toContain('Policy keywords in Japanese');
      expect(result.indicators).toContain('Bullet points');
    });

    test('英語の自然言語ポリシーを検出', () => {
      const nlPolicy = `
        Security Policy:
        - Administrators must have full access
        - Users should only read data
        - Access denied after business hours
        - If emergency, then allow override
      `;

      const result = PolicyFormatDetector.detect(nlPolicy);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.indicators).toContain('Policy keywords in English');
      expect(result.indicators).toContain('Permission keywords in English');
      expect(result.indicators).toContain('Conditional expressions in English');
    });

    test('条件文を含む複雑な自然言語ポリシーを検出', () => {
      const complexPolicy = `
        高度なセキュリティポリシー：
        
        1. 機密データへのアクセス
           - セキュリティチームのみ許可
           - 監査ログの記録が必須
        
        2. 時間ベースの制限
           - 営業時間内のみアクセス可能
           - 緊急時の場合は例外を許可
        
        3. 外部アクセスの場合
           - 二要素認証が必要
           - VPN接続が必須
      `;

      const result = PolicyFormatDetector.detect(complexPolicy);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('形式不明のケース', () => {
    test('空文字列は形式不明', () => {
      const result = PolicyFormatDetector.detect('');
      
      expect(result.format).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });

    test('無関係なテキストは形式不明', () => {
      const randomText = 'This is just some random text without any policy indicators.';
      
      const result = PolicyFormatDetector.detect(randomText);
      
      expect(result.format).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('不正な型は形式不明', () => {
      const result = PolicyFormatDetector.detect(123 as any);
      
      expect(result.format).toBe('UNKNOWN');
      expect(result.indicators).toContain('Invalid policy format');
    });
  });

  describe('複数ポリシーからの形式推定', () => {
    test('ODRLポリシーが多数の場合', () => {
      const policies = [
        { "@type": "Policy", "permission": [] },
        { "@context": "http://www.w3.org/ns/odrl/2/", "@type": "Policy" },
        "Some natural language policy",
        { "@type": "Policy", "prohibition": [] }
      ];

      const bestFormat = PolicyFormatDetector.detectBestFormat(policies);
      
      expect(bestFormat).toBe('ODRL');
    });

    test('自然言語ポリシーが多数の場合', () => {
      const policies = [
        "管理者のみアクセス可能",
        "Policy: Users must authenticate first",
        { "@type": "SomeObject" }, // 不完全なODRL
        "営業時間内のみ許可する"
      ];

      const bestFormat = PolicyFormatDetector.detectBestFormat(policies);
      
      expect(bestFormat).toBe('NATURAL_LANGUAGE');
    });
  });

  describe('境界ケース', () => {
    test('ODRLキーワードを含む自然言語テキスト', () => {
      const mixedText = `
        このドキュメントでは@contextや@typeといった
        ODRLの概念について説明します。
        permissionとprohibitionの使い方を学びましょう。
      `;

      const result = PolicyFormatDetector.detect(mixedText);
      
      // 日本語が含まれているため自然言語として判定されるべき
      expect(result.format).toBe('NATURAL_LANGUAGE');
    });

    test('最小限のODRLポリシー', () => {
      const minimalODRL = {
        "@type": "Policy"
      };

      const result = PolicyFormatDetector.detect(minimalODRL);
      
      // 最小限でも@typeがあればODRLの可能性
      expect(result.format).toBe('ODRL');
      expect(result.confidence).toBeLessThan(0.5); // 信頼度は低い
    });
  });
});