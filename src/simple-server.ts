/**
 * Simple AEGIS HTTP Server
 * Minimal server for testing
 */

import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { Logger } from './utils/logger';
import { AIJudgmentEngine } from './ai/judgment-engine';
import { AIPolicyEngine } from './policy/ai-policy-engine';
import { policyLoader } from './policies/policy-loader.js';

const logger = new Logger('simple-server');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AI Engine
const aiEngine = process.env.ANTHROPIC_API_KEY
  ? new AIJudgmentEngine({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
    })
  : null;

// Initialize AI Policy Engine
const aiPolicyEngine = aiEngine ? new AIPolicyEngine(aiEngine, {
  aiThreshold: 0.7,
  cacheEnabled: true,
}) : null;

// Load policies from configuration
async function loadPolicies() {
  try {
    await policyLoader.loadPolicies();
    const policies = policyLoader.getAllPolicies();
    
    logger.info(`Loaded ${policies.length} policies from configuration`);
    if (aiPolicyEngine) {
      aiPolicyEngine.clearCache();
    }
  } catch (error) {
    logger.error('Failed to load policies from configuration:', error);
  }
}

// Serve static files
const webDir = path.join(__dirname, '../../src/web');
app.use(express.static(webDir));
logger.info(`Serving static files from ${webDir}`);

// Routes
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    policies: policyLoader.getAllPolicies().length,
    aiEnabled: !!aiEngine,
  });
});

// Simple policy test endpoint
app.post('/api/test/evaluate', async (req, res) => {
  try {
    const { context, policyId } = req.body;
    
    if (!aiPolicyEngine) {
      return res.status(503).json({ error: 'AI engine not available' });
    }
    
    // Find policy
    const policy = policyLoader.getPolicy(policyId);
    
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    // Evaluate
    const policyText = typeof policy.policy === 'string' ? policy.policy : JSON.stringify(policy.policy);
    const decision = await aiPolicyEngine.decide(context, policyText);
    
    res.json(decision);
  } catch (error) {
    logger.error('Evaluation error:', error);
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

// Audit metrics stub
app.get('/api/audit/metrics', (req, res) => {
  res.json({
    totalRequests: 0,
    permittedRequests: 0,
    deniedRequests: 0,
    averageProcessingTime: 0,
  });
});

// Start server
async function startServer() {
  // Load policies first
  await loadPolicies();
  
  const PORT = parseInt(process.env.PORT || '3000');
  app.listen(PORT, () => {
    logger.info(`🚀 AEGIS Simple Server running at http://localhost:${PORT}`);
    logger.info(`📝 Policy Management: http://localhost:${PORT}/policy-form.html`);
    logger.info(`🏠 Management UI: http://localhost:${PORT}/`);
    logger.info(`✅ Health check: http://localhost:${PORT}/health`);
  });
}

startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { app };