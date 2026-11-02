/**
 * Client template - base template for generated client
 */

import type { ConnectionConfig, DatabasePin, ModelMetadata } from '../../types';
import { generateEmbeddedConnection, generateResolveConnection } from './connection-template';
import { generateDatabasePins } from './database-pin-template';
import pkg from '../../../package.json';

/** Generate imports for client */
export function generateImports(models: ModelMetadata[]): string {
  const modelImports = models.map((m) => m.name).join(', ');
  const modelTypeImports = models.map((m) => `${m.name}Model`).join(', ');

  return `import { CerialError, CerialMigrationError, CerialNotConnectedError, CerialTransactionError, CerialValidationError, ConnectionManager, CerialQueryPromise, createClientLive, createClientRawStatement, executeClientTransaction, applyUnmatched, verifySchema, warnAutoChange, warnAutoInProduction, blameModels, matchedModels, readLazyState, type LazyMigrationContext, type MigrationState, createCerialTransactionProxy, guardUnknownModels, isTransactionConflict, wrapDatabaseError, type CerialLiveHandle, type CerialTransaction, type ClientLiveOptions, type DatabaseProxy, type ModelRegistry, type BeforeQueryCallback, type PerModelCallbacks, type TransactionItem, type TransactionExecutionItem, type TransactionItemResult, type TransactionOptions, type TransactionClient, type SqlFragment } from 'cerial';
import type { ConnectionConfig } from 'cerial';
import { modelRegistry } from './internal/model-registry';
import { manifest } from './internal/manifest';
import { migrationsByModel, modelFingerprints, wholeSchemaFingerprint, getModelMigrationQuery, getMigrationModelNames, type ModelName } from './internal/migrations';
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

/** Generate arity-specific $transaction overloads for array mode */
function _generateTransactionOverloads(): string {
  const MAX_ARITY = 6;
  const overloads: string[] = [];

  for (let n = 1; n <= MAX_ARITY; n++) {
    const generics: string[] = [];
    const queryTypes: string[] = [];
    const resultTypes: string[] = [];

    for (let i = 1; i <= n; i++) {
      const prevTypes = Array.from({ length: i - 1 }, (_, j) => `TransactionItemResult<T${j + 1}>`).join(', ');

      generics.push(`T${i} extends CerialQueryPromise<any> | ((prev: [${prevTypes}]) => any)`);
      queryTypes.push(`T${i}`);
      resultTypes.push(`TransactionItemResult<T${i}>`);
    }

    overloads.push(
      `  $transaction<${generics.join(', ')}>(queries: [${queryTypes.join(', ')}], options?: TransactionOptions): Promise<[${resultTypes.join(', ')}]>;`,
    );
  }

  // Fallback for 7+ items (prev is any[] — can't type across arbitrary positions)
  overloads.push(
    `  $transaction<T extends (CerialQueryPromise<any> | ((prev: any[]) => any))[]>(queries: [...T], options?: TransactionOptions): Promise<{ [K in keyof T]: TransactionItemResult<T[K]> }>;`,
  );

  return overloads.join('\n\n');
}

/** Generate the CerialClient class */
export function generateClientClass(
  models: ModelMetadata[],
  clientClassName: string = 'CerialClient',
  databasePins?: DatabasePin[],
): string {
  const connectConfigName = `${clientClassName}ConnectConfig`;

  const modelAccessors = models
    .map(
      (m) => `  get ${m.name}(): ${m.name}Model {
    return this._ensureDb().${m.name};
  }`,
    )
    .join('\n\n');

  return `/**
  * What the client knows of each model without a schema: its DDL, its table and the fingerprint the DDL leaves behind
  */
const migrationContext: LazyMigrationContext = {
  schemaName: '${clientClassName}',
  cerialVersion: '${pkg.version}',
  models: Object.fromEntries(
    getMigrationModelNames().map((name) => [
      name,
      {
        table: (modelRegistry as Record<string, { tableName: string }>)[name]!.tableName,
        statements: migrationsByModel[name],
        fingerprint: modelFingerprints[name],
      },
    ]),
  ),
};

/**
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

/** The values \`ClientOptions.migrations\` accepts */
export type MigrationsMode = 'auto' | 'verify' | 'off';

const MIGRATIONS_MODES: readonly MigrationsMode[] = ['auto', 'verify', 'off'];

/**
  * Client options for configuring callbacks and events
  */
export interface ClientOptions {
  /**
   * How the client treats the schema (default: 'auto').
   * - 'auto': apply a model's DDL the first time it is used.
   * - 'verify': on connect, compare the live schema with the generated one and apply nothing. A difference
   *   makes connect() throw a CerialMigrationError naming it and carrying the plan; events and tables Cerial does not manage are ignored.
   * - 'off': apply nothing, check nothing and read or write no migration state on any implicit entry
   *   (model queries, query, $raw, $live, $transaction). An explicit migrate() call still runs.
   */
  migrations?: MigrationsMode;
  /** Callback(s) to run before each query - can be single function or array */
  onBeforeQuery?: BeforeQueryCallback | BeforeQueryCallback[];
  /** Callback for migration events (start, complete, error) */
  onMigrationEvent?: MigrationEventCallback;
  /**
   * Attach the generated statement and its bound parameter values to a database error (default: false).
   * The values are your data: turn this on in development, not where errors reach a shared log or tracker.
   */
  includeStatementInErrors?: boolean;
}

/**
  * Extended connection config with per-model callbacks
  */
export interface ${connectConfigName} extends ConnectionConfig {
  /** Per-model callbacks to run before queries to specific models */
  perModelCallbacks?: PerModelCallbacks;
}

/**
  * SurrealDB client with typed model access and per-model lazy migrations
  */
export class ${clientClassName} {
  private connectionManager: ConnectionManager<typeof modelRegistry>;
  private _db: DatabaseProxy<typeof modelRegistry> | null = null;
  private _migratedModels: Set<ModelName> = new Set();
  // Persisted migration state, read once per client; models are applied in client-level batches, one after another, so they never contend for the database lease with each other.
  private _state: Promise<MigrationState> | null = null;
  private _batch: Promise<unknown> = Promise.resolve();
  // Set by resetMigrationState(): the next apply ignores persisted state, because the caller says the database changed behind it.
  private _bypassState = false;
  // A DDL failure (e.g. a UNIQUE index over duplicate data) will not fix itself, so it is kept and rethrown instead of re-running the DDL on every query.
  private _failedMigrations: Map<ModelName, Error> = new Map();
  private _onMigrationEvent?: MigrationEventCallback;
  private _userCallbacks: BeforeQueryCallback[] = [];
  private _includeStatementInErrors = false;
  private _migrations: MigrationsMode = 'auto';
  // Initialised explicitly so the guard proxy finds it on the instance rather than treating it as an unknown name.
  private _perModelCallbacks?: PerModelCallbacks = undefined;

  constructor(options?: ClientOptions) {
    // Store user callbacks (normalized to array)
    if (options?.onBeforeQuery) {
      this._userCallbacks = Array.isArray(options.onBeforeQuery)
        ? options.onBeforeQuery
        : [options.onBeforeQuery];
    }

    const migrations = options?.migrations === undefined ? 'auto' : options.migrations;
    if (!MIGRATIONS_MODES.includes(migrations)) {
      throw new CerialValidationError(\`Invalid migrations option \${JSON.stringify(migrations)}. Allowed values: \${MIGRATIONS_MODES.map(mode => \`'\${mode}'\`).join(', ')}.\`, { operation: 'constructor' });
    }
    this._migrations = migrations;
    if (migrations === 'auto') warnAutoInProduction();

    this._onMigrationEvent = options?.onMigrationEvent;
    this._includeStatementInErrors = options?.includeStatementInErrors ?? false;

    // Combine migration callback with user callbacks
    const allCallbacks: BeforeQueryCallback[] = [
      async (modelNames: string[]) => {
        await this.ensureModelsMigrated(modelNames as ModelName[]);
      },
      ...this._userCallbacks,
    ];

    this.connectionManager = new ConnectionManager(modelRegistry, {
      proxyOptions: {
        onBeforeQuery: allCallbacks,
        includeStatementInErrors: this._includeStatementInErrors,
      },
    });

    return guardUnknownModels(this, modelRegistry);
  }

  /** @internal */
  private _ensureDb(): TypedDb {
    if (!this._db) throw new CerialNotConnectedError('Not connected. Call connect() first.');
    return this._db as unknown as TypedDb;
  }

  /**
   * Get the database proxy for model access
   * @deprecated Access models directly on the client instead (e.g., \`client.User\` instead of \`client.db.User\`)
   * @throws Error if not connected
   */
  get db(): TypedDb {
    return this._ensureDb();
  }

${modelAccessors}

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
    * @param config - Connection configuration with optional per-model callbacks. Replaces the embedded connection entirely; omit it to use the embedded one.
    */
   async connect(config?: ${connectConfigName}): Promise<void> {
${generateResolveConnection(connectConfigName, databasePins)}
    // Store per-model callbacks for proxy creation
    this._perModelCallbacks = resolved.perModelCallbacks;

    // Update proxy options with per-model callbacks
    if (this._perModelCallbacks) {
      const allCallbacks: BeforeQueryCallback[] = [
        async (modelNames: string[]) => {
          await this.ensureModelsMigrated(modelNames as ModelName[]);
        },
        ...this._userCallbacks,
      ];

      this.connectionManager.setProxyOptions({
        onBeforeQuery: allCallbacks,
        perModelCallbacks: this._perModelCallbacks,
        includeStatementInErrors: this._includeStatementInErrors,
      });
    }

    this._db = await this.connectionManager.connect(resolved);

    if (this._migrations === 'verify') {
      try {
        const surreal = this.connectionManager.getDdlSurreal();
        if (!surreal) throw new CerialNotConnectedError('No active connection.', { operation: 'verify' });
        await verifySchema(surreal, {
          schemaName: migrationContext.schemaName,
          manifest: manifest as unknown as Parameters<typeof verifySchema>[1]['manifest'],
          statements: Object.values(migrationsByModel).flat(),
        });
      } catch (error) {
        // A refused client is not left half-connected; a second connect() after the fix starts clean.
        await this.disconnect().catch(() => undefined);
        throw error;
      }
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
    this._db = null;
    // Not resetMigrationState(): a disconnect says nothing about the database, so a reconnect still trusts a matching state row.
    this._migratedModels.clear();
    this._failedMigrations.clear();
    this._state = null;
  }

  /**
   * Reset migration tracking state so all models are re-migrated on next access.
   * Useful after dropping tables (e.g., in test cleanup) to force schema re-creation. The persisted
   * migration state is ignored until the next apply, so a matching state row does not skip the re-creation.
   */
  resetMigrationState(): void {
    this._bypassState = true;
    this._migratedModels.clear();
    this._failedMigrations.clear();
    this._state = null;
  }

  /**
   * Run migrations for a specific model
   * @param modelName - The model name to migrate
   */
  async migrateModel(modelName: ModelName): Promise<void> {
    if (this._migratedModels.has(modelName)) return;
    this._throwFailed([modelName]);

    const run = this._batch.then(() => this._migrateBatch([modelName], true));
    this._batch = run.catch(() => undefined);
    await run;
  }

  /**
   * Ensure a specific model is migrated (called before queries)
   * @param modelName - The model name to ensure is migrated
   * @internal
   */
  async ensureModelMigrated(modelName: ModelName): Promise<void> {
    await this.ensureModelsMigrated([modelName]);
  }

  /**
   * Ensure the given models are in place before a query runs. Persisted state is read once; models whose state
   * matches send no DDL, and the rest are applied together under the one database lease.
   * @internal
   */
  async ensureModelsMigrated(modelNames: ModelName[]): Promise<void> {
    // Only 'auto' migrates implicitly. 'verify' checked the schema once in connect() and 'off' never looks; only an explicit migrate() applies.
    if (this._migrations !== 'auto') return;
    const wanted = [...new Set(modelNames)].filter(name => name in migrationContext.models && !this._migratedModels.has(name));
    if (!wanted.length) return;
    this._throwFailed(wanted);

    const run = this._batch.then(() => this._migrateBatch(wanted));
    this._batch = run.catch(() => undefined);
    await run;
  }

  private _throwFailed(modelNames: ModelName[]): void {
    for (const name of modelNames) {
      const failure = this._failedMigrations.get(name);
      if (failure) throw failure;
    }
  }

  private async _migrateBatch(modelNames: ModelName[], force = false): Promise<void> {
    const wanted = force ? modelNames : modelNames.filter(name => !this._migratedModels.has(name));
    if (!wanted.length) return;
    this._throwFailed(wanted);
    if (!this._db) throw new CerialNotConnectedError('Not connected. Call connect() first.', { operation: 'migrate' });
    const surreal = this.connectionManager.getDdlSurreal();
    if (!surreal) throw new CerialNotConnectedError('No active connection.', { operation: 'migrate' });

    const bypass = force || this._bypassState;
    let unmatched = wanted;
    if (!bypass) {
      this._state ??= readLazyState(surreal, migrationContext);
      let state: MigrationState;
      try {
        state = await this._state;
      } catch (error) {
        this._state = null;
        throw error;
      }

      const matched = matchedModels(state, migrationContext, wanted);
      for (const name of matched) this._migratedModels.add(name as ModelName);
      unmatched = wanted.filter(name => !matched.includes(name));
      if (!unmatched.length) return;

      // A model with a persisted row that no longer matches changed since it was applied: show what is about to be altered. Fresh models and unchanged fingerprints cost no read.
      const changed = unmatched.filter(name => state.models.has(name));
      if (this._migrations === 'auto' && changed.length) {
        await warnAutoChange(surreal, state, {
          manifest: manifest as unknown as Parameters<typeof verifySchema>[1]['manifest'],
          statements: Object.values(migrationsByModel).flat(),
          tables: changed.map(name => migrationContext.models[name]!.table),
        });
      }
    }

    for (const modelName of unmatched) this._onMigrationEvent?.({ type: 'start', modelName });
    try {
      const done = await applyUnmatched(surreal, migrationContext, unmatched, {
        force: bypass,
        schemaFingerprint: force ? wholeSchemaFingerprint : undefined,
      });
      // The rows just written make any state read earlier stale.
      this._bypassState = false;
      this._state = null;
      for (const name of done as ModelName[]) {
        this._migratedModels.add(name);
        this._onMigrationEvent?.({ type: 'complete', modelName: name });
      }
    } catch (error) {
      for (const modelName of unmatched) this._onMigrationEvent?.({ type: 'error', modelName, error: error as Error });
      // Not being connected is a state, not a DDL verdict: the next query may succeed.
      if (error instanceof CerialNotConnectedError) throw error;

      const failures = (blameModels(error, migrationContext, unmatched) as ModelName[]).map(name => {
        const failure = new CerialMigrationError(\`Migration of \${name} failed: \${error instanceof Error ? error.message : String(error)}\`, {
          model: name,
          operation: 'migrate',
          statement: { text: getModelMigrationQuery(name), vars: {} },
          cause: error,
        });
        this._failedMigrations.set(name, failure);

        return failure;
      });
      throw failures[0];
    }
  }

  /**
   * Run schema migrations for all models, e.g. as a deploy step.
   * Always applies every model as one batch under the database lease, whatever this client or the persisted
   * state already holds, and records the result so later clients send no DDL.
   */
  async migrate(): Promise<void> {
    const allModels = getMigrationModelNames();
    this._throwFailed(allModels);

    const run = this._batch.then(() => this._migrateBatch(allModels, true));
    this._batch = run.catch(() => undefined);
    await run;
  }

  /**
   * Ensure all migrations are applied (called before queries)
   * @internal
   */
  async ensureMigrated(): Promise<void> {
    await this.ensureModelsMigrated(getMigrationModelNames());
  }

  /**
   * Get the primary Surreal instance: the HTTP socket for an http(s) URL (WS after closeHttp()),
   * the single socket for a ws(s) URL. In HTTP mode it is not the socket models, migrations,
   * raw queries and transactions run on; those share the WebSocket.
   */
  getSurreal() {
    return this.connectionManager.getSurreal();
  }

  /**
   * Get the WebSocket Surreal instance for transactions. It is the same socket models,
   * migrations and raw queries run on, and it does not change with closeHttp().
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
    const surreal = this.connectionManager.getQuerySurreal();
    if (!surreal) throw new CerialNotConnectedError('Not connected.', { operation: 'query' });
    const result = await surreal.query<T[]>(query, vars);
    return result.flat() as T[];
  }

  /**
   * Run a whole raw SurrealQL statement built with the sql tag. Returns the last statement's result as an
   * array, unmapped, because a client-level statement belongs to no model. Use a model's own $raw to map rows.
   * @param fragment - A fragment from the sql tag; a plain string is refused
   */
  $raw<T = unknown>(fragment: SqlFragment<T>): CerialQueryPromise<T[]> {
    return createClientRawStatement<T>(
      fragment,
      async () => {
        await this.ensureMigrated();
        const surreal = this.connectionManager.getQuerySurreal();
        if (!surreal) throw new CerialNotConnectedError('Not connected.', { operation: '$raw' });

        return surreal;
      },
      this._includeStatementInErrors,
    );
  }

  /**
   * Subscribe to changes on a table with a managed live query. Resolves once the query is registered, so a
   * write made after the await is seen. Iterate the handle with for await; break or kill() stops it.
   * Not available inside a transaction. A transaction client refuses it.
   * @param table - The table to watch
   * @param options.where - A fragment from the sql tag, evaluated per changed row; ORDER BY is not valid
   */
  async $live<T = unknown>(table: string, options?: ClientLiveOptions): Promise<CerialLiveHandle<T>> {
    return createClientLive<T>(
      table,
      options,
      async () => {
        await this.ensureMigrated();
        const surreal = this.connectionManager.getQuerySurreal();
        if (!surreal) throw new CerialNotConnectedError('Not connected.', { operation: '$live' });

        return surreal;
      },
      (handle) => this.connectionManager.trackLive(handle),
    );
  }

  /**
   * Execute multiple queries in a single transaction (array mode).
   * Supports CerialQueryPromise items and function items with typed prev parameter.
   * Functions receive accumulated results from preceding items with full type inference.
   *
   * @example
   * \`\`\`ts
   * const [user, post] = await client.$transaction([
   *   client.db.User.create({ data: { name: 'Alice', email: 'alice@test.com', isActive: true } }),
   *   (prev) => client.db.Post.create({ data: { title: 'Hello', authorId: prev[0].id } }),
   *   // prev[0] is User — fully typed, no casting needed
   * ]);
   * \`\`\`
   */
${_generateTransactionOverloads()}

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
     fn: (tx: Omit<TypedDb, '$transaction'> & Pick<CerialTransaction, '$raw'>) => Promise<R> | R,
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
   $transaction(): Promise<CerialTransaction & TypedDb>;

   async $transaction(
     arg?: (CerialQueryPromise<any> | ((prev: any[]) => any))[] | ((tx: any) => unknown),
     options?: TransactionOptions,
   ): Promise<unknown> {
    if (!this._db) throw new CerialNotConnectedError('Not connected. Call connect() first.', { operation: '$transaction' });

    // Manual mode: no arguments
    if (arg === undefined) {
      const surreal = this.getTransactionSurreal();
      if (!surreal) throw new CerialNotConnectedError('No active connection.', { operation: '$transaction' });
      await this.ensureMigrated();
      const sdkTxn = await surreal.beginTransaction();

      return createCerialTransactionProxy(sdkTxn, modelRegistry, this._includeStatementInErrors);
    }

    // Callback mode: function argument
    if (typeof arg === 'function') {
      const surreal = this.getTransactionSurreal();
      if (!surreal) throw new CerialNotConnectedError('No active connection.', { operation: '$transaction' });
      await this.ensureMigrated();

      const maxRetries = options?.retries ?? 0;
      const backoffFn = options?.backoff ?? ((attempt: number) => 2 ** attempt * 10 + Math.random() * 10);
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const sdkTxn = await surreal.beginTransaction();
          const tx = createCerialTransactionProxy(sdkTxn, modelRegistry, this._includeStatementInErrors);

          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          try {
            let result: unknown;
            if (options?.timeout) {
              const timeoutMs = options.timeout;
              result = await Promise.race([
                Promise.resolve(arg(tx)),
                new Promise<never>((_, reject) => {
                  timeoutId = setTimeout(
                    () => reject(new CerialTransactionError('Transaction timeout', { operation: '$transaction' })),
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
            try {
              await sdkTxn.cancel();
            } catch {
              // Ignore cancel errors — transaction may already be aborted
            }
            throw error;
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
          }
        } catch (error) {
          lastError = error;
          if (isTransactionConflict(error) && attempt < maxRetries) {
            const delay = backoffFn(attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }

      throw lastError;
    }

    // Array mode
    if (!arg.length) return [] as any;

    const surreal = this.getTransactionSurreal();
    if (!surreal) throw new CerialNotConnectedError('No active connection.', { operation: '$transaction' });

    // Validate all items are CerialQueryPromise or function
    for (const q of arg) {
      if (typeof q !== 'function' && !CerialQueryPromise.isCerialQueryPromise(q)) {
        throw new CerialValidationError('$transaction only accepts CerialQueryPromise objects or functions.', { operation: '$transaction' });
      }
    }

    // Ensure all involved models are migrated before executing
    const queryItems = arg.filter(q => CerialQueryPromise.isCerialQueryPromise(q)) as CerialQueryPromise<any>[];
    const hasFunctions = arg.some(q => typeof q === 'function');
    // A client-level $raw item names no model, so a model-only migration would migrate nothing for it
    const hasUnboundItem = queryItems.some(q => !q.modelNames.length);
    if (hasFunctions || hasUnboundItem) {
      // Functions could access any model — migrate all
      await this.ensureMigrated();
    } else {
      const modelNames = new Set(queryItems.flatMap(q => q.modelNames));
      await this.ensureModelsMigrated([...modelNames] as ModelName[]);
    }

    // Build transaction items — pass functions through, wrap CerialQueryPromise
    const items: TransactionExecutionItem[] = arg.map(q => {
      if (typeof q === 'function') return q as TransactionExecutionItem;

      return {
        compiledQuery: (q as CerialQueryPromise<any>).compiledQuery,
        metadata: (q as CerialQueryPromise<any>).metadata,
        resultType: (q as CerialQueryPromise<any>).resultType,
        registry: (q as CerialQueryPromise<any>).registry,
        select: (q as CerialQueryPromise<any>).select,
      };
    });

    // Execute the transaction
    // Wrapped here, after the retry loop, so conflict detection still sees the raw driver error
    const results = await executeClientTransaction(surreal, items, options).catch((error: unknown) => {
      throw wrapDatabaseError(error, undefined, '$transaction');
    });

    return results as any;
  }
}`;
}

/** Generate the full client template */
export function generateClientTemplate(
  models: ModelMetadata[],
  clientClassName: string = 'CerialClient',
  connection?: ConnectionConfig,
  databasePins?: DatabasePin[],
): string {
  const pinBlock = generateDatabasePins(databasePins);

  return `${generateImports(models)}

${generateEmbeddedConnection(connection)}

${pinBlock ? `${pinBlock}\n\n` : ''}${generateTypedDbInterface(models)}

${generateClientClass(models, clientClassName, databasePins)}
`;
}
