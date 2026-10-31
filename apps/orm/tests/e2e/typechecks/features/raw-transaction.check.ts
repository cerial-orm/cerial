/**
 * Checks `$raw` on the transaction client: the callback's `tx` and a manual transaction both carry it, it
 * returns an array of the claimed row type, a plain string is a compile error, and a model on `tx` keeps its own.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql } from 'cerial';
import type { CerialClient, CerialQueryPromise } from '../../generated';

declare const client: CerialClient;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

export const fromCallback = client.$transaction(async (tx) => {
  const rows = tx.$raw<{ n: number }>(sql`SELECT count() AS n FROM user GROUP ALL`);
  assertType<Equal<typeof rows, CerialQueryPromise<Array<{ n: number }>>>>();

  const untyped = await tx.$raw(sql`SELECT * FROM user`);
  assertType<Equal<typeof untyped, unknown[]>>();

  const modelRows = tx.User.$raw<string>(sql`SELECT VALUE name FROM user`);
  assertType<Equal<typeof modelRows, CerialQueryPromise<string[]>>>();

  // @ts-expect-error a plain string is not a fragment
  tx.$raw('DELETE user');

  return rows;
});

export async function manual() {
  const tx = await client.$transaction();
  const rows = tx.$raw<number>(sql`SELECT VALUE age FROM user`);
  assertType<Equal<typeof rows, CerialQueryPromise<number[]>>>();
}

// A client-level fragment is accepted as an array item
export const inArray = client.$transaction([client.$raw<number>(sql`RETURN 1`)]);
