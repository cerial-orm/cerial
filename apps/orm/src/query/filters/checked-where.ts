/**
 * The where helpers the package exports. A where key that names no field compiles to nothing, so a caller
 * composing `DELETE FROM t ${text}` from a misspelt key would delete every row. The public versions run the
 * validation the client runs and throw on an unknown key. The client and the builders keep using the
 * unchecked versions, having validated already.
 */
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import type { CompiledQuery, QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { validateWhere, validationFailure } from '../validators';
import { buildConditions } from './condition-builder';
import { transformWhere, transformWhereClause } from './transformer';

function assertValidWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry: ModelRegistry | undefined,
  operation: string,
): void {
  const validation = validateWhere(where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, operation);
}

export function buildConditionsChecked(
  ctx: FilterCompileContext,
  where: WhereClause,
  model: ModelMetadata,
  registry?: ModelRegistry,
): QueryFragment {
  assertValidWhere(where, model, registry, 'buildConditions');

  return buildConditions(ctx, where, model, registry);
}

export function transformWhereChecked(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidWhere(where, model, registry, 'transformWhere');

  return transformWhere(where, model, registry);
}

export function transformWhereClauseChecked(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidWhere(where, model, registry, 'transformWhereClause');

  return transformWhereClause(where, model, registry);
}
