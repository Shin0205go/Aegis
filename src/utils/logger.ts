// ============================================================================
// AEGIS - ロガーユーティリティ
// ============================================================================

import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor(level: string = 'info') {
    this.logger = winston.createLogger({
      level: level,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'aegis' },
      transports: [
        // コンソール出力
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
              let msg = `${timestamp} [${service}] ${level}: ${message}`;
              if (Object.keys(metadata).length > 0) {
                msg += ` ${JSON.stringify(metadata)}`;
              }
              return msg;
            })
          )
        })
      ]
    });

    // ファイル出力（プロダクション環境）
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
      this.logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
    }
  }

  info(message: string, metadata?: any) {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: any) {
    this.logger.warn(message, metadata);
  }

  error(message: string, metadata?: any) {
    this.logger.error(message, metadata);
  }

  debug(message: string, metadata?: any) {
    this.logger.debug(message, metadata);
  }

  // AEGIS専用ログメソッド
  decision(agentId: string, decision: string, resource: string, reason: string) {
    this.info('Access Decision', {
      type: 'DECISION',
      agentId,
      decision,
      resource,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  violation(agentId: string, resource: string, reason: string) {
    this.warn('Policy Violation', {
      type: 'VIOLATION',
      agentId,
      resource,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  audit(action: string, details: any) {
    this.info('Audit Log', {
      type: 'AUDIT',
      action,
      details,
      timestamp: new Date().toISOString()
    });
  }
}