/**
 * Query builder - main query building logic
 *
 * Provides both compile-only and compile+execute methods.
 * The compile methods produce CompiledQuery objects for use with CerialQueryPromise.
 * The execute methods run the compiled queries and map results.
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
  UpsertReturn,
  WhereClause,
} from '../types';
import {
  buildCountQuery,
  buildCreateQuery,
  buildCreateWithNestedTransaction,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildDeleteUniqueQuery,
  buildDeleteUniqueWithCascade,
  buildDeleteWithCascade,
  buildFindManyQuery,
  buildFindOneQuery,
  buildFindUniqueQuery,
  findCompositeUniqueKey,
  buildUpdateManyQuery,
  buildUpdateUniqueQuery,
  buildUpdateWithNestedTransaction,
  buildUpsertQuery,
  extractNestedOperations,
  getRecordIdFromWhere,
  type FindOptionsWithInclude,
  type FindUniqueOptionsWithInclude,
  type IncludeClause,
} from './builders';
import { type QueryResultType } from './cerial-query-promise';
import type { CompiledQuery } from './compile/types';
import { executeQuery, executeQuerySingle } from './executor';
import { mapResult, mapSingleResult } from './mappers';
import { applyNowDefaults, transformData, transformOrValidateRecordId } from './transformers';
import { validateCreateData, validateUpdateData, validateWhere } from './validators';

/** Extended find options with include support */
export interface FindOneOptionsWithInclude extends FindOneOptions {
  include?: Record<string, boolean | object>;
}

/** Extended find many options with include support */
export interface FindManyOptionsWithInclude extends FindManyOptions {
  include?: Record<string, boolean | object>;
}

/** Compiled query descriptor with result type metadata */
export interface CompiledQueryDescriptor {
  query: CompiledQuery;
  resultType: QueryResultType;
  /** For updateUnique/deleteUnique: whether the where clause uses an ID field */
  hasId?: boolean;
  /** For updateUnique: the return option */
  returnOption?: unknown;
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

    // Validate unique field requirement and expand composite keys
    const { hasId, expandedWhere } = getRecordIdFromWhere(where, this.model, 'updateUnique');

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
      const query = buildUpdateWithNestedTransaction(
        this.model,
        expandedWhere,
        transformedData,
        nestedOps,
        this.registry,
      );
      const result = await executeQuery(this.db, query);
      const record = Array.isArray(result) ? result[0] : result;

      return this.handleUpdateUniqueResult<R>(record, returnOption);
    }

    // Build and execute the update query
    // Pass original where — buildUpdateUniqueQuery does its own expansion internally
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

    // Get record ID info (also validates unique field requirement) and expand composite keys
    const { hasId, id, expandedWhere } = getRecordIdFromWhere(where, this.model, 'deleteUnique');

    // Determine if we need RETURN BEFORE (for 'true' and 'before' options)
    const needsReturnBefore = returnOption === true || returnOption === 'before';

    // Execute delete and get array result
    let result: unknown[];

    if (this.registry) {
      // With registry - use cascade builder (handles both ID and non-ID lookups)
      // Pass original where — buildDeleteUniqueWithCascade does its own expansion internally
      const query = buildDeleteUniqueWithCascade(this.model, where, this.registry, needsReturnBefore);
      result = (await executeQuery(this.db, query)) as unknown[];
    } else if (hasId) {
      // Simple ID-based delete without cascade
      const query = buildDeleteUniqueQuery(this.model, id!, needsReturnBefore);
      result = (await executeQuery(this.db, query)) as unknown[];
    } else {
      // Non-ID lookup without cascade - use simple WHERE-based delete
      const query = needsReturnBefore
        ? buildDeleteQueryWithReturn(this.model, expandedWhere)
        : buildDeleteQuery(this.model, expandedWhere);
      result = (await executeQuery(this.db, query)) as unknown[];
    }

    return this.handleDeleteUniqueResult<R>(result, returnOption);
  }

  /** Handle deleteUnique result based on return option */
  private handleDeleteUniqueResult<R extends DeleteUniqueReturn>(
    result: unknown[],
    returnOption: R | undefined,
  ): DeleteUniqueResult<T, R> {
    // Default (undefined/null): operation completed, always return true
    if (returnOption === undefined || returnOption === null) return true as DeleteUniqueResult<T, R>;

    // true: return whether record existed (derived from array length)
    if (returnOption === true) return (result.length > 0) as DeleteUniqueResult<T, R>;

    // 'before': return first result or null
    if (returnOption === 'before') {
      if (!result.length) return null as DeleteUniqueResult<T, R>;

      return mapSingleResult<T>(result[0], this.model) as DeleteUniqueResult<T, R>;
    }

    return true as DeleteUniqueResult<T, R>;
  }

  /** Count records matching where clause using SELECT count() ... GROUP ALL */
  async count(where?: WhereClause): Promise<number> {
    // Validate where clause
    if (where) {
      const validation = validateWhere(where, this.model);
      if (!validation.valid)
        throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
    }

    const query = buildCountQuery(this.model, where, this.registry);
    const result = await executeQuerySingle<{ count: number }>(this.db, query);

    return result?.count ?? 0;
  }

  /** Check if any record exists matching where clause */
  async exists(where?: WhereClause): Promise<boolean> {
    const count = await this.count(where);

    return count > 0;
  }

  /**
   * Upsert a record - create if it doesn't exist, update if it does.
   * `create` is required (provides data for new records).
   * `update` is optional — when omitted, existing records are returned unchanged.
   *
   * @param options - Upsert options with where clause, create data, update data, and return configuration
   * @returns Depends on where clause and return option:
   *   - ID or unique field in where: single result (Model | null or boolean)
   *   - Non-unique where: array result (Model[] or boolean)
   */
  async upsert<R extends UpsertReturn = undefined>(options: {
    where: WhereClause;
    create: Record<string, unknown>;
    update?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
  }): Promise<unknown> {
    const { where, create: createData, update: updateData, select, include, return: returnOption } = options;

    // Validate where clause
    const whereValidation = validateWhere(where, this.model);
    if (!whereValidation.valid)
      throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

    // Extract nested operations from create and update data
    const { cleanData: cleanCreateData, nestedOps: createNestedOps } = extractNestedOperations(createData, this.model);
    const { cleanData: cleanUpdateData, nestedOps: updateNestedOps } = updateData
      ? extractNestedOperations(updateData, this.model)
      : { cleanData: {} as Record<string, unknown>, nestedOps: new Map() };

    // Apply defaults and transform create data
    const createWithDefaults = applyNowDefaults(cleanCreateData, this.model);
    const createValidation = validateCreateData(createWithDefaults, this.model, createNestedOps);
    if (!createValidation.valid)
      throw new Error(`Invalid create data: ${createValidation.errors.map((e) => e.message).join(', ')}`);
    const transformedCreateData = transformData(createWithDefaults, this.model);

    // Transform and validate update data (only if update provided)
    let transformedUpdateData: Record<string, unknown> = {};
    if (updateData) {
      transformedUpdateData = transformData(cleanUpdateData, this.model);
      const updateValidation = validateUpdateData(transformedUpdateData, this.model);
      if (!updateValidation.valid)
        throw new Error(`Invalid update data: ${updateValidation.errors.map((e) => e.message).join(', ')}`);
    }

    // Determine if this is ID-based or WHERE-based (without requiring unique fields)
    const idField = this.model.fields.find((f) => f.isId);
    const hasId = !!(idField && where[idField.name] !== undefined && where[idField.name] !== null);
    const uniqueFields = this.model.fields.filter((f) => f.isUnique && !f.isId);
    const whereKeys = Object.keys(where).filter((k) => k !== 'AND' && k !== 'OR' && k !== 'NOT');
    const hasUniqueField =
      whereKeys.some((key) => uniqueFields.some((f) => f.name === key)) || !!findCompositeUniqueKey(where, this.model);
    const isSingle = hasId || hasUniqueField;

    // Check for nested operations that need transaction handling
    const hasNestedOps = createNestedOps.size > 0 || updateNestedOps.size > 0;

    if (hasNestedOps && isSingle && this.registry) {
      return this.executeUpsertWithNested(
        where,
        transformedCreateData,
        transformedUpdateData,
        createNestedOps,
        updateNestedOps,
        returnOption,
        hasId,
      );
    }

    // Build and execute the upsert query
    const query = buildUpsertQuery(
      this.model,
      where,
      transformedCreateData,
      transformedUpdateData,
      returnOption ?? undefined,
      select,
      include,
      this.registry,
    );

    if (hasId) {
      // ID-based: transaction returns single result
      const result = await executeQuerySingle(this.db, query);

      return this.handleUpsertResult(result, returnOption);
    }

    if (isSingle) {
      // Unique field: UPSERT ONLY returns single result
      try {
        const result = await executeQuerySingle(this.db, query);

        return this.handleUpsertResult(result, returnOption);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Expected a single result output when using the ONLY keyword')
        ) {
          return this.handleUpsertResult(null, returnOption);
        }
        throw error;
      }
    }

    // Non-unique: UPSERT/UPDATE returns array
    const result = await executeQuery(this.db, query);

    if (returnOption === true) return Array.isArray(result) && result.length > 0;

    return mapResult<T>(result, this.model);
  }

  /** Handle upsert result based on return option */
  private handleUpsertResult(result: unknown, returnOption: UpsertReturn): unknown {
    if (returnOption === true) return result !== null;
    if (result === null) return null;

    return mapSingleResult<T>(result, this.model);
  }

  /**
   * Execute upsert with nested relation operations.
   * Checks existence first, then delegates to create or update nested transaction builders.
   */
  private async executeUpsertWithNested(
    where: WhereClause,
    createData: Record<string, unknown>,
    updateData: Record<string, unknown>,
    createNestedOps: Map<string, unknown>,
    updateNestedOps: Map<string, unknown>,
    returnOption: UpsertReturn,
    hasId: boolean,
  ): Promise<unknown> {
    // First check if record exists
    const idField = this.model.fields.find((f) => f.isId);
    let existingRecord: unknown = null;

    if (hasId && idField) {
      const recordId = transformOrValidateRecordId(this.model.tableName, where[idField.name] as string);
      const checkResult = await executeQuerySingle(this.db, {
        text: `SELECT * FROM ONLY ${recordId.toString()};`,
        vars: {},
      });
      existingRecord = checkResult;
    } else {
      // Unique field lookup
      const whereKey = Object.keys(where)[0] as string;
      const checkResult = await executeQuery(this.db, {
        text: `SELECT * FROM ${this.model.tableName} WHERE ${whereKey} = $check_val;`,
        vars: { check_val: where[whereKey!] },
      });
      existingRecord = Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] : null;
    }

    if (existingRecord === null || existingRecord === undefined) {
      // Record doesn't exist - use create path
      if (Object.keys(createData).length === 0) return null; // No create data, nothing to do

      const { buildCreateWithNestedTransaction: buildCreateNested } = await import('./builders/nested-builder');
      const query = buildCreateNested(this.model, createData, createNestedOps as Map<string, any>, this.registry!);
      const result = await executeQuerySingle(this.db, query);

      if (returnOption === 'before') return null; // No before state for new records
      if (returnOption === true) return result !== null;

      return mapSingleResult<T>(result, this.model);
    }

    // Record exists - use update path
    if (Object.keys(updateData).length === 0 && (updateNestedOps as Map<string, any>).size === 0) {
      // No update data or nested ops, return existing
      if (returnOption === true) return true;
      if (returnOption === 'before') return mapSingleResult<T>(existingRecord, this.model);

      return mapSingleResult<T>(existingRecord, this.model);
    }

    const { buildUpdateWithNestedTransaction: buildUpdateNested } = await import('./builders/nested-builder');
    const query = buildUpdateNested(this.model, where, updateData, updateNestedOps as Map<string, any>, this.registry!);
    const result = await executeQuery(this.db, query);

    if (returnOption === 'before') return mapSingleResult<T>(existingRecord, this.model);
    if (returnOption === true) return true;

    const record = Array.isArray(result) && result.length > 0 ? result[0] : null;

    return mapSingleResult<T>(record, this.model);
  }
}

// =============================================================================
// Compile-only functions (no DB required)
// =============================================================================

/** Compile a findOne query without executing */
export function compileFindOne(
  model: ModelMetadata,
  options: FindOneOptionsWithInclude = {},
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const validation = validateWhere(options.where, model);
  if (!validation.valid) throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

  return {
    query: buildFindOneQuery(model, options as FindOptionsWithInclude, registry),
    resultType: 'single',
  };
}

/** Compile a findUnique query without executing */
export function compileFindUnique(
  model: ModelMetadata,
  options: FindUniqueOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const validation = validateWhere(options.where, model);
  if (!validation.valid) throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

  return {
    query: buildFindUniqueQuery(model, options as FindUniqueOptionsWithInclude, registry),
    resultType: 'single',
  };
}

/** Compile a findMany query without executing */
export function compileFindMany(
  model: ModelMetadata,
  options: FindManyOptionsWithInclude = {},
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const validation = validateWhere(options.where, model);
  if (!validation.valid) throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

  return {
    query: buildFindManyQuery(model, options as FindOptionsWithInclude, registry),
    resultType: 'array',
  };
}

/** Compile a create query without executing */
export function compileCreate(
  model: ModelMetadata,
  options: CreateOptions<Record<string, unknown>>,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { data, select } = options;

  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const dataWithDefaults = applyNowDefaults(cleanData, model);
  const validation = validateCreateData(dataWithDefaults, model, nestedOps);
  if (!validation.valid) throw new Error(`Invalid data: ${validation.errors.map((e) => e.message).join(', ')}`);

  const transformedData = transformData(dataWithDefaults, model);

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildCreateWithNestedTransaction(model, transformedData, nestedOps, registry),
      resultType: 'single',
    };
  }

  return {
    query: buildCreateQuery(model, transformedData, select),
    resultType: 'single',
  };
}

/** Compile an updateMany query without executing */
export function compileUpdateMany(
  model: ModelMetadata,
  options: UpdateOptions<Record<string, unknown>>,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, data, select } = options;

  const whereValidation = validateWhere(where, model);
  if (!whereValidation.valid)
    throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const transformedData = transformData(cleanData, model);

  const dataValidation = validateUpdateData(transformedData, model);
  if (!dataValidation.valid) throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildUpdateWithNestedTransaction(model, where, transformedData, nestedOps, registry),
      resultType: 'array',
    };
  }

  return {
    query: buildUpdateManyQuery(model, where, transformedData, select),
    resultType: 'array',
  };
}

/** Compile an updateUnique query without executing */
export function compileUpdateUnique(
  model: ModelMetadata,
  options: {
    where: WhereClause;
    data: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: UpdateUniqueReturn;
  },
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, data, select, include, return: returnOption } = options;

  const whereValidation = validateWhere(where, model);
  if (!whereValidation.valid)
    throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

  const { hasId, expandedWhere } = getRecordIdFromWhere(where, model, 'updateUnique');

  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const transformedData = transformData(cleanData, model);

  const dataValidation = validateUpdateData(transformedData, model);
  if (!dataValidation.valid) throw new Error(`Invalid data: ${dataValidation.errors.map((e) => e.message).join(', ')}`);

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildUpdateWithNestedTransaction(model, expandedWhere, transformedData, nestedOps, registry),
      resultType: 'array',
      hasId,
      returnOption,
    };
  }

  return {
    // Pass original where — buildUpdateUniqueQuery does its own expansion internally
    query: buildUpdateUniqueQuery(model, where, transformedData, returnOption ?? undefined, select, include, registry),
    resultType: hasId ? 'single' : 'array',
    hasId,
    returnOption,
  };
}

/** Compile a deleteMany query without executing */
export function compileDeleteMany(
  model: ModelMetadata,
  options: DeleteManyOptions,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where } = options;

  const validation = validateWhere(where, model);
  if (!validation.valid) throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

  if (registry) {
    return {
      query: buildDeleteWithCascade(model, where, registry),
      resultType: 'number',
    };
  }

  return {
    query: buildDeleteQueryWithReturn(model, where),
    resultType: 'number',
  };
}

/** Compile a deleteUnique query without executing */
export function compileDeleteUnique(
  model: ModelMetadata,
  options: { where: WhereClause; return?: DeleteUniqueReturn },
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, return: returnOption } = options;

  const validation = validateWhere(where, model);
  if (!validation.valid) throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);

  const { hasId, id, expandedWhere } = getRecordIdFromWhere(where, model, 'deleteUnique');
  const needsReturnBefore = returnOption === true || returnOption === 'before';

  let query: CompiledQuery;
  if (registry) {
    // Pass original where — buildDeleteUniqueWithCascade does its own expansion internally
    query = buildDeleteUniqueWithCascade(model, where, registry, needsReturnBefore);
  } else if (hasId) {
    query = buildDeleteUniqueQuery(model, id!, needsReturnBefore);
  } else {
    query = needsReturnBefore
      ? buildDeleteQueryWithReturn(model, expandedWhere)
      : buildDeleteQuery(model, expandedWhere);
  }

  // Determine result type based on return option
  let resultType: QueryResultType;
  if (returnOption === 'before') {
    resultType = 'single';
  } else if (returnOption === true) {
    resultType = 'boolean';
  } else {
    // Default: always returns true (operation completed)
    resultType = 'void';
  }

  return {
    query,
    resultType,
    hasId,
    returnOption,
  };
}

/** Compile a count query without executing */
export function compileCount(
  model: ModelMetadata,
  where?: WhereClause,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  if (where) {
    const validation = validateWhere(where, model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  return {
    query: buildCountQuery(model, where, registry),
    resultType: 'count',
  };
}

/** Compile an exists query without executing (uses count internally) */
export function compileExists(
  model: ModelMetadata,
  where?: WhereClause,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  if (where) {
    const validation = validateWhere(where, model);
    if (!validation.valid)
      throw new Error(`Invalid where clause: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  return {
    query: buildCountQuery(model, where, registry),
    resultType: 'boolean',
  };
}

/** Compile an upsert query without executing */
export function compileUpsert(
  model: ModelMetadata,
  options: {
    where: WhereClause;
    create: Record<string, unknown>;
    update?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: UpsertReturn;
  },
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, create: createData, update: updateData, select, include, return: returnOption } = options;

  const whereValidation = validateWhere(where, model);
  if (!whereValidation.valid)
    throw new Error(`Invalid where clause: ${whereValidation.errors.map((e) => e.message).join(', ')}`);

  // Extract nested ops and transform data
  const { cleanData: cleanCreateData, nestedOps: createNestedOps } = extractNestedOperations(createData, model);
  const createWithDefaults = applyNowDefaults(cleanCreateData, model);
  const createValidation = validateCreateData(createWithDefaults, model, createNestedOps);
  if (!createValidation.valid)
    throw new Error(`Invalid create data: ${createValidation.errors.map((e) => e.message).join(', ')}`);
  const transformedCreateData = transformData(createWithDefaults, model);

  let transformedUpdateData: Record<string, unknown> = {};
  if (updateData) {
    const { cleanData: cleanUpdateData } = extractNestedOperations(updateData, model);
    transformedUpdateData = transformData(cleanUpdateData, model);
    const updateValidation = validateUpdateData(transformedUpdateData, model);
    if (!updateValidation.valid)
      throw new Error(`Invalid update data: ${updateValidation.errors.map((e) => e.message).join(', ')}`);
  }

  // Check for id and unique fields without requiring them
  const idField = model.fields.find((f) => f.isId);
  const hasId = !!(idField && where[idField.name] !== undefined && where[idField.name] !== null);
  const uniqueFields = model.fields.filter((f) => f.isUnique && !f.isId);
  const whereKeys = Object.keys(where).filter((k) => k !== 'AND' && k !== 'OR' && k !== 'NOT');
  const hasUniqueField =
    whereKeys.some((key) => uniqueFields.some((f) => f.name === key)) || !!findCompositeUniqueKey(where, model);
  const isSingle = hasId || hasUniqueField;

  const query = buildUpsertQuery(
    model,
    where,
    transformedCreateData,
    transformedUpdateData,
    returnOption ?? undefined,
    select,
    include,
    registry,
  );

  // Determine result type
  let resultType: QueryResultType;
  if (!isSingle) {
    resultType = returnOption === true ? 'boolean' : 'array';
  } else if (returnOption === true) {
    resultType = 'boolean';
  } else {
    resultType = 'single';
  }

  return {
    query,
    resultType,
    hasId,
    returnOption,
  };
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

  /** Count records matching where clause */
  async count(db: Surreal, model: ModelMetadata, where?: WhereClause, registry?: ModelRegistry): Promise<number> {
    const builder = new QueryBuilder(db, model, registry);

    return builder.count(where);
  },

  /** Check if any record exists matching where clause */
  async exists(db: Surreal, model: ModelMetadata, where?: WhereClause, registry?: ModelRegistry): Promise<boolean> {
    const builder = new QueryBuilder(db, model, registry);

    return builder.exists(where);
  },

  /**
   * Upsert a record - create if it doesn't exist, update if it does.
   * `create` is required. `update` is optional.
   */
  async upsert<T extends Record<string, unknown>, R extends UpsertReturn = undefined>(
    db: Surreal,
    model: ModelMetadata,
    options: {
      where: WhereClause;
      create: Record<string, unknown>;
      update?: Record<string, unknown>;
      select?: SelectClause;
      include?: IncludeClause;
      return?: R;
    },
    registry?: ModelRegistry,
  ): Promise<unknown> {
    const builder = new QueryBuilder<T>(db, model, registry);

    return builder.upsert(options);
  },
};
