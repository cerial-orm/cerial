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
  findOne(options: FindOneOptionsWithInclude = {}): CerialQueryPromise<T | null> {
    const compiled = compileFindOne(this.metadata, options, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.findOne<T>(this.db, this.metadata, options, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Find a unique record by id */
  findUnique(options: FindUniqueOptionsWithInclude): CerialQueryPromise<T | null> {
    const compiled = compileFindUnique(this.metadata, options, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.findUnique<T>(this.db, this.metadata, options, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Find multiple records */
  findMany(options: FindManyOptionsWithInclude = {}): CerialQueryPromise<T[]> {
    const compiled = compileFindMany(this.metadata, options, this.registry);

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.findMany<T>(this.db, this.metadata, options, this.registry);
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
  create(options: CreateOptions<Partial<T>>): CerialQueryPromise<T | null> {
    const compiled = compileCreate(this.metadata, options as CreateOptions<Record<string, unknown>>, this.registry);

    return new CerialQueryPromise<T | null>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.create<T>(this.db, this.metadata, options, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Update records matching where clause */
  updateMany(options: UpdateOptions<Partial<T>> & { unset?: Record<string, unknown> }): CerialQueryPromise<T[]> {
    const compiled = compileUpdateMany(this.metadata, options as UpdateOptions<Record<string, unknown>>, this.registry);

    return new CerialQueryPromise<T[]>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.updateMany<T>(this.db, this.metadata, options, this.registry);
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
  }): CerialQueryPromise<UpdateUniqueResult<T, R>> {
    const compiled = compileUpdateUnique(
      this.metadata,
      {
        where: options.where,
        data: options.data as Record<string, unknown>,
        unset: options.unset,
        select: options.select,
        include: options.include,
        return: options.return,
      },
      this.registry,
    );

    return new CerialQueryPromise<UpdateUniqueResult<T, R>>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.updateUnique<T, R>(this.db, this.metadata, options, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Delete records matching where clause */
  deleteMany(options: DeleteManyOptions): CerialQueryPromise<number> {
    const compiled = compileDeleteMany(this.metadata, options, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.deleteMany(this.db, this.metadata, options, this.registry);
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
  }): CerialQueryPromise<DeleteUniqueResult<T, R>> {
    const compiled = compileDeleteUnique(this.metadata, options, this.registry);

    return new CerialQueryPromise<DeleteUniqueResult<T, R>>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.deleteUnique<T, R>(this.db, this.metadata, options, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Count records matching where clause using SELECT count() ... GROUP ALL */
  count(where?: FindManyOptionsWithInclude['where']): CerialQueryPromise<number> {
    const compiled = compileCount(this.metadata, where, this.registry);

    return new CerialQueryPromise<number>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.count(this.db, this.metadata, where, this.registry);
      },
      compiled.query,
      this.metadata,
      compiled.resultType,
      this.registry,
    );
  }

  /** Check if any record exists matching where clause */
  exists(where?: FindOneOptionsWithInclude['where']): CerialQueryPromise<boolean> {
    const compiled = compileExists(this.metadata, where, this.registry);

    return new CerialQueryPromise<boolean>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.exists(this.db, this.metadata, where, this.registry);
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
  }): CerialQueryPromise<unknown> {
    const compiled = compileUpsert(
      this.metadata,
      {
        where: options.where,
        create: options.create,
        update: options.update,
        unset: options.unset,
        select: options.select,
        include: options.include,
        return: options.return,
      },
      this.registry,
    );

    return new CerialQueryPromise<unknown>(
      async () => {
        await this.beforeQuery();

        return QueryBuilderStatic.upsert(this.db, this.metadata, options, this.registry);
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
