// MCPツール制御ポリシー
export const TOOL_CONTROL_POLICY = {
  name: 'mcp-tool-control-policy',
  policy: `
MCPツール制御ポリシー：

【基本原則】
- すべてのツール実行はデフォルトで許可
- 高リスクツールは追加の制御を適用
- ツール名から自動的にリスクを判定

【リスク判定基準】
高リスク（厳格な制御）:
- bash, shell, exec, cmd, powershell を含むツール
- system, os, process を含むツール
- delete, remove, destroy を含むツール
- admin, root, sudo を含むツール
- agent（再帰的実行）を含むツール

中リスク（標準制御）:
- write, create, update, modify, edit を含むツール
- move, rename, copy を含むツール
- config, setting を含むツール

低リスク（最小限の制御）:
- read, get, list, search, find を含むツール
- view, show, display を含むツール
- info, status, stat を含むツール
- todo, task, note を含むツール

【制御内容】
高リスクツールの場合:
- 実行内容の詳細ログ記録が必須
- 危険なパラメータのブロック（rm -rf / など）
- 実行後の監査レポート生成

中リスクツールの場合:
- 実行ログの記録
- 大量操作の警告

低リスクツールの場合:
- 基本的なアクセスログのみ

【特別な例外】
- TodoRead, TodoWrite は常に許可（個人的なタスク管理）
- LS, Glob, Grep は常に許可（読み取り専用）

【判定ロジック】
1. ツール名（resource）を確認
2. 上記のパターンに基づいてリスクレベルを判定
3. リスクレベルに応じた制御を適用
4. 明示的な例外がある場合はそれを優先
`
};