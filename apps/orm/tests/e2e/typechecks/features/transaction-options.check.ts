/**
 * Checks the `$transaction` begin options: `isolation` and `readOnly` are accepted in array, callback and
 * manual mode, `retries`, `backoff` and `timeout` only in array and callback mode, and a value outside the
 * documented set is a compile error. Read-only is not tracked by the types: a write under `readOnly` compiles
 * and is refused at runtime.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialTransaction, TransactionBeginOptions, TransactionIsolation, TransactionOptions } from 'cerial';
import type { CerialClient } from '../../generated';

declare const client: CerialClient;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

assertType<Equal<TransactionIsolation, 'snapshot' | 'serializable'>>();
assertType<Equal<NonNullable<TransactionBeginOptions['isolation']>, TransactionIsolation>>();
assertType<Equal<NonNullable<TransactionBeginOptions['readOnly']>, boolean>>();
assertType<Equal<TransactionOptions extends TransactionBeginOptions ? true : false, true>>();
assertType<Equal<TransactionBeginOptions extends TransactionOptions ? true : false, true>>();

export async function valid() {
  // Array mode: every begin option, alone and combined, plus the retry options
  await client.$transaction([client.db.User.count()], { isolation: 'snapshot' });
  await client.$transaction([client.db.User.count()], { isolation: 'serializable' });
  await client.$transaction([client.db.User.count()], { readOnly: true });
  await client.$transaction([client.db.User.count()], { readOnly: false });
  await client.$transaction([client.db.User.count()], { isolation: 'serializable', readOnly: true });
  await client.$transaction([client.db.User.count()], {});
  await client.$transaction([client.db.User.count()], {
    isolation: 'serializable',
    retries: 3,
    backoff: (attempt) => attempt * 10,
    timeout: 1000,
  });
  await client.$transaction([client.db.User.count()], { readOnly: true, retries: 2 });

  // Callback mode: the same options, and the callback's result keeps its type
  const count = await client.$transaction((tx) => tx.User.count(), { isolation: 'serializable', retries: 3 });
  assertType<Equal<typeof count, number>>();
  await client.$transaction(async (tx) => tx.User.findMany(), { readOnly: true });

  // Manual mode: begin options only, the transaction client keeps commit and cancel
  const none = await client.$transaction();
  assertType<Equal<typeof none.commit, () => Promise<void>>>();
  const both = await client.$transaction({ isolation: 'serializable', readOnly: true });
  const ro = await client.$transaction({ readOnly: true });
  const only = await client.$transaction({ isolation: 'snapshot' });
  const empty = await client.$transaction({});
  assertType<Equal<typeof both, typeof none>>();
  assertType<Equal<typeof ro, typeof none>>();
  assertType<Equal<typeof only, typeof none>>();
  assertType<Equal<typeof empty, typeof none>>();
  const typed: CerialTransaction = both;
  await typed.cancel();

  // Disposal still applies when the transaction began with options
  await using scoped = await client.$transaction({ readOnly: true });
  await scoped.User.findMany();

  // Reads and writes both compile under readOnly: the refusal is the server's
  await client.$transaction((tx) => tx.User.create({ data: { name: 'x', email: 'x@y.io', isActive: true } }), {
    readOnly: true,
  });
}

export async function refused() {
  // A SQL level name is not an isolation level
  // @ts-expect-error -- 'read committed' is not 'snapshot' | 'serializable'
  await client.$transaction([client.db.User.count()], { isolation: 'read committed' });
  // @ts-expect-error -- 'read committed' is not 'snapshot' | 'serializable'
  await client.$transaction((tx) => tx.User.count(), { isolation: 'read committed' });
  // @ts-expect-error -- 'read committed' is not 'snapshot' | 'serializable'
  await client.$transaction({ isolation: 'read committed' });
  // @ts-expect-error -- 'bogus' is not an isolation level
  await client.$transaction({ isolation: 'bogus' });

  // readOnly is a boolean
  // @ts-expect-error -- readOnly must be a boolean
  await client.$transaction([client.db.User.count()], { readOnly: 'true' });
  // @ts-expect-error -- readOnly must be a boolean
  await client.$transaction((tx) => tx.User.count(), { readOnly: 1 });
  // @ts-expect-error -- readOnly must be a boolean
  await client.$transaction({ readOnly: 'yes' });

  // Manual mode takes begin options only: the caller drives commit, so retries and timeout do not apply
  // @ts-expect-error -- retries is not a begin option
  await client.$transaction({ retries: 3 });
  // @ts-expect-error -- timeout is not a begin option
  await client.$transaction({ timeout: 1000 });
  // @ts-expect-error -- backoff is not a begin option
  await client.$transaction({ backoff: () => 1 });
  // @ts-expect-error -- retries is not a begin option
  await client.$transaction({ isolation: 'serializable', retries: 3 });

  // An unknown key is not an option in any mode
  // @ts-expect-error -- unknown option
  await client.$transaction([client.db.User.count()], { read_only: true });
  // @ts-expect-error -- unknown option
  await client.$transaction({ read_only: true });
}
