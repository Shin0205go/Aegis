/**
 * ODRL Parser and Validator
 * Parses and validates ODRL policies in JSON-LD format
 */

import { z } from 'zod';
import {
  ODRLPolicy,
  Rule,
  Constraint,
  Action,
  Asset,
  Party,
  Duty,
  AEGISPolicy
} from './types';

// Zod schemas for validation
const URISchema = z.string().url().or(z.string().startsWith('urn:'));

const ActionSchema: z.ZodType<Action> = z.object({
  '@type': z.literal('Action').optional(),
  value: z.string(),
  refinement: z.array(z.lazy(() => ConstraintSchema)).optional()
});

const AssetSchema: z.ZodType<Asset> = z.object({
  '@type': z.literal('Asset').optional(),
  uid: URISchema,
  metadata: z.record(z.any()).optional()
});

const PartySchema: z.ZodType<Party> = z.object({
  '@type': z.literal('Party').optional(),
  uid: URISchema,
  metadata: z.record(z.any()).optional()
});

const ConstraintSchema: z.ZodType<Constraint> = z.object({
  '@type': z.enum(['Constraint', 'LogicalConstraint']).optional(),
  uid: URISchema.optional(),
  leftOperand: z.string().optional(),
  operator: z.enum(['eq', 'neq', 'gt', 'gteq', 'lt', 'lteq', 'in', 'hasPart', 'isA', 'isAllOf', 'isAnyOf', 'isNoneOf', 'isPartOf']).optional(),
  rightOperand: z.any().optional(),
  rightOperandReference: URISchema.optional(),
  unit: z.string().optional(),
  dataType: z.string().optional(),
  status: z.string().optional(),
  and: z.union([
    z.lazy(() => ConstraintSchema),
    z.array(z.lazy(() => ConstraintSchema))
  ]).optional(),
  or: z.union([
    z.lazy(() => ConstraintSchema),
    z.array(z.lazy(() => ConstraintSchema))
  ]).optional(),
  xone: z.array(z.lazy(() => ConstraintSchema)).optional()
});

const DutySchema: z.ZodType<Duty> = z.object({
  '@type': z.literal('Duty'),
  uid: URISchema.optional(),
  action: z.union([ActionSchema, z.array(ActionSchema)]),
  target: z.union([AssetSchema, z.array(AssetSchema)]).optional(),
  assigner: z.union([PartySchema, z.array(PartySchema)]).optional(),
  assignee: z.union([PartySchema, z.array(PartySchema)]).optional(),
  constraint: z.array(ConstraintSchema).optional(),
  duty: z.array(z.lazy(() => DutySchema)).optional(),
  remedy: z.array(z.lazy(() => DutySchema)).optional(),
  consequence: z.array(z.lazy(() => DutySchema)).optional(),
  metadata: z.record(z.any()).optional()
});

const RuleSchema: z.ZodType<Rule> = z.object({
  '@type': z.enum(['Permission', 'Prohibition', 'Obligation']).optional(),
  uid: URISchema.optional(),
  action: z.union([ActionSchema, z.array(ActionSchema)]),
  target: z.union([AssetSchema, z.array(AssetSchema)]).optional(),
  assigner: z.union([PartySchema, z.array(PartySchema)]).optional(),
  assignee: z.union([PartySchema, z.array(PartySchema)]).optional(),
  constraint: z.array(ConstraintSchema).optional(),
  duty: z.array(DutySchema).optional(),
  remedy: z.array(DutySchema).optional(),
  metadata: z.record(z.any()).optional()
});

const PolicySchema: z.ZodType<ODRLPolicy> = z.object({
  '@context': z.union([
    z.string(),
    z.array(z.string()),
    z.record(z.any())
  ]).optional(),
  '@type': z.enum(['Policy', 'Set', 'Offer', 'Agreement']),
  uid: URISchema,
  profile: URISchema.optional(),
  permission: z.array(RuleSchema).optional(),
  prohibition: z.array(RuleSchema).optional(),
  obligation: z.array(RuleSchema).optional(),
  metadata: z.record(z.any()).optional()
});

export class ODRLParser {
  private static readonly DEFAULT_CONTEXT = 'http://www.w3.org/ns/odrl/2/';
  private static readonly AEGIS_CONTEXT = 'https://aegis.example.com/odrl/';

  /**
   * Parse and validate an ODRL policy
   */
  static parse(input: string | object): ODRLPolicy {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    
    // Add default context if not present
    if (!data['@context']) {
      data['@context'] = this.DEFAULT_CONTEXT;
    }
    
    // Validate using Zod schema
    const result = PolicySchema.safeParse(data);
    
    if (!result.success) {
      throw new ODRLParseError('Invalid ODRL policy', result.error);
    }
    
    return result.data;
  }

  /**
   * Parse an AEGIS-specific ODRL policy
   */
  static parseAEGIS(input: string | object): AEGISPolicy {
    const policy = this.parse(input);
    
    // Ensure AEGIS context
    const contexts = Array.isArray(policy['@context']) 
      ? policy['@context'] 
      : [policy['@context']];
    
    if (!contexts.includes(this.AEGIS_CONTEXT)) {
      contexts.push(this.AEGIS_CONTEXT);
    }
    
    return {
      ...policy,
      '@context': contexts,
      profile: policy.profile || 'https://aegis.example.com/odrl/profile'
    } as AEGISPolicy;
  }

  /**
   * Validate a policy without parsing
   */
  static validate(policy: any): boolean {
    const result = PolicySchema.safeParse(policy);
    return result.success;
  }

  /**
   * Extract all constraints from a policy
   */
  static extractConstraints(policy: ODRLPolicy): Constraint[] {
    const constraints: Constraint[] = [];
    
    const extractFromRules = (rules?: Rule[]) => {
      if (!rules) return;
      
      for (const rule of rules) {
        if (rule.constraint) {
          constraints.push(...rule.constraint);
        }
        
        // Extract from actions
        const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
        for (const action of actions) {
          if (action.refinement) {
            constraints.push(...action.refinement);
          }
        }
        
        // Extract from duties
        if (rule.duty) {
          for (const duty of rule.duty) {
            if (duty.constraint) {
              constraints.push(...duty.constraint);
            }
          }
        }
      }
    };
    
    extractFromRules(policy.permission);
    extractFromRules(policy.prohibition);
    extractFromRules(policy.obligation);
    
    return constraints;
  }

  /**
   * Normalize a policy (expand compact forms)
   */
  static normalize(policy: ODRLPolicy): ODRLPolicy {
    const normalized = { ...policy };
    
    // Normalize rules
    const normalizeRules = (rules?: Rule[], type?: string): Rule[] => {
      if (!rules) return [];
      
      return rules.map(rule => ({
        ...rule,
        '@type': rule['@type'] || type,
        action: this.normalizeActions(rule.action),
        target: this.normalizeAssets(rule.target),
        assignee: this.normalizeParties(rule.assignee),
        assigner: this.normalizeParties(rule.assigner)
      })) as Rule[];
    };
    
    normalized.permission = normalizeRules(policy.permission, 'Permission');
    normalized.prohibition = normalizeRules(policy.prohibition, 'Prohibition');
    normalized.obligation = normalizeRules(policy.obligation, 'Obligation');
    
    return normalized;
  }

  private static normalizeActions(action: Action | Action[]): Action[] {
    if (Array.isArray(action)) return action;
    return [action];
  }

  private static normalizeAssets(asset?: Asset | Asset[]): Asset[] {
    if (!asset) return [];
    if (Array.isArray(asset)) return asset;
    return [asset];
  }

  private static normalizeParties(party?: Party | Party[]): Party[] {
    if (!party) return [];
    if (Array.isArray(party)) return party;
    return [party];
  }
}

export class ODRLParseError extends Error {
  constructor(message: string, public zodError?: z.ZodError) {
    super(message);
    this.name = 'ODRLParseError';
  }

  get details(): string {
    if (!this.zodError) return this.message;
    
    const errors = this.zodError.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    
    return `${this.message}\n${errors.join('\n')}`;
  }
}