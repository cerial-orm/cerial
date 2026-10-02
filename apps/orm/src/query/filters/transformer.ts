/**
 * Filter transformer - transforms where clauses to SQL conditions
 */

import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { fragmentToQuery } from '../compile/fragment';
import type { CompiledQuery } from '../compile/types';
import { createCompileContext } from '../compile/var-allocator';
import { buildConditions } from './condition-builder';

/** Transform a where clause to a compiled WHERE fragment */
export function transformWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  if (!where || Object.keys(where).length === 0) {
    return { text: '', vars: {} };
  }

  const ctx = createCompileContext();
  const fragment = buildConditions(ctx, where, model, registry);

  return fragmentToQuery(fragment);
}

/** Transform a where clause and return with WHERE keyword */
export function transformWhereClause(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  const compiled = transformWhere(where, model, registry);

  if (!compiled.text) {
    return { text: '', vars: {} };
  }

  return {
    text: `WHERE ${compiled.text}`,
    vars: compiled.vars,
  };
}

/**
 * Compile the WHERE clause of a DELETE or UPDATE.
 *
 * A `where` the caller did not give, or gave with no keys, is deliberate: it means every row. A `where`
 * that names at least one key but compiles to no conditions (every value undefined, `AND: []`, an
 * unknown or unresolvable key) is a filter that evaporated. Running it would silently hit every row, so
 * it throws instead. Checking the compiled output, not the causes, keeps unknown causes covered.
 */
export function transformDestructiveWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  operation: string,
  registry?: ModelRegistry,
): CompiledQuery {
  const suppliedNoFilter = where === undefined || Object.keys(where).length === 0;
  const clause = transformWhereClause(where, model, registry);
  if (suppliedNoFilter || clause.text) return clause;

  throw new Error(
    `${operation} on ${model.name}: the where filter resolved to no conditions, so the statement would affect every row. ` +
      'Omit where entirely to affect every row.',
  );
}
