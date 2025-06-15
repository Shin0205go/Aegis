// Claude Desktop 専用ポリシー
export const CLAUDE_DESKTOP_POLICY = {
  name: 'claude-desktop-policy',
  policy: `
Claude Desktop アクセスポリシー：

【基本原則】
- Claude Desktop (mcp-client) からのアクセスは基本的に許可
- リスト操作（tools/list, resources/list）は常に許可
- 初期接続時の探索的アクセスを許可

【アクセス許可】
- ツール一覧の取得: 常に許可
- リソース一覧の取得: 常に許可
- 上流MCPサーバーへの接続: 許可

【制限事項】
- 個人情報を含むリソースへの直接アクセスは追加確認が必要
- 削除操作は明示的な確認が必要
- ファイルシステムへの書き込み・編集・作成・移動操作は禁止

【判定基準】
- agent が "mcp-client" の場合、基本的に PERMIT
- action が "list" の場合、常に PERMIT
- 初期接続フェーズでは寛容に判定
- resource が "tool:filesystem__write_file", "tool:filesystem__edit_file", "tool:filesystem__create_directory", "tool:filesystem__move_file" の場合: DENY
- resource が "tool:filesystem__read", "tool:filesystem__list", "tool:filesystem__search", "tool:filesystem__get", "tool:filesystem__directory_tree" を含む場合: PERMIT
`
};