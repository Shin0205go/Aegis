// ============================================================================
// AEGIS - ポリシーローダー（設定ファイル対応）
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

const logger = new Logger('policy-loader');

export interface PolicyMetadata {
  createdAt: string;
  createdBy: string;
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

export class PolicyLoader {
  private policiesPath: string;
  private loadedPolicies: Map<string, PolicyDefinition> = new Map();

  constructor(policiesPath?: string) {
    this.policiesPath = policiesPath || path.join(process.cwd(), 'policies', 'policies.json');
  }

  async loadPolicies(): Promise<void> {
    try {
      logger.info(`Loading policies from: ${this.policiesPath}`);
      
      const data = await fs.readFile(this.policiesPath, 'utf-8');
      const config: PoliciesConfig = JSON.parse(data);
      
      this.loadedPolicies.clear();
      
      for (const policy of config.policies) {
        this.loadedPolicies.set(policy.id, policy);
        logger.info(`Loaded policy: ${policy.id} (${policy.status})`);
      }
      
      logger.info(`Successfully loaded ${config.policies.length} policies`);
    } catch (error) {
      logger.error('Failed to load policies:', error);
      throw new Error(`Policy loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getPolicy(policyId: string): PolicyDefinition | undefined {
    return this.loadedPolicies.get(policyId);
  }

  getActivePolicies(): PolicyDefinition[] {
    return Array.from(this.loadedPolicies.values())
      .filter(policy => policy.status === 'active')
      .sort((a, b) => b.metadata.priority - a.metadata.priority);
  }

  getAllPolicies(): PolicyDefinition[] {
    return Array.from(this.loadedPolicies.values());
  }

  async reloadPolicies(): Promise<void> {
    await this.loadPolicies();
  }

  formatPolicyForAI(policy: PolicyDefinition): string {
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
}

// シングルトンインスタンス
export const policyLoader = new PolicyLoader();