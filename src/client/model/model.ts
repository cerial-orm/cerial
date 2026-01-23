/**
 * Model class - provides query methods for a model
 */

import type { Surreal } from 'surrealdb';
import type { ModelMetadata, FindOneOptions, FindManyOptions, CreateOptions, UpdateOptions, DeleteOptions } from '../../types';
import { QueryBuilderStatic } from '../../query/builder';

/** Model class that wraps query builder methods */
export class Model<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private db: Surreal,
    private metadata: ModelMetadata,
  ) {}

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
    return QueryBuilderStatic.findOne<T>(this.db, this.metadata, options);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptions = {}): Promise<T[]> {
    return QueryBuilderStatic.findMany<T>(this.db, this.metadata, options);
  }

  /** Find all records (alias for findMany with no options) */
  async findAll(): Promise<T[]> {
    return this.findMany();
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    return QueryBuilderStatic.create<T>(this.db, this.metadata, options);
  }

  /** Update records matching where clause */
  async update(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    return QueryBuilderStatic.update<T>(this.db, this.metadata, options);
  }

  /** Update a single record (first match) */
  async updateOne(options: UpdateOptions<Partial<T>>): Promise<T | null> {
    const results = await this.update(options);
    return results[0] ?? null;
  }

  /** Delete records matching where clause */
  async delete(options: DeleteOptions): Promise<number> {
    return QueryBuilderStatic.delete(this.db, this.metadata, options);
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
): Model<T> {
  return new Model<T>(db, metadata);
}
