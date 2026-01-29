/**
 * UPDATE query builder
 */

import type { ModelMetadata, SelectClause, WhereClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
import { transformWhereClause } from '../filters/transformer';
import { buildArrayUpdateClause, isArrayField, isArrayUpdateOps } from './array-update-builder';
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
