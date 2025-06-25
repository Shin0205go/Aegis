// ============================================================================
// Test Helper Types
// テストで使用する型定義
// ============================================================================

import type { MCPStdioPolicyProxy } from '../../mcp/stdio-proxy';
import type { MCPHttpPolicyProxy } from '../../mcp/http-proxy';
import type { EnforcementSystem } from '../../core/enforcement';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Express } from 'express';

/**
 * テスト用のMCPStdioPolicyProxy拡張型
 * privateやprotectedメンバーにアクセスするため、インターセクション型を使用
 */
export type TestableMCPStdioPolicyProxy = MCPStdioPolicyProxy & {
  enforcementSystem: EnforcementSystem;
  applyConstraints(data: unknown, constraints: string[]): Promise<unknown>;
  executeObligations(obligations: string[], request: unknown): Promise<void>;
  
  // レガシーメソッド（存在しないことを確認するため）
  anonymizeData?: unknown;
  sendNotification?: unknown;
  scheduleDataDeletion?: unknown;
  generateAccessReport?: unknown;
};

/**
 * テスト用のMCPHttpPolicyProxy拡張型
 * privateやprotectedメンバーにアクセスするため、インターセクション型を使用
 */
export type TestableMCPHttpPolicyProxy = MCPHttpPolicyProxy & {
  enforcementSystem: EnforcementSystem;
  applyConstraints(data: unknown, constraints: string[]): Promise<unknown>;
  executeObligations(obligations: string[], request: unknown): Promise<void>;
  app: Express;
  server: Server;
  
  // レガシーメソッド（存在しないことを確認するため）
  anonymizeData?: unknown;
  sendNotification?: unknown;
  scheduleDataDeletion?: unknown;
  generateAccessReport?: unknown;
};

/**
 * Express Listen メソッドのモック型
 */
export interface MockExpressListen {
  (port: number, callback: () => void): { on: jest.Mock };
}