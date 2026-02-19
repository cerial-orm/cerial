/**
 * Client template - base template for generated client
 */

import type { ModelMetadata } from '../../types';

/** Generate imports for client */
export function generateImports(models: ModelMetadata[]): string {
  const modelImports = models.map((m) => m.name).join(', ');
  const modelTypeImports = models.map((m) => `${m.name}Model`).join(', ');

  return `import { ConnectionManager, CerialQueryPromise, executeClientTransaction, createCerialTransactionProxy, type CerialTransaction, type DatabaseProxy, type ModelRegistry, type BeforeQueryCallback, type PerModelCallbacks, type TransactionItem, type TransactionOptions, type TransactionClient } from 'cerial';
import type { ConnectionConfig } from 'cerial';
import { modelRegistry } from './internal/model-registry';
import { migrationsByModel, getModelMigrationQuery, getMigrationModelNames, type ModelName } from './internal/migrations';
import type { ${modelImports}, ${modelTypeImports} } from './models';`;
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

/** Generate the CerialClient class */
export function generateClientClass(): string {
  return `/**
 * Migration event types
 */
export type MigrationEventType = 'start' | 'complete' | 'error';

/**
 * Migration event callback
 */
export type MigrationEventCallback = (event: {
  type: MigrationEventType;
  modelName: ModelName;
  error?: Error;
}) => void;

/**
 * Client options for configuring callbacks and events
 */
export interface ClientOptions {
  /** Callback(s) to run before each query - can be single function or array */
  onBeforeQuery?: BeforeQueryCallback | BeforeQueryCallback[];
  /** Callback for migration events (start, complete, error) */
  onMigrationEvent?: MigrationEventCallback;
}

/**
 * Extended connection config with per-model callbacks
 */
export interface CerialClientConnectConfig extends ConnectionConfig {
  /** Per-model callbacks to run before queries to specific models */
  perModelCallbacks?: PerModelCallbacks;
}

/**
 * SurrealDB client with typed model access and per-model lazy migrations
 */
export class CerialClient {
  private connectionManager: ConnectionManager<typeof modelRegistry>;
  private _db: DatabaseProxy<typeof modelRegistry> | null = null;
  private _migratedModels: Set<ModelName> = new Set();
  private _pendingMigrations: Set<ModelName> = new Set();
  private _migrationPromises: Map<ModelName, Promise<void>> = new Map();
  private _onMigrationEvent?: MigrationEventCallback;
  private _userCallbacks: BeforeQueryCallback[] = [];
  private _perModelCallbacks?: PerModelCallbacks;

  constructor(options?: ClientOptions) {
    // Store user callbacks (normalized to array)
    if (options?.onBeforeQuery) {
      this._userCallbacks = Array.isArray(options.onBeforeQuery)
        ? options.onBeforeQuery
        : [options.onBeforeQuery];
    }

    this._onMigrationEvent = options?.onMigrationEvent;

    // Combine migration callback with user callbacks
    const allCallbacks: BeforeQueryCallback[] = [
      async (modelName: string) => await this.ensureModelMigrated(modelName as ModelName),
      ...this._userCallbacks,
    ];

    this.connectionManager = new ConnectionManager(modelRegistry, {
      proxyOptions: {
        onBeforeQuery: allCallbacks,
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
   * Check if all models have been migrated
   */
  get isMigrated(): boolean {
    const allModels = getMigrationModelNames();
    return allModels.every(model => this._migratedModels.has(model));
  }

  /**
   * Check if a specific model has been migrated
   * @param modelName - The model name to check
   */
  isModelMigrated(modelName: ModelName): boolean {
    return this._migratedModels.has(modelName);
  }

  /**
   * Get list of migrated models
   */
  getMigratedModels(): ModelName[] {
    return Array.from(this._migratedModels);
  }

  /**
   * Get list of pending models (not yet migrated)
   */
  getPendingModels(): ModelName[] {
    const allModels = getMigrationModelNames();
    return allModels.filter(model => !this._migratedModels.has(model));
  }

  /**
   * Connect to the database
   * @param config - Connection configuration with optional per-model callbacks
   */
  async connect(config: CerialClientConnectConfig): Promise<void> {
    // Store per-model callbacks for proxy creation
    this._perModelCallbacks = config.perModelCallbacks;

    // Update proxy options with per-model callbacks
    if (this._perModelCallbacks) {
      const allCallbacks: BeforeQueryCallback[] = [
        async (modelName: string) => await this.ensureModelMigrated(modelName as ModelName),
        ...this._userCallbacks,
      ];

      this.connectionManager.setProxyOptions({
        onBeforeQuery: allCallbacks,
        perModelCallbacks: this._perModelCallbacks,
      });
    }

    this._db = await this.connectionManager.connect(config);
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
    this._db = null;
    this.resetMigrationState();
  }

  /**
   * Reset migration tracking state so all models are re-migrated on next access.
   * Useful after dropping tables (e.g., in test cleanup) to force schema re-creation.
   */
  resetMigrationState(): void {
    this._migratedModels.clear();
    this._pendingMigrations.clear();
    this._migrationPromises.clear();
  }

  /**
   * Run migrations for a specific model
   * @param modelName - The model name to migrate
   */
  async migrateModel(modelName: ModelName): Promise<void> {
    // Check if already migrated
    if (this._migratedModels.has(modelName)) return;

    // Thread safety: wait for in-progress migration
    if (this._pendingMigrations.has(modelName)) {
      const promise = this._migrationPromises.get(modelName);
      if (promise) await promise;
      return;
    }

    // Mark as pending
    this._pendingMigrations.add(modelName);

    // Create migration promise
    const migrationPromise = this._doMigrateModel(modelName);
    this._migrationPromises.set(modelName, migrationPromise);

    try {
      await migrationPromise;
    } finally {
      this._pendingMigrations.delete(modelName);
      this._migrationPromises.delete(modelName);
    }
  }

  /**
   * Internal method to perform migration for a model
   * @internal
   */
  private async _doMigrateModel(modelName: ModelName): Promise<void> {
    if (!this._db) throw new Error('Not connected. Call connect() first.');

    this._onMigrationEvent?.({ type: 'start', modelName });

    try {
      const surreal = this.connectionManager.getSurreal();
      if (!surreal) throw new Error('No active connection.');

      // Get migration statements for this specific model
      const query = getModelMigrationQuery(modelName);
      await surreal.query(query);

      // Mark as migrated
      this._migratedModels.add(modelName);
      this._onMigrationEvent?.({ type: 'complete', modelName });
    } catch (error) {
      this._onMigrationEvent?.({ type: 'error', modelName, error: error as Error });
      throw error; // Fail fast - don't retry
    }
  }

  /**
   * Ensure a specific model is migrated (called before queries)
   * @param modelName - The model name to ensure is migrated
   * @internal
   */
  async ensureModelMigrated(modelName: ModelName): Promise<void> {
    if (!this._migratedModels.has(modelName)) {
      await this.migrateModel(modelName);
    }
  }

  /**
   * Run schema migrations for all models
   * This can be called manually to eagerly migrate all models upfront.
   */
  async migrate(): Promise<void> {
    const allModels = getMigrationModelNames();
    await Promise.all(allModels.map(model => this.migrateModel(model)));
  }

  /**
   * Ensure all migrations are applied (called before queries)
   * @internal
   */
  async ensureMigrated(): Promise<void> {
    await this.migrate();
  }

  /**
   * Get the raw Cerial instance for advanced operations
   */
  getSurreal() {
    return this.connectionManager.getSurreal();
  }

  /**
   * Get the WebSocket Surreal instance for transactions.
   * Always returns the WS connection regardless of primary URL scheme.
   */
  getTransactionSurreal() {
    return this.connectionManager.getTransactionSurreal();
  }

  /**
   * Close the HTTP connection, falling back to WebSocket for all operations.
   * No-op if connected via WebSocket URL only.
   */
  async closeHttp(): Promise<void> {
    await this.connectionManager.closeHttp();
  }

  /**
   * Reopen the HTTP connection after closeHttp().
   * No-op if connected via WebSocket URL only.
   */
  async reopenHttp(): Promise<void> {
    await this.connectionManager.reopenHttp();
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

  /**
   * Execute multiple queries in a single transaction (array mode).
   * All queries are executed atomically — if any query fails, all changes are rolled back.
   *
   * @param queries - Array of CerialQueryPromise objects from model methods
   * @returns Tuple of results matching the input query order
   *
   * @example
   * \`\`\`ts
   * const [user, posts] = await client.$transaction([
   *   client.db.User.create({ data: { name: 'Alice', email: 'alice@test.com', isActive: true } }),
   *   client.db.Post.findMany({ where: { published: true } }),
   * ]);
   * // user: User, posts: Post[]
   * \`\`\`
   */
  $transaction<T extends CerialQueryPromise<any>[]>(
    queries: [...T],
  ): Promise<{ [K in keyof T]: T[K] extends CerialQueryPromise<infer R> ? R : never }>;

  /**
   * Execute a callback within a managed transaction (callback mode).
   * The transaction is automatically committed on success or cancelled on error.
   *
   * @param fn - Callback receiving a transaction client with model access
   * @param options - Optional transaction options (e.g., timeout)
   * @returns The callback's return value
   *
   * @example
   * \`\`\`ts
   * const result = await client.$transaction(async (tx) => {
   *   const user = await tx.User.create({ data: { name: 'Alice', email: 'alice@test.com', isActive: true } });
   *   await tx.Post.create({ data: { title: 'Hello', authorId: user.id } });
   *   return user;
   * });
   * \`\`\`
   */
  $transaction<R>(
    fn: (tx: TransactionClient) => Promise<R> | R,
    options?: TransactionOptions,
  ): Promise<R>;

  /**
   * Begin a manual transaction for explicit commit/cancel control.
   *
   * @returns A transaction client with commit() and cancel() methods
   *
   * @example
   * \`\`\`ts
   * const tx = await client.$transaction();
   * try {
   *   await tx.User.create({ data: { name: 'Alice', email: 'alice@test.com', isActive: true } });
   *   await tx.commit();
   * } catch (error) {
   *   await tx.cancel();
   *   throw error;
   * }
   * \`\`\`
   */
  $transaction(): Promise<CerialTransaction>;

  async $transaction(
    arg?: CerialQueryPromise<any>[] | ((tx: TransactionClient) => unknown),
    options?: TransactionOptions,
  ): Promise<unknown> {
    if (!this._db) throw new Error('Not connected. Call connect() first.');

    // Manual mode: no arguments
    if (arg === undefined) {
      const surreal = this.getTransactionSurreal();
      if (!surreal) throw new Error('No active connection.');
      await this.ensureMigrated();
      const sdkTxn = await surreal.beginTransaction();

      return createCerialTransactionProxy(sdkTxn, modelRegistry);
    }

    // Callback mode: function argument
    if (typeof arg === 'function') {
      const surreal = this.getTransactionSurreal();
      if (!surreal) throw new Error('No active connection.');
      await this.ensureMigrated();
      const sdkTxn = await surreal.beginTransaction();
      const tx = createCerialTransactionProxy(sdkTxn, modelRegistry);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        let result: unknown;
        if (options?.timeout) {
          const timeoutMs = options.timeout;
          result = await Promise.race([
            Promise.resolve(arg(tx)),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error('Transaction timeout')),
                timeoutMs,
              );
            }),
          ]);
        } else {
          result = await Promise.resolve(arg(tx));
        }
        await sdkTxn.commit();

        return result;
      } catch (error) {
        await sdkTxn.cancel();
        throw error;
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    }

    // Array mode
    if (!arg.length) return [] as any;

    const surreal = this.getTransactionSurreal();
    if (!surreal) throw new Error('No active connection.');

    // Validate all items are CerialQueryPromise instances
    for (const q of arg) {
      if (!CerialQueryPromise.isCerialQueryPromise(q)) {
        throw new Error('$transaction only accepts CerialQueryPromise objects returned by model methods.');
      }
    }

    // Ensure all involved models are migrated before executing
    const modelNames = new Set(arg.map(q => q.metadata.name));
    await Promise.all([...modelNames].map(name => this.ensureModelMigrated(name as ModelName)));

    // Build transaction items
    const items: TransactionItem[] = arg.map(q => ({
      compiledQuery: q.compiledQuery,
      metadata: q.metadata,
      resultType: q.resultType,
      registry: q.registry,
    }));

    // Execute the transaction
    const results = await executeClientTransaction(surreal, items);

    return results as any;
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
