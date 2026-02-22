/**
 * INSERT query builder
 */

import type { ModelMetadata, SelectClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext, type FilterCompileContext } from '../compile/var-allocator';
import { transformValue } from '../transformers/data-transformer';
import { buildSelectFields } from './select-builder';

/**
 * Strip @now (COMPUTED) fields from data.
 * These fields are not stored — they are computed by the DB at query time.
 * If the user accidentally includes them, we remove them silently.
 */
export function stripComputedFields<T extends Record<string, unknown>>(data: T, model: ModelMetadata): T {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.timestampDecorator === 'now') {
      delete result[field.name];
    }
  }

  return result;
}

/** Apply @default values to data, transforming SDK types (duration, uuid) */
export function applyDefaultValues<T extends Record<string, unknown>>(data: T, model: ModelMetadata): T {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.defaultValue !== undefined && result[field.name] === undefined) {
      (result as Record<string, unknown>)[field.name] = transformValue(field.defaultValue, field.type);
    }
  }

  return result;
}

/**
 * Build SET clauses for CREATE, wrapping @set fields with <set> cast.
 * Returns SET clause parts and variables.
 */
export function buildCreateSetClauses(
  ctx: FilterCompileContext,
  data: Record<string, unknown>,
  model: ModelMetadata,
): { setParts: string[]; setVars: Record<string, unknown> } {
  const setParts: string[] = [];
  const setVars: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const fieldMetadata = model.fields.find((f) => f.name === field);
    const varBinding = ctx.bind(field, 'create', value, fieldMetadata?.type || 'string');
    const placeholder = fieldMetadata?.isSet ? `<set>${varBinding.placeholder}` : varBinding.placeholder;
    setParts.push(`${field} = ${placeholder}`);
    Object.assign(setVars, varBinding.vars);
  }

  return { setParts, setVars };
}

/** Build CREATE query */
export function buildCreateQuery(
  model: ModelMetadata,
  data: Record<string, unknown>,
  select?: SelectClause,
): CompiledQuery {
  const ctx = createCompileContext();

  // Strip computed fields and apply defaults
  const withDefaults = applyDefaultValues(stripComputedFields(data, model), model);

  // Build select fields for RETURN
  const fields = buildSelectFields(select, model);

  // Models with @set fields must use SET syntax (CONTENT sends raw arrays, SurrealDB rejects them for set<T> fields)
  const hasSetFields = model.fields.some((f) => f.isSet);
  if (hasSetFields) {
    const { setParts, setVars } = buildCreateSetClauses(ctx, withDefaults, model);
    const query = `CREATE ONLY ${model.tableName} SET ${setParts.join(', ')} RETURN ${fields}`;

    return {
      text: query,
      vars: setVars,
    };
  }

  // Standard path: use CONTENT for object data
  const contentVar = ctx.bind('content', 'create', withDefaults, 'string');
  const query = `CREATE ONLY ${model.tableName} CONTENT ${contentVar.placeholder} RETURN ${fields}`;

  return {
    text: query,
    vars: contentVar.vars,
  };
}
