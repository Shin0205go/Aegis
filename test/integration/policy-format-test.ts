import { describe, it, expect, beforeEach } from '@jest/globals';
import { HybridPolicyEngine } from '../../src/policy/hybrid-policy-engine';
import { AIJudgmentEngine } from '../../src/ai/judgment-engine';
import { DecisionContext } from '../../src/types';
import { AEGISPolicy } from '../../src/odrl/types';

describe('Policy Format Handling', () => {
  let hybridEngine: HybridPolicyEngine;
  let mockAIEngine: AIJudgmentEngine;
  
  beforeEach(() => {
    // Mock AI engine to see what policy text it receives
    mockAIEngine = {
      judge: jest.fn().mockResolvedValue({
        decision: 'PERMIT',
        reason: 'Test permit',
        confidence: 0.9,
        constraints: [],
        obligations: []
      })
    } as any;
    
    hybridEngine = new HybridPolicyEngine(mockAIEngine, {
      useODRL: true,
      useAI: true,
      autoDetectFormat: true,
      aiThreshold: 0.7
    });
  });
  
  it('should pass naturalLanguageSource to AI engine when ODRL contains natural language', async () => {
    const context: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      time: new Date()
    };
    
    const odrlWithNaturalLanguage: AEGISPolicy = {
      uid: 'aegis:policy:test-nl',
      '@context': ['http://www.w3.org/ns/odrl/2/'],
      '@type': 'Policy',
      permission: [],
      naturalLanguageSource: '【テストポリシー】\\n基本原則: テストエージェントのアクセスを許可'
    };
    
    // Add policy to engine
    hybridEngine.addPolicy(odrlWithNaturalLanguage);
    
    // Make decision
    await hybridEngine.decide(context, odrlWithNaturalLanguage);
    
    // Check what was passed to AI engine
    expect(mockAIEngine.judge).toHaveBeenCalled();
    const callArgs = (mockAIEngine.judge as jest.Mock).mock.calls[0];
    const aiPolicyText = callArgs[1];
    
    // AI should receive the natural language text, not the ODRL JSON
    expect(aiPolicyText).toBe('【テストポリシー】\\n基本原則: テストエージェントのアクセスを許可');
    expect(aiPolicyText).not.toContain('@context');
    expect(aiPolicyText).not.toContain('@type');
  });
  
  it('should pass plain natural language text directly to AI engine', async () => {
    const context: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      time: new Date()
    };
    
    const naturalLanguagePolicy = '【ファイルアクセスポリシー】\\n読み取りアクセスは営業時間内のみ許可';
    
    // Make decision with plain text
    await hybridEngine.decide(context, naturalLanguagePolicy);
    
    // Check what was passed to AI engine
    expect(mockAIEngine.judge).toHaveBeenCalled();
    const callArgs = (mockAIEngine.judge as jest.Mock).mock.calls[0];
    const aiPolicyText = callArgs[1];
    
    // AI should receive the exact text
    expect(aiPolicyText).toBe(naturalLanguagePolicy);
  });
  
  it('should fallback to JSON stringify for pure ODRL without naturalLanguageSource', async () => {
    const context: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'file://test.txt',
      time: new Date()
    };
    
    const pureODRL: AEGISPolicy = {
      uid: 'aegis:policy:test-odrl',
      '@context': ['http://www.w3.org/ns/odrl/2/'],
      '@type': 'Policy',
      permission: [{
        '@type': 'Permission',
        action: { value: 'read' },
        target: { uid: 'file://*' }
      }]
    };
    
    // Add policy to engine
    hybridEngine.addPolicy(pureODRL);
    
    // Make decision
    await hybridEngine.decide(context, pureODRL);
    
    // If AI is called (depends on ODRL evaluation), it should receive JSON
    if ((mockAIEngine.judge as jest.Mock).mock.calls.length > 0) {
      const callArgs = (mockAIEngine.judge as jest.Mock).mock.calls[0];
      const aiPolicyText = callArgs[1];
      
      // AI should receive stringified ODRL
      expect(aiPolicyText).toContain('@context');
      expect(aiPolicyText).toContain('@type');
      expect(aiPolicyText).toContain('permission');
    }
  });
});