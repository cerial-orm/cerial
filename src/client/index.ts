/**
 * Client module barrel export
 */

export type { TransactionState } from './cerial-transaction';
export { CerialTransaction, createCerialTransactionProxy } from './cerial-transaction';
export type { ConnectionManagerOptions } from './connection';
// Connection manager
export { ConnectionManager, createConnectionManager, resetConnectionPool } from './connection';
export type { BeforeQueryCallback, ModelOptions } from './model';
// Model
export { createModel, Model } from './model';
export type { DatabaseProxy, PerModelCallbacks, ProxyOptions } from './proxy';
// Proxy
export { clearModelCache, createModelProxy, createProxyHandler } from './proxy';
