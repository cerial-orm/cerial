/**
 * UPSERT query builder
 *
 * Builds SurrealDB UPSERT statements with conditional create/update logic.
 *
 * Two strategies based on where clause:
 * 1. WHERE-based (unique field or non-unique): Uses native UPSERT SET with
 *    IF $this == NONE THEN <create_value> ELSE <update_value> END
 *    ($this is NONE when the record doesn't exist yet)
 *
 * 2. ID-based: Uses a transaction with explicit existence check because
 *    $this == NONE always evaluates to true in UPSERT table:id context.
 *    BEGIN; LET $exists = ...; IF $exists == NONE THEN CREATE ELSE UPDATE; COMMIT;
 *
 * `create` is required (provides data for new records).
 * `update` is optional — when omitted, existing records are returned unchanged.
 *
 * Nested relation operations (create/connect/disconnect) are supported for
 * ID-based and unique-field WHERE-based upserts via transaction building.
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, SelectClause, UpsertReturn, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { getRecordIdFromWhere } from './delete-builder';
import {
  expandCompositeKey,
  expandObjectUniqueKey,
  findCompositeUniqueKey,
  findObjectUniqueKey,
} from './select-builder';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
  type NestedOperation,
} from './nested-builder';
import { type IncludeClause, combineSelectWithIncludes } from './relation-builder';
import { buildSelectFields } from './select-builder';

/**
 * Build RETURN clause for upsert based on return option and select/include
 */
function buildUpsertReturnClause(
  returnOption: UpsertReturn,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): string {
  if (returnOption === 'before') return 'RETURN BEFORE';
  if (returnOption === true) return '';

  // Default / 'after' - return upserted record with select/include support
  const fields = select ? buildSelectFields(select, model) : '*';
  const fieldsWithIncludes = include ? combineSelectWithIncludes(fields, include, model, registry) : fields;

  return `RETURN ${fieldsWithIncludes}`;
}

/**
 * Build a single upsert SET clause entry for a field.
 *
 * - Field in both create and update: IF $this == NONE THEN $create ELSE $update END
 * - Field in create only: IF $this == NONE THEN $create ELSE fieldName END
 * - Field in update only: IF $this == NONE THEN NONE ELSE $update END
 */
function buildUpsertFieldClause(
  ctx: FilterCompileContext,
  fieldName: string,
  createValue: unknown | undefined,
  updateValue: unknown | undefined,
  fieldMetadata: FieldMetadata | undefined,
): { clause: string; vars: Record<string, unknown> } | null {
  const vars: Record<string, unknown> = {};
  const inCreate = createValue !== undefined;
  const inUpdate = updateValue !== undefined;

  if (!inCreate && !inUpdate) return null;

  // Handle null for optional record fields - use NONE
  const resolveValue = (value: unknown, prefix: string): string => {
    if (value === null && fieldMetadata?.type === 'record' && !fieldMetadata.isRequired) return 'NONE';

    const binding = ctx.bind(fieldName, prefix, value, fieldMetadata?.type || 'string');
    Object.assign(vars, binding.vars);

    return binding.placeholder;
  };

  if (inCreate && inUpdate) {
    const createRef = resolveValue(createValue, 'create');
    const updateRef = resolveValue(updateValue, 'update');

    return {
      clause: `${fieldName} = IF $this == NONE THEN ${createRef} ELSE ${updateRef} END`,
      vars,
    };
  }

  if (inCreate) {
    const createRef = resolveValue(createValue, 'create');

    return {
      clause: `${fieldName} = IF $this == NONE THEN ${createRef} ELSE ${fieldName} END`,
      vars,
    };
  }

  // Update only
  const updateRef = resolveValue(updateValue!, 'update');

  return {
    clause: `${fieldName} = IF $this == NONE THEN NONE ELSE ${updateRef} END`,
    vars,
  };
}

/**
 * Collect all fields from create and update data, producing SET clauses
 * with IF $this == NONE conditional logic.
 */
function buildUpsertSetClauses(
  ctx: FilterCompileContext,
  createData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  model: ModelMetadata,
): { setParts: string[]; setVars: Record<string, unknown> } {
  const setParts: string[] = [];
  const setVars: Record<string, unknown> = {};

  // Collect all field names from both create and update
  const allFields = new Set([...Object.keys(createData), ...Object.keys(updateData)]);

  for (const fieldName of allFields) {
    const createValue = createData[fieldName];
    const updateValue = updateData[fieldName];
    const fieldMetadata = model.fields.find((f) => f.name === fieldName);

    // Skip relation fields (virtual)
    if (fieldMetadata?.type === 'relation') continue;

    const result = buildUpsertFieldClause(ctx, fieldName, createValue, updateValue, fieldMetadata);
    if (result) {
      setParts.push(result.clause);
      Object.assign(setVars, result.vars);
    }
  }

  return { setParts, setVars };
}

/**
 * Build WHERE-based upsert query (for unique field or non-unique where).
 * Uses native UPSERT SET with IF $this == NONE conditional logic.
 *
 * Query patterns:
 * - Unique field: UPSERT ONLY table SET ... WHERE field = $val RETURN ...
 * - Non-unique: UPSERT table SET ... WHERE ... RETURN ...
 */
export function buildUpsertWhereQuery(
  model: ModelMetadata,
  where: WhereClause,
  createData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  useOnly: boolean,
  returnOption: UpsertReturn,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  const ctx = createCompileContext();

  // Build SET clauses with conditional logic
  const { setParts, setVars } = buildUpsertSetClauses(ctx, createData, updateData, model);

  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build RETURN clause
  const returnClause = buildUpsertReturnClause(returnOption, select, include, model, registry);

  const onlyKeyword = useOnly ? ' ONLY' : '';
  const parts = [
    `UPSERT${onlyKeyword} ${model.tableName}`,
    setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
    whereClause.text,
    returnClause,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: { ...setVars, ...whereClause.vars },
  };
}

/**
 * Build RETURN clause for ID-based transaction upsert.
 * Used in both CREATE and UPDATE branches of the transaction.
 */
function buildTransactionReturnClause(
  returnOption: UpsertReturn,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): { createReturn: string; updateReturn: string } {
  if (returnOption === 'before') {
    return { createReturn: '', updateReturn: 'RETURN BEFORE' };
  }

  if (returnOption === true) {
    return { createReturn: '', updateReturn: '' };
  }

  // Default / 'after' - use select/include fields (no explicit RETURN AFTER needed)
  const fields = select ? buildSelectFields(select, model) : '*';
  const fieldsWithIncludes = include ? combineSelectWithIncludes(fields, include, model, registry) : fields;
  const returnStr = `RETURN ${fieldsWithIncludes}`;

  return { createReturn: returnStr, updateReturn: returnStr };
}

/**
 * Build ID-based upsert using a transaction.
 * $this == NONE does not work with UPSERT table:id, so we use an explicit
 * BEGIN; LET $exists = ...; IF ... CREATE ... ELSE UPDATE ...; COMMIT; pattern.
 *
 * For RETURN BEFORE on create: returns null (the record didn't exist before).
 * For RETURN BEFORE on update: returns the pre-update record.
 */
export function buildUpsertIdQuery(
  model: ModelMetadata,
  where: WhereClause,
  createData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  returnOption: UpsertReturn,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  const ctx = createCompileContext();
  const vars: Record<string, unknown> = {};

  // Extract ID from where (and expand composite keys)
  const { id, expandedWhere } = getRecordIdFromWhere(where, model, 'upsert');
  const recordId = transformOrValidateRecordId(model.tableName, id!);

  // Build additional WHERE filters (non-id fields) using expanded where
  const idField = model.fields.find((f) => f.isId);
  const whereWithoutId = { ...expandedWhere };
  if (idField) delete whereWithoutId[idField.name];
  const hasAdditionalWhere = Object.keys(whereWithoutId).length > 0;
  let additionalWhereClause: CompiledQuery | null = null;
  if (hasAdditionalWhere) {
    additionalWhereClause = transformWhereClause(whereWithoutId, model);
    Object.assign(vars, additionalWhereClause.vars);
  }

  // Build RETURN clauses
  const { createReturn, updateReturn } = buildTransactionReturnClause(returnOption, select, include, model, registry);

  const hasUpdate = Object.keys(updateData).length > 0;

  // Build CREATE content
  const createBinding = ctx.bind('content', 'create', createData, 'string');
  Object.assign(vars, createBinding.vars);

  // Build UPDATE SET clauses (only if update data provided)
  const updateSetParts: string[] = [];
  if (hasUpdate) {
    for (const [field, value] of Object.entries(updateData)) {
      if (value === undefined) continue;
      const fieldMetadata = model.fields.find((f) => f.name === field);
      if (fieldMetadata?.type === 'relation') continue;

      if (value === null && fieldMetadata?.type === 'record' && !fieldMetadata.isRequired) {
        updateSetParts.push(`${field} = NONE`);
        continue;
      }

      const binding = ctx.bind(field, 'update', value, fieldMetadata?.type || 'string');
      updateSetParts.push(`${field} = ${binding.placeholder}`);
      Object.assign(vars, binding.vars);
    }
  }

  // Build the transaction
  const statements: string[] = ['BEGIN TRANSACTION;'];

  // Check if record exists
  statements.push(`LET $exists = (SELECT * FROM ONLY ${recordId.toString()});`);

  // Build create branch (always available since create is required)
  const createQuery = `CREATE ONLY ${recordId.toString()} CONTENT ${createBinding.placeholder}${createReturn ? ` ${createReturn}` : ''}`;

  // Build update branch
  let updateQuery: string;
  if (hasUpdate && updateSetParts.length > 0) {
    updateQuery = `UPDATE ONLY ${recordId.toString()}`;
    updateQuery += ` SET ${updateSetParts.join(', ')}`;
    if (additionalWhereClause?.text) {
      updateQuery += ` ${additionalWhereClause.text}`;
    }
    if (updateReturn) {
      updateQuery += ` ${updateReturn}`;
    }
  } else {
    // No update data - just return the existing record
    updateQuery = `SELECT * FROM ONLY ${recordId.toString()}`;
  }

  // Build IF/ELSE
  if (returnOption === 'before') {
    // RETURN BEFORE: on create return null, on update return the BEFORE record
    statements.push(`LET $result = IF $exists == NONE THEN (${createQuery}) ELSE (${updateQuery}) END;`);
    statements.push('COMMIT TRANSACTION;');
    statements.push('RETURN IF $exists == NONE THEN null ELSE $result END;');
  } else {
    statements.push(`LET $result = IF $exists == NONE THEN (${createQuery}) ELSE (${updateQuery}) END;`);
    statements.push('COMMIT TRANSACTION;');
    statements.push('RETURN $result;');
  }

  return {
    text: statements.join('\n'),
    vars,
  };
}

/**
 * Check if where clause contains the ID field.
 * Unlike getRecordIdFromWhere, this does NOT validate unique field requirement.
 */
function checkForIdInWhere(where: WhereClause, model: ModelMetadata): { hasId: boolean; id?: string } {
  const idField = model.fields.find((f) => f.isId);
  if (idField && where[idField.name] !== undefined && where[idField.name] !== null) {
    return { hasId: true, id: where[idField.name] as string };
  }

  return { hasId: false };
}

/**
 * Check if where clause contains at least one unique field (excluding id)
 * or a composite unique key.
 */
function checkForUniqueFieldInWhere(where: WhereClause, model: ModelMetadata): boolean {
  // Check for composite unique keys
  if (findCompositeUniqueKey(where, model)) return true;

  // Check for object @unique keys
  if (findObjectUniqueKey(where, model)) return true;

  const uniqueFields = model.fields.filter((f) => f.isUnique && !f.isId);
  const whereKeys = Object.keys(where).filter((k) => k !== 'AND' && k !== 'OR' && k !== 'NOT');

  return whereKeys.some((key) => uniqueFields.some((f) => f.name === key));
}

/**
 * Build upsert query - dispatches to WHERE-based or ID-based strategy.
 *
 * @param model - Model metadata
 * @param where - Where clause (determines record to upsert)
 * @param createData - Data for creating a new record (required fields)
 * @param updateData - Data for updating an existing record (partial fields), empty object if not provided
 * @param returnOption - What to return (before/after/true)
 * @param select - Field selection
 * @param include - Relation inclusion
 * @param registry - Model registry for relation resolution
 * @returns CompiledQuery ready for execution
 */
export function buildUpsertQuery(
  model: ModelMetadata,
  where: WhereClause,
  createData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  returnOption: UpsertReturn,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  const { hasId } = checkForIdInWhere(where, model);

  if (hasId) {
    return buildUpsertIdQuery(model, where, createData, updateData, returnOption, select, include, registry);
  }

  // Expand composite keys and object @unique keys for WHERE-based path
  let expandedWhere = expandCompositeKey(where, model);
  expandedWhere = expandObjectUniqueKey(expandedWhere, model);

  // Check for unique fields in where clause to determine ONLY usage
  const hasUniqueField = checkForUniqueFieldInWhere(where, model);

  return buildUpsertWhereQuery(
    model,
    expandedWhere,
    createData,
    updateData,
    hasUniqueField,
    returnOption,
    select,
    include,
    registry,
  );
}

/**
 * Build upsert with nested relation operations using a transaction.
 *
 * For unique-field/ID-based upsert with nested ops:
 * 1. Check if record exists
 * 2. If not exists: delegate to buildCreateWithNestedTransaction for create path
 * 3. If exists: delegate to buildUpdateWithNestedTransaction for update path
 */
export function buildUpsertWithNestedTransaction(
  model: ModelMetadata,
  where: WhereClause,
  createData: Record<string, unknown>,
  updateData: Record<string, unknown>,
  createNestedOps: Map<string, NestedOperation>,
  updateNestedOps: Map<string, NestedOperation>,
  returnOption: UpsertReturn,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
  registry: ModelRegistry,
): { createQuery: CompiledQuery; updateQuery: CompiledQuery } {
  // Build the create path transaction
  const createQuery = buildCreateWithNestedTransaction(model, createData, createNestedOps, registry);

  // Build the update path transaction (if update data provided)
  const updateQuery =
    Object.keys(updateData).length > 0 || updateNestedOps.size > 0
      ? buildUpdateWithNestedTransaction(model, where, updateData, updateNestedOps, registry)
      : { text: `SELECT * FROM ${model.tableName} WHERE ${Object.keys(where)[0]} = NONE;`, vars: {} };

  return { createQuery, updateQuery };
}
