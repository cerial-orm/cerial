import type { Expr } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import { compileFragment, createCompileContext, isSqlFragment, type SqlFragment } from '../../query/compile';
import { buildConditions } from '../../query/filters';
import { validateWhere, validationFailure } from '../../query/validators';
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../types';

/**
 * Adapt a fragment to the SDK's `Expr`. Each value is bound through the SDK's own `ctx.def`, so the SDK
 * names the parameters and none can collide with another part of its query.
 * The fragment is compiled once up front, so an unbranded value refuses here, before anything is subscribed.
 */
export function fragmentToExpr(fragment: unknown): Expr {
  if (!isSqlFragment(fragment)) {
    throw new CerialValidationError('$live: where must be a fragment built by the sql tag');
  }
  compileFragment(fragment, createCompileContext());

  return {
    toSQL(ctx) {
      const compile = createCompileContext();
      const { text } = compileFragment(fragment as SqlFragment, {
        ...compile,
        bind: (_field, _operator, value) => ({ placeholder: ctx.def(value), vars: {} }),
      });

      return text;
    },
  };
}

/**
 * Adapt a typed model where to the SDK's `Expr`. The where is validated against the model and the registry
 * (so a relation filter is checked against its target, and an unknown key or a `$raw` inside a relation
 * filter refuses) and compiled once before anything is subscribed. Each value is bound through the SDK's own
 * `ctx.def`. A where with keys that compiles to no condition refuses, because a subscription wider than the
 * caller asked for would notify about rows they meant to exclude.
 */
export function modelWhereToExpr(
  where: unknown,
  metadata: ModelMetadata,
  registry: ModelRegistry | undefined,
): Expr | undefined {
  if (where === undefined) return undefined;
  if (!where || typeof where !== 'object' || Array.isArray(where)) {
    throw new CerialValidationError('$live: where must be an object', { model: metadata.name, operation: '$live' });
  }
  const clause = where as WhereClause;
  if (!Object.keys(clause).length) return undefined;

  const validation = validateWhere(clause, metadata, registry);
  if (!validation.valid) throw validationFailure('where clause', validation.errors, metadata, '$live');

  const compile = (def: (value: unknown) => string): string => {
    const base = createCompileContext();
    const fragment = buildConditions(
      { ...base, bind: (_field, _operator, value) => ({ placeholder: def(value), vars: {} }) },
      clause,
      metadata,
      registry,
    );
    if (!fragment.text || Object.keys(fragment.vars).length) {
      throw new CerialValidationError(
        `$live on ${metadata.name}: the where filter resolved to no conditions the subscription can use`,
        { model: metadata.name, operation: '$live' },
      );
    }

    return fragment.text;
  };
  compile(() => '$_');

  return { toSQL: (ctx) => compile((value) => ctx.def(value)) };
}
