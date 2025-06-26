# Deployment Resources

This directory contains deployment-related files and examples for production environments.

## Directory Structure

```
deployment/
├── systemd/              # Linux systemd service definitions
│   └── aegis-proxy.service
└── config-examples/      # Configuration file examples
    └── aegis-config.json
```

## systemd Service

The `aegis-proxy.service` file is a template for deploying AEGIS as a systemd service on Linux systems.

### Installation Instructions

1. Copy and customize the service file:
```bash
sudo cp deployment/systemd/aegis-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
```

2. Create the aegis user and directories:
```bash
sudo useradd -r -s /bin/false aegis
sudo mkdir -p /opt/aegis-policy-engine /var/log/aegis /var/lib/aegis
sudo chown aegis:aegis /var/log/aegis /var/lib/aegis
```

3. Enable and start the service:
```bash
sudo systemctl enable aegis-proxy
sudo systemctl start aegis-proxy
```

## Configuration Examples

The `aegis-config.json` file shows an example configuration structure. However, the current implementation uses:
- Environment variables for sensitive settings
- `aegis-mcp-config.json` for MCP server definitions

These example files are kept for reference and future development.