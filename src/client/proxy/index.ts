/**
 * Proxy module barrel export
 */

export { createModelProxy } from './factory';
export type { DatabaseProxy } from './factory';
export { clearModelCache, createProxyHandler } from './handler';
export type { ProxyOptions, PerModelCallbacks } from './handler';
