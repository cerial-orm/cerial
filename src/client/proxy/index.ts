/**
 * Proxy module barrel export
 */

export type { DatabaseProxy } from './factory';
export { createModelProxy } from './factory';
export { createProxyHandler, clearModelCache } from './handler';
