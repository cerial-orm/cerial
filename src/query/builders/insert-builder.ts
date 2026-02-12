/**
 * INSERT query builder
 */

import type { ModelMetadata, SelectClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
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

/** Apply @default values to data */
export function applyDefaultValues<T extends Record<string, unknown>>(data: T, model: ModelMetadata): T {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.defaultValue !== undefined && result[field.name] === undefined) {
      (result as Record<string, unknown>)[field.name] = field.defaultValue;
    }
  }

  return result;
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

  // Build content variable
  const contentVar = ctx.bind('content', 'create', withDefaults, 'string');

  // Build select fields for RETURN
  const fields = buildSelectFields(select, model);

  // Build query - use CONTENT for object data
  const query = `CREATE ONLY ${model.tableName} CONTENT ${contentVar.placeholder} RETURN ${fields}`;

  return {
    text: query,
    vars: contentVar.vars,
  };
}
