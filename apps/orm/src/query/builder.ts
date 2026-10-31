/**
 * Query builder - main query building logic
 *
 * Provides both compile-only and compile+execute methods.
 * The compile methods produce CompiledQuery objects for use with CerialQueryPromise.
 * The execute methods run the compiled queries and map results.
 */

import type { RecordId, Surreal } from 'surrealdb';
import { CerialValidationError } from '../errors';
import { isObject } from '../utils/type-utils';
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
  assertNestedTargetsExist,
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
  buildSelectFields,
  buildUpdateManyQuery,
  buildUpdateUniqueQuery,
  buildUpdateWithNestedTransaction,
  buildUpsertQuery,
  buildUpsertWithNestedTransaction,
  type ComputeClause,
  extractNestedOperations,
  type FindOptionsWithInclude,
  type FindUniqueOptionsWithInclude,
  findCompositeUniqueKey,
  findObjectUniqueKey,
  getRecordIdFromWhere,
  type IncludeClause,
  mergeUnsetIntoData,
  type NestedOperation,
} from './builders';
import type { QueryResultType } from './cerial-query-promise';
import type { CompiledQuery } from './compile/types';
import { createCompileContext } from './compile/var-allocator';
import { executeQuery, executeQuerySingle } from './executor';
import { transformWhereClause } from './filters';
import { mapResult, mapSingleResult } from './mappers';
import { applyFieldDefaults, transformData, transformOrValidateRecordId } from './transformers';
import {
  validateCreateData,
  validateCompute,
  validateDataUnsetOverlap,
  validateOrderBy,
  validatePagination,
  validateSelect,
  validateUnset,
  validateUpdateData,
  refuseFragmentInValue,
  validateWhere,
  validationFailure,
} from './validators';

/**
 * Options a find method's type omits. The builders would read them anyway (findOne forces its own limit
 * but still honours an offset; findUnique validates an orderBy it never emits), so a JavaScript or
 * dynamic caller is told rather than silently ignored.
 */
const UNSUPPORTED_READ_OPTIONS: Record<string, readonly ('orderBy' | 'limit' | 'offset')[]> = {
  findOne: ['limit', 'offset'],
  findUnique: ['orderBy', 'limit', 'offset'],
};

/** Throw on select/orderBy/limit/offset values the model cannot honour, so a typo is not silently dropped. */
function assertValidReadOptions(
  model: ModelMetadata,
  operation: string,
  options: { select?: object; orderBy?: object; limit?: number; offset?: number; compute?: unknown },
  registry?: ModelRegistry,
): void {
  for (const option of UNSUPPORTED_READ_OPTIONS[operation] ?? []) {
    if (options[option] === undefined) continue;

    throw validationFailure(
      option,
      [{ message: `${operation} does not accept ${option}`, field: option }],
      model,
      operation,
    );
  }

  const checks = [
    ['select', validateSelect(options.select, model)],
    ['compute', validateCompute(options.compute, model)],
    [
      'orderBy',
      validateOrderBy(
        options.orderBy,
        model,
        registry,
        isObject(options.compute) ? Object.keys(options.compute) : undefined,
      ),
    ],
    ['limit/offset', validatePagination(options.limit, options.offset)],
  ] as const;

  for (const [context, errors] of checks) {
    if (errors.length) throw validationFailure(context, errors, model, operation);
  }
}

/** Extended find options with include support */
export interface FindOneOptionsWithInclude extends FindOneOptions {
  include?: Record<string, boolean | object>;
  compute?: ComputeClause;
}

/** Extended find many options with include support */
export interface FindManyOptionsWithInclude extends FindManyOptions {
  include?: Record<string, boolean | object>;
  compute?: ComputeClause;
}

/**
 * Only the find methods project computed keys. A JavaScript caller can still pass `compute` to a write,
 * where it would otherwise be dropped without a word.
 */
export function refuseCompute(options: object, model: ModelMetadata, operation: string): void {
  if ((options as { compute?: unknown }).compute === undefined) return;

  throw validationFailure(
    'compute',
    [{ message: `${operation} does not accept compute; only findMany, findOne and findUnique do`, field: 'compute' }],
    model,
    operation,
  );
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
    assertValidReadOptions(this.model, 'findOne', options, this.registry);

    // Validate where clause
    const validation = validateWhere(options.where, this.model, this.registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'findOne');

    const query = buildFindOneQuery(this.model, options as FindOptionsWithInclude, this.registry);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model, options.select);
  }

  /** Find a unique record by id or unique field */
  async findUnique(options: FindUniqueOptionsWithInclude): Promise<T | null> {
    const { where } = options;

    assertValidReadOptions(this.model, 'findUnique', options, this.registry);

    // Validate the entire where clause (including unique fields)
    // The unique field validation is handled in buildFindUniqueQuery
    const validation = validateWhere(where, this.model, this.registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'findUnique');

    const query = buildFindUniqueQuery(this.model, options as FindUniqueOptionsWithInclude, this.registry);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model, options.select);
  }

  /** Find multiple records */
  async findMany(options: FindManyOptionsWithInclude = {}): Promise<T[]> {
    assertValidReadOptions(this.model, 'findMany', options, this.registry);

    // Validate where clause
    const validation = validateWhere(options.where, this.model, this.registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'findMany');

    const query = buildFindManyQuery(this.model, options as FindOptionsWithInclude, this.registry);
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model, options.select);
  }

  /** Create a new record */
  async create(options: CreateOptions<Partial<T>>): Promise<T | null> {
    const { data, select, include } = options;
    assertValidReadOptions(this.model, 'create', { select });

    refuseFragmentInValue(data, 'data', { model: this.model.name, operation: 'create' });

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Validate data BEFORE transformation (so we check original values)
    // Pass nestedOps so validation knows which Record fields will be satisfied by nested operations
    const dataWithDefaults = applyFieldDefaults(cleanData, this.model);
    const validation = validateCreateData(dataWithDefaults, this.model, nestedOps);
    if (!validation.valid) throw validationFailure('data', validation.errors, this.model, 'create');

    // Transform data after validation (converts dates to Date objects, ids to RecordId, etc.)
    const transformedData = transformData(dataWithDefaults, this.model);

    // If there are nested operations, use the transaction builder
    if (nestedOps.size > 0 && this.registry) {
      await assertNestedTargetsExist(this.db, this.model, nestedOps, this.registry, 'create');
      const query = buildCreateWithNestedTransaction(this.model, transformedData, nestedOps, this.registry, {
        select,
        include,
      });
      const result = await executeQuerySingle(this.db, query);

      return mapSingleResult<T>(result, this.model, select);
    }

    // Simple create without nested operations
    const query = buildCreateQuery(this.model, transformedData, select, include as IncludeClause, this.registry);
    const result = await executeQuerySingle(this.db, query);

    return mapSingleResult<T>(result, this.model, select);
  }

  /** Update records matching where clause */
  async updateMany(options: UpdateOptions<Partial<T>>): Promise<T[]> {
    const { where, data, select, include, unset } = options;
    assertValidReadOptions(this.model, 'updateMany', { select });

    // Validate where clause
    const whereValidation = validateWhere(where, this.model, this.registry);
    if (!whereValidation.valid)
      throw validationFailure('where clause', whereValidation.errors, this.model, 'updateMany');

    refuseFragmentInValue(data, 'data', { model: this.model.name, operation: 'updateMany' });

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Transform and validate data
    const transformedData = transformData(cleanData, this.model, 'update');

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid) throw validationFailure('data', dataValidation.errors, this.model, 'updateMany');

    // Validate unset fields
    if (unset) {
      const unsetValidation = validateUnset(unset, this.model);
      if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, this.model, 'updateMany');

      const overlapValidation = validateDataUnsetOverlap(transformedData, unset, this.model);
      if (!overlapValidation.valid)
        throw validationFailure('unset', overlapValidation.errors, this.model, 'updateMany');
    }

    // If there are nested operations, use the transaction builder
    if (nestedOps.size > 0 && this.registry) {
      await assertNestedTargetsExist(this.db, this.model, nestedOps, this.registry, 'updateMany');
      const query = buildUpdateWithNestedTransaction(
        this.model,
        where,
        unset ? mergeUnsetIntoData(transformedData, unset) : transformedData,
        nestedOps,
        this.registry,
        { select, include },
      );
      const result = await executeQuery(this.db, query);

      return mapResult<T>(result, this.model, select);
    }

    // Simple update without nested operations
    const query = buildUpdateManyQuery(
      this.model,
      where,
      transformedData,
      select,
      unset,
      this.registry,
      include as IncludeClause,
    );
    const result = await executeQuery(this.db, query);

    return mapResult<T>(result, this.model, select);
  }

  /**
   * Update a unique record by id or unique field
   * @param options - Update options with where clause, data, and optional return configuration
   * @returns Depends on return option:
   *   - undefined/null/'after': Model | null (updated record with select/include support)
   *   - true: boolean (true if record found and updated, false if not)
   *   - 'before': Model | null (pre-update record, select and include read before the write)
   */
  async updateUnique<R extends UpdateUniqueReturn = undefined>(options: {
    where: WhereClause;
    data: Partial<T>;
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
  }): Promise<UpdateUniqueResult<T, R>> {
    const { where, data, select, include, return: returnOption, unset } = options;
    assertValidReadOptions(this.model, 'updateUnique', { select });

    // Validate where clause
    const whereValidation = validateWhere(where, this.model, this.registry);
    if (!whereValidation.valid)
      throw validationFailure('where clause', whereValidation.errors, this.model, 'updateUnique');

    // Validate unique field requirement and expand composite keys
    const { hasId, expandedWhere } = getRecordIdFromWhere(where, this.model, 'updateUnique');

    refuseFragmentInValue(data, 'data', { model: this.model.name, operation: 'updateUnique' });

    // Extract nested operations from the data
    const { cleanData, nestedOps } = extractNestedOperations(data as Record<string, unknown>, this.model);

    // Transform and validate data
    const transformedData = transformData(cleanData, this.model, 'update');

    const dataValidation = validateUpdateData(transformedData, this.model);
    if (!dataValidation.valid) throw validationFailure('data', dataValidation.errors, this.model, 'updateUnique');

    // Validate unset fields
    if (unset) {
      const unsetValidation = validateUnset(unset, this.model);
      if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, this.model, 'updateUnique');

      const overlapValidation = validateDataUnsetOverlap(transformedData, unset, this.model);
      if (!overlapValidation.valid)
        throw validationFailure('unset', overlapValidation.errors, this.model, 'updateUnique');
    }

    // If there are nested operations, use the transaction builder
    // TOMBSTONE: updateUnique has no nested-operation path of its own, so it falls back
    // to updateMany on the same where clause and takes the first result.
    if (nestedOps.size > 0 && this.registry) {
      // For now, use updateMany with the same where clause and return first result
      await assertNestedTargetsExist(this.db, this.model, nestedOps, this.registry, 'updateUnique');
      const query = buildUpdateWithNestedTransaction(
        this.model,
        expandedWhere,
        unset ? mergeUnsetIntoData(transformedData, unset) : transformedData,
        nestedOps,
        this.registry,
        { returnBefore: returnOption === 'before', select, include },
      );
      const result = await executeQuery(this.db, query);
      // A non-matching where returns no row; handleUpdateUniqueResult tells null from undefined
      const record = (Array.isArray(result) ? result[0] : result) ?? null;

      return this.handleUpdateUniqueResult<R>(record, returnOption, select);
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
      unset,
    );

    // Execute query - UPDATE ONLY returns single result, UPDATE returns array
    if (hasId) {
      const result = await executeQuerySingle(this.db, query);

      return this.handleUpdateUniqueResult<R>(result, returnOption, select);
    }

    // Non-ID unique field: UPDATE returns array, take first result
    const result = await executeQuery(this.db, query);
    const record = Array.isArray(result) && result.length > 0 ? result[0] : null;

    return this.handleUpdateUniqueResult<R>(record, returnOption, select);
  }

  /** Handle updateUnique result based on return option */
  private handleUpdateUniqueResult<R extends UpdateUniqueReturn>(
    result: unknown,
    returnOption: R | undefined,
    select?: SelectClause,
  ): UpdateUniqueResult<T, R> {
    // true: return whether record was found and updated
    if (returnOption === true) {
      return (result !== null) as UpdateUniqueResult<T, R>;
    }

    // Default / 'after' / 'before': return the record or null
    if (result === null) {
      return null as UpdateUniqueResult<T, R>;
    }

    return mapSingleResult<T>(result, this.model, select) as UpdateUniqueResult<T, R>;
  }

  /** Delete records matching where clause */
  async deleteMany(options: DeleteManyOptions): Promise<number> {
    const { where } = options;

    // Validate where clause
    const validation = validateWhere(where, this.model, this.registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'deleteMany');

    // Use cascade delete if registry is available (handles @onDelete behavior)
    if (this.registry) {
      const query = buildDeleteWithCascade(this.model, where, this.registry);
      const result = await executeQuery(this.db, query);

      return Array.isArray(result) ? result.length : 0;
    }

    // Simple delete without cascade
    const query = buildDeleteQueryWithReturn(this.model, where, this.registry);
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
    const validation = validateWhere(where, this.model, this.registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'deleteUnique');

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
        ? buildDeleteQueryWithReturn(this.model, expandedWhere, this.registry, 'deleteUnique')
        : buildDeleteQuery(this.model, expandedWhere, this.registry, 'deleteUnique');
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
      const validation = validateWhere(where, this.model, this.registry);
      if (!validation.valid) throw validationFailure('where clause', validation.errors, this.model, 'count');
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
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: R;
  }): Promise<unknown> {
    const { where, create: createData, update: updateData, unset, select, include, return: returnOption } = options;
    assertValidReadOptions(this.model, 'upsert', { select });

    // Validate where clause
    const whereValidation = validateWhere(where, this.model, this.registry);
    if (!whereValidation.valid) throw validationFailure('where clause', whereValidation.errors, this.model, 'upsert');
    assertUpsertNotRawOnly(where, this.model);

    refuseFragmentInValue(createData, 'create', { model: this.model.name, operation: 'upsert' });
    refuseFragmentInValue(updateData, 'update', { model: this.model.name, operation: 'upsert' });

    // Extract nested operations from create and update data
    const { cleanData: cleanCreateData, nestedOps: createNestedOps } = extractNestedOperations(createData, this.model);
    const { cleanData: cleanUpdateData, nestedOps: updateNestedOps } = updateData
      ? extractNestedOperations(updateData, this.model)
      : { cleanData: {} as Record<string, unknown>, nestedOps: new Map() };

    // Apply defaults and transform create data
    const createWithDefaults = applyFieldDefaults(cleanCreateData, this.model);
    const createValidation = validateCreateData(createWithDefaults, this.model, createNestedOps);
    if (!createValidation.valid) throw validationFailure('data', createValidation.errors, this.model, 'upsert');
    const transformedCreateData = transformData(createWithDefaults, this.model);

    // Transform and validate update data (only if update provided)
    let transformedUpdateData: Record<string, unknown> = {};
    if (updateData) {
      transformedUpdateData = transformData(cleanUpdateData, this.model, 'update');
      const updateValidation = validateUpdateData(transformedUpdateData, this.model);
      if (!updateValidation.valid) throw validationFailure('data', updateValidation.errors, this.model, 'upsert');
    }

    // Validate unset fields (applies to update portion of upsert)
    if (unset) {
      const unsetValidation = validateUnset(unset, this.model);
      if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, this.model, 'upsert');

      if (updateData) {
        const overlapValidation = validateDataUnsetOverlap(transformedUpdateData, unset, this.model);
        if (!overlapValidation.valid) throw validationFailure('unset', overlapValidation.errors, this.model, 'upsert');
      }
    }

    // Determine if this is ID-based or WHERE-based (without requiring unique fields)
    const idField = this.model.fields.find((f) => f.isId);
    const hasId = !!(idField && where[idField.name] !== undefined && where[idField.name] !== null);
    const uniqueFields = this.model.fields.filter((f) => f.isUnique && !f.isId);
    const whereKeys = Object.keys(where).filter((k) => k !== 'AND' && k !== 'OR' && k !== 'NOT');
    const hasUniqueField =
      whereKeys.some((key) => uniqueFields.some((f) => f.name === key)) ||
      !!findCompositeUniqueKey(where, this.model) ||
      !!findObjectUniqueKey(where, this.model);
    const isSingle = hasId || hasUniqueField;

    // Check for nested operations that need transaction handling
    const hasNestedOps = createNestedOps.size > 0 || updateNestedOps.size > 0;
    if (hasNestedOps) assertNestedUpsertNamesOneRow(this.model, isSingle);

    if (hasNestedOps && this.registry) {
      return this.executeUpsertWithNested(
        where,
        transformedCreateData,
        unset ? mergeUnsetIntoData(transformedUpdateData, unset) : transformedUpdateData,
        createNestedOps,
        updateNestedOps,
        returnOption,
        hasId,
        select,
        include,
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
      unset,
    );

    if (hasId) {
      // ID-based: transaction returns single result
      const result = await executeQuerySingle(this.db, query);

      return this.handleUpsertResult(result, returnOption, select);
    }

    if (isSingle) {
      // Unique field: UPSERT ONLY returns single result
      const result = await executeQuerySingle(this.db, query);

      return this.handleUpsertResult(result, returnOption, select);
    }

    // Non-unique: UPSERT/UPDATE returns array
    const result = await executeQuery(this.db, query);

    if (returnOption === true) return Array.isArray(result) && result.length > 0;
    return mapResult<T>(result, this.model, select);
  }

  /** Handle upsert result based on return option */
  private handleUpsertResult(result: unknown, returnOption: UpsertReturn, select?: SelectClause): unknown {
    if (returnOption === true) return result !== null;
    if (result === null) return null;

    return mapSingleResult<T>(result, this.model, select);
  }

  /** Read the row an upsert's where matches, or null; `select` and `include` shape the projection. */
  private async readExisting(
    where: WhereClause,
    hasId: boolean,
    select?: SelectClause,
    include?: IncludeClause,
  ): Promise<unknown> {
    const includeCtx = createCompileContext('inc_');
    const fields = buildSelectFields(select, this.model, include, this.registry, includeCtx);
    const vars = includeCtx.getCollected();
    const recordId = hasId ? recordIdFromWhere(this.model, where) : undefined;

    if (recordId) {
      const idBinding = createCompileContext('rid_').bind('record', 'id', recordId, 'string');

      return executeQuerySingle(this.db, {
        text: `SELECT ${fields} FROM ONLY ${idBinding.placeholder};`,
        vars: { ...vars, ...idBinding.vars },
      });
    }

    // Unique field lookup
    const whereClause = transformWhereClause(where, this.model, this.registry);
    const checkResult = await executeQuery(this.db, {
      text: `SELECT ${fields} FROM ${this.model.tableName} ${whereClause.text};`,
      vars: { ...whereClause.vars, ...vars },
    });

    return Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] : null;
  }

  /**
   * Execute upsert with nested relation operations.
   * Checks existence first, then delegates to create or update nested transaction builders.
   *
   * Array-mode transactions run `buildUpsertWithNestedTransaction` instead (via compileUpsert), which makes
   * the same create-or-update choice inside one statement. The two are not interchangeable: this path adds
   * the typed missing-target errors, returns null for an empty create and maps the update row itself. A
   * change to what an upsert with relation operations does has to be made in both.
   */
  private async executeUpsertWithNested(
    where: WhereClause,
    createData: Record<string, unknown>,
    updateData: Record<string, unknown>,
    createNestedOps: Map<string, unknown>,
    updateNestedOps: Map<string, unknown>,
    returnOption: UpsertReturn,
    hasId: boolean,
    select?: SelectClause,
    include?: IncludeClause,
  ): Promise<unknown> {
    // First check if record exists; for 'before' this read is also the answer, so it carries the projection
    const existingRecord =
      returnOption === 'before'
        ? await this.readExisting(where, hasId, select, include)
        : await this.readExisting(where, hasId);

    if (existingRecord === null || existingRecord === undefined) {
      // Record doesn't exist - use create path
      if (Object.keys(createData).length === 0) return null; // No create data, nothing to do

      await assertNestedTargetsExist(this.db, this.model, createNestedOps, this.registry!, 'upsert');
      const { buildCreateWithNestedTransaction: buildCreateNested } = await import('./builders/nested-builder');
      const query = buildCreateNested(this.model, createData, createNestedOps as Map<string, any>, this.registry!, {
        select,
        include,
        // An id in the where names the record to create, exactly as the plain upsert's CREATE does;
        // without it the nested create lands on a server-generated id the caller never asked for
        recordId: hasId ? recordIdFromWhere(this.model, where) : undefined,
      });
      const result = await executeQuerySingle(this.db, query);

      if (returnOption === 'before') return null; // No before state for new records
      if (returnOption === true) return result !== null;

      return mapSingleResult<T>(result, this.model, select);
    }

    // Record exists - use update path
    if (Object.keys(updateData).length === 0 && (updateNestedOps as Map<string, any>).size === 0) {
      // No update data or nested ops, return existing
      if (returnOption === true) return true;
      if (returnOption === 'before') return mapSingleResult<T>(existingRecord, this.model, select);
      if (!select && !include) return mapSingleResult<T>(existingRecord, this.model);

      // The existence check read every field; re-read with the caller's select and include
      return mapSingleResult<T>(await this.readExisting(where, hasId, select, include), this.model, select);
    }

    await assertNestedTargetsExist(this.db, this.model, updateNestedOps, this.registry!, 'upsert');
    const { buildUpdateWithNestedTransaction: buildUpdateNested } = await import('./builders/nested-builder');
    const query = buildUpdateNested(
      this.model,
      where,
      updateData,
      updateNestedOps as Map<string, any>,
      this.registry!,
      {
        select,
        include,
      },
    );
    const result = await executeQuery(this.db, query);

    if (returnOption === 'before') return mapSingleResult<T>(existingRecord, this.model, select);
    if (returnOption === true) return true;

    const record = Array.isArray(result) && result.length > 0 ? result[0] : null;

    return mapSingleResult<T>(record, this.model, select);
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
  assertValidReadOptions(model, 'findOne', options, registry);
  const validation = validateWhere(options.where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'findOne');

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
  assertValidReadOptions(model, 'findUnique', options, registry);
  const validation = validateWhere(options.where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'findUnique');

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
  assertValidReadOptions(model, 'findMany', options, registry);
  const validation = validateWhere(options.where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'findMany');

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
  const { data, select, include } = options;
  refuseCompute(options, model, 'create');
  assertValidReadOptions(model, 'create', { select });

  refuseFragmentInValue(data, 'data', { model: model.name, operation: 'create' });
  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const dataWithDefaults = applyFieldDefaults(cleanData, model);
  const validation = validateCreateData(dataWithDefaults, model, nestedOps);
  if (!validation.valid) throw validationFailure('data', validation.errors, model, 'create');

  const transformedData = transformData(dataWithDefaults, model);

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildCreateWithNestedTransaction(model, transformedData, nestedOps, registry, { select, include }),
      resultType: 'single',
    };
  }

  return {
    query: buildCreateQuery(model, transformedData, select, include as IncludeClause, registry),
    resultType: 'single',
  };
}

/** Compile an updateMany query without executing */
export function compileUpdateMany(
  model: ModelMetadata,
  options: UpdateOptions<Record<string, unknown>>,
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, data, select, include, unset } = options;
  refuseCompute(options, model, 'updateMany');
  assertValidReadOptions(model, 'updateMany', { select });

  const whereValidation = validateWhere(where, model, registry);
  if (!whereValidation.valid) throw validationFailure('where clause', whereValidation.errors, model, 'updateMany');

  refuseFragmentInValue(data, 'data', { model: model.name, operation: 'updateMany' });
  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const transformedData = transformData(cleanData, model, 'update');

  const dataValidation = validateUpdateData(transformedData, model);
  if (!dataValidation.valid) throw validationFailure('data', dataValidation.errors, model, 'updateMany');

  // Validate unset fields
  if (unset) {
    const unsetValidation = validateUnset(unset, model);
    if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, model, 'updateMany');

    const overlapValidation = validateDataUnsetOverlap(transformedData, unset, model);
    if (!overlapValidation.valid) throw validationFailure('unset', overlapValidation.errors, model, 'updateMany');
  }

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildUpdateWithNestedTransaction(
        model,
        where,
        unset ? mergeUnsetIntoData(transformedData, unset) : transformedData,
        nestedOps,
        registry,
        { select, include },
      ),
      resultType: 'array',
    };
  }

  return {
    query: buildUpdateManyQuery(model, where, transformedData, select, unset, registry, include as IncludeClause),
    resultType: 'array',
  };
}

/** Compile an updateUnique query without executing */
export function compileUpdateUnique(
  model: ModelMetadata,
  options: {
    where: WhereClause;
    data: Record<string, unknown>;
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: UpdateUniqueReturn;
  },
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, data, select, include, return: returnOption, unset } = options;
  refuseCompute(options, model, 'updateUnique');
  assertValidReadOptions(model, 'updateUnique', { select });

  const whereValidation = validateWhere(where, model, registry);
  if (!whereValidation.valid) throw validationFailure('where clause', whereValidation.errors, model, 'updateUnique');

  const { hasId, expandedWhere } = getRecordIdFromWhere(where, model, 'updateUnique');

  refuseFragmentInValue(data, 'data', { model: model.name, operation: 'updateUnique' });
  const { cleanData, nestedOps } = extractNestedOperations(data, model);
  const transformedData = transformData(cleanData, model, 'update');

  const dataValidation = validateUpdateData(transformedData, model);
  if (!dataValidation.valid) throw validationFailure('data', dataValidation.errors, model, 'updateUnique');

  // Validate unset fields
  if (unset) {
    const unsetValidation = validateUnset(unset, model);
    if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, model, 'updateUnique');

    const overlapValidation = validateDataUnsetOverlap(transformedData, unset, model);
    if (!overlapValidation.valid) throw validationFailure('unset', overlapValidation.errors, model, 'updateUnique');
  }

  if (nestedOps.size > 0 && registry) {
    return {
      query: buildUpdateWithNestedTransaction(
        model,
        expandedWhere,
        unset ? mergeUnsetIntoData(transformedData, unset) : transformedData,
        nestedOps,
        registry,
        { returnBefore: returnOption === 'before', select, include },
      ),
      // One row or none, read the way the plain nested path reads it
      resultType: returnOption === true ? 'boolean' : 'single',
      hasId,
      returnOption,
    };
  }

  return {
    // Pass original where — buildUpdateUniqueQuery does its own expansion internally
    query: buildUpdateUniqueQuery(
      model,
      where,
      transformedData,
      returnOption ?? undefined,
      select,
      include,
      registry,
      unset,
    ),
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
  refuseCompute(options, model, 'deleteMany');

  const validation = validateWhere(where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'deleteMany');

  if (registry) {
    return {
      query: buildDeleteWithCascade(model, where, registry),
      resultType: 'number',
    };
  }

  return {
    query: buildDeleteQueryWithReturn(model, where, registry),
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
  refuseCompute(options, model, 'deleteUnique');

  const validation = validateWhere(where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'deleteUnique');

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
      ? buildDeleteQueryWithReturn(model, expandedWhere, registry, 'deleteUnique')
      : buildDeleteQuery(model, expandedWhere, registry, 'deleteUnique');
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
    const validation = validateWhere(where, model, registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'count');
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
    const validation = validateWhere(where, model, registry);
    if (!validation.valid) throw validationFailure('where clause', validation.errors, model, 'exists');
  }

  return {
    query: buildCountQuery(model, where, registry),
    resultType: 'boolean',
  };
}

/** The record an upsert's where names through its id field, or undefined when the where has none. */
function recordIdFromWhere(model: ModelMetadata, where: WhereClause): RecordId | undefined {
  const idField = model.fields.find((f) => f.isId);
  if (!idField) return undefined;
  const id = where[idField.name];
  if (id === undefined || id === null) return undefined;

  return transformOrValidateRecordId(model.tableName, id as string);
}

/** The shape of a where once `$raw` is set aside: whether it held one, and whether anything else is left to filter on */
function scanRaw(where: WhereClause): { hasRaw: boolean; hasCondition: boolean } {
  let hasRaw = false;
  let hasCondition = false;
  const visit = (node: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$raw') hasRaw = true;
      else if (value === undefined) continue;
      else if (key === 'AND' || key === 'OR') {
        if (Array.isArray(value)) for (const item of value) if (isObject(item)) visit(item);
      } else if (key === 'NOT') {
        if (isObject(value)) visit(value);
      } else hasCondition = true;
    }
  };
  visit(where as Record<string, unknown>);

  return { hasRaw, hasCondition };
}

/**
 * An upsert skips the unique-field check, so a where made only of `$raw` compiles to UPSERT table ... WHERE (fragment)
 * and rewrites every row the fragment matches. Unlike deleteMany, that is never what the fragment's author meant.
 */
function assertUpsertNotRawOnly(where: WhereClause, model: ModelMetadata): void {
  const { hasRaw, hasCondition } = scanRaw(where);
  if (!hasRaw || hasCondition) return;

  throw new CerialValidationError(
    `upsert on ${model.name}: a where made only of $raw would rewrite every row the fragment matches. ` +
      'Add the id or a @unique field beside it, or use updateMany.',
    { model: model.name, operation: 'upsert', field: 'where.$raw' },
  );
}

/**
 * A relation op in an upsert needs one row to attach to. A where that is not an id or a @unique field can
 * match none (the upsert creates one row) or several (no row to pick), so there is no defined target and
 * the op would be lost; rejecting is the only answer that cannot silently drop a link.
 */
function assertNestedUpsertNamesOneRow(model: ModelMetadata, isSingle: boolean): void {
  if (isSingle) return;

  throw new CerialValidationError(
    `upsert on ${model.name}: a relation operation in create or update needs a where that names exactly one row, ` +
      'by id or by a @unique field. This where can match several rows, so there is no single row to attach the ' +
      'relation to. Upsert on a unique field, or write the relation with a separate update.',
    { model: model.name, operation: 'upsert' },
  );
}

/** Compile an upsert query without executing */
export function compileUpsert(
  model: ModelMetadata,
  options: {
    where: WhereClause;
    create: Record<string, unknown>;
    update?: Record<string, unknown>;
    unset?: Record<string, unknown>;
    select?: SelectClause;
    include?: IncludeClause;
    return?: UpsertReturn;
  },
  registry?: ModelRegistry,
): CompiledQueryDescriptor {
  const { where, create: createData, update: updateData, unset, select, include, return: returnOption } = options;
  refuseCompute(options, model, 'upsert');
  assertValidReadOptions(model, 'upsert', { select });

  const whereValidation = validateWhere(where, model, registry);
  if (!whereValidation.valid) throw validationFailure('where clause', whereValidation.errors, model, 'upsert');
  assertUpsertNotRawOnly(where, model);

  refuseFragmentInValue(createData, 'create', { model: model.name, operation: 'upsert' });
  refuseFragmentInValue(updateData, 'update', { model: model.name, operation: 'upsert' });

  // Extract nested ops and transform data
  const { cleanData: cleanCreateData, nestedOps: createNestedOps } = extractNestedOperations(createData, model);
  const createWithDefaults = applyFieldDefaults(cleanCreateData, model);
  const createValidation = validateCreateData(createWithDefaults, model, createNestedOps);
  if (!createValidation.valid) throw validationFailure('data', createValidation.errors, model, 'upsert');
  const transformedCreateData = transformData(createWithDefaults, model);

  let transformedUpdateData: Record<string, unknown> = {};
  let updateNestedOps = new Map<string, unknown>();
  if (updateData) {
    const { cleanData: cleanUpdateData, nestedOps } = extractNestedOperations(updateData, model);
    updateNestedOps = nestedOps;
    transformedUpdateData = transformData(cleanUpdateData, model, 'update');
    const updateValidation = validateUpdateData(transformedUpdateData, model);
    if (!updateValidation.valid) throw validationFailure('data', updateValidation.errors, model, 'upsert');
  }

  // Validate unset fields (applies to update portion of upsert)
  if (unset) {
    const unsetValidation = validateUnset(unset, model);
    if (!unsetValidation.valid) throw validationFailure('unset', unsetValidation.errors, model, 'upsert');

    if (updateData) {
      const overlapValidation = validateDataUnsetOverlap(transformedUpdateData, unset, model);
      if (!overlapValidation.valid) throw validationFailure('unset', overlapValidation.errors, model, 'upsert');
    }
  }

  // Check for id and unique fields without requiring them
  const idField = model.fields.find((f) => f.isId);
  const hasId = !!(idField && where[idField.name] !== undefined && where[idField.name] !== null);
  const uniqueFields = model.fields.filter((f) => f.isUnique && !f.isId);
  const whereKeys = Object.keys(where).filter((k) => k !== 'AND' && k !== 'OR' && k !== 'NOT');
  const hasUniqueField =
    whereKeys.some((key) => uniqueFields.some((f) => f.name === key)) ||
    !!findCompositeUniqueKey(where, model) ||
    !!findObjectUniqueKey(where, model);
  const isSingle = hasId || hasUniqueField;

  // Array mode runs this compiled query, so a nested op has to be in it: the plain upsert would drop it
  const hasNestedOps = createNestedOps.size > 0 || updateNestedOps.size > 0;
  if (hasNestedOps) assertNestedUpsertNamesOneRow(model, isSingle);

  const query =
    hasNestedOps && registry
      ? buildUpsertWithNestedTransaction(
          model,
          where,
          transformedCreateData,
          unset ? mergeUnsetIntoData(transformedUpdateData, unset) : transformedUpdateData,
          createNestedOps,
          updateNestedOps as Map<string, NestedOperation>,
          { recordId: hasId ? recordIdFromWhere(model, where) : undefined, returnOption, select, include },
          registry,
        )
      : buildUpsertQuery(
          model,
          where,
          transformedCreateData,
          transformedUpdateData,
          returnOption ?? undefined,
          select,
          include,
          registry,
          unset,
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
      unset?: Record<string, unknown>;
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
      unset?: Record<string, unknown>;
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
