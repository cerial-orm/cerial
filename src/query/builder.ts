/**
 * Query builder - main query building logic
 */

import type { Surreal } from 'surrealdb';
import type {
  CreateOptions,
  DeleteManyOptions,
  FindManyOptions,
  FindOneOptions,
  FindUniqueOptions,
  ModelMetadata,
  UpdateOptions,
} from '../types';
import {
  buildCreateQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildFindUniqueQuery,
  buildUpdateManyQuery,
} from './builders';
import { executeQuery, executeQuerySingle } from './executor';
import { mapResult, mapSingleResult } from './mappers';
import { applyNowDefaults, transformData } from './transformers';
import { validateCreateData, validateUpdateData, validateWhere } from './validators';

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
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindOneQuery(this.model, options);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model);
  }

  /** Find a unique record by id */
  async findUnique(options: FindUniqueOptions): Promise<T | null> {
    const { where } = options;

    // Extract id from where clause and validate
    const idValue = where?.id;
    if (!idValue) throw new Error('id is required in where clause for findUnique');

    // Remove 'id' from where clause for validation
    const { id: _id, ...whereWithoutId } = where;

    // Validate where clause (excluding id field)
    const validation = validateWhere(Object.keys(whereWithoutId).length ? whereWithoutId : undefined, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindUniqueQuery(this.model, options);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptions = {}): Promise<T[]> {
    // Validate where clause
    const validation = validateWhere(options.where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindManyQuery(this.model, options);
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model);
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    const { data, select } = options;

    // Validate data BEFORE transformation (so we check original values)
    const dataWithDefaults = applyNowDefaults(data as Record<string, unknown>, this.model);
    const validation = validateCreateData(dataWithDefaults, this.model);
    if (!validation.valid) throw new Error(`Invalid data: ${validation.errors.map((e) => e.message).join(', ')}`);

    // Transform data after validation (converts dates to Date objects, ids to RecordId, etc.)
    const transformedData = transformData(dataWithDefaults, this.model);

    const query = buildCreateQuery(this.model, transformedData, select);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model);
  }

  /** Update records matching where clause */
  async updateMany(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    const { where, data, select } = options;

    // Validate where clause
    const whereValidation = validateWhere(where, this.model);
    if (!whereValidation.valid)
      throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

    // Transform and validate data
    const transformedData = transformData(data as Record<string, unknown>, this.model);

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid)
      throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);

    const query = buildUpdateManyQuery(this.model, where, transformedData, select);
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model);
  }

  /** Delete records matching where clause */
  async deleteMany(options: DeleteManyOptions): Promise<number> {
    const { where } = options;

    // Validate where clause
    const validation = validateWhere(where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    // Use buildDeleteQueryWithReturn to get deleted records count
    const query = buildDeleteQueryWithReturn(this.model, where);
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

  /** Find a unique record by id */
  async findUnique<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindUniqueOptions,
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.findUnique(options);
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
  async updateMany<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: UpdateOptions<Partial<T>>,
  ): Promise<T[]> {
    const builder = new QueryBuilder<T>(db, model);
    return builder.updateMany(options);
  },

  /** Delete records */
  async deleteMany(db: Surreal, model: ModelMetadata, options: DeleteManyOptions): Promise<number> {
    const builder = new QueryBuilder(db, model);
    return builder.deleteMany(options);
  },
};
