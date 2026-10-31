/**
 * Checks `client.$live`: it takes a table and an optional fragment, resolves to a handle typed by the claimed
 * row, iterates notifications of that row, refuses a plain string where, and is absent from the callback `tx`.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql, type CerialLiveHandle, type LiveNotification } from 'cerial';
import type { CerialClient } from '../../generated';

declare const client: CerialClient;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

export async function typed() {
  const handle = await client.$live<{ name: string }>('user', { where: sql`age > ${1}` });
  assertType<Equal<typeof handle, CerialLiveHandle<{ name: string }>>>();
  assertType<Equal<typeof handle.isAlive, boolean>>();
  assertType<Equal<typeof handle.isManaged, boolean>>();

  for await (const notification of handle) {
    assertType<Equal<typeof notification, LiveNotification<{ name: string }>>>();
    assertType<Equal<typeof notification.value.name, string>>();
    assertType<Equal<typeof notification.action, 'CREATE' | 'UPDATE' | 'DELETE'>>();
    break;
  }

  const untyped = await client.$live('user');
  assertType<Equal<typeof untyped, CerialLiveHandle<unknown>>>();
  await untyped.kill();
}

export async function disposable() {
  await using handle = await client.$live('user');
  assertType<Equal<typeof handle.isAlive, boolean>>();
}

// @ts-expect-error a plain string is not a fragment
export const stringWhere = client.$live('user', { where: 'age > 1' });

export const inTransaction = client.$transaction(async (tx) => {
  // @ts-expect-error a live query outlives the transaction, so the callback client does not offer it
  tx.$live('user');
});
