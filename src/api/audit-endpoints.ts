// ============================================================================
// AEGIS - Audit API Endpoints
// 監査・レポート機能のAPIエンドポイント
// ============================================================================

import express, { Router, Request, Response } from 'express';
import { AdvancedAuditSystem } from '../audit/advanced-audit-system.js';
import { AuditDashboardDataProvider } from '../audit/audit-dashboard-data.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('audit-api');

export interface AuditAPIOptions {
  auditSystem: AdvancedAuditSystem;
  dashboardProvider: AuditDashboardDataProvider;
}

export function createAuditEndpoints(options: AuditAPIOptions): Router {
  const router = express.Router();
  const { auditSystem, dashboardProvider } = options;

  /**
   * GET /audit/dashboard
   * ダッシュボード用メトリクスを取得
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const metrics = await dashboardProvider.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      logger.error('Failed to get dashboard metrics', error);
      res.status(500).json({ error: 'Failed to retrieve dashboard metrics' });
    }
  });

  /**
   * GET /audit/reports/compliance
   * コンプライアンスレポートを生成
   */
  router.get('/reports/compliance', async (req: Request, res: Response) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
      
      const report = await auditSystem.generateComplianceReport({
        start: startTime,
        end: endTime
      });
      
      res.json(report);
    } catch (error) {
      logger.error('Failed to generate compliance report', error);
      res.status(500).json({ error: 'Failed to generate compliance report' });
    }
  });

  /**
   * GET /audit/reports/anomalies
   * 異常検知レポートを取得
   */
  router.get('/reports/anomalies', async (req: Request, res: Response) => {
    try {
      const threshold = parseFloat(req.query.threshold as string) || 0.1;
      const anomalies = await auditSystem.detectAnomalousAccess(threshold);
      res.json(anomalies);
    } catch (error) {
      logger.error('Failed to detect anomalies', error);
      res.status(500).json({ error: 'Failed to detect anomalies' });
    }
  });

  /**
   * GET /audit/reports/patterns
   * アクセスパターン分析レポートを生成
   */
  router.get('/reports/patterns', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
      
      const analysis = await auditSystem.createAccessPatternAnalysis({
        start: startTime,
        end: endTime
      });
      
      res.json(analysis);
    } catch (error) {
      logger.error('Failed to create pattern analysis', error);
      res.status(500).json({ error: 'Failed to create pattern analysis' });
    }
  });

  /**
   * GET /audit/export
   * 監査ログをエクスポート
   */
  router.get('/export', async (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string || 'JSON').toUpperCase() as 'JSON' | 'CSV';
      const hours = parseInt(req.query.hours as string) || 24;
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
      
      const data = await auditSystem.exportAuditLogs(format, {
        start: startTime,
        end: endTime
      });
      
      // Content-Typeとファイル名を設定
      if (format === 'CSV') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit_export_${Date.now()}.csv"`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit_export_${Date.now()}.json"`);
      }
      
      res.send(data);
    } catch (error) {
      logger.error('Failed to export audit logs', error);
      res.status(500).json({ error: 'Failed to export audit logs' });
    }
  });

  /**
   * GET /audit/stats
   * システム統計情報を取得
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = auditSystem.getSystemStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get system stats', error);
      res.status(500).json({ error: 'Failed to get system stats' });
    }
  });

  /**
   * POST /audit/alerts/:alertId/acknowledge
   * アラートを確認済みにする
   */
  router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      dashboardProvider.acknowledgeAlert(alertId);
      res.json({ success: true, alertId });
    } catch (error) {
      logger.error('Failed to acknowledge alert', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  });

  /**
   * GET /audit/realtime
   * リアルタイムメトリクスを取得（WebSocket代替）
   */
  router.get('/realtime', async (req: Request, res: Response) => {
    try {
      const metrics = await dashboardProvider.getDashboardMetrics();
      res.json(metrics.realtime);
    } catch (error) {
      logger.error('Failed to get realtime metrics', error);
      res.status(500).json({ error: 'Failed to get realtime metrics' });
    }
  });

  /**
   * GET /audit/reports/latest
   * 最新のコンプライアンスレポートを取得
   */
  router.get('/reports/latest', async (req: Request, res: Response) => {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1時間前
      const report = await auditSystem.generateComplianceReport({ start: startTime, end: endTime });
      res.json(report);
    } catch (error) {
      logger.error('Failed to get latest compliance report', error);
      res.status(500).json({ error: 'Failed to get latest compliance report' });
    }
  });

  /**
   * GET /audit/requests
   * リクエスト一覧を取得（ページネーション対応）
   */
  router.get('/requests', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const filter = req.query.filter as string;
      
      const allEntries = auditSystem.getAuditEntries();
      
      // フィルタリング
      let filteredEntries = allEntries;
      if (filter) {
        filteredEntries = allEntries.filter(entry => {
          const searchStr = filter.toLowerCase();
          return entry.context.agent.toLowerCase().includes(searchStr) ||
                 entry.context.resource.toLowerCase().includes(searchStr) ||
                 entry.decision.reason.toLowerCase().includes(searchStr);
        });
      }
      
      // ソート（最新順）
      filteredEntries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      // ページネーション
      const pagedEntries = filteredEntries.slice(offset, offset + limit);
      
      res.json({
        total: filteredEntries.length,
        offset,
        limit,
        requests: pagedEntries.map(entry => ({
          id: entry.id,
          timestamp: entry.timestamp,
          agent: entry.context.agent,
          action: entry.context.action,
          resource: entry.context.resource,
          decision: entry.decision.decision,
          outcome: entry.outcome,
          processingTime: entry.processingTime,
          reason: entry.decision.reason,
          riskLevel: entry.decision.riskLevel,
          policy: entry.policyUsed,
          transport: entry.metadata?.transport || 'unknown'
        }))
      });
    } catch (error) {
      logger.error('Failed to get requests', error);
      res.status(500).json({ error: 'Failed to get requests' });
    }
  });

  /**
   * GET /audit/requests/:id
   * 特定のリクエストの詳細を取得
   */
  router.get('/requests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const entries = auditSystem.getAuditEntries();
      const entry = entries.find(e => e.id === id);
      
      if (!entry) {
        return res.status(404).json({ error: 'Request not found' });
      }
      
      res.json(entry);
    } catch (error) {
      logger.error('Failed to get request details', error);
      res.status(500).json({ error: 'Failed to get request details' });
    }
  });

  return router;
}