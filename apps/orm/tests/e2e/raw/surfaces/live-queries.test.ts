/**
 * E2E Tests: live queries through the raw hatch
 *
 * The tables are private (`rawsf_event` and the edge `rawsf_member`), created and removed by this file.
 * Refusals first: a transaction refuses `$live`, and a forged where subscribes nothing. Then `client.$live`
 * on a private table and `Model.$live` on a model, each delivering a create, an update and a delete under a
 * `$raw` filter, with a non-matching write staying silent, and a filter that traverses a graph edge.
 * Every test kills what it opened, and every wait is bounded so a stalled test cannot hang the run.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialTransactionError, CerialValidationError, sql, type CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import type { User } from '../../generated';

const TABLES = [...tables.core];
const EVENT = 'rawsf_event';
const MEMBER = 'rawsf_member';
const TIMEOUT = Symbol('timeout');
const WAIT_MS = 3000;
const SILENCE_MS = 400;

/** Settles with the promise, or with TIMEOUT so a hang fails the assertion instead of the run. */
async function within<T>(promise: PromiseLike<T>, ms = WAIT_MS): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type Notification<T> = { action: string; value: T };
type Handle<T> = { next: () => Promise<IteratorResult<Notification<T>>>; kill: () => Promise<void> };
type Event = { level: number; label: string };

const user = (age: number, name = `u${age}`) => ({ email: `${name}@x.test`, name, isActive: true, age });

describe('E2E raw surface: live queries', () => {
  let client: CerialClient;
  const opened: Array<{ kill: () => Promise<void> }> = [];

  const track = <H extends { kill: () => Promise<void> }>(handle: H): H => {
    opened.push(handle);

    return handle;
  };
  // A timed-out next() stays pending and would swallow the next notification, so each handle keeps one.
  // It is dropped only once a caller has read its result: a notification can settle it while the write
  // that caused it is still awaiting its response, and dropping it on settle would lose that notification.
  const pending = new WeakMap<object, Promise<IteratorResult<unknown>>>();
  const pull = async <T>(
    handle: Handle<T>,
    ms = WAIT_MS,
  ): Promise<IteratorResult<Notification<T>> | typeof TIMEOUT> => {
    let next = pending.get(handle) as Promise<IteratorResult<Notification<T>>> | undefined;
    if (!next) {
      next = handle.next();
      pending.set(handle, next);
    }
    const result = await within(next, ms);
    if (result !== TIMEOUT) pending.delete(handle);

    return result;
  };
  const take = async <T>(handle: Handle<T>): Promise<Notification<T>> => {
    const result = await pull(handle);
    expect(result).not.toBe(TIMEOUT);

    return (result as IteratorResult<Notification<T>>).value;
  };
  const silent = async <T>(handle: Handle<T>): Promise<void> => {
    expect(await pull(handle, SILENCE_MS)).toBe(TIMEOUT);
  };

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(EVENT)}`);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(MEMBER)}`);
    await client.$raw(sql`DEFINE TABLE ${sql.ident(EVENT)} SCHEMALESS`);
    await client.$raw(sql`DEFINE TABLE ${sql.ident(MEMBER)} TYPE RELATION SCHEMALESS`);
  });

  afterAll(async () => {
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(EVENT)}`);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(MEMBER)}`);
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.$raw(sql`DELETE ${sql.ident(EVENT)}`);
    await client.$raw(sql`DELETE ${sql.ident(MEMBER)}`);
  });

  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.kill().catch(() => {});
  });

  describe('refusals', () => {
    test('a transaction refuses $live and opens nothing', async () => {
      await client.$transaction(async (tx) => {
        expect(() => (tx as unknown as { $live: (t: string) => unknown }).$live(EVENT)).toThrow(CerialTransactionError);
      });
      const tx = await client.$transaction();
      try {
        expect(() => tx.$live()).toThrow(CerialTransactionError);
      } finally {
        await tx.cancel();
      }
    });

    test('a forged where refuses and a later write is not delivered anywhere', async () => {
      await expect(client.$live(EVENT, { where: { strings: ['true'], values: [] } as never })).rejects.toThrow(
        CerialValidationError,
      );
      await expect(client.db.User.$live({ where: { $raw: 'true' as never } as never })).rejects.toThrow(
        CerialValidationError,
      );
      await client.$raw(sql`CREATE ${sql.ident(EVENT)} SET level = ${1}`);
      expect(await client.$raw(sql`SELECT * FROM ${sql.ident(EVENT)}`)).toHaveLength(1);
    });
  });

  describe('client.$live on a private table', () => {
    test('a $raw filter delivers a create, an update and a delete of the matching row', async () => {
      const handle = track(await client.$live<Event>(EVENT, { where: sql`level > ${5}` }));
      const [row] = await client.$raw<{ id: CerialId }>(
        sql`CREATE ${sql.ident(EVENT)} SET level = ${9}, label = ${'hot'}`,
      );
      await client.$raw(sql`UPDATE ${row!.id} SET level = ${10}`);
      await client.$raw(sql`DELETE ${row!.id}`);

      const seen = [await take(handle), await take(handle), await take(handle)];

      expect(seen.map((n) => n.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
      expect(seen.map((n) => n.value.level)).toEqual([9, 10, 10]);
      expect(seen[0]!.value.label).toBe('hot');
    });

    test('a write that does not match is not delivered', async () => {
      const handle = track(await client.$live<Event>(EVENT, { where: sql`level > ${5}` }));
      await client.$raw(sql`CREATE ${sql.ident(EVENT)} SET level = ${1}, label = ${'cold'}`);
      await silent(handle);
      await client.$raw(sql`CREATE ${sql.ident(EVENT)} SET level = ${6}, label = ${'warm'}`);

      expect((await take(handle)).value.label).toBe('warm');
    });

    test('kill ends the subscription, and a later matching write is not delivered', async () => {
      const handle = track(await client.$live<Event>(EVENT, { where: sql`level > ${5}` }));
      await handle.kill();
      await client.$raw(sql`CREATE ${sql.ident(EVENT)} SET level = ${9}`);

      const result = await within(handle.next(), SILENCE_MS);

      expect(result === TIMEOUT || (result as IteratorResult<unknown>).done === true).toBe(true);
    });
  });

  describe('Model.$live', () => {
    test('a $raw filter delivers a create, an update and a delete of the matching user, mapped', async () => {
      const handle = track(await client.db.User.$live({ where: { $raw: sql`age > ${50}` } }));
      const created = await client.db.User.create({ data: user(60, 'live') });
      await client.db.User.updateUnique({ where: { id: created.id }, data: { age: 70 } });
      await client.db.User.deleteUnique({ where: { id: created.id } });

      const seen = [await take<User>(handle), await take<User>(handle), await take<User>(handle)];

      expect(seen.map((n) => n.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
      expect(seen.map((n) => n.value.age)).toEqual([60, 70, 70]);
      expect(seen[0]!.value.id.equals(created.id)).toBe(true);
    });

    test('a user outside the filter is not delivered', async () => {
      const handle = track(await client.db.User.$live({ where: { $raw: sql`age > ${50}` } }));
      await client.db.User.create({ data: user(10, 'low') });
      await silent<User>(handle);
      await client.db.User.create({ data: user(99, 'high') });

      expect((await take<User>(handle)).value.name).toBe('high');
    });

    test('a filter that traverses an edge delivers only the users it reaches', async () => {
      const inside = await client.db.User.create({ data: user(30, 'inside') });
      const outside = await client.db.User.create({ data: user(31, 'outside') });
      await client.$raw(sql`RELATE ${inside.id}->${sql.ident(MEMBER)}->${inside.id}`);
      const handle = track(
        await client.db.User.$live({ where: { $raw: sql`->${sql.ident(MEMBER)}->user CONTAINS ${inside.id}` } }),
      );

      await client.db.User.updateUnique({ where: { id: outside.id }, data: { age: 41 } });
      await silent<User>(handle);
      await client.db.User.updateUnique({ where: { id: inside.id }, data: { age: 40 } });

      const notification = await take<User>(handle);

      expect(notification.action).toBe('UPDATE');
      expect(notification.value.name).toBe('inside');
    });
  });
});
