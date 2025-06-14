import { ConstraintProcessor } from '../types';
import { DecisionContext } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as crypto from 'crypto';

/**
 * データ匿名化制約プロセッサ
 * 個人情報やセンシティブなデータを匿名化
 */
export class DataAnonymizerProcessor implements ConstraintProcessor {
  public readonly name = 'DataAnonymizer';
  public readonly supportedTypes = [
    'anonymize',
    'mask',
    'redact',
    'tokenize'
  ];

  private logger: Logger;
  private config: DataAnonymizerConfig;
  private tokenStore = new Map<string, string>();

  constructor() {
    this.logger = new Logger();
    this.config = {
      hashAlgorithm: 'sha256',
      preserveFormat: true,
      sensitiveFields: [
        'name', 'email', 'phone', 'address', 'ssn', 'creditCard',
        'passport', 'driverLicense', 'bankAccount', 'taxId'
      ]
    };
  }

  async initialize(config: DataAnonymizerConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.logger.info('DataAnonymizerプロセッサ初期化完了', this.config);
  }

  canProcess(constraint: string): boolean {
    const lowerConstraint = constraint.toLowerCase();
    return (
      lowerConstraint.includes('匿名化') ||
      lowerConstraint.includes('anonymize') ||
      lowerConstraint.includes('mask') ||
      lowerConstraint.includes('redact') ||
      lowerConstraint.includes('個人情報')
    );
  }

  async apply(
    constraint: string,
    data: any,
    context: DecisionContext
  ): Promise<any> {
    this.logger.info(`匿名化制約適用: ${constraint}`);

    const method = this.determineMethod(constraint);
    const fieldsToAnonymize = this.extractFields(constraint);

    return this.anonymizeData(data, method, fieldsToAnonymize);
  }

  private determineMethod(constraint: string): AnonymizationMethod {
    if (constraint.includes('トークン化') || constraint.includes('tokenize')) {
      return 'tokenize';
    }
    if (constraint.includes('ハッシュ化') || constraint.includes('hash')) {
      return 'hash';
    }
    if (constraint.includes('マスク') || constraint.includes('mask')) {
      return 'mask';
    }
    return 'redact';
  }

  private extractFields(constraint: string): string[] | null {
    // 特定フィールドが指定されている場合は抽出
    const fieldMatch = constraint.match(/フィールド[：:](.*?)($|\s|、)/);
    if (fieldMatch) {
      return fieldMatch[1].split(',').map(f => f.trim());
    }
    return null; // nullは全センシティブフィールドを対象とする
  }

  private anonymizeData(
    data: any,
    method: AnonymizationMethod,
    specificFields?: string[] | null
  ): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const result = Array.isArray(data) ? [...data] : { ...data };
    const fieldsToCheck = specificFields || this.config.sensitiveFields;

    if (Array.isArray(result)) {
      return result.map(item => this.anonymizeData(item, method, specificFields));
    }

    for (const key in result) {
      if (fieldsToCheck.includes(key) && result[key] != null) {
        result[key] = this.anonymizeValue(result[key], key, method);
      } else if (typeof result[key] === 'object') {
        result[key] = this.anonymizeData(result[key], method, specificFields);
      }
    }

    return result;
  }

  private anonymizeValue(value: any, fieldName: string, method: AnonymizationMethod): any {
    if (typeof value !== 'string') {
      return '[REDACTED]';
    }

    switch (method) {
      case 'tokenize':
        return this.tokenize(value);
      case 'hash':
        return this.hash(value);
      case 'mask':
        return this.mask(value, fieldName);
      case 'redact':
      default:
        return '[REDACTED]';
    }
  }

  private tokenize(value: string): string {
    // 既存のトークンがあればそれを返す
    for (const [original, token] of this.tokenStore.entries()) {
      if (original === value) {
        return token;
      }
    }

    // 新しいトークンを生成
    const token = `TKN_${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    this.tokenStore.set(value, token);
    return token;
  }

  private hash(value: string): string {
    const hash = crypto.createHash(this.config.hashAlgorithm);
    hash.update(value + (this.config.salt || ''));
    return `HASH_${hash.digest('hex').substring(0, 16).toUpperCase()}`;
  }

  private mask(value: string, fieldName: string): string {
    if (!this.config.preserveFormat) {
      return '*'.repeat(value.length);
    }

    switch (fieldName) {
      case 'email':
        return this.maskEmail(value);
      case 'phone':
        return this.maskPhone(value);
      case 'creditCard':
        return this.maskCreditCard(value);
      case 'ssn':
        return this.maskSSN(value);
      default:
        return this.maskGeneric(value);
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '****@****';
    
    const maskedLocal = local.length > 2 
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : '***';
    
    return `${maskedLocal}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return '*'.repeat(phone.length);
    
    const lastFour = digits.slice(-4);
    return phone.replace(/\d/g, '*').slice(0, -4) + lastFour;
  }

  private maskCreditCard(card: string): string {
    const digits = card.replace(/\D/g, '');
    if (digits.length < 12) return '*'.repeat(card.length);
    
    const lastFour = digits.slice(-4);
    return card.replace(/\d/g, '*').slice(0, -4) + lastFour;
  }

  private maskSSN(ssn: string): string {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length !== 9) return '*'.repeat(ssn.length);
    
    return `***-**-${digits.slice(-4)}`;
  }

  private maskGeneric(value: string): string {
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    
    const visibleChars = Math.min(2, Math.floor(value.length * 0.2));
    return (
      value.substring(0, visibleChars) +
      '*'.repeat(value.length - visibleChars * 2) +
      value.substring(value.length - visibleChars)
    );
  }

  async cleanup(): Promise<void> {
    this.tokenStore.clear();
    this.logger.info('DataAnonymizerプロセッサクリーンアップ完了');
  }
}

interface DataAnonymizerConfig {
  hashAlgorithm?: string;
  salt?: string;
  preserveFormat?: boolean;
  sensitiveFields?: string[];
}

type AnonymizationMethod = 'redact' | 'mask' | 'hash' | 'tokenize';