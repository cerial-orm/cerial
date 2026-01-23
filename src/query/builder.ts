/**
 * Query builder - main query building logic
 */

import type { Surreal } from 'surrealdb';
import type { ModelMetadata, FindOneOptions, FindManyOptions, CreateOptions, UpdateOptions, DeleteOptions } from '../types';
import { buildFindOneQuery, buildFindManyQuery, buildCreateQuery, buildUpdateQuery, buildDeleteQuery } from './builders';
import { transformData, applyNowDefaults } from './transformers';
import { mapResult, mapSingleResult } from './mappers';
import { validateWhere, validateCreateData, validateUpdateData } from './validators';
import { executeQuery, executeQuerySingle } from './executor';

/** Query builder class for a specific model */
export class QueryBuilder<T extends Record<string, unknown>> {
  constructor(
    private db: Surreal,
    private model: ModelMetadata,
  ) {}

  /** Find a single record */
  async findOne(options: FindOneOptions = {}): Promise<T | null> {
    // Validate where clause
    const validation = validateWhere(options.where, this.model);
    if (!validation.valid) {
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildFindOneQuery(this.model, options);
    const result = await executeQuerySingle(this.db, query);
    return mapSingleResult<T>(result, this.model, options.select);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptions = {}): Promise<T[]> {
    // Validate where clause
    const validation = validateWhere(options.where, this.model);
    if (!validation.valid) {
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildFindManyQuery(this.model, options);
    const result = await executeQuery(this.db, query);
    return mapResult<T>(result, this.model, options.select);
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    const { data, select } = options;

    // Transform and validate data
    const transformedData = transformData(
      applyNowDefaults(data as Record<string, unknown>, this.model),
      this.model,
    );

    const validation = validateCreateData(transformedData, this.model);
    if (!validation.valid) {
      throw new Error(`Invalid data: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildCreateQuery(this.model, transformedData, select);
    const result = await executeQuerySingle(this.db, query);
    return mapSingleResult<T>(result, this.model, select);
  }

  /** Update records matching where clause */
  async update(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    const { where, data, select } = options;

    // Validate where clause
    const whereValidation = validateWhere(where, this.model);
    if (!whereValidation.valid) {
      throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);
    }

    // Transform and validate data
    const transformedData = transformData(data as Record<string, unknown>, this.model);

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid) {
      throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildUpdateQuery(this.model, where, transformedData, select);
    const result = await executeQuery(this.db, query);
    return mapResult<T>(result, this.model, select);
  }

  /** Delete records matching where clause */
  async delete(options: DeleteOptions): Promise<number> {
    const { where } = options;

    // Validate where clause
    const validation = validateWhere(where, this.model);
    if (!validation.valid) {
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildDeleteQuery(this.model, where);
    const result = await executeQuery(this.db, query);
    return Array.isArray(result) ? result.length : 0;
  }
}

/** Static query builder methods */
export const QueryBuilderStatic = {
  /** Find a single record */
  async findOne<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindOneOptions = {},
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.findOne(options);
  },

  /** Find multiple records */
  async findMany<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindManyOptions = {},
  ): Promise<T[]> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.findMany(options);
  },

  /** Create a new record */
  async create<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: CreateOptions<Partial<T>>,
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.create(options);
  },

  /** Update records */
  async update<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: UpdateOptions<Partial<T>>,
  ): Promise<T[]> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.update(options);
  },

  /** Delete records */
  async delete(
    db: Surreal,
    model: ModelMetadata,
    options: DeleteOptions,
  ): Promise<number> {
    const builder = new QueryBuilder(db, model);
    return builder.delete(options);
  },
};
