// ============================================================================
// DEPRECATED: このファイルは廃止されました
// ============================================================================
// 
// APIサーバー機能はMCPプロキシサーバー (src/mcp/http-proxy.ts) に統合されました。
// 
// 統合されたサーバーは以下の機能を提供します：
// - MCPプロキシ機能 (ポート8080)
// - ポリシー管理API (/api/policies/*)
// - 監査ダッシュボードAPI (/api/audit/*)
// - Web UI配信
// 
// 使用方法:
// npm run start:mcp:http
// または
// npm run dev:mcp:http
// 
// ============================================================================

throw new Error(`
このファイルは廃止されました。
MCPプロキシサーバーに統合された機能を使用してください。

起動コマンド:
  npm run start:mcp:http

アクセスURL:
  - Web UI: http://localhost:8080/
  - Policy API: http://localhost:8080/api/policies
  - Audit API: http://localhost:8080/api/audit
  - MCP Endpoint: http://localhost:8080/mcp/messages
`);