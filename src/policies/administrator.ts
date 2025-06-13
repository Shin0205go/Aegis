// ============================================================================
// AEGIS - Policy Administrator (PAP - Policy Administration Point)
// ポリシーのライフサイクル管理を担当
// ============================================================================

import {
  NaturalLanguagePolicyDefinition,
  PolicyMetadata,
  PolicyVersion
} from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { 
  AEGISError, 
  ResourceNotFoundError, 
  ValidationError 
} from '../utils/errors.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * ポリシーエクスポート形式
 */
export interface PolicyExport {
  version: string;
  exportedAt: Date;
  exportedBy: string;
  policy: NaturalLanguagePolicyDefinition;
  history?: PolicyVersion[];
}

/**
 * ポリシー管理APIインターフェース
 */
export interface PolicyManagementAPI {
  // ポリシーCRUD
  createPolicy(
    name: string,
    policy: string,
    metadata?: Partial<PolicyMetadata>
  ): Promise<string>;
  
  updatePolicy(
    policyId: string,
    policy: string,
    updatedBy?: string
  ): Promise<void>;
  
  deletePolicy(policyId: string): Promise<void>;
  
  // ポリシー取得
  getPolicy(policyId: string): Promise<{
    metadata: PolicyMetadata;
    policy: string;
  } | null>;
  
  listPolicies(filter?: {
    status?: string;
    tags?: string[];
  }): Promise<PolicyMetadata[]>;
  
  // バージョン管理
  getPolicyHistory(policyId: string): Promise<PolicyVersion[]>;
  
  // インポート/エクスポート
  exportPolicy(policyId: string): Promise<PolicyExport>;
  importPolicy(
    exportData: PolicyExport,
    importedBy?: string
  ): Promise<string>;
}

/**
 * Policy Administrator実装
 */
export class PolicyAdministrator implements PolicyManagementAPI {
  private policies = new Map<string, NaturalLanguagePolicyDefinition>();
  private policyHistory = new Map<string, PolicyVersion[]>();
  private logger: Logger;
  private storageDir: string;

  constructor(storageDir?: string) {
    this.logger = new Logger();
    this.storageDir = storageDir || './policies-store';
    this.initializeStorage();
  }

  /**
   * ストレージディレクトリの初期化
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.mkdir(path.join(this.storageDir, 'history'), { recursive: true });
      await fs.mkdir(path.join(this.storageDir, 'exports'), { recursive: true });
      
      // 既存のポリシーを読み込み
      await this.loadPoliciesFromDisk();
    } catch (error) {
      this.logger.error('Failed to initialize storage', error);
    }
  }

  /**
   * ディスクからポリシーを読み込み
   */
  private async loadPoliciesFromDisk(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const policyFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('.'));

      for (const file of policyFiles) {
        try {
          const content = await fs.readFile(
            path.join(this.storageDir, file),
            'utf-8'
          );
          const policyDef = JSON.parse(content) as NaturalLanguagePolicyDefinition;
          
          // 日付文字列をDateオブジェクトに変換
          if (policyDef.metadata) {
            policyDef.metadata.createdAt = new Date(policyDef.metadata.createdAt);
            policyDef.metadata.lastModified = new Date(policyDef.metadata.lastModified);
          }
          
          this.policies.set(policyDef.metadata.id, policyDef);
          
          // 履歴も読み込み
          await this.loadPolicyHistory(policyDef.metadata.id);
        } catch (error) {
          this.logger.error(`Failed to load policy file: ${file}`, error);
        }
      }

      this.logger.info(`Loaded ${this.policies.size} policies from disk`);
    } catch (error) {
      this.logger.error('Failed to load policies from disk', error);
    }
  }

  /**
   * ポリシー履歴を読み込み
   */
  private async loadPolicyHistory(policyId: string): Promise<void> {
    try {
      const historyFile = path.join(this.storageDir, 'history', `${policyId}.json`);
      const content = await fs.readFile(historyFile, 'utf-8');
      const history = JSON.parse(content) as PolicyVersion[];
      
      // 日付文字列をDateオブジェクトに変換
      history.forEach(version => {
        version.createdAt = new Date(version.createdAt);
      });
      
      this.policyHistory.set(policyId, history);
    } catch (error) {
      // 履歴ファイルがない場合は空の配列を設定
      this.policyHistory.set(policyId, []);
    }
  }

  /**
   * ポリシーをディスクに保存
   */
  private async savePolicyToDisk(policy: NaturalLanguagePolicyDefinition): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, `${policy.metadata.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(policy, null, 2));
    } catch (error) {
      this.logger.error('Failed to save policy to disk', error);
      throw error;
    }
  }

  /**
   * ポリシー履歴をディスクに保存
   */
  private async saveHistoryToDisk(policyId: string, history: PolicyVersion[]): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, 'history', `${policyId}.json`);
      await fs.writeFile(filePath, JSON.stringify(history, null, 2));
    } catch (error) {
      this.logger.error('Failed to save policy history to disk', error);
      throw error;
    }
  }

  /**
   * ポリシーを作成
   */
  async createPolicy(
    name: string,
    policy: string,
    metadata?: Partial<PolicyMetadata>
  ): Promise<string> {
    // 検証
    if (!name || !policy) {
      throw new ValidationError('Policy name and content are required');
    }

    // 重複チェック
    const existingPolicy = Array.from(this.policies.values())
      .find(p => p.name === name);
    if (existingPolicy) {
      throw new ValidationError(`Policy with name '${name}' already exists`);
    }

    const policyId = `policy-${uuidv4()}`;
    const now = new Date();

    const policyDefinition: NaturalLanguagePolicyDefinition = {
      name,
      description: metadata?.description || `Policy for ${name}`,
      policy,
      examples: [],
      metadata: {
        id: policyId,
        name,
        description: metadata?.description || `Policy for ${name}`,
        version: '1.0.0',
        createdAt: now,
        createdBy: metadata?.createdBy || 'system',
        lastModified: now,
        lastModifiedBy: metadata?.createdBy || 'system',
        tags: metadata?.tags || [],
        status: metadata?.status || 'active'
      }
    };

    // メモリに保存
    this.policies.set(policyId, policyDefinition);

    // 初期バージョンを履歴に記録
    const initialVersion: PolicyVersion = {
      version: '1.0.0',
      policy,
      createdAt: now,
      createdBy: policyDefinition.metadata.createdBy,
      changeLog: 'Initial version'
    };
    this.policyHistory.set(policyId, [initialVersion]);

    // ディスクに保存
    await this.savePolicyToDisk(policyDefinition);
    await this.saveHistoryToDisk(policyId, [initialVersion]);

    this.logger.info(`Policy created: ${name} (${policyId})`);
    return policyId;
  }

  /**
   * ポリシーを更新
   */
  async updatePolicy(
    policyId: string,
    policy: string,
    updatedBy: string = 'system'
  ): Promise<void> {
    const existingPolicy = this.policies.get(policyId);
    if (!existingPolicy) {
      throw new ResourceNotFoundError('Policy', policyId);
    }

    const now = new Date();
    const currentVersion = existingPolicy.metadata.version;
    const newVersion = this.incrementVersion(currentVersion);

    // 更新
    existingPolicy.policy = policy;
    existingPolicy.metadata.version = newVersion;
    existingPolicy.metadata.lastModified = now;
    existingPolicy.metadata.lastModifiedBy = updatedBy;

    // 履歴に追加
    const history = this.policyHistory.get(policyId) || [];
    const newVersionEntry: PolicyVersion = {
      version: newVersion,
      policy,
      createdAt: now,
      createdBy: updatedBy,
      changeLog: `Updated by ${updatedBy}`
    };
    history.push(newVersionEntry);

    // 履歴は最大50バージョンまで保持
    if (history.length > 50) {
      history.shift();
    }

    this.policyHistory.set(policyId, history);

    // ディスクに保存
    await this.savePolicyToDisk(existingPolicy);
    await this.saveHistoryToDisk(policyId, history);

    this.logger.info(`Policy updated: ${existingPolicy.name} (${policyId}) -> v${newVersion}`);
  }

  /**
   * ポリシーを削除
   */
  async deletePolicy(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new ResourceNotFoundError('Policy', policyId);
    }

    // メモリから削除
    this.policies.delete(policyId);
    this.policyHistory.delete(policyId);

    // ディスクから削除
    try {
      await fs.unlink(path.join(this.storageDir, `${policyId}.json`));
      await fs.unlink(path.join(this.storageDir, 'history', `${policyId}.json`));
    } catch (error) {
      this.logger.error('Failed to delete policy files', error);
    }

    this.logger.info(`Policy deleted: ${policy.name} (${policyId})`);
  }

  /**
   * ポリシーを取得
   */
  async getPolicy(policyId: string): Promise<{
    metadata: PolicyMetadata;
    policy: string;
  } | null> {
    const policyDef = this.policies.get(policyId);
    if (!policyDef) {
      return null;
    }

    return {
      metadata: policyDef.metadata,
      policy: policyDef.policy
    };
  }

  /**
   * ポリシー一覧を取得
   */
  async listPolicies(filter?: {
    status?: string;
    tags?: string[];
  }): Promise<PolicyMetadata[]> {
    let policies = Array.from(this.policies.values())
      .map(p => p.metadata);

    // フィルタリング
    if (filter?.status) {
      policies = policies.filter(p => p.status === filter.status);
    }

    if (filter?.tags && filter.tags.length > 0) {
      policies = policies.filter(p =>
        filter.tags!.some(tag => p.tags.includes(tag))
      );
    }

    // 最終更新日でソート（新しい順）
    policies.sort((a, b) => 
      b.lastModified.getTime() - a.lastModified.getTime()
    );

    return policies;
  }

  /**
   * ポリシー履歴を取得
   */
  async getPolicyHistory(policyId: string): Promise<PolicyVersion[]> {
    const history = this.policyHistory.get(policyId);
    if (!history) {
      throw new ResourceNotFoundError('Policy history', policyId);
    }

    // 新しい順に返す
    return [...history].reverse();
  }

  /**
   * ポリシーをエクスポート
   */
  async exportPolicy(policyId: string): Promise<PolicyExport> {
    const policyDef = this.policies.get(policyId);
    if (!policyDef) {
      throw new ResourceNotFoundError('Policy', policyId);
    }

    const history = this.policyHistory.get(policyId) || [];

    const exportData: PolicyExport = {
      version: '1.0',
      exportedAt: new Date(),
      exportedBy: 'system',
      policy: policyDef,
      history
    };

    // エクスポートファイルを保存
    const exportFile = path.join(
      this.storageDir,
      'exports',
      `${policyId}-export-${Date.now()}.json`
    );
    
    try {
      await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
      this.logger.info(`Policy exported: ${policyDef.name} -> ${exportFile}`);
    } catch (error) {
      this.logger.error('Failed to save export file', error);
    }

    return exportData;
  }

  /**
   * ポリシーをインポート
   */
  async importPolicy(
    exportData: PolicyExport,
    importedBy: string = 'system'
  ): Promise<string> {
    // 検証
    if (!exportData.policy || !exportData.policy.metadata) {
      throw new ValidationError('Invalid export data format');
    }

    // 新しいIDを生成（既存のポリシーと競合を避けるため）
    const newPolicyId = `policy-${uuidv4()}`;
    const now = new Date();

    // メタデータを更新
    const importedPolicy: NaturalLanguagePolicyDefinition = {
      ...exportData.policy,
      metadata: {
        ...exportData.policy.metadata,
        id: newPolicyId,
        createdAt: now,
        createdBy: importedBy,
        lastModified: now,
        lastModifiedBy: importedBy,
        version: '1.0.0' // インポート時はバージョンをリセット
      }
    };

    // 既存の同名ポリシーをチェック
    const existingPolicy = Array.from(this.policies.values())
      .find(p => p.name === importedPolicy.name);
    
    if (existingPolicy) {
      // 名前に番号を追加
      const count = Array.from(this.policies.values())
        .filter(p => p.name.startsWith(importedPolicy.name))
        .length;
      importedPolicy.name = `${importedPolicy.name} (${count + 1})`;
      importedPolicy.metadata.name = importedPolicy.name;
    }

    // 保存
    this.policies.set(newPolicyId, importedPolicy);

    // 履歴もインポート（オプション）
    if (exportData.history && exportData.history.length > 0) {
      // インポート履歴として新しいエントリを作成
      const importHistory: PolicyVersion = {
        version: '1.0.0',
        policy: importedPolicy.policy,
        createdAt: now,
        createdBy: importedBy,
        changeLog: `Imported from ${exportData.policy.name}`
      };
      this.policyHistory.set(newPolicyId, [importHistory]);
    }

    // ディスクに保存
    await this.savePolicyToDisk(importedPolicy);
    if (this.policyHistory.has(newPolicyId)) {
      await this.saveHistoryToDisk(
        newPolicyId,
        this.policyHistory.get(newPolicyId)!
      );
    }

    this.logger.info(`Policy imported: ${importedPolicy.name} (${newPolicyId})`);
    return newPolicyId;
  }

  /**
   * バージョン番号をインクリメント
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  /**
   * ポリシーのステータスを変更
   */
  async updatePolicyStatus(
    policyId: string,
    status: 'draft' | 'active' | 'deprecated',
    updatedBy: string = 'system'
  ): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new ResourceNotFoundError('Policy', policyId);
    }

    const now = new Date();
    policy.metadata.status = status;
    policy.metadata.lastModified = now;
    policy.metadata.lastModifiedBy = updatedBy;

    await this.savePolicyToDisk(policy);

    this.logger.info(`Policy status updated: ${policy.name} -> ${status}`);
  }

  /**
   * ポリシーの検証
   */
  async validatePolicy(policy: string): Promise<{
    valid: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];

    // 基本的な構造チェック
    if (!policy || policy.trim().length === 0) {
      errors.push('ポリシーが空です');
    }

    if (policy.length < 50) {
      errors.push('ポリシーが短すぎます（最低50文字必要）');
    }

    if (policy.length > 10000) {
      errors.push('ポリシーが長すぎます（最大10000文字）');
    }

    // 必須セクションのチェック
    const requiredSections = ['基本原則', '制限事項'];
    for (const section of requiredSections) {
      if (!policy.includes(section)) {
        errors.push(`必須セクション「${section}」が見つかりません`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}