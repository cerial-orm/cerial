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
import { assertNoAmbiguousEmpty } from './ambiguous-empty';
import { buildConditions } from './condition-builder';
import { assertFilterResolved, transformWhere, transformWhereClause } from './transformer';

function assertValidWhere(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry: ModelRegistry | undefined,
  operation: string,
): void {
  const validation = validateWhere(where, model, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, model, operation);
  assertNoAmbiguousEmpty(where, model, registry, operation);
}

export function buildConditionsChecked(
  ctx: FilterCompileContext,
  where: WhereClause,
  model: ModelMetadata,
  registry?: ModelRegistry,
): QueryFragment {
  assertValidWhere(where, model, registry, 'buildConditions');

  const fragment = buildConditions(ctx, where, model, registry);
  assertFilterResolved(where, fragment.text, model, 'buildConditions');

  return fragment;
}

export function transformWhereChecked(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidWhere(where, model, registry, 'transformWhere');

  const compiled = transformWhere(where, model, registry);
  assertFilterResolved(where, compiled.text, model, 'transformWhere');

  return compiled;
}

export function transformWhereClauseChecked(
  where: WhereClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): CompiledQuery {
  assertValidWhere(where, model, registry, 'transformWhereClause');

  const compiled = transformWhereClause(where, model, registry);
  assertFilterResolved(where, compiled.text, model, 'transformWhereClause');

  return compiled;
}
