/**
 * ODRL Policy Management API Endpoints
 */

import { Router, Request, Response } from 'express';
import { HybridPolicyEngine } from '../policy/hybrid-policy-engine';
import { NLToODRLConverter } from '../odrl/nl-to-odrl-converter';
import { ODRLParser } from '../odrl/parser';
import { AEGISPolicy } from '../odrl/types';
import { logger } from '../utils/logger';

export function createODRLEndpoints(hybridEngine: HybridPolicyEngine): Router {
  const router = Router();
  const nlConverter = new NLToODRLConverter();

  /**
   * GET /odrl/policies - List all ODRL policies
   */
  router.get('/policies', (req: Request, res: Response) => {
    try {
      const policies = hybridEngine.getPolicies();
      res.json({
        count: policies.length,
        policies: policies.map(p => ({
          uid: p.uid,
          type: p['@type'],
          naturalLanguageSource: p.naturalLanguageSource,
          metadata: p.metadata,
          priority: p.priority,
          permissions: p.permission?.length || 0,
          prohibitions: p.prohibition?.length || 0,
          obligations: p.obligation?.length || 0
        }))
      });
    } catch (error) {
      logger.error('Failed to list policies', error);
      res.status(500).json({ error: 'Failed to list policies' });
    }
  });

  /**
   * GET /odrl/policies/:id - Get a specific policy
   */
  router.get('/policies/:id', (req: Request, res: Response) => {
    try {
      const policies = hybridEngine.getPolicies();
      const policy = policies.find(p => p.uid === req.params.id);
      
      if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
      }
      
      res.json(policy);
    } catch (error) {
      logger.error('Failed to get policy', error);
      res.status(500).json({ error: 'Failed to get policy' });
    }
  });

  /**
   * POST /odrl/policies - Create a new ODRL policy
   */
  router.post('/policies', async (req: Request, res: Response) => {
    try {
      const { policy, naturalLanguage } = req.body;
      
      let odrlPolicy: AEGISPolicy;
      
      if (naturalLanguage) {
        // Convert from natural language
        const result = await nlConverter.convert(naturalLanguage);
        
        if (!result.success) {
          return res.status(400).json({ 
            error: 'Failed to convert natural language', 
            details: result.error 
          });
        }
        
        odrlPolicy = result.policy!;
        
        // Add additional metadata
        if (req.body.metadata) {
          odrlPolicy.metadata = { ...odrlPolicy.metadata, ...req.body.metadata };
        }
      } else if (policy) {
        // Direct ODRL policy
        try {
          odrlPolicy = ODRLParser.parseAEGIS(policy);
        } catch (parseError) {
          return res.status(400).json({ 
            error: 'Invalid ODRL policy', 
            details: parseError instanceof Error ? parseError.message : 'Unknown error'
          });
        }
      } else {
        return res.status(400).json({ 
          error: 'Either policy or naturalLanguage must be provided' 
        });
      }
      
      // Add to engine
      hybridEngine.addPolicy(odrlPolicy);
      
      res.status(201).json({
        success: true,
        policy: odrlPolicy,
        message: 'Policy created successfully'
      });
      
    } catch (error) {
      logger.error('Failed to create policy', error);
      res.status(500).json({ error: 'Failed to create policy' });
    }
  });

  /**
   * PUT /odrl/policies/:id - Update an existing policy
   */
  router.put('/policies/:id', async (req: Request, res: Response) => {
    try {
      const { policy, naturalLanguage } = req.body;
      const policyId = req.params.id;
      
      // Remove old policy
      const removed = hybridEngine.removePolicy(policyId);
      if (!removed) {
        return res.status(404).json({ error: 'Policy not found' });
      }
      
      // Add updated policy
      let odrlPolicy: AEGISPolicy;
      
      if (naturalLanguage) {
        const result = await nlConverter.convert(naturalLanguage);
        if (!result.success) {
          return res.status(400).json({ 
            error: 'Failed to convert natural language', 
            details: result.error 
          });
        }
        odrlPolicy = result.policy!;
        odrlPolicy.uid = policyId; // Keep the same ID
      } else if (policy) {
        odrlPolicy = ODRLParser.parseAEGIS(policy);
        odrlPolicy.uid = policyId; // Keep the same ID
      } else {
        return res.status(400).json({ 
          error: 'Either policy or naturalLanguage must be provided' 
        });
      }
      
      hybridEngine.addPolicy(odrlPolicy);
      
      res.json({
        success: true,
        policy: odrlPolicy,
        message: 'Policy updated successfully'
      });
      
    } catch (error) {
      logger.error('Failed to update policy', error);
      res.status(500).json({ error: 'Failed to update policy' });
    }
  });

  /**
   * DELETE /odrl/policies/:id - Delete a policy
   */
  router.delete('/policies/:id', (req: Request, res: Response) => {
    try {
      const removed = hybridEngine.removePolicy(req.params.id);
      
      if (!removed) {
        return res.status(404).json({ error: 'Policy not found' });
      }
      
      res.json({
        success: true,
        message: 'Policy deleted successfully'
      });
      
    } catch (error) {
      logger.error('Failed to delete policy', error);
      res.status(500).json({ error: 'Failed to delete policy' });
    }
  });

  /**
   * POST /odrl/convert - Convert natural language to ODRL
   */
  router.post('/convert', async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }
      
      const result = await nlConverter.convert(text);
      
      if (!result.success) {
        return res.status(400).json({ 
          error: 'Conversion failed', 
          details: result.error 
        });
      }
      
      res.json({
        success: true,
        policy: result.policy,
        confidence: result.confidence,
        patterns: result.patterns
      });
      
    } catch (error) {
      logger.error('Failed to convert policy', error);
      res.status(500).json({ error: 'Failed to convert policy' });
    }
  });

  /**
   * POST /odrl/validate - Validate an ODRL policy
   */
  router.post('/validate', (req: Request, res: Response) => {
    try {
      const { policy } = req.body;
      
      if (!policy) {
        return res.status(400).json({ error: 'Policy is required' });
      }
      
      try {
        const parsed = ODRLParser.parseAEGIS(policy);
        res.json({
          valid: true,
          policy: parsed,
          message: 'Policy is valid'
        });
      } catch (parseError) {
        res.json({
          valid: false,
          error: parseError instanceof Error ? parseError.message : 'Invalid policy',
          details: parseError instanceof Error && 'details' in parseError ? 
            (parseError as any).details : undefined
        });
      }
      
    } catch (error) {
      logger.error('Failed to validate policy', error);
      res.status(500).json({ error: 'Failed to validate policy' });
    }
  });

  /**
   * GET /odrl/suggestions - Get policy suggestions
   */
  router.get('/suggestions', (req: Request, res: Response) => {
    try {
      const suggestions = [
        {
          id: 'business-hours',
          name: 'Business Hours Access',
          description: 'Restrict access to business hours (9-18)',
          naturalLanguage: '営業時間内（9時から18時まで）のみアクセスを許可'
        },
        {
          id: 'trusted-agents',
          name: 'Trusted Agents Only',
          description: 'Allow only agents with high trust scores',
          naturalLanguage: '信頼スコアが0.7以上のエージェントのみ許可'
        },
        {
          id: 'read-only',
          name: 'Read-Only Access',
          description: 'Allow only read operations',
          naturalLanguage: '読み取り操作のみ許可、書き込みは禁止'
        },
        {
          id: 'emergency-override',
          name: 'Emergency Override',
          description: 'Allow emergency access outside normal restrictions',
          naturalLanguage: '緊急時はすべての制限を解除'
        }
      ];
      
      res.json(suggestions);
      
    } catch (error) {
      logger.error('Failed to get suggestions', error);
      res.status(500).json({ error: 'Failed to get suggestions' });
    }
  });

  /**
   * POST /odrl/test - Test a policy against a context
   */
  router.post('/test', async (req: Request, res: Response) => {
    try {
      const { context, policyId } = req.body;
      
      if (!context) {
        return res.status(400).json({ error: 'Context is required' });
      }
      
      // If specific policy ID provided, test only that policy
      if (policyId) {
        const policies = hybridEngine.getPolicies();
        const policy = policies.find(p => p.uid === policyId);
        
        if (!policy) {
          return res.status(404).json({ error: 'Policy not found' });
        }
        
        // Temporarily set engine to use only this policy
        const tempEngine = new HybridPolicyEngine(null as any, {
          useODRL: true,
          useAI: false,
          odrlPolicies: [policy]
        });
        
        const decision = await tempEngine.decide(context);
        
        return res.json({
          decision: decision.decision,
          reason: decision.reason,
          confidence: decision.confidence,
          policyId: policy.uid,
          policyName: policy.metadata?.label || policy.uid
        });
      }
      
      // Test against all policies
      const decision = await hybridEngine.decide(context);
      
      res.json({
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        metadata: decision.metadata
      });
      
    } catch (error) {
      logger.error('Failed to test policy', error);
      res.status(500).json({ error: 'Failed to test policy' });
    }
  });

  return router;
}