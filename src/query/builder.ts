/**
 * Query builder - main query building logic
 */

import type { Surreal } from 'surrealdb';
import type {
  CreateOptions,
  DeleteManyOptions,
  DeleteUniqueResult,
  DeleteUniqueReturn,
  FindManyOptions,
  FindOneOptions,
  ModelMetadata,
  ModelRegistry,
  SelectClause,
  UpdateOptions,
  UpdateUniqueResult,
  UpdateUniqueReturn,
  WhereClause,
} from '../types';
import {
  buildCreateQuery,
  buildCreateWithNestedTransaction,
  buildDeleteQueryWithReturn,
  buildDeleteUniqueFetchQuery,
  buildDeleteUniqueQuery,
  buildDeleteUniqueWithCascade,
  buildDeleteWithCascade,
  buildFindManyQuery,
  buildFindOneQuery,
  buildFindUniqueQuery,
  buildUpdateManyQuery,
  buildUpdateUniqueQuery,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
  getRecordIdFromWhere,
  type FindOptionsWithInclude,
  type FindUniqueOptionsWithInclude,
  type IncludeClause,
} from './builders';
import { executeQuery, executeQuerySingle } from './executor';
import { mapResult, mapSingleResult } from './mappers';
import { applyNowDefaults, transformData } from './transformers';
import { validateCreateData, validateUpdateData, validateWhere } from './validators';

/** Extended find options with include support */
export interface FindOneOptionsWithInclude extends FindOneOptions {
  include?: Record<string, boolean | object>;
}

/** Extended find many options with include support */
export interface FindManyOptionsWithInclude extends FindManyOptions {
  include?: Record<string, boolean | object>;
}

/** Query builder class for a specific model */
export class QueryBuilder<T extends Record<string, unknown>> {
  constructor(
    private db: Surreal,
    private model: ModelMetadata,
    private registry?: ModelRegistry,
  ) {}

  /** Find a single record */
  async findOne(options: FindOneOptionsWithInclude = {}): Promise<T | null> {
    // Validate where clause
    const validation = validateWhere(options.where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindOneQuery(this.model, options as FindOptionsWithInclude, this.registry);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model);
  }

  /** Find a unique record by id or unique field */
  async findUnique(options: FindUniqueOptionsWithInclude): Promise<T | null> {
    const { where } = options;

    // Validate the entire where clause (including unique fields)
    // The unique field validation is handled in buildFindUniqueQuery
    const validation = validateWhere(where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindUniqueQuery(this.model, options as FindUniqueOptionsWithInclude, this.registry);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptionsWithInclude = {}): Promise<T[]> {
    // Validate where clause
    const validation = validateWhere(options.where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    const query = buildFindManyQuery(this.model, options as FindOptionsWithInclude, this.registry);
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model);
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    const { data, select } = options;

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Validate data BEFORE transformation (so we check original values)
    // Pass nestedOps so validation knows which Record fields will be satisfied by nested operations
    const dataWithDefaults = applyNowDefaults(cleanData, this.model);
    const validation = validateCreateData(dataWithDefaults, this.model, nestedOps);
    if (!validation.valid) throw new Error(`Invalid data: ${validation.errors.map((e) => e.message).join(', ')}`);

    // Transform data after validation (converts dates to Date objects, ids to RecordId, etc.)
    const transformedData = transformData(dataWithDefaults, this.model);

    // If there are nested operations, use the transaction builder
    if (nestedOps.size > 0 && this.registry) {
      const query = buildCreateWithNestedTransaction(this.model, transformedData, nestedOps, this.registry);
      const result = await executeQuerySingle(this.db, query);

      return mapSingleResult<T>(result, this.model);
    }

    // Simple create without nested operations
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

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Transform and validate data
    const transformedData = transformData(cleanData, this.model);

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid)
      throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);

    // If there are nested operations, use the transaction builder
    if (nestedOps.size > 0 && this.registry) {
      const query = buildUpdateWithNestedTransaction(this.model, where, transformedData, nestedOps, this.registry);
      const result = await executeQuery(this.db, query);

      return mapResult<T>(result, this.model);
    }

    // Simple update without nested operations
    const query = buildUpdateManyQuery(this.model, where, transformedData, select);
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model);
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
    const { where, data, select, include, return: returnOption } = options;

    // Validate where clause
    const whereValidation = validateWhere(where, this.model);
    if (!whereValidation.valid)
      throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

    // Validate unique field requirement
    const { hasId } = getRecordIdFromWhere(where, this.model, 'updateUnique');

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Transform and validate data
    const transformedData = transformData(cleanData, this.model);

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid)
      throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);

    // If there are nested operations, use the transaction builder
    // TODO: Add support for nested operations with updateUnique
    if (nestedOps.size > 0 && this.registry) {
      // For now, use updateMany with the same where clause and return first result
      const query = buildUpdateWithNestedTransaction(this.model, where, transformedData, nestedOps, this.registry);
      const result = await executeQuery(this.db, query);
      const record = Array.isArray(result) ? result[0] : result;

      return this.handleUpdateUniqueResult<R>(record, returnOption);
    }

    // Build and execute the update query
    const query = buildUpdateUniqueQuery(
      this.model,
      where,
      transformedData,
      returnOption ?? undefined,
      select,
      include,
      this.registry,
    );

    // Execute query - UPDATE ONLY returns single result, UPDATE returns array
    if (hasId) {
      try {
        const result = await executeQuerySingle(this.db, query);

        return this.handleUpdateUniqueResult<R>(result, returnOption);
      } catch (error) {
        // UPDATE ONLY throws error when record doesn't exist
        if (
          error instanceof Error &&
          error.message.includes('Expected a single result output when using the ONLY keyword')
        ) {
          return this.handleUpdateUniqueResult<R>(null, returnOption);
        }
        throw error;
      }
    }

    // Non-ID unique field: UPDATE returns array, take first result
    const result = await executeQuery(this.db, query);
    const record = Array.isArray(result) && result.length > 0 ? result[0] : null;

    return this.handleUpdateUniqueResult<R>(record, returnOption);
  }

  /** Handle updateUnique result based on return option */
  private handleUpdateUniqueResult<R extends UpdateUniqueReturn>(
    result: unknown,
    returnOption: R | undefined,
  ): UpdateUniqueResult<T, R> {
    // true: return whether record was found and updated
    if (returnOption === true) {
      return (result !== null) as UpdateUniqueResult<T, R>;
    }

    // Default / 'after' / 'before': return the record or null
    if (result === null) {
      return null as UpdateUniqueResult<T, R>;
    }

    return mapSingleResult<T>(result, this.model) as UpdateUniqueResult<T, R>;
  }

  /** Delete records matching where clause */
  async deleteMany(options: DeleteManyOptions): Promise<number> {
    const { where } = options;

    // Validate where clause
    const validation = validateWhere(where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    // Use cascade delete if registry is available (handles @onDelete behavior)
    if (this.registry) {
      const query = buildDeleteWithCascade(this.model, where, this.registry);
      const result = await executeQuery(this.db, query);

      return Array.isArray(result) ? result.length : 0;
    }

    // Simple delete without cascade
    const query = buildDeleteQueryWithReturn(this.model, where);
    const result = await executeQuery(this.db, query);

    return Array.isArray(result) ? result.length : 0;
  }

  /**
   * Delete a unique record by id or unique field
   * @param options - Delete options with where clause and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null: boolean (always true)
   *   - true: boolean (true if record existed, false if not)
   *   - 'before': Model | null (raw deleted data)
   *   - 'beforeAndCheck': Model | null (validated, slower - fetches first)
   */
  async deleteUnique<R extends DeleteUniqueReturn = undefined>(options: {
    where: WhereClause;
    return?: R;
  }): Promise<DeleteUniqueResult<T, R>> {
    const { where, return: returnOption } = options;

    // Validate where clause
    const validation = validateWhere(where, this.model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

    // Get record ID info (also validates unique field requirement)
    const { hasId, id } = getRecordIdFromWhere(where, this.model, 'deleteUnique');

    // Determine if we need RETURN BEFORE
    const needsReturnBefore = returnOption === true || returnOption === 'before';

    // Handle 'beforeAndCheck' mode: SELECT → validate → DELETE
    if (returnOption === 'beforeAndCheck') {
      return this.deleteUniqueWithValidation<R>(where, hasId, id);
    }

    // For non-ID lookups OR when we need to check existence, pre-fetch the record
    // This avoids transaction failures when the record doesn't exist
    if (!hasId || returnOption === true || returnOption === 'before') {
      // Fetch record first to get ID and check existence
      const fetchQuery = buildDeleteUniqueFetchQuery(this.model, where);
      const record = await executeQuerySingle(this.db, fetchQuery);

      // Handle non-existent record
      if (record === null) {
        if (returnOption === true) return false as DeleteUniqueResult<T, R>;
        if (returnOption === 'before') return null as DeleteUniqueResult<T, R>;

        return true as DeleteUniqueResult<T, R>;
      }

      // Record exists - delete it
      const recordId = (record as Record<string, unknown>).id as string;

      if (this.registry) {
        // Use cascade delete with the ID we found
        const deleteQuery = buildDeleteUniqueWithCascade(
          this.model,
          { id: recordId },
          this.registry,
          needsReturnBefore,
        );
        const result = await executeQuerySingle(this.db, deleteQuery);

        return this.handleDeleteUniqueResult<R>(result, returnOption);
      }

      // Simple delete without cascade
      const deleteQuery = buildDeleteUniqueQuery(this.model, recordId, needsReturnBefore);
      const result = await executeQuerySingle(this.db, deleteQuery);

      return this.handleDeleteUniqueResult<R>(result, returnOption);
    }

    // ID-based delete with default return (undefined/null) - no pre-check needed
    if (this.registry) {
      const query = buildDeleteUniqueWithCascade(this.model, where, this.registry, false);
      await executeQuerySingle(this.db, query);

      return true as DeleteUniqueResult<T, R>;
    }

    const query = buildDeleteUniqueQuery(this.model, id!, false);
    await executeQuerySingle(this.db, query);

    return true as DeleteUniqueResult<T, R>;
  }

  /** Delete with validation (beforeAndCheck mode) */
  private async deleteUniqueWithValidation<R extends DeleteUniqueReturn>(
    where: WhereClause,
    hasId: boolean,
    id: string | undefined,
  ): Promise<DeleteUniqueResult<T, R>> {
    // First, fetch and validate the record
    const fetchQuery = buildDeleteUniqueFetchQuery(this.model, where);
    const record = await executeQuerySingle(this.db, fetchQuery);

    // If record doesn't exist, return null
    if (record === null) return null as DeleteUniqueResult<T, R>;

    // Validate the record against current schema (throws if invalid)
    const validatedRecord = mapSingleResult<T>(record, this.model);

    // Now delete the record (we know it exists and have the ID)
    const recordId = (record as Record<string, unknown>).id as string;

    if (this.registry) {
      const deleteQuery = buildDeleteUniqueWithCascade(this.model, { id: recordId }, this.registry, false);
      await executeQuerySingle(this.db, deleteQuery);
    } else {
      const deleteQuery = buildDeleteUniqueQuery(this.model, recordId, false);
      await executeQuerySingle(this.db, deleteQuery);
    }

    return validatedRecord as DeleteUniqueResult<T, R>;
  }

  /** Handle deleteUnique result based on return option */
  private handleDeleteUniqueResult<R extends DeleteUniqueReturn>(
    result: unknown,
    returnOption: R | undefined,
  ): DeleteUniqueResult<T, R> {
    // Default (undefined/null): operation succeeded, return true
    if (returnOption === undefined || returnOption === null) return true as DeleteUniqueResult<T, R>;

    // true: return whether record existed
    if (returnOption === true) return (result !== null) as DeleteUniqueResult<T, R>;

    // 'before': return raw data without validation
    if (returnOption === 'before') {
      if (result === null) return null as DeleteUniqueResult<T, R>;

      return mapSingleResult<T>(result, this.model) as DeleteUniqueResult<T, R>;
    }

    return true as DeleteUniqueResult<T, R>;
  }
}

/** Static query builder methods */
export const QueryBuilderStatic = {
  /** Find a single record */
  async findOne<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindOneOptionsWithInclude = {},
    registry?: ModelRegistry,
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model, registry);
    return builder.findOne(options);
  },

  /** Find a unique record by id */
  async findUnique<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindUniqueOptionsWithInclude,
    registry?: ModelRegistry,
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model, registry);
    return builder.findUnique(options);
  },

  /** Find multiple records */
  async findMany<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: FindManyOptionsWithInclude = {},
    registry?: ModelRegistry,
  ): Promise<T[]> {
    const builder = new QueryBuilder<T>(db, model, registry);
    return builder.findMany(options);
  },

  /** Create a new record */
  async create<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: CreateOptions<Partial<T>>,
    registry?: ModelRegistry,
  ): Promise<T | null> {
    const builder = new QueryBuilder<T>(db, model, registry);

    return builder.create(options);
  },

  /** Update records */
  async updateMany<T extends Record<string, unknown>>(
    db: Surreal,
    model: ModelMetadata,
    options: UpdateOptions<Partial<T>>,
    registry?: ModelRegistry,
  ): Promise<T[]> {
    const builder = new QueryBuilder<T>(db, model, registry);

    return builder.updateMany(options);
  },

  /** Delete records */
  async deleteMany(
    db: Surreal,
    model: ModelMetadata,
    options: DeleteManyOptions,
    registry?: ModelRegistry,
  ): Promise<number> {
    const builder = new QueryBuilder(db, model, registry);

    return builder.deleteMany(options);
  },

  /**
   * Delete a unique record by id or unique field
   * @param db - SurrealDB connection
   * @param model - Model metadata
   * @param options - Delete options with where clause and optional return configuration
   * @param registry - Optional model registry for cascade support
   */
  async deleteUnique<T extends Record<string, unknown>, R extends DeleteUniqueReturn = undefined>(
    db: Surreal,
    model: ModelMetadata,
    options: { where: WhereClause; return?: R },
    registry?: ModelRegistry,
  ): Promise<DeleteUniqueResult<T, R>> {
    const builder = new QueryBuilder<T>(db, model, registry);

    return builder.deleteUnique(options);
  },

  /**
   * Update a unique record by id or unique field
   * @param db - SurrealDB connection
   * @param model - Model metadata
   * @param options - Update options with where clause, data, and optional return configuration
   * @param registry - Optional model registry for nested operations and cascade support
   */
  async updateUnique<T extends Record<string, unknown>, R extends UpdateUniqueReturn = undefined>(
    db: Surreal,
    model: ModelMetadata,
    options: {
      where: WhereClause;
      data: Partial<T>;
      select?: SelectClause;
      include?: IncludeClause;
      return?: R;
    },
    registry?: ModelRegistry,
  ): Promise<UpdateUniqueResult<T, R>> {
    const builder = new QueryBuilder<T>(db, model, registry);

    return builder.updateUnique(options);
  },
};
