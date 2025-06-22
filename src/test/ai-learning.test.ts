import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIJudgmentEngine } from '../ai/judgment-engine.js';
import type { DecisionContext, PolicyDecision, LLMConfig } from '../types/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';

// Mock fs/promises module
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    readdir: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn()
  }
}));

// Mock fs module for createReadStream
vi.mock('fs', () => ({
  createReadStream: vi.fn()
}));

// Mock readline module
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield '{"patterns":{"resourcePattern":{"type":"customer-data"},"timePattern":{"isBusinessHours":true}},"decision":{"decision":"PERMIT","confidence":0.9}}';
      }
    }))
  }
}));

describe('AI Judgment Engine Learning', () => {
  let engine: AIJudgmentEngine;
  let mockLLMConfig: LLMConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLMConfig = {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000
    };
    engine = new AIJudgmentEngine(mockLLMConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('learn() method', () => {
    const validDecision: PolicyDecision = {
      decision: 'PERMIT',
      reason: 'Test reason',
      confidence: 0.8,
      riskLevel: 'LOW',
      constraints: [],
      obligations: []
    };

    const validContext: DecisionContext = {
      agent: 'test-agent',
      action: 'read',
      resource: 'test-resource',
      time: new Date()
    };

    const validPolicy = 'Test policy';

    it('should validate required parameters', async () => {
      // Missing decision
      await expect(engine.learn(null as any, validContext, validPolicy))
        .rejects.toThrow('Missing required parameters for learning');

      // Missing context
      await expect(engine.learn(validDecision, null as any, validPolicy))
        .rejects.toThrow('Missing required parameters for learning');

      // Missing policy
      await expect(engine.learn(validDecision, validContext, ''))
        .rejects.toThrow('Missing required parameters for learning');
    });

    it('should validate decision values', async () => {
      // Invalid decision value
      const invalidDecision = { ...validDecision, decision: 'INVALID' as any };
      await expect(engine.learn(invalidDecision, validContext, validPolicy))
        .rejects.toThrow('Invalid decision value');

      // Missing decision value
      const missingDecision = { ...validDecision, decision: undefined as any };
      await expect(engine.learn(missingDecision, validContext, validPolicy))
        .rejects.toThrow('Invalid decision value');
    });

    it('should validate confidence values', async () => {
      // Confidence too low
      const lowConfidence = { ...validDecision, confidence: -0.1 };
      await expect(engine.learn(lowConfidence, validContext, validPolicy))
        .rejects.toThrow('Invalid confidence value - must be between 0 and 1');

      // Confidence too high
      const highConfidence = { ...validDecision, confidence: 1.1 };
      await expect(engine.learn(highConfidence, validContext, validPolicy))
        .rejects.toThrow('Invalid confidence value - must be between 0 and 1');

      // Non-numeric confidence
      const nonNumericConfidence = { ...validDecision, confidence: 'high' as any };
      await expect(engine.learn(nonNumericConfidence, validContext, validPolicy))
        .rejects.toThrow('Invalid confidence value - must be between 0 and 1');
    });

    it('should validate required context fields', async () => {
      // Missing agent
      const noAgent = { ...validContext, agent: '' };
      await expect(engine.learn(validDecision, noAgent, validPolicy))
        .rejects.toThrow('Missing required context fields');

      // Missing action
      const noAction = { ...validContext, action: '' };
      await expect(engine.learn(validDecision, noAction, validPolicy))
        .rejects.toThrow('Missing required context fields');

      // Missing resource
      const noResource = { ...validContext, resource: '' };
      await expect(engine.learn(validDecision, noResource, validPolicy))
        .rejects.toThrow('Missing required context fields');
    });

    it('should save learning data with correct format', async () => {
      const mockFs = await import('fs/promises');
      
      await engine.learn(validDecision, validContext, validPolicy);

      // Verify directory creation
      expect(mockFs.default.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(path.join('data', 'learning')),
        { recursive: true }
      );

      // Verify file append
      expect(mockFs.default.appendFile).toHaveBeenCalledWith(
        expect.stringMatching(/learning-\d{4}-\d{2}-\d{2}\.jsonl$/),
        expect.stringContaining('"decision":"PERMIT"'),
        'utf8'
      );
    });

    it('should handle low confidence decisions', async () => {
      const lowConfidenceDecision = { ...validDecision, confidence: 0.6 };
      
      await engine.learn(lowConfidenceDecision, validContext, validPolicy);
      
      const mockFs = await import('fs/promises');
      expect(mockFs.default.appendFile).toHaveBeenCalled();
    });
  });

  describe('Pattern extraction', () => {
    it('should extract time patterns correctly', async () => {
      const businessHoursContext: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date('2024-01-15T14:30:00') // Monday 14:30
      };

      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Business hours access',
        confidence: 0.9,
        riskLevel: 'LOW',
        constraints: [],
        obligations: []
      };

      await engine.learn(decision, businessHoursContext, 'test policy');

      const mockFs = await import('fs/promises');
      const appendCall = (mockFs.default.appendFile as any).mock.calls[0];
      const savedData = JSON.parse(appendCall[1].replace('\n', ''));
      
      expect(savedData.patterns.timePattern.isBusinessHours).toBe(true);
      expect(savedData.patterns.timePattern.dayOfWeek).toBe(1); // Monday
    });

    it('should classify resource types correctly', async () => {
      const testCases = [
        { resource: 'customer-123', expectedType: 'customer-data' },
        { resource: 'financial-report', expectedType: 'financial-data' },
        { resource: 'employee-record', expectedType: 'employee-data' },
        { resource: 'system-config', expectedType: 'system-config' },
        { resource: 'general-file', expectedType: 'general-data' }
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: testCase.resource,
          time: new Date()
        };

        const decision: PolicyDecision = {
          decision: 'PERMIT',
          reason: 'Test',
          confidence: 0.9,
          riskLevel: 'LOW',
          constraints: [],
          obligations: []
        };

        await engine.learn(decision, context, 'test policy');

        const mockFs = await import('fs/promises');
        const appendCall = (mockFs.default.appendFile as any).mock.calls[0];
        const savedData = JSON.parse(appendCall[1].replace('\n', ''));
        
        expect(savedData.patterns.resourcePattern.type).toBe(testCase.expectedType);
      }
    });

    it('should estimate sensitivity levels', async () => {
      const testCases = [
        { resource: 'password-file', expectedSensitivity: 'high' },
        { resource: 'secret-key', expectedSensitivity: 'high' },
        { resource: 'customer-data', expectedSensitivity: 'medium' },
        { resource: 'financial-report', expectedSensitivity: 'medium' },
        { resource: 'public-data', expectedSensitivity: 'low' }
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        
        const context: DecisionContext = {
          agent: 'test-agent',
          action: 'read',
          resource: testCase.resource,
          time: new Date()
        };

        const decision: PolicyDecision = {
          decision: 'PERMIT',
          reason: 'Test',
          confidence: 0.9,
          riskLevel: 'LOW',
          constraints: [],
          obligations: []
        };

        await engine.learn(decision, context, 'test policy');

        const mockFs = await import('fs/promises');
        const appendCall = (mockFs.default.appendFile as any).mock.calls[0];
        const savedData = JSON.parse(appendCall[1].replace('\n', ''));
        
        expect(savedData.patterns.resourcePattern.sensitivity).toBe(testCase.expectedSensitivity);
      }
    });
  });

  describe('Fine-tuning data preparation', () => {
    it('should prepare fine-tuning dataset when threshold is met', async () => {
      const mockFs = await import('fs/promises');
      
      // Mock readdir to return multiple files
      (mockFs.default.readdir as any).mockResolvedValue([
        'learning-2024-01-01.jsonl',
        'learning-2024-01-02.jsonl',
        'learning-2024-01-03.jsonl'
      ]);

      // Mock readFile to return sample data
      (mockFs.default.readFile as any).mockResolvedValue(
        '{"context":{"agent":"test"},"decision":{"decision":"PERMIT"},"patterns":{}}\n'
      );

      // Test by calling the public judge method which triggers learning
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date()
      };

      // Mock the LLM response
      const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
        decision: 'PERMIT',
        reason: 'Test',
        confidence: 0.9,
        riskLevel: 'LOW',
        constraints: [],
        obligations: []
      }));
      
      (engine as any).llm.complete = mockComplete;

      await engine.judge(context, 'test policy');

      // The fine-tuning preparation happens asynchronously, so we don't test it directly here
      // Instead, we verify the learning process was initiated
      expect(mockFs.default.appendFile).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const mockFs = await import('fs/promises');
      (mockFs.default.appendFile as any).mockRejectedValue(new Error('Disk full'));

      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Test',
        confidence: 0.8,
        riskLevel: 'LOW',
        constraints: [],
        obligations: []
      };

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date()
      };

      // Learning errors should not throw, they are logged
      await expect(engine.learn(decision, context, 'test policy')).resolves.not.toThrow();
    });

    it('should handle malformed learning data', async () => {
      const mockFs = await import('fs/promises');
      const mockReadline = await import('readline');
      
      // Mock readline to return malformed JSON
      (mockReadline.default.createInterface as any).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield 'invalid json';
        }
      });

      const decision: PolicyDecision = {
        decision: 'PERMIT',
        reason: 'Test',
        confidence: 0.5, // Low confidence to trigger pattern search
        riskLevel: 'LOW',
        constraints: [],
        obligations: []
      };

      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date()
      };

      await expect(engine.learn(decision, context, 'test policy')).resolves.not.toThrow();
    });
  });
});