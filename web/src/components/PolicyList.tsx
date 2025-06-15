// ============================================================================
// Policy List Component - Display and manage policies
// ============================================================================

import React from 'react';
import { Policy } from '../types';

interface PolicyListProps {
  policies: Policy[];
  selectedPolicy: Policy | null;
  onSelectPolicy: (policy: Policy) => void;
  onRefresh: () => void;
  onDeletePolicy?: (policyId: string) => void;
}

const PolicyList: React.FC<PolicyListProps> = ({ 
  policies, 
  selectedPolicy, 
  onSelectPolicy,
  onRefresh,
  onDeletePolicy 
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '🟢';
      case 'draft': return '🟡';
      case 'deprecated': return '🔴';
      default: return '⚪';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className="policy-list">
      <div className="list-header">
        <h3>📑 ポリシー一覧</h3>
        <button className="refresh-button" onClick={onRefresh}>
          🔄 更新
        </button>
      </div>

      <div className="list-actions">
        <button className="new-policy-button">
          ➕ 新規ポリシー
        </button>
      </div>

      <div className="policy-items">
        {policies.length === 0 ? (
          <div className="empty-state">
            ポリシーがありません
          </div>
        ) : (
          policies.map((policy) => (
            <div
              key={policy.id}
              className={`policy-item ${selectedPolicy?.id === policy.id ? 'selected' : ''}`}
            >
              <div 
                className="policy-item-content"
                onClick={() => onSelectPolicy(policy)}
              >
                <div className="policy-item-header">
                  <span className="policy-status">{getStatusIcon(policy.status)}</span>
                  <span className="policy-name">{policy.name}</span>
                </div>
                <div className="policy-item-meta">
                  <span className="policy-version">v{policy.version}</span>
                  <span className="policy-date">{formatDate(policy.lastModified)}</span>
                </div>
                {policy.tags && policy.tags.length > 0 && (
                  <div className="policy-tags">
                    {policy.tags.map((tag, index) => (
                      <span key={index} className="policy-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {onDeletePolicy && (
                <button
                  className="policy-delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`ポリシー「${policy.name}」を削除しますか？`)) {
                      onDeletePolicy(policy.id);
                    }
                  }}
                  title="削除"
                >
                  🗑️
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="list-footer">
        <div className="policy-stats">
          <div className="stat-item">
            <span className="stat-label">アクティブ:</span>
            <span className="stat-value">
              {policies.filter(p => p.status === 'active').length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">ドラフト:</span>
            <span className="stat-value">
              {policies.filter(p => p.status === 'draft').length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">合計:</span>
            <span className="stat-value">{policies.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyList;