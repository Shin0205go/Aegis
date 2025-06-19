/**
 * Standalone Coordinator Agent startup script
 */

import { CoordinatorAgent } from '../agents/coordinator-agent';
import { AEGISPolicyEnforcer } from '../core/mock-policy-enforcer';

async function main() {
  console.log('Starting Coordinator Agent...');

  // Create AEGIS policy enforcer
  const policyEnforcer = new AEGISPolicyEnforcer({
    policyEngineUrl: process.env.AEGIS_URL || 'http://localhost:3000/api/policy',
    cacheEnabled: true,
    cacheTTL: 300000,
    strictMode: false
  });

  // Create and start agent
  const agent = new CoordinatorAgent(8000, policyEnforcer);
  await agent.start();

  console.log('Coordinator Agent is running on port 8000');
  console.log('Agent registry:');
  console.log('  - Research Agent: http://localhost:8001');
  console.log('  - Writing Agent: http://localhost:8002');
  console.log('Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down Coordinator Agent...');
    await agent.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start Coordinator Agent:', error);
  process.exit(1);
});