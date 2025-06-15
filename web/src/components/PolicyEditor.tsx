// ============================================================================
// Policy Editor Component - Monaco Editor with templates
// ============================================================================

import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Policy } from '../types';

interface PolicyEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (name: string, policy: string) => void;
  selectedPolicy: Policy | null;
}

const PolicyEditor: React.FC<PolicyEditorProps> = ({ 
  value, 
  onChange, 
  onSave,
  selectedPolicy 
}) => {
  const [policyName, setPolicyName] = useState('');
  const editorRef = useRef<any>(null);

  // ポリシーテンプレート
  const templates = {
    dataAccess: `【基本方針】
顧客データへのアクセスは平日9時から18時の営業時間内のみ許可する。

【アクセス許可】
- 内部エージェントのみアクセス可能
- 読み取り権限は全員に付与
- 書き込み権限は管理者のみ

【制限事項】
- 外部ネットワークからのアクセスは禁止
- 個人情報を含むデータは匿名化必須
- 一度に取得できるレコード数は1000件まで

【義務】
- すべてのアクセスログを記録
- アクセスログは90日間保存
- 異常なアクセスパターンを検知した場合は管理者に通知`,
    
    timeRestriction: `【時間制限ポリシー】
システムメンテナンスのため、以下の時間帯はアクセスを制限する。

【メンテナンス時間】
- 毎週日曜日 2:00-5:00
- 毎月第一火曜日 0:00-3:00

【例外】
- 緊急対応チームのメンバーは制限なし
- 重要度「Critical」のリクエストは許可

【通知】
- メンテナンス開始1時間前に全ユーザーに通知
- メンテナンス完了後に完了通知を送信`,
    
    apiRateLimit: `【APIレート制限ポリシー】
APIの安定性を保つため、以下のレート制限を適用する。

【レート制限】
- 通常ユーザー: 100リクエスト/分
- プレミアムユーザー: 1000リクエスト/分
- 管理者: 制限なし

【超過時の処理】
- HTTP 429 (Too Many Requests) を返却
- Retry-Afterヘッダーで次回リクエスト可能時刻を通知

【義務】
- レート制限の適用状況を監視
- 頻繁に制限に達するユーザーを月次レポートで報告`
  };

  const handleSave = () => {
    const name = policyName || selectedPolicy?.name || '新規ポリシー';
    onSave(name, value);
  };

  const insertTemplate = (templateKey: keyof typeof templates) => {
    if (editorRef.current) {
      const editor = editorRef.current;
      const position = editor.getPosition();
      editor.executeEdits('', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: templates[templateKey]
      }]);
    }
  };

  return (
    <div className="policy-editor">
      <div className="editor-header">
        <input
          type="text"
          placeholder="ポリシー名を入力..."
          value={policyName || selectedPolicy?.name || ''}
          onChange={(e) => setPolicyName(e.target.value)}
          className="policy-name-input"
        />
        <div className="editor-actions">
          <div className="template-dropdown">
            <button className="template-button">テンプレート ▼</button>
            <div className="template-menu">
              <button onClick={() => insertTemplate('dataAccess')}>
                📊 データアクセス制御
              </button>
              <button onClick={() => insertTemplate('timeRestriction')}>
                🕐 時間制限
              </button>
              <button onClick={() => insertTemplate('apiRateLimit')}>
                🚦 APIレート制限
              </button>
            </div>
          </div>
          <button className="save-button" onClick={handleSave}>
            💾 保存
          </button>
        </div>
      </div>

      <div className="editor-container">
        <Editor
          height="600px"
          defaultLanguage="markdown"
          value={value}
          onChange={(value) => onChange(value || '')}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>

      <div className="editor-tips">
        <h4>💡 ポリシー記述のヒント</h4>
        <ul>
          <li>【】で囲んでセクションを分けると読みやすくなります</li>
          <li>具体的な時間や数値を指定しましょう</li>
          <li>「外部」「内部」などの用語は明確に定義しましょう</li>
          <li>義務事項には期限や頻度を明記しましょう</li>
        </ul>
      </div>
    </div>
  );
};

export default PolicyEditor;