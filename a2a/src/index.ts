/**
 * A2A Integration with AEGIS - Main Entry Point
 */

export * from './types/a2a-protocol';
export * from './core/a2a-agent';
export * from './agents/mcp-enabled-agent';
export * from './agents/mcp-research-agent';
export * from './agents/writing-agent';
export * from './agents/coordinator-agent';

// For CLI usage
if (require.main === module) {
  console.log('A2A Integration with AEGIS');
  console.log('');
  console.log('Usage:');
  console.log('  npm run demo              - Run the full demo');
  console.log('  npm run start:coordinator - Start coordinator agent');
  console.log('  npm run start:agent1      - Start research agent');
  console.log('  npm run start:agent2      - Start writing agent');
  console.log('');
  console.log('For more information, see README.md');
}