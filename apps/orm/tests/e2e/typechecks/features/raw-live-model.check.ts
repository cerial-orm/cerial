/**
 * Checks `Model.$live`: it takes an optional typed where (including `$raw`), resolves to a handle of the
 * model's row, and refuses a wrong where type.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { sql, type CerialLiveHandle, type LiveNotification } from 'cerial';
import type { CerialClient, User } from '../../generated';

declare const client: CerialClient;

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>() {}

export async function typed() {
  const handle = await client.db.User.$live({ where: { age: { gt: 1 } } });
  assertType<Equal<typeof handle, CerialLiveHandle<User>>>();

  for await (const notification of handle) {
    assertType<Equal<typeof notification, LiveNotification<User>>>();
    assertType<Equal<typeof notification.value.name, string>>();
    break;
  }
}

export async function rawWhere() {
  await using handle = await client.db.User.$live({ where: { $raw: sql`age > ${1}` } });
  assertType<Equal<typeof handle.isAlive, boolean>>();
  await client.db.User.$live();
}

// @ts-expect-error an unknown key is not a User field
export const unknownKey = client.db.User.$live({ where: { nope: 1 } });

// @ts-expect-error age is a number, not a string
export const wrongType = client.db.User.$live({ where: { age: 'x' } });

// @ts-expect-error a plain string is not a where
export const stringWhere = client.db.User.$live({ where: 'age > 1' });

// @ts-expect-error a $raw is not a plain string
export const stringRaw = client.db.User.$live({ where: { $raw: 'true' } });
