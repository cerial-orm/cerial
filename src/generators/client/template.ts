/**
 * Client template - base template for generated client
 */

import type { ModelMetadata } from '../../types';

/** Generate imports for client */
export function generateImports(models: ModelMetadata[]): string {
  const modelImports = models.map((m) => m.name).join(', ');
  const modelTypeImports = models.map((m) => `${m.name}Model`).join(', ');

  return `import { ConnectionManager, type DatabaseProxy, type ModelRegistry } from '@org/lib_backend_surreal-om';
import type { ConnectionConfig } from '@org/lib_backend_surreal-om';
import { modelRegistry } from './internal/model-registry';
import { migrationStatements } from './internal/migrations';
import type { ${modelImports}, ${modelTypeImports} } from './models';`;
}

/** Generate client setup code */
export function generateClientSetup(): string {
  return ``;
}

/** Generate connect function */
export function generateConnectFunction(): string {
  return ``;
}

/** Generate disconnect function */
export function generateDisconnectFunction(): string {
  return ``;
}

/** Generate useConnection function */
export function generateUseConnectionFunction(): string {
  return ``;
}

/** Generate TypedDb interface for typed model access */
export function generateTypedDbInterface(models: ModelMetadata[]): string {
  const modelTypes = models.map((m) => `  ${m.name}: ${m.name}Model;`).join('\n');

  return `/**
 * Typed database interface for model access
 */
export interface TypedDb {
${modelTypes}
}`;
}

/** Generate the SurrealClient class */
export function generateClientClass(): string {
  return `/**
 * SurrealDB client with typed model access
 */
export class SurrealClient {
  private connectionManager: ConnectionManager<typeof modelRegistry>;
  private _db: DatabaseProxy<typeof modelRegistry> | null = null;
  private _isMigrated = false;

  constructor() {
    // Set up the connection manager with a before-query callback for lazy migrations
    this.connectionManager = new ConnectionManager(modelRegistry, {
      proxyOptions: {
        onBeforeQuery: async () => {
          await this.ensureMigrated();
        },
      },
    });
  }

  /**
   * Get the database proxy for model access
   * @throws Error if not connected
   */
  get db(): TypedDb {
    if (!this._db) throw new Error('Not connected. Call connect() first.');
    return this._db as unknown as TypedDb;
  }

  /**
   * Check if connected to the database
   */
  get isConnected(): boolean {
    return this._db !== null;
  }

  /**
   * Check if migrations have been applied
   */
  get isMigrated(): boolean {
    return this._isMigrated;
  }

  /**
   * Connect to the database
   * @param config - Connection configuration
   */
  async connect(config: ConnectionConfig): Promise<void> {
    this._db = await this.connectionManager.connect(config);
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
    this._db = null;
    this._isMigrated = false;
  }

  /**
   * Run schema migrations (DEFINE TABLE and DEFINE FIELD statements)
   * This is called automatically before the first query if not called manually.
   */
  async migrate(): Promise<void> {
    if (this._isMigrated) return;
    if (!this._db) throw new Error('Not connected. Call connect() first.');

    const surreal = this.connectionManager.getSurreal();
    if (!surreal) throw new Error('No active connection.');

    // Execute all migration statements
    const query = migrationStatements.join('\\n');
    await surreal.query(query);

    this._isMigrated = true;
  }

  /**
   * Ensure migrations are applied (called before queries)
   * @internal
   */
  async ensureMigrated(): Promise<void> {
    if (!this._isMigrated) await this.migrate();
  }

  /**
   * Get the raw Surreal instance for advanced operations
   */
  getSurreal() {
    return this.connectionManager.getSurreal();
  }

  /**
   * Execute a raw SurrealQL query
   * @param query - The query string
   * @param vars - Optional query variables
   */
  async query<T = unknown>(query: string, vars?: Record<string, unknown>): Promise<T[]> {
    await this.ensureMigrated();
    const surreal = this.getSurreal();
    if (!surreal) throw new Error('Not connected.');
    const result = await surreal.query<T[]>(query, vars);
    return result.flat() as T[];
  }
}`;
}

/** Generate the full client template */
export function generateClientTemplate(models: ModelMetadata[]): string {
  return `${generateImports(models)}

${generateTypedDbInterface(models)}

${generateClientClass()}
`;
}
