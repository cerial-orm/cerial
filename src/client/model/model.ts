/**
 * Model class - provides query methods for a model
 */

import type { Surreal } from 'surrealdb';
import type {
  ModelMetadata,
  FindOneOptions,
  FindUniqueOptions,
  FindManyOptions,
  CreateOptions,
  UpdateOptions,
  DeleteManyOptions,
} from '../../types';
import { QueryBuilderStatic } from '../../query/builder';

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
  async findOne(options: FindOneOptions = {}): Promise<T | null> {
    await this.beforeQuery();
    return QueryBuilderStatic.findOne<T>(this.db, this.metadata, options);
  }

  /** Find a unique record by id */
  async findUnique(options: FindUniqueOptions): Promise<T | null> {
    await this.beforeQuery();
    return QueryBuilderStatic.findUnique<T>(this.db, this.metadata, options);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptions = {}): Promise<T[]> {
    await this.beforeQuery();
    return QueryBuilderStatic.findMany<T>(this.db, this.metadata, options);
  }

  /** Find all records (alias for findMany with no options) */
  async findAll(): Promise<T[]> {
    return this.findMany();
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    await this.beforeQuery();
    return QueryBuilderStatic.create<T>(this.db, this.metadata, options);
  }

  /** Update records matching where clause */
  async updateMany(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    await this.beforeQuery();
    return QueryBuilderStatic.updateMany<T>(this.db, this.metadata, options);
  }

  /** Delete records matching where clause */
  async deleteMany(options: DeleteManyOptions): Promise<number> {
    await this.beforeQuery();
    return QueryBuilderStatic.deleteMany(this.db, this.metadata, options);
  }

  /** Count records matching where clause */
  async count(where?: FindManyOptions['where']): Promise<number> {
    const results = await this.findMany({ where });
    return results.length;
  }

  /** Check if any record exists matching where clause */
  async exists(where: FindOneOptions['where']): Promise<boolean> {
    const result = await this.findOne({ where });
    return result !== null;
  }
}

/** Create a model instance */
export function createModel<T extends Record<string, unknown>>(
  db: Surreal,
  metadata: ModelMetadata,
  options?: ModelOptions,
): Model<T> {
  return new Model<T>(db, metadata, options);
}
