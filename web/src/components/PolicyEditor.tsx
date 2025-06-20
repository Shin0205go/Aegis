// ============================================================================
// Policy Editor Component - Monaco Editor with templates
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Policy } from '../types';

interface PolicyEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (name: string, policy: string) => void;
  selectedPolicy: Policy | null;
}

interface ODRLPreview {
  policy?: any;
  confidence: number;
  patterns: string[];
  conversionMethod: 'pattern' | 'ai' | 'hybrid';
  aiAnalysis?: any;
  error?: string;
}

const PolicyEditor: React.FC<PolicyEditorProps> = ({ 
  value, 
  onChange, 
  onSave,
  selectedPolicy 
}) => {
  const [policyName, setPolicyName] = useState('');
  const [viewMode, setViewMode] = useState<'natural' | 'odrl'>('natural');
  const [odrlPreview, setOdrlPreview] = useState<ODRLPreview | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [showAIOptions, setShowAIOptions] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const editorRef = useRef<any>(null);
  
  // Convert natural language to ODRL when value changes
  useEffect(() => {
    if (viewMode === 'natural' && value.trim()) {
      convertToODRL();
    }
  }, [value, viewMode]);
  
  const convertToODRL = async () => {
    if (!value.trim()) {
      setOdrlPreview(null);
      return;
    }
    
    setIsConverting(true);
    try {
      const response = await fetch('/api/odrl/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          useAI,
          saveHistory: true,
          learnFromSuccess: true
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setOdrlPreview({
          policy: data.policy,
          confidence: data.confidence,
          patterns: data.patterns,
          conversionMethod: data.conversionMethod,
          aiAnalysis: data.aiAnalysis
        });
      } else {
        setOdrlPreview({
          error: data.error || 'Conversion failed',
          confidence: 0,
          patterns: [],
          conversionMethod: 'pattern'
        });
      }
    } catch (error) {
      console.error('Failed to convert to ODRL:', error);
      setOdrlPreview({
        error: 'Network error',
        confidence: 0,
        patterns: [],
        conversionMethod: 'pattern'
      });
    } finally {
      setIsConverting(false);
    }
  };

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
        <div className="view-mode-toggle">
          <button 
            className={`mode-button ${viewMode === 'natural' ? 'active' : ''}`}
            onClick={() => setViewMode('natural')}
          >
            📝 自然言語
          </button>
          <button 
            className={`mode-button ${viewMode === 'odrl' ? 'active' : ''}`}
            onClick={() => setViewMode('odrl')}
            disabled={!odrlPreview?.policy}
          >
            🔧 ODRL
          </button>
        </div>
      
      {viewMode === 'natural' && odrlPreview && (
        <div className="conversion-preview">
          <div className="preview-header">
            <h4>🔄 ODRL変換プレビュー</h4>
            {isConverting ? (
              <span className="converting">変換中...</span>
            ) : (
              <div className="conversion-info">
                <span className={`confidence ${odrlPreview.confidence > 0.8 ? 'high' : odrlPreview.confidence > 0.6 ? 'medium' : 'low'}`}>
                  信頼度: {(odrlPreview.confidence * 100).toFixed(0)}%
                </span>
                <span className="method">
                  方式: {odrlPreview.conversionMethod === 'ai' ? '🤖 AI' : 
                         odrlPreview.conversionMethod === 'hybrid' ? '🔀 ハイブリッド' : 
                         '📐 パターン'}
                </span>
              </div>
            )}
          </div>
          
          {odrlPreview.error ? (
            <div className="preview-error">
              ❌ {odrlPreview.error}
            </div>
          ) : odrlPreview.policy ? (
            <div className="preview-content">
              <div className="odrl-summary">
                <div className="summary-item">
                  <span className="label">ポリシーID:</span>
                  <span className="value">{odrlPreview.policy.uid}</span>
                </div>
                <div className="summary-item">
                  <span className="label">許可ルール:</span>
                  <span className="value">{odrlPreview.policy.permission?.length || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="label">禁止ルール:</span>
                  <span className="value">{odrlPreview.policy.prohibition?.length || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="label">義務:</span>
                  <span className="value">{odrlPreview.policy.obligation?.length || 0}</span>
                </div>
              </div>
              
              {odrlPreview.patterns && odrlPreview.patterns.length > 0 && (
                <div className="matched-patterns">
                  <h5>マッチしたパターン:</h5>
                  <ul>
                    {odrlPreview.patterns.map((pattern, index) => (
                      <li key={index}>{pattern}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {odrlPreview.conversionMethod !== 'pattern' && odrlPreview.aiAnalysis && (
                <div className="ai-analysis">
                  <h5>AI解析結果:</h5>
                  <div className="analysis-content">
                    <div className="analysis-item">
                      <span className="label">タイプ:</span>
                      <span className="value">{odrlPreview.aiAnalysis.type || '不明'}</span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">時間制限:</span>
                      <span className="value">{odrlPreview.aiAnalysis.timeRestrictions || 'なし'}</span>
                    </div>
                    <div className="analysis-item">
                      <span className="label">エージェント制限:</span>
                      <span className="value">{odrlPreview.aiAnalysis.agentRestrictions || 'なし'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
        <input
          type="text"
          placeholder="ポリシー名を入力..."
          value={policyName || selectedPolicy?.name || ''}
          onChange={(e) => setPolicyName(e.target.value)}
          className="policy-name-input"
        />
        <div className="editor-actions">
          {viewMode === 'natural' && (
            <button 
              className="ai-options-button"
              onClick={() => setShowAIOptions(!showAIOptions)}
            >
              🤖 AI設定
            </button>
          )}
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

      {showAIOptions && (
        <div className="ai-options-panel">
          <label>
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
            />
            AI変換を使用（パターンマッチング失敗時）
          </label>
        </div>
      )}
      
      <div className="editor-container">
        {viewMode === 'natural' ? (
          <Editor
            height="400px"
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
        ) : (
          <Editor
            height="400px"
            defaultLanguage="json"
            value={JSON.stringify(odrlPreview?.policy, null, 2)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
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