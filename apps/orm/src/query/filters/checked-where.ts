/**
 * The where helpers the package exports. A where key that names no field compiles to nothing, so a caller
 * composing `DELETE FROM t ${text}` from a misspelt key would delete every row. The public versions run the
 * validation the client runs and throw on an unknown key. The client and the builders keep using the
 * unchecked versions, having validated already.
 */
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import type { CompiledQuery, QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { CerialValidationError } from '../../errors';
import { isObject } from '../../utils/type-utils';
import { validateWhere, validationFailure } from '../validators';
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
  if (!registry) assertNoRelationKeys(where, model, operation);
}

/**
 * Without a registry the target model of a relation is unknown, so a relation filter would compile against the
 * virtual relation field, which is always NONE: `posts = NONE` matches every row without posts. The caller has to
 * pass the registry, so a relation key is refused at any depth. Runs after validation, which bounds the depth.
 */
function assertNoRelationKeys(where: WhereClause | undefined, model: ModelMetadata, operation: string): void {
  if (!isObject(where)) return;

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') {
      for (const item of value as WhereClause[]) assertNoRelationKeys(item, model, operation);
      continue;
    }
    if (key === 'NOT') {
      assertNoRelationKeys(value as WhereClause, model, operation);
      continue;
    }
    if (model.fields.some((f) => f.name === key && f.type === 'relation'))
      throw new CerialValidationError(
        `Invalid where clause: '${key}' is a relation on ${model.name}; a model registry is required to filter on a relation, pass it as the last argument`,
        { model: model.name, operation, field: key },
      );
  }
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
