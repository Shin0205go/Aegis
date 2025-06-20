/**
 * Sample ODRL Policies for AEGIS
 * These demonstrate common policy patterns
 */

import { AEGISPolicy } from './types';

/**
 * Business hours access policy
 * Allows file system read access only during business hours (9-18)
 * with emergency override
 */
export const businessHoursPolicy: AEGISPolicy = {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
  '@type': 'Policy',
  'uid': 'aegis:policy:business-hours-access',
  'profile': 'https://aegis.example.com/odrl/profile',
  'naturalLanguageSource': '営業時間内（9-18時）のみファイルシステムへの読み取りアクセスを許可。ただし、緊急フラグがある場合は時間制限を解除。',
  'metadata': {
    'label': 'Business Hours Access Policy',
    'description': 'Restricts file system access to business hours with emergency override',
    'created': '2024-01-01T00:00:00Z'
  },
  'permission': [{
    '@type': 'Permission',
    'action': {
      'value': 'filesystem:read'
    },
    'constraint': [{
      '@type': 'LogicalConstraint',
      'or': [
        {
          '@type': 'Constraint',
          'leftOperand': 'timeOfDay',
          'operator': 'gteq',
          'rightOperand': '09:00:00',
          'and': {
            'leftOperand': 'timeOfDay',
            'operator': 'lteq',
            'rightOperand': '18:00:00'
          }
        },
        {
          '@type': 'Constraint',
          'leftOperand': 'aegis:emergency',
          'operator': 'eq',
          'rightOperand': true
        }
      ]
    }]
  }]
};

/**
 * Agent trust level policy
 * Only trusted agents can access sensitive resources
 */
export const agentTrustPolicy: AEGISPolicy = {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
  '@type': 'Policy',
  'uid': 'aegis:policy:agent-trust',
  'profile': 'https://aegis.example.com/odrl/profile',
  'naturalLanguageSource': '信頼スコアが0.7以上のエージェントのみ機密リソースにアクセス可能',
  'permission': [{
    '@type': 'Permission',
    'action': {
      'value': 'resource:access'
    },
    'constraint': [{
      '@type': 'LogicalConstraint',
      'and': [
        {
          '@type': 'Constraint',
          'leftOperand': 'aegis:trustScore',
          'operator': 'gteq',
          'rightOperand': 0.7
        },
        {
          '@type': 'Constraint',
          'leftOperand': 'aegis:resourceClassification',
          'operator': 'in',
          'rightOperand': ['public', 'internal', 'confidential']
        }
      ]
    }]
  }],
  'prohibition': [{
    '@type': 'Prohibition',
    'action': {
      'value': 'resource:access'
    },
    'constraint': [{
      '@type': 'LogicalConstraint',
      'and': [
        {
          '@type': 'Constraint',
          'leftOperand': 'aegis:trustScore',
          'operator': 'lt',
          'rightOperand': 0.7
        },
        {
          '@type': 'Constraint',
          'leftOperand': 'aegis:resourceClassification',
          'operator': 'eq',
          'rightOperand': 'confidential'
        }
      ]
    }]
  }]
};

/**
 * MCP tool access policy
 * Controls which tools can be used by different agent types
 */
export const mcpToolPolicy: AEGISPolicy = {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
  '@type': 'Policy',
  'uid': 'aegis:policy:mcp-tools',
  'profile': 'https://aegis.example.com/odrl/profile',
  'naturalLanguageSource': 'Research agentsはfilesystem読み取りツールのみ使用可。Writing agentsは書き込みツールも使用可。',
  'permission': [
    {
      '@type': 'Permission',
      'action': {
        'value': 'tool:filesystem__read_*'
      },
      'constraint': [{
        '@type': 'Constraint',
        'leftOperand': 'aegis:agentType',
        'operator': 'isAnyOf',
        'rightOperand': ['research', 'writing', 'coordinator']
      }]
    },
    {
      '@type': 'Permission',
      'action': {
        'value': 'tool:filesystem__write_*'
      },
      'constraint': [{
        '@type': 'Constraint',
        'leftOperand': 'aegis:agentType',
        'operator': 'eq',
        'rightOperand': 'writing'
      }]
    },
    {
      '@type': 'Permission',
      'action': {
        'value': 'tool:execution-server__*'
      },
      'constraint': [{
        '@type': 'LogicalConstraint',
        'and': [
          {
            '@type': 'Constraint',
            'leftOperand': 'aegis:agentType',
            'operator': 'eq',
            'rightOperand': 'admin'
          },
          {
            '@type': 'Constraint',
            'leftOperand': 'aegis:clearanceLevel',
            'operator': 'eq',
            'rightOperand': 'high'
          }
        ]
      }]
    }
  ],
  'prohibition': [{
    '@type': 'Prohibition',
    'action': {
      'value': 'tool:execution-server__*'
    },
    'constraint': [{
      '@type': 'Constraint',
      'leftOperand': 'aegis:agentType',
      'operator': 'isNoneOf',
      'rightOperand': ['admin', 'system']
    }]
  }]
};

/**
 * Delegation depth policy
 * Limits how deep task delegation can go
 */
export const delegationDepthPolicy: AEGISPolicy = {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
  '@type': 'Policy',
  'uid': 'aegis:policy:delegation-depth',
  'profile': 'https://aegis.example.com/odrl/profile',
  'naturalLanguageSource': 'タスクの委譲は最大3レベルまで許可',
  'prohibition': [{
    '@type': 'Prohibition',
    'action': {
      'value': 'task:delegate'
    },
    'constraint': [{
      '@type': 'Constraint',
      'leftOperand': 'aegis:delegationDepth',
      'operator': 'gt',
      'rightOperand': 3
    }]
  }]
};

/**
 * Claude Desktop policy
 * Special permissions for Claude Desktop client
 */
export const claudeDesktopPolicy: AEGISPolicy = {
  '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
  '@type': 'Policy',
  'uid': 'aegis:policy:claude-desktop',
  'profile': 'https://aegis.example.com/odrl/profile',
  'naturalLanguageSource': 'Claude Desktopクライアントは全ツールにアクセス可能',
  'priority': 100, // Higher priority
  'permission': [{
    '@type': 'Permission',
    'action': {
      'value': 'tool:*'
    },
    'constraint': [{
      '@type': 'Constraint',
      'leftOperand': 'aegis:agentId',
      'operator': 'eq',
      'rightOperand': 'claude-desktop'
    }],
    'duty': [{
      '@type': 'Duty',
      'action': {
        'value': 'aegis:log'
      },
      'constraint': [{
        '@type': 'Constraint',
        'leftOperand': 'aegis:logLevel',
        'operator': 'eq',
        'rightOperand': 'detailed'
      }]
    }]
  }]
};

/**
 * Combined default policy set
 */
export const defaultPolicySet: AEGISPolicy[] = [
  claudeDesktopPolicy,  // Highest priority
  businessHoursPolicy,
  agentTrustPolicy,
  mcpToolPolicy,
  delegationDepthPolicy
];

/**
 * Helper function to create a simple permission policy
 */
export function createSimplePermission(
  action: string,
  condition?: { operand: string; operator: string; value: any }
): AEGISPolicy {
  const policy: AEGISPolicy = {
    '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
    '@type': 'Policy',
    'uid': `aegis:policy:simple-${Date.now()}`,
    'profile': 'https://aegis.example.com/odrl/profile',
    'permission': [{
      '@type': 'Permission',
      'action': { 'value': action }
    }]
  };
  
  if (condition) {
    policy.permission![0].constraint = [{
      '@type': 'Constraint',
      'leftOperand': condition.operand,
      'operator': condition.operator,
      'rightOperand': condition.value
    }];
  }
  
  return policy;
}

/**
 * Helper function to create a simple prohibition policy
 */
export function createSimpleProhibition(
  action: string,
  condition?: { operand: string; operator: string; value: any }
): AEGISPolicy {
  const policy: AEGISPolicy = {
    '@context': ['http://www.w3.org/ns/odrl/2/', 'https://aegis.example.com/odrl/'],
    '@type': 'Policy',
    'uid': `aegis:policy:simple-${Date.now()}`,
    'profile': 'https://aegis.example.com/odrl/profile',
    'prohibition': [{
      '@type': 'Prohibition',
      'action': { 'value': action }
    }]
  };
  
  if (condition) {
    policy.prohibition![0].constraint = [{
      '@type': 'Constraint',
      'leftOperand': condition.operand,
      'operator': condition.operator,
      'rightOperand': condition.value
    }];
  }
  
  return policy;
}