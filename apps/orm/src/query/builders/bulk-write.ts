/**
 * A write that reaches many rows names them first.
 *
 * SurrealDB re-runs a WHERE subquery for each row against the table as it is being written, so a filter that
 * reads the written table (a relation filter over a reverse or self relation) sees rows already gone or
 * changed. Selecting the ids once, then writing exactly those, evaluates the filter once against the state
 * the statement started from.
 */

import type { FilterCompileContext } from '../compile/var-allocator';

export interface MatchedIds {
  /** The `LET` that holds the ids, run before the write */
  readonly statement: string;
  /** The variable to write to in place of the table */
  readonly target: string;
}

/**
 * Capture the ids `whereText` (with its `WHERE`) matches in `table`. The name comes from the statement's own
 * allocator, which must already hold every variable name bound in the statement.
 */
export function captureMatchedIds(
  ctx: Pick<FilterCompileContext, 'name'>,
  table: string,
  whereText: string,
): MatchedIds {
  const target = `$${ctx.name('bulk_ids')}`;

  return { statement: `LET ${target} = (SELECT VALUE id FROM ${table} ${whereText})`, target };
}

/** Wrap statements in the transaction a capture needs, so the write sees the ids as read. */
export function inTransaction(statements: readonly string[]): string {
  return ['BEGIN TRANSACTION', ...statements, 'COMMIT TRANSACTION'].map((s) => `${s};`).join('\n');
}
