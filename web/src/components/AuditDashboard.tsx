// ============================================================================
// Audit Dashboard Component - Display audit logs and statistics
// ============================================================================

import React, { useState, useEffect } from 'react';

interface AuditLog {
  id: string;
  timestamp: string;
  agent: string;
  action: string;
  resource: string;
  decision: 'PERMIT' | 'DENY' | 'INDETERMINATE';
  decisionEngine: 'ODRL' | 'AI' | 'Hybrid';
  confidence: number;
  reason: string;
  evaluationTime: number;
  metadata?: Record<string, any>;
}

interface EngineStats {
  engine: string;
  totalDecisions: number;
  permits: number;
  denies: number;
  avgConfidence: number;
  avgEvaluationTime: number;
  successRate: number;
}

interface ConversionStats {
  totalConversions: number;
  patternConversions: number;
  aiConversions: number;
  hybridConversions: number;
  avgConfidence: number;
  failureRate: number;
  learnedPatterns: number;
}

const AuditDashboard: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [engineStats, setEngineStats] = useState<EngineStats[]>([]);
  const [conversionStats, setConversionStats] = useState<ConversionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [engineFilter, setEngineFilter] = useState<string>('all');

  useEffect(() => {
    fetchAuditData();
    fetchStatistics();
    const interval = setInterval(() => {
      fetchAuditData();
      fetchStatistics();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchAuditData = async () => {
    try {
      const response = await fetch(`/api/audit/logs?timeRange=${timeRange}&limit=100`);
      const data = await response.json();
      if (data.success) {
        setAuditLogs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      // Fetch engine statistics
      const engineResponse = await fetch(`/api/audit/stats/engines?timeRange=${timeRange}`);
      const engineData = await engineResponse.json();
      if (engineData.success) {
        setEngineStats(engineData.data);
      }

      // Fetch conversion statistics
      const conversionResponse = await fetch('/api/odrl/convert/stats');
      const conversionData = await conversionResponse.json();
      if (conversionData.success) {
        setConversionStats(conversionData.data);
      }
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'PERMIT': return '✅';
      case 'DENY': return '❌';
      case 'INDETERMINATE': return '❓';
      default: return '⚪';
    }
  };

  const getEngineIcon = (engine: string) => {
    switch (engine) {
      case 'ODRL': return '📐';
      case 'AI': return '🤖';
      case 'Hybrid': return '🔀';
      default: return '⚙️';
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  const filteredLogs = engineFilter === 'all' 
    ? auditLogs 
    : auditLogs.filter(log => log.decisionEngine === engineFilter);

  return (
    <div className="audit-dashboard">
      <div className="dashboard-header">
        <h2>🔍 監査ダッシュボード</h2>
        <div className="header-controls">
          <div className="time-range-selector">
            <button 
              className={timeRange === '1h' ? 'active' : ''}
              onClick={() => setTimeRange('1h')}
            >
              1時間
            </button>
            <button 
              className={timeRange === '24h' ? 'active' : ''}
              onClick={() => setTimeRange('24h')}
            >
              24時間
            </button>
            <button 
              className={timeRange === '7d' ? 'active' : ''}
              onClick={() => setTimeRange('7d')}
            >
              7日間
            </button>
            <button 
              className={timeRange === '30d' ? 'active' : ''}
              onClick={() => setTimeRange('30d')}
            >
              30日間
            </button>
          </div>
          <button className="refresh-button" onClick={() => {
            fetchAuditData();
            fetchStatistics();
          }}>
            🔄 更新
          </button>
        </div>
      </div>

      {/* Engine Statistics */}
      <div className="statistics-section">
        <h3>📊 判定エンジン統計</h3>
        <div className="stats-grid">
          {engineStats.map(stat => (
            <div key={stat.engine} className="stat-card">
              <div className="stat-header">
                <span className="engine-icon">{getEngineIcon(stat.engine)}</span>
                <span className="engine-name">{stat.engine}</span>
              </div>
              <div className="stat-metrics">
                <div className="metric">
                  <span className="label">総判定数:</span>
                  <span className="value">{stat.totalDecisions.toLocaleString()}</span>
                </div>
                <div className="metric">
                  <span className="label">許可率:</span>
                  <span className="value success">
                    {((stat.permits / stat.totalDecisions) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="metric">
                  <span className="label">拒否率:</span>
                  <span className="value danger">
                    {((stat.denies / stat.totalDecisions) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="metric">
                  <span className="label">平均信頼度:</span>
                  <span className={`value ${getConfidenceClass(stat.avgConfidence)}`}>
                    {(stat.avgConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="metric">
                  <span className="label">平均処理時間:</span>
                  <span className="value">{stat.avgEvaluationTime.toFixed(0)}ms</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion Statistics */}
      {conversionStats && (
        <div className="statistics-section">
          <h3>🔄 変換統計</h3>
          <div className="conversion-stats">
            <div className="stat-item">
              <span className="label">総変換数:</span>
              <span className="value">{conversionStats.totalConversions.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="label">パターン変換:</span>
              <span className="value">
                {conversionStats.patternConversions} 
                ({((conversionStats.patternConversions / conversionStats.totalConversions) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="stat-item">
              <span className="label">AI変換:</span>
              <span className="value">
                {conversionStats.aiConversions}
                ({((conversionStats.aiConversions / conversionStats.totalConversions) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="stat-item">
              <span className="label">ハイブリッド変換:</span>
              <span className="value">
                {conversionStats.hybridConversions}
                ({((conversionStats.hybridConversions / conversionStats.totalConversions) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="stat-item">
              <span className="label">学習済みパターン:</span>
              <span className="value">{conversionStats.learnedPatterns}</span>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      <div className="audit-logs-section">
        <div className="logs-header">
          <h3>📋 監査ログ</h3>
          <div className="engine-filter">
            <button 
              className={engineFilter === 'all' ? 'active' : ''}
              onClick={() => setEngineFilter('all')}
            >
              すべて
            </button>
            <button 
              className={engineFilter === 'ODRL' ? 'active' : ''}
              onClick={() => setEngineFilter('ODRL')}
            >
              📐 ODRL
            </button>
            <button 
              className={engineFilter === 'AI' ? 'active' : ''}
              onClick={() => setEngineFilter('AI')}
            >
              🤖 AI
            </button>
            <button 
              className={engineFilter === 'Hybrid' ? 'active' : ''}
              onClick={() => setEngineFilter('Hybrid')}
            >
              🔀 Hybrid
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">読み込み中...</div>
        ) : (
          <div className="logs-table">
            <div className="table-header">
              <div className="col-time">時刻</div>
              <div className="col-agent">エージェント</div>
              <div className="col-action">アクション</div>
              <div className="col-resource">リソース</div>
              <div className="col-decision">判定</div>
              <div className="col-engine">エンジン</div>
              <div className="col-confidence">信頼度</div>
              <div className="col-time">処理時間</div>
            </div>
            <div className="table-body">
              {filteredLogs.map(log => (
                <div key={log.id} className="log-row">
                  <div className="col-time">
                    {new Date(log.timestamp).toLocaleTimeString('ja-JP')}
                  </div>
                  <div className="col-agent">{log.agent}</div>
                  <div className="col-action">{log.action}</div>
                  <div className="col-resource">{log.resource}</div>
                  <div className="col-decision">
                    <span className={`decision ${log.decision.toLowerCase()}`}>
                      {getDecisionIcon(log.decision)} {log.decision}
                    </span>
                  </div>
                  <div className="col-engine">
                    {getEngineIcon(log.decisionEngine)} {log.decisionEngine}
                  </div>
                  <div className="col-confidence">
                    <span className={`confidence ${getConfidenceClass(log.confidence)}`}>
                      {(log.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="col-time">{log.evaluationTime}ms</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditDashboard;