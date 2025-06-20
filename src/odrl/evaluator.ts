/**
 * ODRL Policy Evaluator
 * Evaluates ODRL policies against a given context
 */

import {
  ODRLPolicy,
  Rule,
  Constraint,
  Action,
  PolicyDecision,
  EvaluationContext,
  ConstraintEvaluation,
  Duty,
  AEGISOperands
} from './types';

export class ODRLEvaluator {
  private evaluationStartTime: number = 0;

  /**
   * Evaluate a policy against a context
   */
  evaluate(policy: ODRLPolicy, context: EvaluationContext): PolicyDecision {
    this.evaluationStartTime = Date.now();
    
    // Check permissions
    const permissionResult = this.evaluateRules(
      policy.permission || [],
      context,
      'Permission'
    );
    
    // Check prohibitions (these override permissions)
    const prohibitionResult = this.evaluateRules(
      policy.prohibition || [],
      context,
      'Prohibition'
    );
    
    // If any prohibition matches, deny
    if (prohibitionResult.matched.length > 0) {
      return this.createDecision(
        'DENY',
        policy,
        prohibitionResult.matched,
        prohibitionResult.failedConstraints,
        []
      );
    }
    
    // If any permission matches, check duties
    if (permissionResult.matched.length > 0) {
      const duties = this.extractDuties(permissionResult.matched);
      
      return this.createDecision(
        'PERMIT',
        policy,
        permissionResult.matched,
        [],
        duties
      );
    }
    
    // Check obligations (must be fulfilled regardless)
    const obligationResult = this.evaluateRules(
      policy.obligation || [],
      context,
      'Obligation'
    );
    
    // If no rules matched, policy is not applicable
    if (permissionResult.matched.length === 0 && 
        prohibitionResult.matched.length === 0 &&
        obligationResult.matched.length === 0) {
      return this.createDecision('NOT_APPLICABLE', policy, [], [], []);
    }
    
    // Otherwise, deny by default
    return this.createDecision(
      'DENY',
      policy,
      [],
      permissionResult.failedConstraints,
      []
    );
  }

  /**
   * Evaluate multiple policies (policy set)
   */
  evaluateSet(policies: ODRLPolicy[], context: EvaluationContext): PolicyDecision {
    const decisions: PolicyDecision[] = [];
    
    for (const policy of policies) {
      const decision = this.evaluate(policy, context);
      decisions.push(decision);
      
      // First matching policy wins (ordered evaluation)
      if (decision.decision !== 'NOT_APPLICABLE') {
        return decision;
      }
    }
    
    // No applicable policy found
    return this.createDecision('NOT_APPLICABLE', undefined, [], [], []);
  }

  private evaluateRules(
    rules: Rule[],
    context: EvaluationContext,
    ruleType: string
  ): {
    matched: Rule[];
    failedConstraints: ConstraintEvaluation[];
  } {
    const matched: Rule[] = [];
    const failedConstraints: ConstraintEvaluation[] = [];
    
    for (const rule of rules) {
      // Check if action matches
      if (!this.matchesAction(rule.action, context.action)) {
        continue;
      }
      
      // Check if target matches (if specified)
      if (rule.target && !this.matchesTarget(rule.target, context.resource)) {
        continue;
      }
      
      // Check if assignee matches (if specified)
      if (rule.assignee && !this.matchesAssignee(rule.assignee, context.agent)) {
        continue;
      }
      
      // Evaluate constraints
      const constraintResult = this.evaluateConstraints(
        rule.constraint || [],
        context
      );
      
      if (constraintResult.allSatisfied) {
        matched.push(rule);
      } else {
        failedConstraints.push(...constraintResult.failed);
      }
    }
    
    return { matched, failedConstraints };
  }

  private matchesAction(
    ruleAction: Action | Action[],
    contextAction: { type: string; mcpMethod?: string; mcpTool?: string }
  ): boolean {
    const actions = Array.isArray(ruleAction) ? ruleAction : [ruleAction];
    
    return actions.some(action => {
      const actionValue = action.value.toString();
      
      // Direct match
      if (actionValue === contextAction.type) return true;
      
      // MCP method match
      if (actionValue === `mcp:${contextAction.mcpMethod}`) return true;
      
      // MCP tool match
      if (actionValue === `tool:${contextAction.mcpTool}`) return true;
      
      // Wildcard match
      if (actionValue.endsWith('*')) {
        const prefix = actionValue.slice(0, -1);
        return contextAction.type.startsWith(prefix) ||
               (contextAction.mcpMethod?.startsWith(prefix) ?? false) ||
               (contextAction.mcpTool?.startsWith(prefix) ?? false);
      }
      
      return false;
    });
  }

  private matchesTarget(
    target: any,
    resource: { type: string; id?: string; classification?: string }
  ): boolean {
    // Simple implementation - can be extended
    return true;
  }

  private matchesAssignee(
    assignee: any,
    agent: { id: string; type: string; role?: string }
  ): boolean {
    // Simple implementation - can be extended
    return true;
  }

  private evaluateConstraints(
    constraints: Constraint[],
    context: EvaluationContext
  ): {
    allSatisfied: boolean;
    failed: ConstraintEvaluation[];
  } {
    const failed: ConstraintEvaluation[] = [];
    
    for (const constraint of constraints) {
      const result = this.evaluateConstraint(constraint, context);
      
      if (!result.result) {
        failed.push(result);
      }
    }
    
    return {
      allSatisfied: failed.length === 0,
      failed
    };
  }

  private evaluateConstraint(
    constraint: Constraint,
    context: EvaluationContext
  ): ConstraintEvaluation {
    // Handle logical constraints
    if (constraint.and) {
      return this.evaluateLogicalConstraint(constraint, context, 'AND');
    }
    
    if (constraint.or) {
      return this.evaluateLogicalConstraint(constraint, context, 'OR');
    }
    
    if (constraint.xone) {
      return this.evaluateLogicalConstraint(constraint, context, 'XONE');
    }
    
    // Handle atomic constraint
    if (!constraint.leftOperand || !constraint.operator) {
      return {
        constraint,
        result: false,
        reason: 'Invalid constraint: missing operand or operator'
      };
    }
    
    const actualValue = this.resolveOperand(constraint.leftOperand, context);
    const expectedValue = constraint.rightOperand;
    const result = this.evaluateOperator(
      actualValue,
      constraint.operator,
      expectedValue
    );
    
    return {
      constraint,
      result,
      actualValue,
      reason: result ? undefined : `${constraint.leftOperand} ${constraint.operator} ${expectedValue} failed`
    };
  }

  private evaluateLogicalConstraint(
    constraint: Constraint,
    context: EvaluationContext,
    type: 'AND' | 'OR' | 'XONE'
  ): ConstraintEvaluation {
    let subConstraints: Constraint[] = [];
    
    if (type === 'AND' && constraint.and) {
      subConstraints = Array.isArray(constraint.and) ? constraint.and : [constraint.and];
    } else if (type === 'OR' && constraint.or) {
      subConstraints = Array.isArray(constraint.or) ? constraint.or : [constraint.or];
    } else if (type === 'XONE' && constraint.xone) {
      subConstraints = constraint.xone;
    }
    
    const results = subConstraints.map(c => this.evaluateConstraint(c, context));
    
    let result = false;
    let reason = '';
    
    switch (type) {
      case 'AND':
        result = results.every(r => r.result);
        reason = result ? '' : 'Not all AND conditions satisfied';
        break;
      
      case 'OR':
        result = results.some(r => r.result);
        reason = result ? '' : 'No OR conditions satisfied';
        break;
      
      case 'XONE':
        const satisfied = results.filter(r => r.result).length;
        result = satisfied === 1;
        reason = result ? '' : `XONE requires exactly 1 condition, but ${satisfied} satisfied`;
        break;
    }
    
    return { constraint, result, reason };
  }

  private resolveOperand(operand: string, context: EvaluationContext): any {
    // Standard ODRL operands
    switch (operand) {
      case 'dateTime':
        return new Date(context.dateTime);
      
      case 'timeOfDay':
        return new Date(context.dateTime).toTimeString().split(' ')[0];
      
      case 'dayOfWeek':
        return new Date(context.dateTime).getDay();
    }
    
    // AEGIS-specific operands
    switch (operand) {
      case AEGISOperands.AGENT_ID:
        return context.agent.id;
      
      case AEGISOperands.AGENT_TYPE:
        return context.agent.type;
      
      case AEGISOperands.AGENT_ROLE:
        return context.agent.role;
      
      case AEGISOperands.CLEARANCE_LEVEL:
        return context.agent.clearanceLevel;
      
      case AEGISOperands.TRUST_SCORE:
        return context.agent.trustScore;
      
      case AEGISOperands.RESOURCE_TYPE:
        return context.resource.type;
      
      case AEGISOperands.RESOURCE_CLASSIFICATION:
        return context.resource.classification;
      
      case AEGISOperands.IP_ADDRESS:
        return context.environment.ipAddress;
      
      case AEGISOperands.LOCATION:
        return context.environment.location;
      
      case AEGISOperands.EMERGENCY_FLAG:
        return context.environment.emergency;
      
      case AEGISOperands.DELEGATION_DEPTH:
        return context.environment.delegationChain?.length || 0;
      
      case AEGISOperands.MCP_TOOL:
        return context.action.mcpTool;
      
      case AEGISOperands.MCP_METHOD:
        return context.action.mcpMethod;
    }
    
    // Check extensions
    if (context.extensions && operand in context.extensions) {
      return context.extensions[operand];
    }
    
    return undefined;
  }

  private evaluateOperator(leftValue: any, operator: string, rightValue: any): boolean {
    switch (operator) {
      case 'eq':
        return leftValue === rightValue;
      
      case 'neq':
        return leftValue !== rightValue;
      
      case 'gt':
        return leftValue > rightValue;
      
      case 'gteq':
        return leftValue >= rightValue;
      
      case 'lt':
        return leftValue < rightValue;
      
      case 'lteq':
        return leftValue <= rightValue;
      
      case 'in':
        return Array.isArray(rightValue) && rightValue.includes(leftValue);
      
      case 'hasPart':
        return Array.isArray(leftValue) && leftValue.includes(rightValue);
      
      case 'isA':
        // Type checking - simplified
        return typeof leftValue === rightValue;
      
      case 'isAllOf':
        return Array.isArray(rightValue) && 
               rightValue.every((v: any) => leftValue?.includes?.(v));
      
      case 'isAnyOf':
        return Array.isArray(rightValue) && 
               rightValue.some((v: any) => leftValue === v);
      
      case 'isNoneOf':
        return Array.isArray(rightValue) && 
               !rightValue.includes(leftValue);
      
      case 'isPartOf':
        return rightValue?.includes?.(leftValue);
      
      default:
        return false;
    }
  }

  private extractDuties(rules: Rule[]): Duty[] {
    const duties: Duty[] = [];
    
    for (const rule of rules) {
      if (rule.duty) {
        duties.push(...rule.duty);
      }
    }
    
    return duties;
  }

  private createDecision(
    decision: PolicyDecision['decision'],
    policy: ODRLPolicy | undefined,
    matchedRules: Rule[],
    failedConstraints: ConstraintEvaluation[],
    obligations: Duty[]
  ): PolicyDecision {
    return {
      decision,
      policy,
      matchedRules,
      failedConstraints,
      obligations,
      metadata: {
        timestamp: new Date().toISOString(),
        evaluationTime: Date.now() - this.evaluationStartTime,
        policyId: policy?.uid || 'unknown'
      }
    };
  }
}