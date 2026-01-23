/**
 * Connection manager for managing multiple database connections
 */

import { Surreal } from 'surrealdb';
import type { ModelRegistry, ConnectionConfig } from '../types';
import { createModelProxy, clearModelCache, type DatabaseProxy } from './proxy';

/** Default connection name */
const DEFAULT_CONNECTION_NAME = 'default';

/** Connection instance */
interface ConnectionInstance<R extends ModelRegistry = ModelRegistry> {
  surreal: Surreal;
  config: ConnectionConfig;
  isConnected: boolean;
  proxy: DatabaseProxy<R>;
}

/** Connection manager */
export class ConnectionManager<R extends ModelRegistry = ModelRegistry> {
  private connections: Map<string, ConnectionInstance<R>> = new Map();
  private registry: R;
  private defaultConfig?: ConnectionConfig;

  constructor(registry: R, defaultConfig?: ConnectionConfig) {
    this.registry = registry;
    this.defaultConfig = defaultConfig;
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

    // Create new connection
    const surreal = new Surreal();

    // Connect to the database
    await surreal.connect(`${finalConfig.url}/rpc`);

    // Authenticate if credentials provided
    if (finalConfig.auth) {
      await surreal.signin({
        username: finalConfig.auth.username,
        password: finalConfig.auth.password,
      });
    }

    // Use namespace and database
    if (finalConfig.namespace) {
      await surreal.use({ namespace: finalConfig.namespace });
    }
    if (finalConfig.database) {
      await surreal.use({ database: finalConfig.database });
    }

    // Create proxy
    const proxy = createModelProxy<R>(surreal, this.registry);

    // Store connection
    this.connections.set(name, {
      surreal,
      config: finalConfig,
      isConnected: true,
      proxy,
    });

    return proxy;
  }

  /** Disconnect from database */
  async disconnect(name: string = DEFAULT_CONNECTION_NAME): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;

    // Clear model cache
    clearModelCache(connection.surreal);

    // Close connection
    await connection.surreal.close();

    // Update state
    connection.isConnected = false;
    this.connections.delete(name);
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
}

/** Create a connection manager */
export function createConnectionManager<R extends ModelRegistry>(
  registry: R,
  defaultConfig?: ConnectionConfig,
): ConnectionManager<R> {
  return new ConnectionManager<R>(registry, defaultConfig);
}
