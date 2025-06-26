// テスト環境のセットアップ

// TextEncoderとTextDecoderのポリフィル
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// fetchのモック
global.fetch = jest.fn();

// consoleメソッドのモック（ノイズを減らすため）
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// タイムアウトを延長（AI処理のテスト用）
jest.setTimeout(30000);

// 共通のモック設定
beforeEach(() => {
  jest.clearAllMocks();
});

// expect拡張
expect.extend({
  closeTo(received: number, expected: number, precision: number = 2) {
    const pass = Math.abs(received - expected) < Math.pow(10, -precision);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be close to ${expected}`
          : `expected ${received} to be close to ${expected}`,
    };
  },
  toEndWith(received: string, expected: string) {
    const pass = received.endsWith(expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to end with ${expected}`
          : `expected ${received} to end with ${expected}`,
    };
  },
});

// TypeScript用の型定義
declare global {
  namespace jest {
    interface Matchers<R> {
      toEndWith(expected: string): R;
      closeTo(expected: number, precision?: number): R;
    }
  }
}