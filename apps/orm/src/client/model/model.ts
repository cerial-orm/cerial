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
} from '../../query/builder';
import type { IncludeClause } from '../../query/builders';
import { CerialQueryPromise } from '../../query/cerial-query-promise';
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
  UpsertReturn,
  WhereClause,
} from '../../types';
import type { CerialTransaction } from '../cerial-transaction';

/** Extended find unique options with include support */
export interface FindUniqueOptionsWithInclude {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  include?: Record<string, boolean | object>;
}

/** Callback type for before-query hook (receives model name for context) */
export type BeforeQueryCallback = (modelName: string) => Promise<void>;

/** Model options */
export interface ModelOptions {
  /** Callback(s) to run before each query - can be single function or array (e.g., for lazy migrations, logging) */
  onBeforeQuery?: BeforeQueryCallback | BeforeQueryCallback[];
}

/** Model class that wraps query builder methods */
export class Model<T extends Record<string, unknown> = Record<string, unknown>> {
  private onBeforeQueryCallbacks: BeforeQueryCallback[] = [];

  constructor(
    private db: Surreal,
    private metadata: ModelMetadata,
    private registry?: ModelRegistry,
    options?: ModelOptions,
  ) {
    // Normalize to array for consistent handling
    if (options?.onBeforeQuery) {
      this.onBeforeQueryCallbacks = Array.isArray(options.onBeforeQuery)
        ? options.onBeforeQuery
        : [options.onBeforeQuery];
    }
  }

  /** Run all before-query hooks sequentially with model name */
  private async beforeQuery(): Promise<void> {
    for (const callback of this.onBeforeQueryCallbacks) {
      await callback(this.metadata.name);
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

  /** Find a single record */
  findOne(options: FindOneOptionsWithInclude & { txn?: CerialTransaction } = {}): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const compiled = compileFindOne(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.findOne<T>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Find a unique record by id */
  findUnique(options: FindUniqueOptionsWithInclude & { txn?: CerialTransaction }): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const compiled = compileFindUnique(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.findUnique<T>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Find multiple records */
  findMany(options: FindManyOptionsWithInclude & { txn?: CerialTransaction } = {}): CerialQueryPromise<T[]> {
    const { txn, ...queryOptions } = options;
    const compiled = compileFindMany(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.findMany<T>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Find all records (alias for findMany with no options) */
  findAll(): CerialQueryPromise<T[]> {
    return this.findMany();
  }

  /** Create a new record */
  create(options: CreateOptions<Partial<T>> & { txn?: CerialTransaction }): CerialQueryPromise<T | null> {
    const { txn, ...queryOptions } = options;
    const compiled = compileCreate(
      this.metadata,
      queryOptions as CreateOptions<Record<string, unknown>>,
      this.registry,
    );

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.create<T>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Update records matching where clause */
  updateMany(
    options: UpdateOptions<Partial<T>> & { unset?: Record<string, unknown>; txn?: CerialTransaction },
  ): CerialQueryPromise<T[]> {
    const { txn, ...queryOptions } = options;
    const compiled = compileUpdateMany(
      this.metadata,
      queryOptions as UpdateOptions<Record<string, unknown>>,
      this.registry,
    );

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.updateMany<T>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /**
   * Update a unique record by id or unique field
   * @param options - Update options with where clause, data, and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null/'after': Model | null (updated record with select/include support)
   *   - true: boolean (true if record found and updated, false if not)
   *   - 'before': Model | null (pre-update record, no select/include support)
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
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.updateUnique<T, R>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Delete records matching where clause */
  deleteMany(options: DeleteManyOptions & { txn?: CerialTransaction }): CerialQueryPromise<number> {
    const { txn, ...queryOptions } = options;
    const compiled = compileDeleteMany(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.deleteMany(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
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
    const compiled = compileDeleteUnique(this.metadata, queryOptions, this.registry);

    return new CerialQueryPromise<DeleteUniqueResult<T, R>>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.deleteUnique<T, R>(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Count records matching where clause using SELECT count() ... GROUP ALL */
  count(where?: FindManyOptionsWithInclude['where'], txn?: CerialTransaction): CerialQueryPromise<number> {
    const compiled = compileCount(this.metadata, where, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.count(db, this.metadata, where, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Check if any record exists matching where clause */
  exists(where?: FindOneOptionsWithInclude['where'], txn?: CerialTransaction): CerialQueryPromise<boolean> {
    const compiled = compileExists(this.metadata, where, this.registry);

    return new CerialQueryPromise<boolean>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.exists(db, this.metadata, where, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /**
   * Upsert a record - create if it doesn't exist, update if it does
   * @param options - Upsert options with where, create data, update data, and return configuration
   * @returns Depends on where clause and return option:
   *   - ID or unique field: single result (Model | null or boolean)
   *   - Non-unique where: array result (Model[])
   */
  upsert<R extends UpsertReturn = undefined>(options: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update?: Record<string, unknown>;
    unset?: Record<string, unknown>;
    select?: Record<string, boolean>;
    include?: Record<string, boolean | object>;
    return?: R;
    txn?: CerialTransaction;
  }): CerialQueryPromise<unknown> {
    const { txn, ...queryOptions } = options;
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

    return new CerialQueryPromise<unknown>(
      async () => {
        await this.beforeQuery();
        const db = this.resolveDb(txn);

        return QueryBuilderStatic.upsert(db, this.metadata, queryOptions, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
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
