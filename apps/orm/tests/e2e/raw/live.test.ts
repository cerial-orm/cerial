/**
 * E2E Tests: `client.$live`
 *
 * Refusals first (a forged where, a hostile table name, `ORDER BY`, a transaction), each ending in a count of
 * the rows that must still be there. Then the managed handle on an HTTP-mode and a WS-mode client: create,
 * update and delete notify, a non-matching write does not, a killed handle stops, and a real `KILL` from a
 * second connection ends the iterator without a TypeError. Last, the disconnect paths: a deliberate
 * `disconnect()` ends cleanly, a socket that closes on its own ends with a taxonomy error.
 * Every test kills what it opened, and every wait is bounded so a stalled test cannot hang the run.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  CerialConnectionError,
  CerialDatabaseError,
  CerialTransactionError,
  CerialValidationError,
  sql,
  type CerialLiveHandle,
} from 'cerial';
import { Surreal } from 'surrealdb';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];
const WS_CONFIG = { ...testConfig, url: testConfig.url.replace(/^http/, 'ws') };
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

const user = (age: number, name = `u${age}`) => ({ email: `${name}@x.test`, name, isActive: true, age });

/** A second connection, for writes and for a KILL the client under test did not issue. */
async function openSecond(): Promise<Surreal> {
  const surreal = new Surreal();
  await surreal.connect(`${WS_CONFIG.url}/rpc`);
  await surreal.signin({ username: testConfig.auth.username, password: testConfig.auth.password });
  await surreal.use({ namespace: testConfig.namespace, database: testConfig.database });

  return surreal;
}

type Row = { name: string; age: number };

describe('E2E client.$live', () => {
  let client: CerialClient;
  const opened: Array<{ kill: () => Promise<void> }> = [];

  const live = async (table: string, where?: ReturnType<typeof sql>, using: CerialClient = client) => {
    const handle = await using.$live<Row>(table, where ? { where } : undefined);
    opened.push(handle);

    return handle;
  };
  const count = async (): Promise<number> => client.db.User.count();

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.db.User.create({ data: user(20, 'victim') });
  });

  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.kill().catch(() => {});
  });

  describe('refusals', () => {
    const forged: Array<[string, unknown]> = [
      ['a string', 'age > 1'],
      ['a plain object shaped like a fragment', { strings: ['age > 1'], values: [] }],
      ['a spread copy of a real fragment', { ...sql`age > ${1}` }],
      ['a request body', JSON.parse('{"$raw":{"strings":["true"],"values":[]}}')],
    ];

    test.each(forged)('an unbranded where (%s) refuses and subscribes nothing', async (_label, where) => {
      await expect(client.$live('user', { where: where as never })).rejects.toThrow(CerialValidationError);
      expect(await count()).toBe(1);
    });

    test.each([[''], [undefined], [5], [null]])('a table of %p refuses', async (table) => {
      await expect(client.$live(table as never)).rejects.toThrow(CerialValidationError);
    });

    test('ORDER BY in a fragment surfaces as CerialDatabaseError', async () => {
      await expect(client.$live('user', { where: sql`age > 1 ORDER BY age` })).rejects.toThrow(CerialDatabaseError);
      expect(await count()).toBe(1);
    });

    // The driver builds `FROM ${what}`; this proves the table travels as a bound value, not as text.
    const hostile = [
      'x\\⟩ FROM user; DELETE user; SELECT ⟨y',
      'user` FROM user; DELETE user; --',
      "user'; DELETE user; --",
    ];

    test.each(hostile.map((p) => [p]))('a hostile table name %p deletes nothing', async (payload) => {
      try {
        await live(payload);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      await client.db.User.create({ data: user(30, 'extra') });
      expect(await count()).toBe(2);
    });

    test('a hostile string inside the where is bound and deletes nothing', async () => {
      const handle = await live('user', sql`name = ${"x'; DELETE user; --"}`);
      await client.db.User.create({ data: user(31, 'other') });

      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
      expect(await count()).toBe(2);
    });

    test('a transaction refuses $live', async () => {
      await client.$transaction(async (tx) => {
        expect(() => (tx as unknown as { $live: (t: string) => unknown }).$live('user')).toThrow(
          CerialTransactionError,
        );
      });
      const tx = await client.$transaction();
      try {
        expect(() => tx.$live()).toThrow(CerialTransactionError);
      } finally {
        await tx.cancel();
      }
      expect(await count()).toBe(1);
    });
  });

  describe.each([
    ['HTTP-mode', testConfig],
    ['WS-mode', WS_CONFIG],
  ])('%s client', (_mode, config) => {
    let own: CerialClient;

    beforeAll(async () => {
      own = createTestClient();
      await own.connect(config);
    });

    afterAll(async () => {
      await own.disconnect();
    });

    test('is managed and alive when it resolves', async () => {
      const handle = await live('user', undefined, own);

      expect(handle.isManaged).toBe(true);
      expect(handle.isAlive).toBe(true);
    });

    test('create, update and delete each notify, with the action and the row', async () => {
      const handle = await live('user', sql`age > ${50}`, own);
      const created = await own.db.User.create({ data: user(60, 'live') });
      await own.db.User.updateUnique({ where: { id: created.id }, data: { age: 70 } });
      await own.db.User.deleteUnique({ where: { id: created.id } });

      const seen = [];
      for (let i = 0; i < 3; i++) {
        const result = await within(handle.next());
        expect(result).not.toBe(TIMEOUT);
        seen.push((result as IteratorResult<{ action: string; value: Row }>).value);
      }

      expect(seen.map((n) => n.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
      expect(seen.map((n) => n.value.age)).toEqual([60, 70, 70]);
      expect(seen[0]!.value.name).toBe('live');
    });

    test('a non-matching write does not notify: the first notification is the matching one', async () => {
      const handle = await live('user', sql`age > ${50}`, own);
      await own.db.User.create({ data: user(10, 'low') });
      await own.db.User.create({ data: user(99, 'high') });
      const first = await within(handle.next());

      expect(first).not.toBe(TIMEOUT);
      expect((first as IteratorResult<{ value: Row }>).value.value.name).toBe('high');
    });

    test('a write before the where is met by a later update notifies as the row now matches', async () => {
      const handle = await live('user', sql`age > ${50}`, own);
      const row = await own.db.User.create({ data: user(10, 'grow') });
      await own.db.User.updateUnique({ where: { id: row.id }, data: { age: 80 } });
      const first = await within(handle.next());

      expect((first as IteratorResult<{ value: Row }>).value.value.age).toBe(80);
    });

    test('kill() stops it: isAlive false, iteration done, no later notification', async () => {
      const handle = await live('user', undefined, own);
      await handle.kill();
      await own.db.User.create({ data: user(41, 'after') });

      expect(handle.isAlive).toBe(false);
      expect(await within(handle.next())).toEqual({ value: undefined, done: true });
    });

    test('break in a for await kills the query', async () => {
      const handle = await live('user', undefined, own);
      await own.db.User.create({ data: user(42, 'once') });
      for await (const notification of handle) {
        expect(notification.value.name).toBe('once');
        break;
      }

      expect(handle.isAlive).toBe(false);
    });

    test('await using kills the query at scope exit', async () => {
      let escaped: CerialLiveHandle<Row> | undefined;
      {
        await using handle = await own.$live<Row>('user');
        escaped = handle;
        expect(handle.isAlive).toBe(true);
      }

      expect(escaped.isAlive).toBe(false);
    });

    test('a real KILL from a second connection ends the iterator cleanly, with no TypeError', async () => {
      const second = await openSecond();
      try {
        const handle = await live('user', undefined, own);
        const [info] = await second.query('INFO FOR TABLE user').collect<[{ lives: Record<string, string> }]>();
        const ids = Object.keys(info!.lives);
        expect(ids.length).toBe(1);

        const pending = handle.next();
        await second.query(`KILL u'${ids[0]}'`).collect();

        expect(await within(pending)).toEqual({ value: undefined, done: true });
        expect(handle.isAlive).toBe(false);
      } finally {
        await second.close();
      }
    });
  });

  describe('disconnect', () => {
    test('a deliberate disconnect ends a waiting iterator cleanly', async () => {
      const own = createTestClient();
      await own.connect(testConfig);
      const handle = await own.$live<Row>('user');
      const pending = handle.next();
      await own.disconnect();

      expect(await within(pending)).toEqual({ value: undefined, done: true });
      expect(handle.isAlive).toBe(false);
    });

    test('a deliberate disconnect ends the handle on a pooled socket another client still holds', async () => {
      const first = createTestClient();
      const second = createTestClient();
      await first.connect(WS_CONFIG);
      await second.connect(WS_CONFIG);
      const mine = await first.$live<Row>('user');
      const theirs = await second.$live<Row>('user');
      try {
        await first.disconnect();

        expect(mine.isAlive).toBe(false);
        expect(theirs.isAlive).toBe(true);
        await second.db.User.create({ data: user(77, 'still') });
        const result = await within(theirs.next());
        expect((result as IteratorResult<{ value: Row }>).value.value.name).toBe('still');
      } finally {
        await theirs.kill();
        await second.disconnect();
      }
    });

    test('a socket that closes with no disconnect() ends the iterator with a CerialConnectionError', async () => {
      const own = createTestClient();
      await own.connect(WS_CONFIG);
      const handle = await own.$live<Row>('user');
      const pending = handle.next();
      const settled = pending.then(
        () => 'ended',
        (error: unknown) => error,
      );
      await own.getTransactionSurreal()!.close();
      try {
        const outcome = await within(settled);

        expect(outcome).toBeInstanceOf(CerialConnectionError);
        expect(handle.isAlive).toBe(false);
      } finally {
        await own.disconnect().catch(() => {});
      }
    });
  });
});
