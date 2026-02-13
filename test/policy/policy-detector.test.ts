// ============================================================================
// ポリシー形式自動検出のテスト
// ============================================================================

import { PolicyFormatDetector } from '../../src/policy/policy-detector';

describe('PolicyFormatDetector', () => {
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
      // 新しい細分化されたインジケーター名を確認
      expect(result.indicators).toContain('Policy keyword');
      expect(result.indicators).toContain('Access keyword');
      expect(result.indicators).toContain('Allow/Deny keywords');
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

    test('顧客データアクセスポリシーを検出', () => {
      const customerPolicy = `
        顧客データアクセスポリシー：

        【基本原則】
        - 顧客データは顧客サポート目的でのみアクセス可能
        - アクセスは営業時間内を基本とする
        - 適切なクリアランスレベルが必要

        【制限事項】
        - 外部エージェントのアクセス禁止
        - データの外部共有は一切禁止
        - 個人情報の長期保存禁止

        【義務】
        - 全アクセスのログ記録必須
        - データ処理後の結果通知
        - 30日後の自動削除スケジュール設定
      `;

      const result = PolicyFormatDetector.detect(customerPolicy);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.indicators).toContain('Japanese text detected');
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

    test('nullは形式不明', () => {
      const result = PolicyFormatDetector.detect(null as any);
      
      expect(result.format).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
      expect(result.indicators).toContain('Invalid policy format');
    });
  });

  describe('複数ポリシーからの形式推定', () => {
    test('自然言語ポリシーが多数の場合', () => {
      const policies = [
        "管理者のみアクセス可能",
        "Policy: Users must authenticate first",
        "営業時間内のみ許可する",
        "セキュリティポリシー: 重要ファイルは暗号化必須"
      ];

      const bestFormat = PolicyFormatDetector.detectBestFormat(policies);
      
      expect(bestFormat).toBe('NATURAL_LANGUAGE');
    });

    test('混在する場合は自然言語を優先', () => {
      const policies = [
        "管理者のみアクセス可能",
        { "type": "unknown-object" },
        "Policy: Users must authenticate first",
        "営業時間内のみ許可する"
      ];

      const bestFormat = PolicyFormatDetector.detectBestFormat(policies);
      
      expect(bestFormat).toBe('NATURAL_LANGUAGE');
    });

    test('すべて不明な場合', () => {
      const policies = [
        "random text",
        { "data": "not a policy" },
        123,
        ""
      ];

      const bestFormat = PolicyFormatDetector.detectBestFormat(policies);
      
      expect(bestFormat).toBe('UNKNOWN');
    });
  });

  describe('オブジェクト形式の処理', () => {
    test('JSON文字列化してから分析', () => {
      const policyObject = {
        title: "アクセス制御ポリシー",
        rules: ["管理者のみアクセス可能", "営業時間内のみ許可"]
      };

      const result = PolicyFormatDetector.detect(policyObject);
      
      // オブジェクトは文字列化されて自然言語検出される
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('空のオブジェクト', () => {
      const result = PolicyFormatDetector.detect({});
      
      expect(result.format).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('境界ケース', () => {
    test('ポリシーキーワードのみを含むテキスト', () => {
      const keywordOnlyText = "policy rule access permission";
      
      const result = PolicyFormatDetector.detect(keywordOnlyText);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('大量のテキストを含むポリシー', () => {
      const longPolicy = `
        非常に詳細なセキュリティポリシードキュメント
        
        このポリシーは企業全体のセキュリティ要件を定義し、
        すべての従業員、契約者、外部パートナーに適用されます。
        
        1. アクセス制御の基本原則
           - 最小権限の原則を適用
           - 職務分離の実施
           - 定期的なアクセス権レビュー
        
        2. データ分類とハンドリング
           - 機密レベルに応じた適切な取り扱い
           - 暗号化要件の遵守
           - データ保持期間の管理
        
        3. インシデント対応
           - 迅速な検知と対応
           - 関係者への報告
           - 改善策の実装
      `;

      const result = PolicyFormatDetector.detect(longPolicy);
      
      expect(result.format).toBe('NATURAL_LANGUAGE');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });
});