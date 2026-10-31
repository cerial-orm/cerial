/**
 * Connection manager for managing multiple database connections
 *
 * Uses a module-level connection pool to reuse WebSocket connections
 * when multiple ConnectionManager instances connect with the same config.
 * This prevents socket exhaustion from rapid open/close cycles.
 */

import { Surreal } from 'surrealdb';
import { CerialConnectionError, CerialNotConnectedError } from '../errors';
import type { ConnectionConfig, ModelRegistry } from '../types';
import type { EndableLive } from './live';
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

/** Check if a URL uses the WebSocket scheme */
function isWsUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

/** Derive a WebSocket config from an HTTP config (same host/port/auth) */
function deriveWsConfig(httpConfig: ConnectionConfig): ConnectionConfig {
  const wsUrl = httpConfig.url.replace(/^http(s?):\/\//, 'ws$1://');

  return { ...httpConfig, url: wsUrl };
}

/**
 * Reconnect bounds for a pooled socket. The SDK default waits 2s, 4s, 8s, 16s and 32s, so a call made
 * while it retries hangs for about a minute before failing. A server that restarts is back within
 * seconds, so retry five times (0.5s, 1s, then 2s each, about 7.5s in all): a socket that has not
 * returned by then is not coming back, and the caller gets the connection error instead of a minute of
 * silence.
 * A reconnected socket has lost its session, so `isUsable` still decides whether it may be handed out.
 */
const RECONNECT_OPTIONS = {
  attempts: 5,
  retryDelay: 250,
  retryDelayMax: 2000,
  retryDelayMultiplier: 2,
  retryDelayJitter: 0.1,
} as const;

/** Create and authenticate a fresh Surreal connection */
async function connectSurreal(config: ConnectionConfig): Promise<Surreal> {
  const surreal = new Surreal();

  try {
    await surreal.connect(`${config.url}/rpc`, { reconnect: { enabled: true, ...RECONNECT_OPTIONS } });

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
 * Probe a socket with a round-trip. `status` stays `connected` after the server
 * drops the session, so only a query tells a live socket from a dead one.
 */
async function isUsable(surreal: Surreal): Promise<boolean> {
  try {
    await surreal.query('RETURN 1;');

    return true;
  } catch {
    return false;
  }
}

/**
 * Hand out the pooled socket for a key if it answers a probe.
 * A dead socket is dead for every holder, so its entry is dropped and the caller opens a new one.
 */
async function takeIfUsable(key: string): Promise<Surreal | null> {
  const entry = surrealPool.get(key);
  if (!entry) return null;

  if (await isUsable(entry.surreal)) {
    // The entry may have been dropped by another acquirer while the probe was in flight
    if (surrealPool.get(key) !== entry) return null;
    entry.refCount++;

    return entry.surreal;
  }

  if (surrealPool.get(key) === entry) await closePooledSurreal(key, entry);

  return null;
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
  const existing = await takeIfUsable(key);
  if (existing) return existing;

  // Wait for an in-flight connection attempt instead of creating a duplicate
  const pending = pendingConnections.get(key);
  if (pending) {
    try {
      await pending;
    } catch {
      // First attempt failed — we'll create a fresh one below
    }

    // Re-check pool after pending resolved/rejected
    const entry = await takeIfUsable(key);
    if (entry) return entry;
    // Entry wasn't created (failed, disconnected or dead) — fall through
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
 * Close a pooled connection and drop its pool entry.
 * Close errors are ignored: the entry must go regardless.
 */
async function closePooledSurreal(key: string, entry: PoolEntry): Promise<void> {
  // Clear model cache so the next acquirer creates fresh Model instances
  // with its own beforeQuery callbacks (each CerialClient has its own)
  clearModelCache(entry.surreal);
  // Delete before awaiting the close so a concurrent acquire cannot be handed a closing socket
  surrealPool.delete(key);
  try {
    await entry.surreal.close();
  } catch {
    // Ignore close errors
  }
}

/**
 * Release a Surreal instance back to the pool.
 * While other holders remain the socket stays open. The last release closes
 * the socket and removes the pool entry, so the next acquirer opens a new one.
 */
async function releaseSurreal(config: ConnectionConfig, surreal: Surreal): Promise<void> {
  const key = poolKey(config);
  const entry = surrealPool.get(key);
  // A holder of a socket that was discarded as dead must not release its replacement
  if (!entry || entry.surreal !== surreal) return;

  entry.refCount--;

  if (entry.refCount <= 0) await closePooledSurreal(key, entry);
}

/**
 * Force-close all pooled connections and reset the pool.
 * Useful for test teardown or process shutdown.
 */
export async function resetConnectionPool(): Promise<void> {
  for (const [key, entry] of surrealPool) {
    await closePooledSurreal(key, entry);
  }
  pendingConnections.clear();
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

/** Connection instance */
interface ConnectionInstance<R extends ModelRegistry = ModelRegistry> {
  surreal: Surreal;
  wsSurreal: Surreal | null;
  wsConfig: ConnectionConfig | null;
  config: ConnectionConfig;
  isConnected: boolean;
  proxy: DatabaseProxy<R>;
  httpClosed: boolean;
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
  /** Open live handles per connection name, so a deliberate disconnect can end them. */
  private liveHandles: Map<string, Set<EndableLive>> = new Map();

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
      throw new CerialConnectionError('No connection config provided');
    }

    const existing = this.connections.get(name);
    if (existing?.isConnected) return existing.proxy;

    const wsOnly = isWsUrl(finalConfig.url);

    let surreal: Surreal;
    let wsSurreal: Surreal | null = null;
    let wsConfig: ConnectionConfig | null = null;
    let proxySurreal: Surreal;

    if (wsOnly) {
      // WS URL → single WS connection for everything
      surreal = await acquireSurreal(finalConfig);
      proxySurreal = surreal;
    } else {
      // HTTP URL → HTTP primary + auto-derived WS secondary
      const derivedWsConfig = deriveWsConfig(finalConfig);
      wsConfig = derivedWsConfig;
      [surreal, wsSurreal] = await Promise.all([acquireSurreal(finalConfig), acquireSurreal(derivedWsConfig)]);
      // Proxy uses WS surreal — always alive, even after closeHttp()
      proxySurreal = wsSurreal;
    }

    const proxy = createModelProxy<R>(proxySurreal, this.registry, this.proxyOptions);

    this.connections.set(name, {
      surreal,
      wsSurreal,
      wsConfig,
      config: finalConfig,
      isConnected: true,
      proxy,
      httpClosed: false,
    });

    return proxy;
  }

  /**
   * Track an open live handle so `disconnect()` ends it cleanly, also when the socket stays open for
   * another holder. Returns the function that forgets it.
   */
  trackLive(handle: EndableLive, name: string = DEFAULT_CONNECTION_NAME): () => void {
    const handles = this.liveHandles.get(name) ?? new Set<EndableLive>();
    handles.add(handle);
    this.liveHandles.set(name, handles);

    return () => {
      handles.delete(handle);
    };
  }

  /** Disconnect from database */
  async disconnect(name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;

    // Before the socket is released, so a handle ends as a deliberate stop and not as a lost connection
    await Promise.all([...(this.liveHandles.get(name) ?? [])].map((handle) => handle._endForDisconnect()));
    connection.isConnected = false;
    this.connections.delete(name);

    // Release HTTP from pool (if not already closed via closeHttp)
    if (!connection.httpClosed) {
      await releaseSurreal(connection.config, connection.surreal);
    }

    // Release WS from pool (dual mode only)
    if (connection.wsConfig && connection.wsSurreal) {
      await releaseSurreal(connection.wsConfig, connection.wsSurreal);
    }
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

  /**
   * The primary Surreal instance: the HTTP socket when the URL is `http(s)://`, the single socket
   * for a `ws(s)://` URL. After `closeHttp()` it falls back to the WS socket. It is not the socket
   * the model proxy queries on in HTTP mode; use `getDdlSurreal()` or `getQuerySurreal()` for that.
   */
  getSurreal(name: string = DEFAULT_CONNECTION_NAME): Surreal | undefined {
    const connection = this.connections.get(name);
    if (!connection) return undefined;
    if (connection.httpClosed && connection.wsSurreal) return connection.wsSurreal;

    return connection.surreal;
  }

  /**
   * The socket the model proxy queries on: the derived WS socket in HTTP mode, the single socket
   * in WS mode. It never changes with `closeHttp()` / `reopenHttp()`. A migration applied on one
   * session while the queries that depend on it run on another is an ordering callers cannot
   * reason about, so DDL and DML share this socket.
   */
  private getProxySurreal(name: string): Surreal | undefined {
    const connection = this.connections.get(name);
    if (!connection) return undefined;

    return connection.wsSurreal ?? connection.surreal;
  }

  /** The socket migrations run on. Same instance as the model proxy and `getQuerySurreal()`. */
  getDdlSurreal(name: string = DEFAULT_CONNECTION_NAME): Surreal | undefined {
    return this.getProxySurreal(name);
  }

  /** The socket raw queries run on. Same instance as the model proxy and `getDdlSurreal()`. */
  getQuerySurreal(name: string = DEFAULT_CONNECTION_NAME): Surreal | undefined {
    return this.getProxySurreal(name);
  }

  /** The WS socket for transactions: the derived WS socket in HTTP mode, the single socket in WS mode. */
  getTransactionSurreal(name: string = DEFAULT_CONNECTION_NAME): Surreal | undefined {
    return this.getProxySurreal(name);
  }

  /** Close the HTTP connection, falling back to WS for all operations. No-op if WS-only. */
  async closeHttp(name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection || !connection.wsSurreal) return;
    if (connection.httpClosed) return;

    connection.httpClosed = true;
    await releaseSurreal(connection.config, connection.surreal);
  }

  /** Reopen the HTTP connection after closeHttp(). No-op if WS-only. */
  async reopenHttp(name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection || !connection.wsSurreal) return;
    if (!connection.httpClosed) return;

    const surreal = await acquireSurreal(connection.config);
    connection.surreal = surreal;
    connection.httpClosed = false;
  }

  /** Get the database proxy for a connection */
  getProxy(name: string = DEFAULT_CONNECTION_NAME): DatabaseProxy<R> | undefined {
    return this.connections.get(name)?.proxy;
  }

  /** Use a specific connection */
  useConnection(name: string): DatabaseProxy<R> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new CerialConnectionError(`Connection "${name}" not found`);
    }
    if (!connection.isConnected) {
      throw new CerialNotConnectedError(`Connection "${name}" is not connected`);
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
}

/** Create a connection manager */
export function createConnectionManager<R extends ModelRegistry>(
  registry: R,
  options?: ConnectionManagerOptions | ConnectionConfig,
): ConnectionManager<R> {
  return new ConnectionManager<R>(registry, options);
}
