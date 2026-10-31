/**
 * Model class - provides query methods for a model
 *
 * All query methods return CerialQueryPromise<T> which:
 * - Auto-executes when awaited (backward compatible)
 * - Can be collected into client.$transaction([...]) for batched execution
 */

import type { Surreal } from 'surrealdb';
import {
  compileCount,
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
  type FindManyOptionsWithInclude,
  type FindOneOptionsWithInclude,
  QueryBuilderStatic,
  refuseCompute,
} from '../../query/builder';
import { collectRelatedModelNames, type ComputeClause, type IncludeClause } from '../../query/builders';
import { CerialQueryPromise } from '../../query/cerial-query-promise';
import type { SqlFragment } from '../../query/compile';
import type { CompiledQuery } from '../../query/compile/types';
import { mapRawResult } from '../../query/mappers';
import { compileRawStatement, executeRawStatement } from '../../query/raw-statement';
import type {
  CreateOptions,
  DeleteManyOptions,
  DeleteUniqueResult,
  DeleteUniqueReturn,
  ModelMetadata,
  ModelRegistry,
  SelectClause,
  UpdateOptions,
  UpdateUniqueResult,
  UpdateUniqueReturn,
  UpsertArrayReturnType,
  UpsertReturn,
  UpsertReturnType,
  WhereClause,
} from '../../types';
import type { CerialTransaction } from '../cerial-transaction';
import { type CerialLiveHandle, createModelLive, type EndableLive, type ModelLiveOptions } from '../live';
import { wrapDatabaseError } from './wrap-database-error';

/** Extended find unique options with include support */
export interface FindUniqueOptionsWithInclude {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  include?: Record<string, boolean | object>;
  compute?: ComputeClause;
}

/** Callback type for before-query hook (receives the queried model plus every related model the operation touches) */
export type BeforeQueryCallback = (modelNames: string[]) => Promise<void>;

/** Model options */
export interface ModelOptions {
  /** Callback(s) to run before each query - can be single function or array (e.g., for lazy migrations, logging) */
  onBeforeQuery?: BeforeQueryCallback | BeforeQueryCallback[];
  /** Attach the generated statement and its bound values to a wrapped database error (default: false) */
  includeStatementInErrors?: boolean;
  /** Registers a live handle with its connection so a deliberate `disconnect()` ends it */
  trackLive?: (handle: EndableLive) => () => void;
}

/** Model class that wraps query builder methods */
export class Model<T extends Record<string, unknown> = Record<string, unknown>> {
  private onBeforeQueryCallbacks: BeforeQueryCallback[] = [];
  private readonly includeStatement: boolean;
  private readonly trackLive: ModelOptions['trackLive'];

  constructor(
    private db: Surreal,
    private metadata: ModelMetadata,
    private registry?: ModelRegistry,
    options?: ModelOptions,
  ) {
    this.includeStatement = options?.includeStatementInErrors ?? false;
    this.trackLive = options?.trackLive;
    // Normalize to array for consistent handling
    if (options?.onBeforeQuery) {
      this.onBeforeQueryCallbacks = Array.isArray(options.onBeforeQuery)
        ? options.onBeforeQuery
        : [options.onBeforeQuery];
    }
  }

  /** Run all before-query hooks sequentially with the models the operation touches */
  private async beforeQuery(modelNames: string[]): Promise<void> {
    for (const callback of this.onBeforeQueryCallbacks) {
      await callback(modelNames);
    }
  }

  /** Run a builder call, wrapping a database error in the Cerial call that produced it */
  private async run<R>(operation: string, compiled: CompiledQuery, call: () => Promise<R>): Promise<R> {
    try {
      return await call();
    } catch (error) {
      throw wrapDatabaseError(error, this.metadata.name, operation, this.includeStatement ? compiled : undefined);
    }
  }

  /** Resolve the db connection, routing through txn if provided */
  private resolveDb(txn?: CerialTransaction): Surreal {
    if (txn) {
      txn._ensureActive();

      return txn._raw as unknown as Surreal;
    }

    return this.db;
  }

  /** Get model metadata */
  getMetadata(): ModelMetadata {
    return this.metadata;
  }

  /** Get model name */
  getName(): string {
    return this.metadata.name;
  }

  /** Get table name */
  getTableName(): string {
    return this.metadata.tableName;
  }

  /**
   * Run a whole raw statement and return the last statement's result as an array. Object rows are mapped
   * as this model's rows; any other value (`SELECT VALUE name`, `RETURN 1`) is returned as it is.
   */
  $raw<R = unknown>(fragment: SqlFragment<R>, options: { txn?: CerialTransaction } = {}): CerialQueryPromise<R[]> {
    const compiled = compileRawStatement(fragment);
    const modelNames = [this.metadata.name];

    return new CerialQueryPromise<R[]>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(options.txn);
        const rows = await this.run('$raw', compiled, () => executeRawStatement<R>(db, compiled));

        return mapRawResult<R>(rows, this.metadata);
      },
      compiled,
      this.metadata,
      'raw',
      this.registry,
      modelNames,
    );
  }

  /**
   * Subscribe to changes on this model's table with a managed live query. Resolves once the query is
   * registered. Rows arrive mapped through the model, a delete carries the row it removed, and the handle
   * ends when the query is killed. Not available inside a transaction.
   * @param options.where - A typed where of this model, including `$raw`
   */
  async $live<R = T>(options?: ModelLiveOptions): Promise<CerialLiveHandle<R>> {
    await this.beforeQuery([this.metadata.name]);

    return createModelLive<R>(
      this.metadata,
      this.registry,
      options,
      async () => this.db,
      (handle) => this.trackLive?.(handle) ?? (() => {}),
    );
  }

  /** Find a single record */
  findOne(options: FindOneOptionsWithInclude & { txn?: CerialTransaction } = {}): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, { include: queryOptions.include });
    const compiled = compileFindOne(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('findOne', compiled.query, () =>
          QueryBuilderStatic.findOne<T>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /** Find a unique record by id */
  findUnique(options: FindUniqueOptionsWithInclude & { txn?: CerialTransaction }): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, { include: queryOptions.include });
    const compiled = compileFindUnique(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('findUnique', compiled.query, () =>
          QueryBuilderStatic.findUnique<T>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /** Find multiple records */
  findMany(options: FindManyOptionsWithInclude & { txn?: CerialTransaction } = {}): CerialQueryPromise<T[]> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, { include: queryOptions.include });
    const compiled = compileFindMany(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('findMany', compiled.query, () =>
          QueryBuilderStatic.findMany<T>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /** Create a new record */
  create(options: CreateOptions<Partial<T>> & { txn?: CerialTransaction }): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {
      data: [queryOptions.data as Record<string, unknown>],
      include: queryOptions.include as IncludeClause,
    });
    const compiled = compileCreate(
      this.metadata,
      queryOptions as CreateOptions<Record<string, unknown>>,
      this.registry,
    );

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('create', compiled.query, () =>
          QueryBuilderStatic.create<T>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /** Update records matching where clause */
  updateMany(
    options: UpdateOptions<Partial<T>> & { unset?: Record<string, unknown>; txn?: CerialTransaction },
  ): CerialQueryPromise<T[]> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {
      data: [queryOptions.data as Record<string, unknown>],
      include: queryOptions.include as IncludeClause,
    });
    const compiled = compileUpdateMany(
      this.metadata,
      queryOptions as UpdateOptions<Record<string, unknown>>,
      this.registry,
    );

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('updateMany', compiled.query, () =>
          QueryBuilderStatic.updateMany<T>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /**
   * Update a unique record by id or unique field
   * @param options - Update options with where clause, data, and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null/'after': Model | null (updated record with select/include support)
   *   - true: boolean (true if record found and updated, false if not)
   *   - 'before': Model | null (pre-update record, select and include read before the write)
   */
  updateUnique<R extends UpdateUniqueReturn = undefined>(options: {
    where: WhereClause;
    data: Partial<T>;
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpdateUniqueResult<T, R>> {
    const { txn, ...queryOptions } = options;
    // The compile call below is handed a rebuilt options object, which would drop the key unseen
    refuseCompute(queryOptions, this.metadata, 'updateUnique');
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {
      data: [queryOptions.data as Record<string, unknown>],
      include: queryOptions.include,
    });
    const compiled = compileUpdateUnique(
      this.metadata,
      {
        where: queryOptions.where,
        data: queryOptions.data as Record<string, unknown>,
        unset: queryOptions.unset,
        select: queryOptions.select,
        include: queryOptions.include,
        return: queryOptions.return,
      },
      this.registry,
    );

    return new CerialQueryPromise<UpdateUniqueResult<T, R>>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('updateUnique', compiled.query, () =>
          QueryBuilderStatic.updateUnique<T, R>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }

  /** Delete records matching where clause */
  deleteMany(options: DeleteManyOptions & { txn?: CerialTransaction }): CerialQueryPromise<number> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, { isDelete: true });
    const compiled = compileDeleteMany(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('deleteMany', compiled.query, () =>
          QueryBuilderStatic.deleteMany(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
    );
  }

  /**
   * Delete a unique record by id or unique field
   * @param options - Delete options with where clause and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null: boolean (always true)
   *   - true: boolean (true if record existed, false if not)
   *   - 'before': Model | null (deleted data)
   */
  deleteUnique<R extends DeleteUniqueReturn = undefined>(options: {
    where: WhereClause;
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<DeleteUniqueResult<T, R>> {
    const { txn, ...queryOptions } = options;
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, { isDelete: true });
    const compiled = compileDeleteUnique(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<DeleteUniqueResult<T, R>>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('deleteUnique', compiled.query, () =>
          QueryBuilderStatic.deleteUnique<T, R>(db, this.metadata, queryOptions, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
    );
  }

  /** Count records matching where clause using SELECT count() ... GROUP ALL */
  count(where?: FindManyOptionsWithInclude['where'], txn?: CerialTransaction): CerialQueryPromise<number> {
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {});
    const compiled = compileCount(this.metadata, where, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('count', compiled.query, () =>
          QueryBuilderStatic.count(db, this.metadata, where, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
    );
  }

  /** Check if any record exists matching where clause */
  exists(where?: FindOneOptionsWithInclude['where'], txn?: CerialTransaction): CerialQueryPromise<boolean> {
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {});
    const compiled = compileExists(this.metadata, where, this.registry);

    return new CerialQueryPromise<boolean>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        return this.run('exists', compiled.query, () =>
          QueryBuilderStatic.exists(db, this.metadata, where, this.registry),
        );
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
    );
  }

  /**
   * Upsert a record - create if it doesn't exist, update if it does
   * @param options - Upsert options with where, create data, update data, and return configuration
   * @returns The runtime class cannot tell a unique `where` from a non-unique one, so the
   *   result is the union of both generated overloads:
   *   - true: boolean
   *   - otherwise: Model | null for an id or unique field, Model[] for a non-unique where
   */
  upsert<R extends UpsertReturn = undefined>(options: {
    where: WhereClause;
    create: Record<string, unknown>;
    update?: Record<string, unknown>;
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<UpsertReturnType<T, R> | UpsertArrayReturnType<T, R>> {
    const { txn, ...queryOptions } = options;
    // The compile call below is handed a rebuilt options object, which would drop the key unseen
    refuseCompute(queryOptions, this.metadata, 'upsert');
    const modelNames = collectRelatedModelNames(this.metadata, this.registry, {
      data: [queryOptions.create, queryOptions.update],
      include: queryOptions.include,
    });
    const compiled = compileUpsert(
      this.metadata,
      {
        where: queryOptions.where,
        create: queryOptions.create,
        update: queryOptions.update,
        unset: queryOptions.unset,
        select: queryOptions.select,
        include: queryOptions.include,
        return: queryOptions.return,
      },
      this.registry,
    );

    return new CerialQueryPromise<UpsertReturnType<T, R> | UpsertArrayReturnType<T, R>>(
      async () => {
        await this.beforeQuery(modelNames);
        const db = this.resolveDb(txn);

        // The builder returns unknown because the shape depends on the where clause
        const result = await this.run('upsert', compiled.query, () =>
          QueryBuilderStatic.upsert<T, R>(db, this.metadata, queryOptions, this.registry),
        );

        return result as UpsertReturnType<T, R> | UpsertArrayReturnType<T, R>;
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
      modelNames,
      queryOptions.select,
    );
  }
}

/** Create a model instance */
export function createModel<T extends Record<string, unknown>>(
  db: Surreal,
  metadata: ModelMetadata,
  registry?: ModelRegistry,
  options?: ModelOptions,
): Model<T> {
  return new Model<T>(db, metadata, registry, options);
}
