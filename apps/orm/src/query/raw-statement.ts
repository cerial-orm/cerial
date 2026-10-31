/**
 * A whole raw statement: a fragment built by the `sql` tag, run as the statement itself.
 */

import { BoundQuery, type Surreal } from 'surrealdb';
import { compileFragment, createCompileContext } from './compile';
import type { CompiledQuery } from './compile/types';

/**
 * Compile a fragment into a statement. A string, a plain object or an unbranded value is refused here,
 * before anything reaches the database.
 */
export function compileRawStatement(fragment: unknown): CompiledQuery {
  const { text, vars } = compileFragment(fragment as Parameters<typeof compileFragment>[0], createCompileContext());

  return { text, vars };
}

/**
 * Run a statement and return the last statement's result as an array: a scalar wraps, NONE gives `[]`.
 * `executeQuery` and `executeRaw` read the first result set and cannot serve here.
 */
export async function executeRawStatement<T = unknown>(db: Surreal, query: CompiledQuery): Promise<T[]> {
  const results = await db.query(new BoundQuery(query.text, query.vars)).collect();
  const last = results.at(-1);
  if (last === undefined) return [];

  return (Array.isArray(last) ? last : [last]) as T[];
}
