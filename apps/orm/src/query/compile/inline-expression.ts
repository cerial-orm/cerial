/**
 * The one SurrealQL expression Cerial writes into query text instead of binding it.
 *
 * A fixed-length tuple type literal refuses NONE in a position, and SurrealDB 4.0.0 refuses
 * `DEFINE FIELD t[N]` under a tuple-literal parent outright, so the server can never default
 * a tuple element (measured against 4.0.0). A tuple element's `@createdAt` / `@updatedAt` is therefore written
 * into the array literal as `time::now()`, so the timestamp comes from the database
 * clock like every model field's `DEFAULT time::now()`.
 *
 * The expression text is this module's own constant and `TIME_NOW` is a frozen
 * singleton matched by identity, so no caller-supplied value can ever become one and
 * no caller input can ever reach the query text through this path.
 */

import type { SchemaFieldType } from '../../types';
import { quoteSubKey } from '../../utils/string-utils';
import type { FilterCompileContext } from './var-allocator';

/** `time::now()` — the only inline expression Cerial emits for a tuple element */
export const TIME_NOW = Object.freeze({ text: 'time::now()' });

/** A SurrealQL expression emitted as query text rather than a bound parameter */
export type InlineExpression = typeof TIME_NOW;

/** True only for the frozen `TIME_NOW` singleton — identity, never shape */
export function isInlineExpression(value: unknown): value is InlineExpression {
  return value === TIME_NOW;
}

/** True when the value is a plain array or object literal we may render as query text */
function isRenderable(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

/** True when an inline expression sits anywhere inside the value */
export function containsInlineExpression(value: unknown): boolean {
  if (isInlineExpression(value)) return true;
  if (!isRenderable(value)) return false;

  return Object.values(value as Record<string, unknown>).some((v) => containsInlineExpression(v));
}

function render(
  ctx: FilterCompileContext,
  name: string,
  prefix: string,
  value: unknown,
  type: SchemaFieldType,
  vars: Record<string, unknown>,
): string {
  if (isInlineExpression(value)) return value.text;

  // Nothing inline below this point — bind the whole subtree as one parameter
  if (!containsInlineExpression(value)) {
    const binding = ctx.bind(name, prefix, value, type);
    Object.assign(vars, binding.vars);

    return binding.placeholder;
  }

  if (Array.isArray(value)) {
    const parts = value.map((element, index) =>
      // An absent position with no decorator keeps today's behaviour: NONE
      element === undefined ? 'NONE' : render(ctx, `${name}_${index}`, prefix, element, type, vars),
    );

    return `[${parts.join(', ')}]`;
  }

  const parts: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    parts.push(`${quoteSubKey(key)}: ${render(ctx, `${name}_${key}`, prefix, entry, type, vars)}`);
  }

  return `{ ${parts.join(', ')} }`;
}

/**
 * Bind a value for a SET or CONTENT clause, keeping inline expressions as query text.
 *
 * Without an inline expression anywhere in the value this is exactly `ctx.bind`, one
 * placeholder for the whole value. With one, the surrounding array or object literal is
 * written out and every other part is still bound, so the only text that is not a bound
 * parameter is this module's own `time::now()` constant.
 */
export function bindWithInlineExpressions(
  ctx: FilterCompileContext,
  name: string,
  prefix: string,
  value: unknown,
  type: SchemaFieldType,
): { text: string; vars: Record<string, unknown> } {
  const vars: Record<string, unknown> = {};
  const text = render(ctx, name, prefix, value, type, vars);

  return { text, vars };
}
