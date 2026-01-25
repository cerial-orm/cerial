/**
 * Client module barrel export
 */

// Model
export { createModel, Model } from './model';
export type { BeforeQueryCallback, ModelOptions } from './model';

// Proxy
export { clearModelCache, createModelProxy, createProxyHandler } from './proxy';
export type { DatabaseProxy, ProxyOptions } from './proxy';

// Connection manager
export { ConnectionManager, createConnectionManager } from './connection';
export type { ConnectionManagerOptions } from './connection';
