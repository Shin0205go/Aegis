/**
 * Enhanced Audit Statistics API for ODRL Hybrid Engine
 */

import { Router, Request, Response } from 'express';
import { AdvancedAuditSystem } from '../audit/advanced-audit-system';
import { logger } from '../utils/logger';

export interface AuditStatistics {
  totalDecisions: number;
  changeFromLastPeriod: number;
  engineBreakdown: {
    odrl: number;
    ai: number;
    hybrid: number;
  };
  performance: {
    odrl: EnginePerformance;
    ai: EnginePerformance;
    hybrid: EnginePerformance;
  };
  outcomes: {
    odrl: OutcomeStats;
    ai: OutcomeStats;
    hybrid: OutcomeStats;
  };
  timeline: {
    labels: string[];
    odrl: number[];
    ai: number[];
    hybrid: number[];
  };
}

interface EnginePerformance {
  avgTime: number;
  permitRate: number;
  avgConfidence: number;
  cacheHitRate?: number;
  estimatedCost?: number;
  odrlFirstHit?: number;
  costSavings?: number;
}

interface OutcomeStats {
  permit: number;
  deny: number;
  indeterminate: number;
}

export function createAuditStatisticsAPI(auditSystem: AdvancedAuditSystem): Router {
  const router = Router();

  /**
   * GET /audit/statistics - Get comprehensive audit statistics
   */
  router.get('/statistics', async (req: Request, res: Response) => {
    try {
      const { timeRange = '24h', engine = 'all' } = req.query;
      
      const endDate = new Date();
      const startDate = getStartDate(timeRange as string);
      const previousStartDate = getPreviousPeriodStartDate(timeRange as string);
      
      // Get entries for current period
      const entries = await auditSystem.getAuditEntriesForDateRange(
        startDate,
        endDate,
        engine === 'all' ? undefined : { engine: engine as string }
      );
      
      // Get entries for previous period
      const previousEntries = await auditSystem.getAuditEntriesForDateRange(
        previousStartDate,
        startDate
      );
      
      const stats = calculateStatistics(entries, previousEntries, timeRange as string);
      
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get audit statistics', error);
      res.status(500).json({ error: 'Failed to get audit statistics' });
    }
  });

  /**
   * GET /audit/recent - Get recent audit entries
   */
  router.get('/recent', async (req: Request, res: Response) => {
    try {
      const { limit = 10, engine = 'all' } = req.query;
      
      const entries = await auditSystem.getRecentAuditEntries(
        Number(limit),
        engine === 'all' ? undefined : { engine: engine as string }
      );
      
      const formattedEntries = entries.map(entry => ({
        timestamp: entry.timestamp,
        agent: entry.context.agent,
        resource: entry.context.resource,
        engine: entry.metadata?.engine || 'Unknown',
        decision: entry.decision.decision,
        responseTime: entry.processingTime,
        confidence: entry.decision.confidence || 0
      }));
      
      res.json(formattedEntries);
    } catch (error) {
      logger.error('Failed to get recent entries', error);
      res.status(500).json({ error: 'Failed to get recent entries' });
    }
  });

  /**
   * GET /audit/export - Export audit data
   */
  router.get('/export', async (req: Request, res: Response) => {
    try {
      const { format = 'json', timeRange = '24h' } = req.query;
      
      const endDate = new Date();
      const startDate = getStartDate(timeRange as string);
      
      const entries = await auditSystem.getAuditEntriesForDateRange(startDate, endDate);
      
      if (format === 'csv') {
        const csv = convertToCSV(entries);
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename=aegis-audit-${Date.now()}.csv`);
        res.send(csv);
      } else {
        res.json(entries);
      }
    } catch (error) {
      logger.error('Failed to export audit data', error);
      res.status(500).json({ error: 'Failed to export audit data' });
    }
  });

  return router;
}

function calculateStatistics(
  entries: any[], 
  previousEntries: any[], 
  timeRange: string
): AuditStatistics {
  const totalDecisions = entries.length;
  const previousTotal = previousEntries.length;
  const changeFromLastPeriod = previousTotal > 0 
    ? ((totalDecisions - previousTotal) / previousTotal) * 100 
    : 0;

  // Engine breakdown
  const engineBreakdown = {
    odrl: entries.filter(e => e.metadata?.engine === 'ODRL').length,
    ai: entries.filter(e => e.metadata?.engine === 'AI').length,
    hybrid: entries.filter(e => e.metadata?.engine === 'Hybrid').length
  };

  // Performance metrics by engine
  const performance = {
    odrl: calculateEnginePerformance(entries.filter(e => e.metadata?.engine === 'ODRL')),
    ai: calculateEnginePerformance(entries.filter(e => e.metadata?.engine === 'AI')),
    hybrid: calculateEnginePerformance(entries.filter(e => e.metadata?.engine === 'Hybrid'))
  };

  // Add specific metrics
  performance.odrl.cacheHitRate = calculateCacheHitRate(entries.filter(e => e.metadata?.engine === 'ODRL'));
  performance.ai.estimatedCost = calculateAICost(entries.filter(e => e.metadata?.engine === 'AI'));
  performance.hybrid.odrlFirstHit = calculateODRLFirstHit(entries.filter(e => e.metadata?.engine === 'Hybrid'));
  performance.hybrid.costSavings = calculateCostSavings(entries);

  // Outcomes by engine
  const outcomes = {
    odrl: calculateOutcomes(entries.filter(e => e.metadata?.engine === 'ODRL')),
    ai: calculateOutcomes(entries.filter(e => e.metadata?.engine === 'AI')),
    hybrid: calculateOutcomes(entries.filter(e => e.metadata?.engine === 'Hybrid'))
  };

  // Timeline data
  const timeline = generateTimeline(entries, timeRange);

  return {
    totalDecisions,
    changeFromLastPeriod,
    engineBreakdown,
    performance,
    outcomes,
    timeline
  };
}

function calculateEnginePerformance(entries: any[]): EnginePerformance {
  if (entries.length === 0) {
    return {
      avgTime: 0,
      permitRate: 0,
      avgConfidence: 0
    };
  }

  const avgTime = entries.reduce((sum, e) => sum + (e.processingTime || 0), 0) / entries.length;
  const permits = entries.filter(e => e.decision.decision === 'PERMIT').length;
  const permitRate = (permits / entries.length) * 100;
  const avgConfidence = entries.reduce((sum, e) => sum + (e.decision.confidence || 0), 0) / entries.length * 100;

  return {
    avgTime: Math.round(avgTime),
    permitRate: Math.round(permitRate),
    avgConfidence: Math.round(avgConfidence)
  };
}

function calculateOutcomes(entries: any[]): OutcomeStats {
  return {
    permit: entries.filter(e => e.decision.decision === 'PERMIT').length,
    deny: entries.filter(e => e.decision.decision === 'DENY').length,
    indeterminate: entries.filter(e => e.decision.decision === 'INDETERMINATE').length
  };
}

function calculateCacheHitRate(entries: any[]): number {
  if (entries.length === 0) return 0;
  const cacheHits = entries.filter(e => e.metadata?.cached === true).length;
  return Math.round((cacheHits / entries.length) * 100);
}

function calculateAICost(entries: any[]): number {
  // Estimate: $0.001 per API call
  return entries.length * 0.001;
}

function calculateODRLFirstHit(entries: any[]): number {
  if (entries.length === 0) return 0;
  const odrlFirst = entries.filter(e => e.metadata?.odrlFirst === true).length;
  return Math.round((odrlFirst / entries.length) * 100);
}

function calculateCostSavings(entries: any[]): number {
  const odrlEntries = entries.filter(e => e.metadata?.engine === 'ODRL');
  const hybridODRLFirst = entries.filter(e => 
    e.metadata?.engine === 'Hybrid' && e.metadata?.odrlFirst === true
  );
  
  // Cost saved by not using AI
  const savedCalls = odrlEntries.length + hybridODRLFirst.length;
  return savedCalls * 0.001;
}

function generateTimeline(entries: any[], timeRange: string): any {
  const intervals = getTimeIntervals(timeRange);
  const labels = intervals.map(i => formatTimeLabel(i, timeRange));
  
  const odrl = intervals.map(interval => 
    entries.filter(e => 
      e.metadata?.engine === 'ODRL' && 
      isInInterval(e.timestamp, interval)
    ).length
  );
  
  const ai = intervals.map(interval => 
    entries.filter(e => 
      e.metadata?.engine === 'AI' && 
      isInInterval(e.timestamp, interval)
    ).length
  );
  
  const hybrid = intervals.map(interval => 
    entries.filter(e => 
      e.metadata?.engine === 'Hybrid' && 
      isInInterval(e.timestamp, interval)
    ).length
  );
  
  return { labels, odrl, ai, hybrid };
}

function getStartDate(timeRange: string): Date {
  const now = new Date();
  switch (timeRange) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}

function getPreviousPeriodStartDate(timeRange: string): Date {
  const now = new Date();
  switch (timeRange) {
    case '1h':
      return new Date(now.getTime() - 2 * 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  }
}

function getTimeIntervals(timeRange: string): Date[] {
  const intervals: Date[] = [];
  const now = new Date();
  
  switch (timeRange) {
    case '1h':
      // 10-minute intervals
      for (let i = 0; i < 6; i++) {
        intervals.push(new Date(now.getTime() - (i * 10 * 60 * 1000)));
      }
      break;
    case '24h':
      // 2-hour intervals
      for (let i = 0; i < 12; i++) {
        intervals.push(new Date(now.getTime() - (i * 2 * 60 * 60 * 1000)));
      }
      break;
    case '7d':
      // Daily intervals
      for (let i = 0; i < 7; i++) {
        intervals.push(new Date(now.getTime() - (i * 24 * 60 * 60 * 1000)));
      }
      break;
    case '30d':
      // 3-day intervals
      for (let i = 0; i < 10; i++) {
        intervals.push(new Date(now.getTime() - (i * 3 * 24 * 60 * 60 * 1000)));
      }
      break;
  }
  
  return intervals.reverse();
}

function formatTimeLabel(date: Date, timeRange: string): string {
  switch (timeRange) {
    case '1h':
      return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    case '24h':
      return date.toLocaleTimeString('ja-JP', { hour: '2-digit' });
    case '7d':
    case '30d':
      return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleString('ja-JP');
  }
}

function isInInterval(timestamp: Date, intervalStart: Date): boolean {
  // Check if timestamp is within the interval
  return timestamp >= intervalStart;
}

function convertToCSV(entries: any[]): string {
  const headers = ['Timestamp', 'Agent', 'Resource', 'Action', 'Engine', 'Decision', 'Confidence', 'Processing Time', 'Policy Used'];
  const rows = entries.map(entry => [
    entry.timestamp,
    entry.context.agent,
    entry.context.resource,
    entry.context.action,
    entry.metadata?.engine || 'Unknown',
    entry.decision.decision,
    entry.decision.confidence || 0,
    entry.processingTime,
    entry.policyUsed
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}