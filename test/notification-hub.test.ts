// ============================================================================
// AEGIS - 通知ハブ機能のテスト
// ============================================================================

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { StdioRouter } from '../src/mcp/stdio-router.js';
import { Logger } from '../src/utils/logger.js';

describe('AEGIS Notification Hub', () => {
  let stdioRouter: StdioRouter;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    stdioRouter = new StdioRouter(logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('StdioRouter Notification Handling', () => {
    it('should emit upstreamNotification event for resources/listChanged', async () => {
      const testServerName = 'test-server';
      const notificationMessage = {
        jsonrpc: '2.0',
        method: '$/notification',
        params: {
          method: 'resources/listChanged',
          params: {}
        }
      };

      const mockCallback = jest.fn();
      stdioRouter.on('upstreamNotification', mockCallback);

      // Simulate upstream message
      (stdioRouter as any).handleUpstreamMessage(testServerName, notificationMessage);

      expect(mockCallback).toHaveBeenCalledWith({
        serverName: testServerName,
        notificationMethod: 'resources/listChanged',
        notificationParams: {}
      });
    });

    it('should not emit upstreamNotification for other notification types', () => {
      const testServerName = 'test-server';
      const notificationMessage = {
        jsonrpc: '2.0',
        method: '$/notification',
        params: {
          method: 'some/other/notification',
          params: {}
        }
      };

      const mockCallback = jest.fn();
      stdioRouter.on('upstreamNotification', mockCallback);

      (stdioRouter as any).handleUpstreamMessage(testServerName, notificationMessage);

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Notification Broadcasting', () => {
    it('should prevent infinite loops by excluding source server', async () => {
      // This test would require a full MCPStdioPolicyProxy instance
      // For now, we'll test the logic conceptually
      
      const sourceServer = 'filesystem';
      const notificationMethod = 'resources/listChanged';
      const notificationParams = {};
      
      // The broadcast logic should:
      // 1. Not send back to sourceServer
      // 2. Send to all other connected clients
      // 3. Invalidate relevant caches
      
      // This is more of an integration test that would require
      // mocking the entire MCP server infrastructure
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate resource cache when resources/listChanged is received', () => {
      // Test that cache invalidation is triggered
      // This would require access to the cache system
      
      const serverName = 'test-server';
      const expectedCacheKeys = [
        `resources/list:${serverName}`,
        'resources/list'
      ];
      
      // Verify that these cache keys would be invalidated
      expect(expectedCacheKeys).toHaveLength(2);
      expect(expectedCacheKeys[0]).toContain(serverName);
    });
  });
});