/**
 * Proxy module barrel export
 */

export type { DatabaseProxy } from './factory';
export { createModelProxy } from './factory';
export type { PerModelCallbacks, ProxyOptions } from './handler';
export { clearModelCache, createProxyHandler } from './handler';
