/**
 * UPDATE query builder
 */

import type { ModelMetadata, ModelRegistry, SelectClause, UpdateUniqueReturn, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { buildArrayUpdateClause, isArrayField, isArrayUpdateOps } from './array-update-builder';
import { getRecordIdFromWhere } from './delete-builder';
import { type IncludeClause, combineSelectWithIncludes } from './relation-builder';
import { buildSelectFields } from './select-builder';

/** Build UPDATE query */
export function buildUpdateManyQuery(
  model: ModelMetadata,
  where: WhereClause,
  data: Record<string, unknown>,
  select?: SelectClause,
): CompiledQuery {
  const ctx = createCompileContext();

  // Build SET clause
  const setVars: Record<string, unknown> = {};
  const setParts: string[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === field);

    // Handle null values for optional record fields - use NONE instead of NULL
    if (value === null && fieldMetadata?.type === 'record' && !fieldMetadata.isRequired) {
      setParts.push(`${field} = NONE`);
      continue;
    }

    // Handle array Record[] fields with push/unset operations
    if (fieldMetadata && isArrayField(fieldMetadata) && (Array.isArray(value) || isArrayUpdateOps(value))) {
      const arrayUpdate = buildArrayUpdateClause(ctx, field, value, fieldMetadata);
      if (arrayUpdate.clause) {
        setParts.push(arrayUpdate.clause);
        Object.assign(setVars, arrayUpdate.vars);
      }
      continue;
    }

    // Standard field update
    const varBinding = ctx.bind(field, 'set', value, fieldMetadata?.type || 'string');
    setParts.push(`${field} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build select fields for RETURN
  const fields = buildSelectFields(select, model);

  // Build query
  const parts = [
    `UPDATE ${model.tableName}`,
    setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
    whereClause.text,
    `RETURN ${fields}`,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: { ...setVars, ...whereClause.vars },
  };
}

/**
 * Build WHERE clause from fields excluding the id field
 * Used for updateUnique when id is provided along with other fields
 */
function buildWhereClauseWithoutId(where: WhereClause, model: ModelMetadata): CompiledQuery {
  const idField = model.fields.find((f) => f.isId);
  if (!idField) {
    return transformWhereClause(where, model);
  }

  // Remove id field from where clause
  const whereWithoutId = { ...where };
  delete whereWithoutId[idField.name];

  // If no other fields, return empty
  if (!Object.keys(whereWithoutId).length) {
    return { text: '', vars: {} };
  }

  return transformWhereClause(whereWithoutId, model);
}

/**
 * Build SET clause for update
 * Returns the SET parts and variables
 */
function buildSetClause(
  data: Record<string, unknown>,
  model: ModelMetadata,
): { setParts: string[]; setVars: Record<string, unknown> } {
  const ctx = createCompileContext();
  const setVars: Record<string, unknown> = {};
  const setParts: string[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === field);

    // Handle null values for optional record fields - use NONE instead of NULL
    if (value === null && fieldMetadata?.type === 'record' && !fieldMetadata.isRequired) {
      setParts.push(`${field} = NONE`);
      continue;
    }

    // Handle array Record[] fields with push/unset operations
    if (fieldMetadata && isArrayField(fieldMetadata) && (Array.isArray(value) || isArrayUpdateOps(value))) {
      const arrayUpdate = buildArrayUpdateClause(ctx, field, value, fieldMetadata);
      if (arrayUpdate.clause) {
        setParts.push(arrayUpdate.clause);
        Object.assign(setVars, arrayUpdate.vars);
      }
      continue;
    }

    // Standard field update
    const varBinding = ctx.bind(field, 'set', value, fieldMetadata?.type || 'string');
    setParts.push(`${field} = ${varBinding.placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  return { setParts, setVars };
}

/**
 * Build RETURN clause for updateUnique based on return option and select/include
 */
function buildUpdateUniqueReturnClause(
  returnOption: UpdateUniqueReturn,
  select: SelectClause | undefined,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): string {
  // 'before' - return pre-update state (no select/include support)
  if (returnOption === 'before') {
    return 'RETURN BEFORE';
  }

  // true - no explicit return, we'll check if result is NONE
  if (returnOption === true) {
    return '';
  }

  // Default / 'after' - return updated record with select/include support
  const fields = select ? buildSelectFields(select, model) : '*';
  const fieldsWithIncludes = include ? combineSelectWithIncludes(fields, include, model, registry) : fields;

  return `RETURN ${fieldsWithIncludes}`;
}

/**
 * Build UPDATE unique query for a single record by unique field
 *
 * Query patterns:
 * - { id: '123' } → UPDATE ONLY table:123 SET ...
 * - { id: '123', email: 'x@y.com' } → UPDATE ONLY table:123 SET ... WHERE email = $email
 * - { email: 'x@y.com' } → UPDATE table SET ... WHERE email = $email
 * - { email: 'x', isActive: true } → UPDATE table SET ... WHERE email = $email AND isActive = $isActive
 */
export function buildUpdateUniqueQuery(
  model: ModelMetadata,
  where: WhereClause,
  data: Record<string, unknown>,
  returnOption: UpdateUniqueReturn,
  select?: SelectClause,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  const { hasId, id } = getRecordIdFromWhere(where, model, 'updateUnique');

  // Build SET clause
  const { setParts, setVars } = buildSetClause(data, model);

  // Build RETURN clause
  const returnClause = buildUpdateUniqueReturnClause(returnOption, select, include, model, registry);

  if (hasId) {
    // ID-based: UPDATE ONLY table:id SET ... [WHERE other fields] [RETURN ...]
    const recordId = transformOrValidateRecordId(model.tableName, id!);
    const whereClause = buildWhereClauseWithoutId(where, model);

    const parts = [
      `UPDATE ONLY ${recordId.toString()}`,
      setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
      whereClause.text,
      returnClause,
    ].filter((p) => p);

    return {
      text: parts.join(' '),
      vars: { ...setVars, ...whereClause.vars },
    };
  }

  // Unique field (no id): UPDATE table SET ... WHERE all fields [RETURN ...]
  const whereClause = transformWhereClause(where, model);

  const parts = [
    `UPDATE ${model.tableName}`,
    setParts.length > 0 ? `SET ${setParts.join(', ')}` : '',
    whereClause.text,
    returnClause,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: { ...setVars, ...whereClause.vars },
  };
}
