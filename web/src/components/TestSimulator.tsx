// ============================================================================
// Test Simulator Component - Test policies with sample requests
// ============================================================================

import React, { useState } from 'react';

interface TestSimulatorProps {
  policyId: string;
  policyName: string;
}

interface TestResult {
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  reason: string;
  confidence: number;
  constraints?: string[];
  obligations?: string[];
}

const TestSimulator: React.FC<TestSimulatorProps> = ({ policyId, policyName }) => {
  const [testRequest, setTestRequest] = useState({
    agent: 'test-agent',
    action: 'read',
    resource: 'customer/123',
    time: new Date().toISOString(),
    purpose: 'testing',
    environment: {
      clientIP: '192.168.1.1',
      userAgent: 'TestClient/1.0'
    }
  });

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  // サンプルシナリオ
  const sampleScenarios = [
    {
      name: '正常な内部アクセス',
      request: {
        agent: 'internal-support-agent',
        action: 'read',
        resource: 'customer/123',
        time: '2024-01-15T10:00:00Z',
        purpose: 'customer-support'
      }
    },
    {
      name: '外部からのアクセス',
      request: {
        agent: 'external-api-client',
        action: 'read',
        resource: 'customer/456',
        time: '2024-01-15T22:00:00Z',
        purpose: 'data-sync'
      }
    },
    {
      name: '営業時間外のアクセス',
      request: {
        agent: 'internal-support-agent',
        action: 'write',
        resource: 'customer/789',
        time: '2024-01-15T23:00:00Z',
        purpose: 'emergency-update'
      }
    }
  ];

  const runTest = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/policies/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId,
          testRequest
        })
      });

      const data = await response.json();
      if (data.success) {
        setTestResult(data.data);
      }
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScenario = (scenario: any) => {
    setTestRequest({
      ...testRequest,
      ...scenario.request
    });
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'PERMIT': return '✅';
      case 'DENY': return '❌';
      case 'INDETERMINATE': return '❓';
      default: return '❔';
    }
  };

  const getDecisionClass = (decision: string) => {
    switch (decision) {
      case 'PERMIT': return 'decision-permit';
      case 'DENY': return 'decision-deny';
      case 'INDETERMINATE': return 'decision-indeterminate';
      default: return '';
    }
  };

  return (
    <div className="test-simulator">
      <h3>🧪 テストシミュレーター</h3>
      <p className="test-policy-name">対象ポリシー: {policyName}</p>

      <div className="test-scenarios">
        <h4>サンプルシナリオ:</h4>
        <div className="scenario-buttons">
          {sampleScenarios.map((scenario, index) => (
            <button
              key={index}
              className="scenario-button"
              onClick={() => loadScenario(scenario)}
            >
              {scenario.name}
            </button>
          ))}
        </div>
      </div>

      <div className="test-request-form">
        <h4>テストリクエスト:</h4>
        <div className="form-group">
          <label>エージェント:</label>
          <input
            type="text"
            value={testRequest.agent}
            onChange={(e) => setTestRequest({ ...testRequest, agent: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>アクション:</label>
          <select
            value={testRequest.action}
            onChange={(e) => setTestRequest({ ...testRequest, action: e.target.value })}
          >
            <option value="read">読み取り (read)</option>
            <option value="write">書き込み (write)</option>
            <option value="delete">削除 (delete)</option>
            <option value="execute">実行 (execute)</option>
          </select>
        </div>
        <div className="form-group">
          <label>リソース:</label>
          <input
            type="text"
            value={testRequest.resource}
            onChange={(e) => setTestRequest({ ...testRequest, resource: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>時刻:</label>
          <input
            type="datetime-local"
            value={testRequest.time.slice(0, 16)}
            onChange={(e) => setTestRequest({ ...testRequest, time: new Date(e.target.value).toISOString() })}
          />
        </div>
        <div className="form-group">
          <label>目的:</label>
          <input
            type="text"
            value={testRequest.purpose}
            onChange={(e) => setTestRequest({ ...testRequest, purpose: e.target.value })}
          />
        </div>

        <button 
          className="test-button" 
          onClick={runTest}
          disabled={loading}
        >
          {loading ? 'テスト実行中...' : '🚀 テスト実行'}
        </button>
      </div>

      {testResult && (
        <div className="test-result">
          <h4>📋 テスト結果:</h4>
          <div className={`decision-result ${getDecisionClass(testResult.decision)}`}>
            <div className="decision-header">
              <span className="decision-icon">{getDecisionIcon(testResult.decision)}</span>
              <span className="decision-text">{testResult.decision}</span>
              <span className="confidence">信頼度: {Math.round(testResult.confidence * 100)}%</span>
            </div>
            <div className="decision-reason">
              <strong>理由:</strong> {testResult.reason}
            </div>
            
            {testResult.constraints && testResult.constraints.length > 0 && (
              <div className="constraints">
                <strong>適用される制約:</strong>
                <ul>
                  {testResult.constraints.map((constraint, index) => (
                    <li key={index}>{constraint}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {testResult.obligations && testResult.obligations.length > 0 && (
              <div className="obligations">
                <strong>実行される義務:</strong>
                <ul>
                  {testResult.obligations.map((obligation, index) => (
                    <li key={index}>{obligation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TestSimulator;