/**
 * Checks the `$raw` statement methods: the client's and a model's both take a fragment and return an array of
 * the claimed row type (`unknown` by default), a plain string is a compile error, and a model's accepts `txn`.
 *
 * `T` is the caller's unchecked claim. A wrong `T` compiles, and nothing throws when the rows disagree.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql } from 'cerial';
import type { CerialClient, CerialQueryPromise } from '../../generated';
import type { UserModel } from '../../generated/models';

declare const client: CerialClient;
declare const users: UserModel;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

// No type argument means unknown rows
export const untyped = client.$raw(sql`SELECT * FROM user`);
assertType<Equal<typeof untyped, CerialQueryPromise<unknown[]>>>();

// An explicit type argument types the rows
export const typed = client.$raw<{ n: number }>(sql`SELECT count() AS n FROM user GROUP ALL`);
assertType<Equal<Awaited<typeof typed>, Array<{ n: number }>>>();

// The type can ride on the fragment too
export const fromFragment = client.$raw(sql<string>`SELECT VALUE name FROM user`);
assertType<Equal<Awaited<typeof fromFragment>, string[]>>();

// A model's $raw has the same shape and takes a transaction
export const modelTyped = users.$raw<string>(sql`SELECT VALUE name FROM user`);
assertType<Equal<Awaited<typeof modelTyped>, string[]>>();
export const modelUntyped = users.$raw(sql`SELECT * FROM user`);
assertType<Equal<Awaited<typeof modelUntyped>, unknown[]>>();
declare const txn: import('cerial').CerialTransaction;
export const inTxn = users.$raw(sql`SELECT * FROM user`, { txn });

// A wrong T compiles, because the claim is unchecked
export const wrong = client.$raw<number>(sql`SELECT * FROM user`);

// Both are CerialQueryPromise, so they fit a $transaction array
export const queued = client.$transaction([users.$raw(sql`SELECT 1`)]);

// @ts-expect-error a plain string is not a fragment
client.$raw('DELETE user');
// @ts-expect-error a plain string is not a fragment
users.$raw('DELETE user');
// @ts-expect-error an object without the fragment's shape is not a fragment (the brand itself is runtime-only)
client.$raw({ text: 'DELETE user' });
// @ts-expect-error txn must be a transaction
users.$raw(sql`SELECT 1`, { txn: 'x' });
