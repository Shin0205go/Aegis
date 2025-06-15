// ============================================================================
// Policy Preview Component - Real-time interpretation and analysis
// ============================================================================

import React from 'react';
import { PolicyAnalysis } from '../types';

interface PolicyPreviewProps {
  analysis: PolicyAnalysis | null;
  loading: boolean;
}

const PolicyPreview: React.FC<PolicyPreviewProps> = ({ analysis, loading }) => {
  if (loading) {
    return (
      <div className="policy-preview">
        <h3>📊 リアルタイムプレビュー</h3>
        <div className="loading">解析中...</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="policy-preview">
        <h3>📊 リアルタイムプレビュー</h3>
        <div className="empty-state">
          ポリシーを入力すると、ここに解釈結果が表示されます
        </div>
      </div>
    );
  }

  return (
    <div className="policy-preview">
      <h3>📊 リアルタイムプレビュー</h3>
      
      <div className="interpretation-section">
        <h4>🔍 ポリシー解釈</h4>
        <div className="interpretation-content">
          {analysis.interpretation && (
            <div className="interpretation-details">
              <div className="interpretation-item">
                <strong>判定タイプ:</strong> {analysis.interpretation.type || 'アクセス制御'}
              </div>
              <div className="interpretation-item">
                <strong>対象リソース:</strong> {analysis.interpretation.resources?.join(', ') || '全リソース'}
              </div>
              <div className="interpretation-item">
                <strong>時間制限:</strong> {analysis.interpretation.timeRestrictions || 'なし'}
              </div>
              <div className="interpretation-item">
                <strong>エージェント制限:</strong> {analysis.interpretation.agentRestrictions || 'なし'}
              </div>
              {analysis.interpretation.constraints && (
                <div className="interpretation-item">
                  <strong>制約:</strong>
                  <ul>
                    {analysis.interpretation.constraints.map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.interpretation.obligations && (
                <div className="interpretation-item">
                  <strong>義務:</strong>
                  <ul>
                    {analysis.interpretation.obligations.map((o: string, i: number) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <div className="suggestions-section">
          <h4>🤖 AI提案</h4>
          <ul className="suggestions-list">
            {analysis.suggestions.map((suggestion, index) => (
              <li key={index} className="suggestion-item">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.warnings && analysis.warnings.length > 0 && (
        <div className="warnings-section">
          <h4>⚠️ 警告</h4>
          <ul className="warnings-list">
            {analysis.warnings.map((warning, index) => (
              <li key={index} className="warning-item">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="confidence-section">
        <h4>📈 解析品質</h4>
        <div className="confidence-meter">
          <div className="confidence-label">明確性スコア</div>
          <div className="confidence-bar">
            <div 
              className="confidence-fill"
              style={{ 
                width: `${calculateClarityScore(analysis)}%`,
                backgroundColor: getClarityColor(calculateClarityScore(analysis))
              }}
            />
          </div>
          <div className="confidence-value">
            {calculateClarityScore(analysis)}%
          </div>
        </div>
      </div>
    </div>
  );
};

// 明確性スコアの計算
function calculateClarityScore(analysis: PolicyAnalysis): number {
  let score = 100;
  
  // 警告があれば減点
  if (analysis.warnings) {
    score -= analysis.warnings.length * 10;
  }
  
  // 提案があれば減点（改善の余地がある）
  if (analysis.suggestions) {
    score -= analysis.suggestions.length * 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

// スコアに応じた色
function getClarityColor(score: number): string {
  if (score >= 80) return '#4caf50';  // 緑
  if (score >= 60) return '#ff9800';  // オレンジ
  return '#f44336';  // 赤
}

export default PolicyPreview;