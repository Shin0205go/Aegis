# Scripts Directory

This directory contains build and utility scripts for the AEGIS Policy Engine.

## Scripts

### mcp-launcher.js
Main launcher script for starting the AEGIS MCP proxy server in either HTTP or stdio mode.

Usage:
```bash
# HTTP mode (default)
node scripts/mcp-launcher.js

# stdio mode for Claude Desktop
node scripts/mcp-launcher.js stdio
```

## Other Scripts

Additional build, deployment, and utility scripts should be placed in this directory.