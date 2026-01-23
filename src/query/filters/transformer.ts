/**
 * Filter transformer - transforms where clauses to SQL conditions
 */

import type { QueryFragment, CompiledQuery } from '../compile/types';
import type { ModelMetadata, WhereClause } from '../../types';
import { createCompileContext } from '../compile/var-allocator';
import { fragmentToQuery } from '../compile/fragment';
import { buildConditions } from './condition-builder';

/** Transform a where clause to a compiled WHERE fragment */
export function transformWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
): CompiledQuery {
  if (!where || Object.keys(where).length === 0) {
    return { text: '', vars: {} };
  }

  const ctx = createCompileContext();
  const fragment = buildConditions(ctx, where, model);

  return fragmentToQuery(fragment);
}

/** Transform a where clause and return with WHERE keyword */
export function transformWhereClause(
  where: WhereClause | undefined,
  model: ModelMetadata,
): CompiledQuery {
  const compiled = transformWhere(where, model);

  if (!compiled.text) {
    return { text: '', vars: {} };
  }

  return {
    text: `WHERE ${compiled.text}`,
    vars: compiled.vars,
  };
}
