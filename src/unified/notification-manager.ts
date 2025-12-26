// ============================================================================
// 統一MCPアーキテクチャ - 動的通知マネージャー
// list_changed通知とリソースサブスクリプション管理
// ============================================================================

import { EventEmitter } from 'events';
import type {
  MCPNotificationType,
  NotificationMessage,
  ResourceSubscription,
  ConnectedClient,
  ClientCapabilities
} from './types.js';
import { Logger } from '../utils/logger.js';

/**
 * 動的通知マネージャー
 *
 * MCP仕様に準拠した通知メカニズムを提供：
 * - tools/list_changed: ツールリストの変更通知
 * - resources/list_changed: リソースリストの変更通知
 * - prompts/list_changed: プロンプトリストの変更通知
 * - resources/updated: 個別リソースの更新通知
 * - roots/list_changed: クライアントのルートディレクトリ変更
 */
export class DynamicNotificationManager extends EventEmitter {
  private logger: Logger;
  private clients: Map<string, ConnectedClient> = new Map();
  private subscriptions: Map<string, ResourceSubscription[]> = new Map();
  private notificationQueue: NotificationMessage[] = [];
  private isProcessing = false;
  private stats = {
    notificationsSent: 0,
    notificationsFailed: 0,
    activeSubscriptions: 0
  };

  constructor(logger?: Logger) {
    super();
    this.logger = logger || new Logger('info');
  }

  /**
   * クライアントを登録
   */
  registerClient(client: ConnectedClient): void {
    this.clients.set(client.id, client);
    this.logger.info(`Client registered: ${client.id} (${client.type})`);
    this.emit('clientRegistered', client);
  }

  /**
   * クライアントの登録解除
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      // クライアントのサブスクリプションをクリーンアップ
      this.cleanupClientSubscriptions(clientId);
      this.logger.info(`Client unregistered: ${clientId}`);
      this.emit('clientUnregistered', client);
    }
  }

  /**
   * クライアント能力を更新
   */
  updateClientCapabilities(clientId: string, capabilities: Partial<ClientCapabilities>): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.capabilities = { ...client.capabilities, ...capabilities };
      this.logger.debug(`Client capabilities updated: ${clientId}`, capabilities);
    }
  }

  /**
   * クライアントのルートを更新（roots/list_changed受信時）
   */
  updateClientRoots(clientId: string, roots: string[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.roots = roots;
      client.lastActivity = new Date();
      this.logger.info(`Client roots updated: ${clientId}`, { roots });
      this.emit('rootsChanged', { clientId, roots });
    }
  }

  // ============================================================================
  // 通知送信メソッド
  // ============================================================================

  /**
   * ツールリスト変更を通知
   */
  async notifyToolsListChanged(): Promise<void> {
    await this.broadcastNotification({
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed'
    });
    this.logger.info('Sent tools/list_changed notification to all clients');
  }

  /**
   * リソースリスト変更を通知
   */
  async notifyResourcesListChanged(): Promise<void> {
    await this.broadcastNotification({
      jsonrpc: '2.0',
      method: 'notifications/resources/list_changed'
    });
    this.logger.info('Sent resources/list_changed notification to all clients');
  }

  /**
   * プロンプトリスト変更を通知
   */
  async notifyPromptsListChanged(): Promise<void> {
    await this.broadcastNotification({
      jsonrpc: '2.0',
      method: 'notifications/prompts/list_changed'
    });
    this.logger.info('Sent prompts/list_changed notification to all clients');
  }

  /**
   * 個別リソースの更新を通知
   */
  async notifyResourceUpdated(uri: string): Promise<void> {
    const subscribers = this.subscriptions.get(uri) || [];

    for (const subscription of subscribers) {
      await this.sendNotificationToClient(subscription.clientId, {
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: { uri }
      });
      subscription.lastUpdate = new Date();
    }

    this.logger.info(`Sent resources/updated notification for ${uri} to ${subscribers.length} subscribers`);
  }

  /**
   * 全クライアントに一括通知
   */
  async notifyAllChanged(): Promise<void> {
    await Promise.all([
      this.notifyToolsListChanged(),
      this.notifyResourcesListChanged(),
      this.notifyPromptsListChanged()
    ]);
  }

  // ============================================================================
  // サブスクリプション管理
  // ============================================================================

  /**
   * リソースサブスクリプションを追加
   */
  subscribeToResource(uri: string, clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client?.capabilities.supportsSubscriptions) {
      this.logger.warn(`Client ${clientId} does not support subscriptions`);
      return;
    }

    if (!this.subscriptions.has(uri)) {
      this.subscriptions.set(uri, []);
    }

    const existing = this.subscriptions.get(uri)!
      .find(s => s.clientId === clientId);

    if (!existing) {
      this.subscriptions.get(uri)!.push({
        uri,
        clientId,
        subscribedAt: new Date()
      });
      this.stats.activeSubscriptions++;
      this.logger.info(`Client ${clientId} subscribed to ${uri}`);
    }
  }

  /**
   * リソースサブスクリプションを解除
   */
  unsubscribeFromResource(uri: string, clientId: string): void {
    const subs = this.subscriptions.get(uri);
    if (subs) {
      const index = subs.findIndex(s => s.clientId === clientId);
      if (index !== -1) {
        subs.splice(index, 1);
        this.stats.activeSubscriptions--;
        this.logger.info(`Client ${clientId} unsubscribed from ${uri}`);
      }
    }
  }

  /**
   * クライアントの全サブスクリプションをクリーンアップ
   */
  private cleanupClientSubscriptions(clientId: string): void {
    for (const [uri, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.clientId === clientId);
      if (index !== -1) {
        subs.splice(index, 1);
        this.stats.activeSubscriptions--;
      }
      if (subs.length === 0) {
        this.subscriptions.delete(uri);
      }
    }
  }

  // ============================================================================
  // 内部メソッド
  // ============================================================================

  /**
   * 全クライアントに通知をブロードキャスト
   */
  private async broadcastNotification(notification: NotificationMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [clientId, client] of this.clients) {
      // list_changed対応クライアントのみに送信
      if (client.capabilities.supportsListChanged) {
        promises.push(this.sendNotificationToClient(clientId, notification));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * 特定のクライアントに通知を送信
   */
  private async sendNotificationToClient(
    clientId: string,
    notification: NotificationMessage
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      this.logger.warn(`Client not found: ${clientId}`);
      return;
    }

    try {
      // 通知イベントを発火（実際の送信はイベントリスナーが処理）
      this.emit('sendNotification', {
        clientId,
        client,
        notification
      });
      this.stats.notificationsSent++;
    } catch (error) {
      this.stats.notificationsFailed++;
      this.logger.error(`Failed to send notification to ${clientId}:`, error);
    }
  }

  // ============================================================================
  // 統計・状態取得
  // ============================================================================

  /**
   * 接続中のクライアント一覧を取得
   */
  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * 特定のクライアント情報を取得
   */
  getClient(clientId: string): ConnectedClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * サブスクリプション一覧を取得
   */
  getSubscriptions(): Map<string, ResourceSubscription[]> {
    return new Map(this.subscriptions);
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    connectedClients: number;
    notificationsSent: number;
    notificationsFailed: number;
    activeSubscriptions: number;
    clientsByType: Record<string, number>;
  } {
    const clientsByType: Record<string, number> = {};
    for (const client of this.clients.values()) {
      clientsByType[client.type] = (clientsByType[client.type] || 0) + 1;
    }

    return {
      connectedClients: this.clients.size,
      notificationsSent: this.stats.notificationsSent,
      notificationsFailed: this.stats.notificationsFailed,
      activeSubscriptions: this.stats.activeSubscriptions,
      clientsByType
    };
  }

  /**
   * クライアントタイプを検出（ユーザーエージェントや接続情報から推測）
   */
  detectClientType(userAgent?: string, metadata?: Record<string, any>): 'copilot' | 'gemini' | 'claude' | 'unknown' {
    if (!userAgent && !metadata) return 'unknown';

    const ua = userAgent?.toLowerCase() || '';
    const name = metadata?.clientName?.toLowerCase() || '';

    if (ua.includes('copilot') || name.includes('copilot') || name.includes('vscode')) {
      return 'copilot';
    }
    if (ua.includes('gemini') || name.includes('gemini')) {
      return 'gemini';
    }
    if (ua.includes('claude') || name.includes('claude') || name.includes('anthropic')) {
      return 'claude';
    }

    return 'unknown';
  }

  /**
   * デフォルトのクライアント能力を取得
   */
  getDefaultCapabilities(clientType: 'copilot' | 'gemini' | 'claude' | 'unknown'): ClientCapabilities {
    switch (clientType) {
      case 'gemini':
        // Gemini CLIは最も高い対応状況
        return {
          supportsListChanged: true,
          supportsRoots: true,
          supportsSubscriptions: true,
          supportedPromptTemplates: true
        };
      case 'copilot':
        // VS Code/Copilotも高い対応状況
        return {
          supportsListChanged: true,
          supportsRoots: true,
          supportsSubscriptions: true,
          supportedPromptTemplates: true
        };
      case 'claude':
        // Claude Codeは限定的（改善中）
        return {
          supportsListChanged: false, // 手動リロード必要な場合あり
          supportsRoots: false,
          supportsSubscriptions: false,
          supportedPromptTemplates: true
        };
      default:
        return {
          supportsListChanged: false,
          supportsRoots: false,
          supportsSubscriptions: false,
          supportedPromptTemplates: false
        };
    }
  }
}

export default DynamicNotificationManager;
