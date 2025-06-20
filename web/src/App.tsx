// ============================================================================
// AEGIS Policy Management UI - Main React App
// ============================================================================

import React, { useState, useEffect } from 'react';
import PolicyEditor from './components/PolicyEditor';
import PolicyList from './components/PolicyList';
import PolicyPreview from './components/PolicyPreview';
import TestSimulator from './components/TestSimulator';
import AuditDashboard from './components/AuditDashboard';
import { Policy, PolicyAnalysis } from './types';
import './App.css';

function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<string>('');
  const [analysis, setAnalysis] = useState<PolicyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'audit'>('editor');

  // ポリシー一覧の取得
  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const response = await fetch('/api/policies');
      const data = await response.json();
      if (data.success) {
        setPolicies(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    }
  };

  // ポリシーの解析（リアルタイムプレビュー用）
  const analyzePolicy = async (policyText: string) => {
    if (!policyText.trim()) {
      setAnalysis(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/policies/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: policyText })
      });
      
      const data = await response.json();
      if (data.success) {
        setAnalysis(data.data);
      }
    } catch (error) {
      console.error('Failed to analyze policy:', error);
    } finally {
      setLoading(false);
    }
  };

  // ポリシーの保存
  const savePolicy = async (name: string, policyText: string) => {
    try {
      const response = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          policy: policyText,
          metadata: {
            createdBy: 'admin',
            tags: ['web-ui']
          }
        })
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchPolicies();
        alert('ポリシーを保存しました');
      }
    } catch (error) {
      console.error('Failed to save policy:', error);
      alert('ポリシーの保存に失敗しました');
    }
  };

  // ポリシーの選択
  const selectPolicy = (policy: Policy) => {
    setSelectedPolicy(policy);
    setEditingPolicy(policy.policy);
    analyzePolicy(policy.policy);
  };

  // ポリシーの削除
  const deletePolicy = async (policyId: string) => {
    try {
      const response = await fetch(`/api/policies/${policyId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchPolicies();
        if (selectedPolicy?.id === policyId) {
          setSelectedPolicy(null);
          setEditingPolicy('');
          setAnalysis(null);
        }
        alert('ポリシーを削除しました');
      }
    } catch (error) {
      console.error('Failed to delete policy:', error);
      alert('ポリシーの削除に失敗しました');
    }
  };

  // ポリシーのステータス切り替え
  const togglePolicyStatus = async (policyId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/policies/${policyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          updatedBy: 'admin'
        })
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchPolicies();
        const statusText = newStatus === 'active' ? '有効' : '無効';
        alert(`ポリシーを${statusText}にしました`);
      }
    } catch (error) {
      console.error('Failed to toggle policy status:', error);
      alert('ポリシーのステータス変更に失敗しました');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🛡️ AEGIS ポリシー管理コンソール</h1>
        <p>自然言語でセキュリティポリシーを定義・管理</p>
        <div className="header-tabs">
          <button 
            className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            📝 ポリシー管理
          </button>
          <button 
            className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            🔍 監査ダッシュボード
          </button>
        </div>
      </header>

      <div className="app-container">
        {activeTab === 'editor' ? (
          <>
            <div className="left-panel">
              <PolicyList 
                policies={policies}
                selectedPolicy={selectedPolicy}
                onSelectPolicy={selectPolicy}
                onRefresh={fetchPolicies}
                onDeletePolicy={deletePolicy}
                onToggleStatus={togglePolicyStatus}
              />
            </div>

            <div className="center-panel">
              <PolicyEditor
                value={editingPolicy}
                onChange={(value) => {
                  setEditingPolicy(value);
                  analyzePolicy(value);
                }}
                onSave={savePolicy}
                selectedPolicy={selectedPolicy}
              />
            </div>

            <div className="right-panel">
              <PolicyPreview 
                analysis={analysis}
                loading={loading}
              />
              
              {selectedPolicy && (
                <TestSimulator 
                  policyId={selectedPolicy.id}
                  policyName={selectedPolicy.name}
                />
              )}
            </div>
          </>
        ) : (
          <div className="full-width-panel">
            <AuditDashboard />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;