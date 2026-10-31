import type { Expr } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import { compileFragment, createCompileContext, isSqlFragment, type SqlFragment } from '../../query/compile';

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
