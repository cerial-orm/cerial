/**
 * Connection manager for managing multiple database connections
 *
 * Uses a module-level connection pool to reuse WebSocket connections
 * when multiple ConnectionManager instances connect with the same config.
 * This prevents socket exhaustion from rapid open/close cycles.
 */

import { Surreal } from 'surrealdb';
import type { ConnectionConfig, ModelRegistry } from '../types';
import { clearModelCache, createModelProxy, type DatabaseProxy, type ProxyOptions } from './proxy';

/** Default connection name */
const DEFAULT_CONNECTION_NAME = 'default';

// ---------------------------------------------------------------------------
// Module-level connection pool
// ---------------------------------------------------------------------------

/** A pooled Surreal instance with reference counting */
interface PoolEntry {
  surreal: Surreal;
  refCount: number;
}

/** Active pool entries keyed by config fingerprint */
const surrealPool = new Map<string, PoolEntry>();

/** In-flight connection attempts to prevent duplicate concurrent connects */
const pendingConnections = new Map<string, Promise<Surreal>>();

/** Build a stable key from a connection config */
function poolKey(config: ConnectionConfig): string {
  const auth = config.auth ? `${config.auth.username}:${config.auth.password}` : '';

  return `${config.url}|${auth}|${config.namespace ?? ''}|${config.database ?? ''}`;
}

/** Create and authenticate a fresh Surreal connection */
async function connectSurreal(config: ConnectionConfig): Promise<Surreal> {
  const surreal = new Surreal();

  try {
    await surreal.connect(`${config.url}/rpc`);

    if (config.auth) {
      await surreal.signin({
        username: config.auth.username,
        password: config.auth.password,
      });
    }

    if (config.namespace) {
      await surreal.use({ namespace: config.namespace });
    }
    if (config.database) {
      await surreal.use({ database: config.database });
    }

    return surreal;
  } catch (error) {
    // Close the socket so it doesn't leak if any step fails
    try {
      await surreal.close();
    } catch {
      // Ignore close errors during cleanup
    }

    throw error;
  }
}

/**
 * Acquire a Surreal instance from the pool.
 * Returns an existing connection if one matches the config, otherwise creates a new one.
 * Concurrent callers with the same config wait for the first connection attempt
 * instead of opening duplicate sockets.
 */
async function acquireSurreal(config: ConnectionConfig): Promise<Surreal> {
  const key = poolKey(config);

  // Reuse existing active connection
  const existing = surrealPool.get(key);
  if (existing) {
    existing.refCount++;

    return existing.surreal;
  }

  // Wait for an in-flight connection attempt instead of creating a duplicate
  const pending = pendingConnections.get(key);
  if (pending) {
    try {
      await pending;
    } catch {
      // First attempt failed — we'll create a fresh one below
    }

    // Re-check pool after pending resolved/rejected
    const entry = surrealPool.get(key);
    if (entry) {
      entry.refCount++;

      return entry.surreal;
    }
    // Entry wasn't created (failed or was disconnected) — fall through
  }

  // Create a new connection
  const promise = connectSurreal(config);
  pendingConnections.set(key, promise);

  try {
    const surreal = await promise;
    surrealPool.set(key, { surreal, refCount: 1 });

    return surreal;
  } finally {
    pendingConnections.delete(key);
  }
}

/**
 * Release a Surreal instance back to the pool.
 * The WebSocket stays alive (idle) so the next acquirer can reuse it
 * without opening a new socket. Sockets are only closed via resetConnectionPool().
 */
function releaseSurreal(config: ConnectionConfig): void {
  const key = poolKey(config);
  const entry = surrealPool.get(key);
  if (!entry) return;

  entry.refCount--;

  if (entry.refCount <= 0) {
    // Clear model cache so the next acquirer creates fresh Model instances
    // with its own beforeQuery callbacks (each CerialClient has its own)
    clearModelCache(entry.surreal);
  }
}

/**
 * Force-close all pooled connections and reset the pool.
 * Useful for test teardown or process shutdown.
 */
export async function resetConnectionPool(): Promise<void> {
  for (const [key, entry] of surrealPool) {
    clearModelCache(entry.surreal);
    try {
      await entry.surreal.close();
    } catch {
      // Ignore close errors
    }
    surrealPool.delete(key);
  }
  pendingConnections.clear();
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

/** Connection instance */
interface ConnectionInstance<R extends ModelRegistry = ModelRegistry> {
  surreal: Surreal;
  config: ConnectionConfig;
  isConnected: boolean;
  isMigrated: boolean;
  proxy: DatabaseProxy<R>;
}

/** Connection manager options */
export interface ConnectionManagerOptions {
  /** Default connection config */
  defaultConfig?: ConnectionConfig;
  /** Proxy options (e.g., onBeforeQuery callback) */
  proxyOptions?: ProxyOptions;
}

/** Connection manager */
export class ConnectionManager<R extends ModelRegistry = ModelRegistry> {
  private connections: Map<string, ConnectionInstance<R>> = new Map();
  private registry: R;
  private defaultConfig?: ConnectionConfig;
  private proxyOptions?: ProxyOptions;

  constructor(registry: R, options?: ConnectionManagerOptions | ConnectionConfig) {
    this.registry = registry;
    // Support both old signature (defaultConfig) and new signature (options object)
    if (options && 'url' in options) {
      // Old signature: ConnectionConfig passed directly
      this.defaultConfig = options as ConnectionConfig;
    } else if (options) {
      // New signature: ConnectionManagerOptions
      const opts = options as ConnectionManagerOptions;
      this.defaultConfig = opts.defaultConfig;
      this.proxyOptions = opts.proxyOptions;
    }
  }

  /** Set proxy options (e.g., onBeforeQuery callback) */
  setProxyOptions(options: ProxyOptions): void {
    this.proxyOptions = options;
    // Note: This won't affect already-created proxies
  }

  /** Connect to database */
  async connect(config?: ConnectionConfig, name: string = DEFAULT_CONNECTION_NAME): Promise<DatabaseProxy<R>> {
    const finalConfig = config ?? this.defaultConfig;
    if (!finalConfig) {
      throw new Error('No connection config provided');
    }

    // Check if already connected
    const existing = this.connections.get(name);
    if (existing?.isConnected) {
      return existing.proxy;
    }

    // Acquire from pool (reuses existing WebSocket or creates new)
    const surreal = await acquireSurreal(finalConfig);

    // Create proxy with options (for before-query callbacks)
    const proxy = createModelProxy<R>(surreal, this.registry, this.proxyOptions);

    // Store connection
    this.connections.set(name, {
      surreal,
      config: finalConfig,
      isConnected: true,
      isMigrated: false,
      proxy,
    });

    return proxy;
  }

  /** Disconnect from database */
  async disconnect(name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;

    // Update state
    connection.isConnected = false;
    this.connections.delete(name);

    // Release to pool — socket stays alive for reuse
    releaseSurreal(connection.config);
  }

  /** Disconnect all connections */
  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.all(names.map((name) => this.disconnect(name)));
  }

  /** Get a connection by name */
  getConnection(name: string = DEFAULT_CONNECTION_NAME): ConnectionInstance | undefined {
    return this.connections.get(name);
  }

  /** Get the Surreal instance for a connection */
  getSurreal(name: string = DEFAULT_CONNECTION_NAME): Surreal | undefined {
    return this.connections.get(name)?.surreal;
  }

  /** Get the database proxy for a connection */
  getProxy(name: string = DEFAULT_CONNECTION_NAME): DatabaseProxy<R> | undefined {
    return this.connections.get(name)?.proxy;
  }

  /** Use a specific connection */
  useConnection(name: string): DatabaseProxy<R> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Connection "${name}" not found`);
    }
    if (!connection.isConnected) {
      throw new Error(`Connection "${name}" is not connected`);
    }

    return connection.proxy;
  }

  /** Check if a connection is active */
  isConnected(name: string = DEFAULT_CONNECTION_NAME): boolean {
    return this.connections.get(name)?.isConnected ?? false;
  }

  /** Get all connection names */
  getConnectionNames(): string[] {
    return [...this.connections.keys()];
  }

  /** Get the model registry */
  getRegistry(): R {
    return this.registry;
  }

  /** Check if a connection has been migrated */
  isMigrated(name: string = DEFAULT_CONNECTION_NAME): boolean {
    return this.connections.get(name)?.isMigrated ?? false;
  }

  /**
   * Run migrations for a connection
   * @param migrationStatements - Array of DEFINE statements to execute
   * @param name - Connection name (default: 'default')
   */
  async migrate(migrationStatements: string[], name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) throw new Error(`Connection "${name}" not found`);
    if (!connection.isConnected) throw new Error(`Connection "${name}" is not connected`);
    if (connection.isMigrated) return;

    // Execute all migration statements
    const query = migrationStatements.join('\n');
    await connection.surreal.query(query);

    // Mark as migrated
    connection.isMigrated = true;
  }

  /**
   * Ensure migrations are applied, running them if needed
   * @param migrationStatements - Array of DEFINE statements to execute
   * @param name - Connection name (default: 'default')
   */
  async ensureMigrated(migrationStatements: string[], name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    if (!this.isMigrated(name)) await this.migrate(migrationStatements, name);
  }

  /**
   * Set the migrated flag without running migrations
   * Useful if migrations were run externally
   */
  setMigrated(migrated: boolean, name: string = DEFAULT_CONNECTION_NAME): void {
    const connection = this.connections.get(name);
    if (connection) connection.isMigrated = migrated;
  }
}

/** Create a connection manager */
export function createConnectionManager<R extends ModelRegistry>(
  registry: R,
  options?: ConnectionManagerOptions | ConnectionConfig,
): ConnectionManager<R> {
  return new ConnectionManager<R>(registry, options);
}
