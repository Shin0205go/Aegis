// ============================================================================
// AEGIS - ポリシーローダー（設定ファイル対応）
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import type { IPolicyLoader } from '../types/component-interfaces.js';
import type { LoadedPolicy } from '../types/enforcement-types.js';

const logger = new Logger('policy-loader');

export interface PolicyMetadata {
  createdAt: string;
  createdBy: string;
  lastModified?: string;
  lastModifiedBy?: string;
  tags: string[];
  priority: number;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'draft';
  description?: string;
  policy: Record<string, any>;
  metadata: PolicyMetadata;
}

export interface PoliciesConfig {
  policies: PolicyDefinition[];
}

export class PolicyLoader implements IPolicyLoader {
  private policiesPath: string;
  private loadedPolicies: Map<string, PolicyDefinition> = new Map();

  constructor(policiesPath?: string) {
    // Ensure we use absolute path resolution
    if (policiesPath) {
      this.policiesPath = path.isAbsolute(policiesPath) ? policiesPath : path.resolve(process.cwd(), policiesPath);
    } else {
      // Default to policies/policies.json relative to project root
      this.policiesPath = path.resolve(process.cwd(), 'policies', 'policies.json');
    }
  }

  async loadPolicies(): Promise<void> {
    try {
      logger.info(`Loading policies from: ${this.policiesPath}`);
      
      // Check if file exists first
      try {
        await fs.access(this.policiesPath);
      } catch {
        logger.warn(`Policy file not found at ${this.policiesPath}, creating default policies`);
        await this.createDefaultPolicies();
        return;
      }
      
      const data = await fs.readFile(this.policiesPath, 'utf-8');
      const config: PoliciesConfig = JSON.parse(data);
      
      this.loadedPolicies.clear();
      
      for (const policy of config.policies) {
        this.loadedPolicies.set(policy.id, policy);
        logger.info(`Loaded policy: ${policy.id} (${policy.status}, priority: ${policy.metadata?.priority || 'N/A'})`);
      }
      
      logger.info(`Successfully loaded ${config.policies.length} policies`);
    } catch (error) {
      logger.error('Failed to load policies:', error);
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in policy file: ${error.message}`);
      }
      throw new Error(`Policy loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getPolicy(policyId: string): PolicyDefinition | undefined {
    return this.loadedPolicies.get(policyId);
  }

  getActivePolicies(): LoadedPolicy[] {
    return Array.from(this.loadedPolicies.values())
      .filter(policy => policy.status === 'active')
      .sort((a, b) => b.metadata.priority - a.metadata.priority)
      .map(policy => this.convertToLoadedPolicy(policy));
  }

  getAllPolicies(): PolicyDefinition[] {
    return Array.from(this.loadedPolicies.values());
  }

  async reloadPolicies(): Promise<void> {
    await this.loadPolicies();
  }

  async createPolicy(policy: Omit<PolicyDefinition, 'metadata'> & { metadata?: Partial<PolicyMetadata> }): Promise<string> {
    const now = new Date().toISOString();
    const fullPolicy: PolicyDefinition = {
      ...policy,
      metadata: {
        createdAt: now,
        createdBy: policy.metadata?.createdBy || 'api-user',
        tags: policy.metadata?.tags || [],
        priority: policy.metadata?.priority || 100,
        ...policy.metadata
      }
    };

    this.loadedPolicies.set(fullPolicy.id, fullPolicy);
    await this.savePolicies();
    
    logger.info(`Policy created: ${fullPolicy.id}`);
    return fullPolicy.id;
  }

  async updatePolicy(policyId: string, updates: Partial<PolicyDefinition>, updatedBy?: string): Promise<void> {
    const existing = this.loadedPolicies.get(policyId);
    if (!existing) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const updated: PolicyDefinition = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        lastModified: new Date().toISOString(),
        lastModifiedBy: updatedBy || 'api-user'
      }
    };

    this.loadedPolicies.set(policyId, updated);
    await this.savePolicies();
    
    logger.info(`Policy updated: ${policyId}`);
  }

  async deletePolicy(policyId: string): Promise<void> {
    if (!this.loadedPolicies.has(policyId)) {
      throw new Error(`Policy ${policyId} not found`);
    }

    this.loadedPolicies.delete(policyId);
    await this.savePolicies();
    
    logger.info(`Policy deleted: ${policyId}`);
  }

  private async savePolicies(): Promise<void> {
    try {
      const config: PoliciesConfig = {
        policies: Array.from(this.loadedPolicies.values())
      };

      const data = JSON.stringify(config, null, 2);
      await fs.writeFile(this.policiesPath, data, 'utf-8');
      
      logger.info(`Policies saved to: ${this.policiesPath}`);
    } catch (error) {
      logger.error('Failed to save policies:', error);
      throw new Error(`Policy saving failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  formatPolicyForAI(policy: LoadedPolicy | PolicyDefinition): string {
    // PolicyDefinitionの場合の処理
    if ('policy' in policy) {
      return this.formatPolicyDefinitionForAI(policy as PolicyDefinition);
    }
    
    // LoadedPolicyの場合はcontentを返す
    return policy.content;
  }

  private formatPolicyDefinitionForAI(policy: PolicyDefinition): string {
    let formatted = `【${policy.name}】\n`;
    formatted += `バージョン: ${policy.version}\n`;
    if (policy.description) {
      formatted += `説明: ${policy.description}\n`;
    }
    formatted += '\n';
    
    // ポリシー内容をフォーマット
    for (const [section, content] of Object.entries(policy.policy)) {
      formatted += `■ ${section}\n`;
      if (Array.isArray(content)) {
        content.forEach(item => formatted += `- ${item}\n`);
      } else if (typeof content === 'object') {
        for (const [subKey, subValue] of Object.entries(content)) {
          formatted += `  ${subKey}:\n`;
          if (Array.isArray(subValue)) {
            (subValue as string[]).forEach(item => formatted += `    - ${item}\n`);
          }
        }
      } else {
        formatted += `${content}\n`;
      }
      formatted += '\n';
    }
    
    return formatted;
  }

  async loadPolicy(name: string): Promise<LoadedPolicy | null> {
    const policy = Array.from(this.loadedPolicies.values())
      .find(p => p.name === name || p.id === name);
    
    if (!policy) {
      return null;
    }
    
    return this.convertToLoadedPolicy(policy);
  }

  private convertToLoadedPolicy(policy: PolicyDefinition): LoadedPolicy {
    return {
      name: policy.name,
      content: this.formatPolicyDefinitionForAI(policy),
      metadata: {
        priority: policy.metadata.priority,
        status: policy.status,
        tags: policy.metadata.tags,
        createdAt: policy.metadata.createdAt ? new Date(policy.metadata.createdAt) : undefined,
        updatedAt: policy.metadata.lastModified ? new Date(policy.metadata.lastModified) : undefined
      }
    };
  }

  private async createDefaultPolicies(): Promise<void> {
    const defaultPolicy: PolicyDefinition = {
      id: 'default-policy',
      name: 'Default Policy',
      version: '1.0.0',
      status: 'active',
      description: 'Default policy for AEGIS MCP Proxy',
      policy: {
        '基本原則': [
          'すべてのアクセスは監査ログに記録される',
          '明示的に許可されていないアクセスは拒否する'
        ],
        'アクセス許可': {
          'ツール実行': ['低リスクのツールのみ許可'],
          'リソース読み取り': ['公開情報のみ許可']
        }
      },
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'system',
        tags: ['default', 'security'],
        priority: 100
      }
    };

    this.loadedPolicies.set(defaultPolicy.id, defaultPolicy);
    
    // Create policies directory if it doesn't exist
    const policiesDir = path.dirname(this.policiesPath);
    try {
      await fs.mkdir(policiesDir, { recursive: true });
    } catch (error) {
      logger.warn('Failed to create policies directory:', error);
    }
    
    // Save the default policy
    await this.savePolicies();
    logger.info('Created default policies');
  }
}

// シングルトンインスタンス
export const policyLoader = new PolicyLoader();