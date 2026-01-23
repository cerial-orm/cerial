/**
 * Client module barrel export
 */

// Model
export { Model, createModel } from './model';

// Proxy
export type { DatabaseProxy } from './proxy';
export { createModelProxy, createProxyHandler, clearModelCache } from './proxy';

// Connection manager
export { ConnectionManager, createConnectionManager } from './connection';
