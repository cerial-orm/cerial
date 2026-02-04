/**
 * Model class - provides query methods for a model
 */

import type { Surreal } from 'surrealdb';
import {
  QueryBuilderStatic,
  type FindManyOptionsWithInclude,
  type FindOneOptionsWithInclude,
} from '../../query/builder';
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
  WhereClause,
} from '../../types';
import type { IncludeClause } from '../../query/builders';

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
  async findOne(options: FindOneOptionsWithInclude = {}): Promise<T | null> {
    await this.beforeQuery();
    return QueryBuilderStatic.findOne<T>(this.db, this.metadata, options, this.registry);
  }

  /** Find a unique record by id */
  async findUnique(options: FindUniqueOptionsWithInclude): Promise<T | null> {
    await this.beforeQuery();
    return QueryBuilderStatic.findUnique<T>(this.db, this.metadata, options, this.registry);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptionsWithInclude = {}): Promise<T[]> {
    await this.beforeQuery();
    return QueryBuilderStatic.findMany<T>(this.db, this.metadata, options, this.registry);
  }

  /** Find all records (alias for findMany with no options) */
  async findAll(): Promise<T[]> {
    return this.findMany();
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    await this.beforeQuery();

    return QueryBuilderStatic.create<T>(this.db, this.metadata, options, this.registry);
  }

  /** Update records matching where clause */
  async updateMany(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    await this.beforeQuery();

    return QueryBuilderStatic.updateMany<T>(this.db, this.metadata, options, this.registry);
  }

  /**
   * Update a unique record by id or unique field
   * @param options - Update options with where clause, data, and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null/'after': Model | null (updated record with select/include support)
   *   - true: boolean (true if record found and updated, false if not)
   *   - 'before': Model | null (pre-update record, no select/include support)
   */
  async updateUnique<R extends UpdateUniqueReturn = undefined>(options: {
    where: WhereClause;
    data: Partial<T>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
  }): Promise<UpdateUniqueResult<T, R>> {
    await this.beforeQuery();

    return QueryBuilderStatic.updateUnique<T, R>(this.db, this.metadata, options, this.registry);
  }

  /** Delete records matching where clause */
  async deleteMany(options: DeleteManyOptions): Promise<number> {
    await this.beforeQuery();

    return QueryBuilderStatic.deleteMany(this.db, this.metadata, options, this.registry);
  }

  /**
   * Delete a unique record by id or unique field
   * @param options - Delete options with where clause and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null: boolean (always true)
   *   - true: boolean (true if record existed, false if not)
   *   - 'before': Model | null (deleted data)
   */
  async deleteUnique<R extends DeleteUniqueReturn = undefined>(options: {
    where: WhereClause;
    return?: R;
  }): Promise<DeleteUniqueResult<T, R>> {
    await this.beforeQuery();

    return QueryBuilderStatic.deleteUnique<T, R>(this.db, this.metadata, options, this.registry);
  }

  /** Count records matching where clause */
  async count(where?: FindManyOptionsWithInclude['where']): Promise<number> {
    const results = await this.findMany({ where });
    return results.length;
  }

  /** Check if any record exists matching where clause */
  async exists(where: FindOneOptionsWithInclude['where']): Promise<boolean> {
    const result = await this.findOne({ where });
    return result !== null;
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
