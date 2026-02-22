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
