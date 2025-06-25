// ============================================================================
// AEGIS - Type Index
// Central export for all type definitions
// ============================================================================

// Core types
export * from './index.js';

// MCP-specific types
export * from './mcp-types.js';

// Enforcement system types
export * from './enforcement-types.js';

// Component interface types
export * from './component-interfaces.js';

// Type guards and utilities
export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray<T = any>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

// Safe type conversion utilities
export function toRecord(value: unknown): Record<string, any> {
  if (isRecord(value)) return value;
  return {};
}

export function toString(value: unknown): string {
  if (isString(value)) return value;
  return String(value);
}

export function toNumber(value: unknown, defaultValue: number = 0): number {
  if (isNumber(value)) return value;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function toBoolean(value: unknown): boolean {
  if (isBoolean(value)) return value;
  return Boolean(value);
}

export function toArray<T = any>(value: unknown): T[] {
  if (isArray<T>(value)) return value;
  if (isDefined(value)) return [value as T];
  return [];
}