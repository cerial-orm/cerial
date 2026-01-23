/**
 * INSERT query builder
 */

import type { CompiledQuery, QueryVars } from '../compile/types';
import type { ModelMetadata, SelectClause } from '../../types';
import { createCompileContext } from '../compile/var-allocator';
import { buildSelectFields } from './select-builder';

/** Apply @now defaults to data */
export function applyNowDefaults<T extends Record<string, unknown>>(
  data: T,
  model: ModelMetadata,
): T {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.hasNowDefault && result[field.name] === undefined) {
      (result as Record<string, unknown>)[field.name] = new Date().toISOString();
    }
  }

  return result;
}

/** Apply @default values to data */
export function applyDefaultValues<T extends Record<string, unknown>>(
  data: T,
  model: ModelMetadata,
): T {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.defaultValue !== undefined && result[field.name] === undefined) {
      (result as Record<string, unknown>)[field.name] = field.defaultValue;
    }
  }

  return result;
}

/** Build INSERT query */
export function buildInsertQuery(
  model: ModelMetadata,
  data: Record<string, unknown>,
  select?: SelectClause,
): CompiledQuery {
  const ctx = createCompileContext();

  // Apply defaults
  const withDefaults = applyDefaultValues(applyNowDefaults(data, model), model);

  // Build content variable
  const contentVar = ctx.bind('content', 'insert', withDefaults, 'string');

  // Build select fields for RETURN
  const fields = buildSelectFields(select, model);

  // Build query
  const query = `INSERT INTO ${model.tableName} ${contentVar.placeholder} RETURN ${fields}`;

  return {
    text: query,
    vars: contentVar.vars,
  };
}

/** Build CREATE query (alternative to INSERT for single records) */
export function buildCreateQuery(
  model: ModelMetadata,
  data: Record<string, unknown>,
  select?: SelectClause,
): CompiledQuery {
  const ctx = createCompileContext();

  // Apply defaults
  const withDefaults = applyDefaultValues(applyNowDefaults(data, model), model);

  // Build content variable
  const contentVar = ctx.bind('content', 'create', withDefaults, 'string');

  // Build select fields for RETURN
  const fields = buildSelectFields(select, model);

  // Build query - use CONTENT for object data
  const query = `CREATE ${model.tableName} CONTENT ${contentVar.placeholder} RETURN ${fields}`;

  return {
    text: query,
    vars: contentVar.vars,
  };
}
