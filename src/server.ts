/**
 * AEGIS HTTP Server
 * Main server entry point for HTTP mode
 */

import express from 'express';
import cors from 'cors';
import { MCPHttpPolicyProxy } from './mcp/http-proxy';
import { AIJudgmentEngine } from './ai/judgment-engine';
import { Logger } from './utils/logger';
import { createODRLEndpoints } from './api/odrl-endpoints';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger('server');

async function startServer() {
  try {
    // Initialize AI engine
    const aiEngine = process.env.ANTHROPIC_API_KEY
      ? new AIJudgmentEngine({
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: 'claude-3-haiku-20240307',
        })
      : null;

    if (!aiEngine) {
      logger.warn('No AI provider configured - running in ODRL-only mode');
    }

    // Create MCP proxy
    const mcpProxy = new MCPHttpPolicyProxy(
      {
        port: parseInt(process.env.PORT || '3000'),
      } as any,
      logger,
      aiEngine
    );

    // Start the proxy (this sets up all the routes)
    await mcpProxy.start();

    // Get the Express app from the proxy
    const app = (mcpProxy as any).app;

    // Serve static files from web directory
    const webDir = path.join(__dirname, '..', 'web');
    if (fs.existsSync(webDir)) {
      app.use(express.static(webDir));
      logger.info(`Serving static files from ${webDir}`);
    } else {
      logger.warn(`Web directory not found: ${webDir}`);
    }

    // Add ODRL endpoints
    const hybridEngine = (mcpProxy as any).hybridPolicyEngine;
    if (hybridEngine) {
      app.use('/api/odrl', createODRLEndpoints(hybridEngine));
      logger.info('ODRL endpoints registered at /api/odrl');
    }

    // Root redirect
    app.get('/', (req: any, res: any) => {
      res.redirect('/index.html');
    });

    // Health check endpoint (if not already defined)
    if (!app._router.stack.find((r: any) => r.route?.path === '/health')) {
      app.get('/health', (req: any, res: any) => {
        res.json({
          status: 'healthy',
          version: '1.0.0',
          mode: 'http',
          aiEnabled: !!aiEngine,
        });
      });
    }

    const port = parseInt(process.env.PORT || '3000');
    logger.info(`🚀 AEGIS Policy Engine running at http://localhost:${port}`);
    logger.info(`📝 ODRL Form Builder available at http://localhost:${port}/odrl-policy-form.html`);
    logger.info(`🏠 Management UI available at http://localhost:${port}/`);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if run directly
if (require.main === module) {
  startServer();
}

export { startServer };