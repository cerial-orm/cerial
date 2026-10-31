/**
 * E2E Tests: `Model.$live`
 *
 * Refusals first (an unknown key, a forged `$raw`, a `$raw` in a relation filter, a where that resolves to
 * nothing, a transaction), each ending in a count of the rows that must still be there and none opening a
 * subscription. Then the mapped handle: a typed where and a `$raw` where each notify only on matching writes,
 * ids arrive as CerialId, a delete carries the row it removed, a killed query ends the iterator.
 * Every test kills what it opened, and every wait is bounded so a stalled test cannot hang the run.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  CerialId,
  CerialTransactionError,
  CerialUnknownFieldError,
  CerialValidationError,
  sql,
  type CerialLiveHandle,
} from 'cerial';
import { Surreal } from 'surrealdb';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';
import type { User } from '../generated';

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

async function openSecond(): Promise<Surreal> {
  const surreal = new Surreal();
  await surreal.connect(`${WS_CONFIG.url}/rpc`);
  await surreal.signin({ username: testConfig.auth.username, password: testConfig.auth.password });
  await surreal.use({ namespace: testConfig.namespace, database: testConfig.database });

  return surreal;
}

describe('E2E Model.$live', () => {
  let client: CerialClient;
  const opened: Array<{ kill: () => Promise<void> }> = [];

  const track = <H extends { kill: () => Promise<void> }>(handle: H): H => {
    opened.push(handle);

    return handle;
  };
  const count = async (): Promise<number> => client.db.User.count();
  const next = async (handle: CerialLiveHandle<User>) => {
    const result = await within(handle.next());
    expect(result).not.toBe(TIMEOUT);

    return (result as IteratorResult<{ action: string; value: User }>).value;
  };

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
    test('an unknown key refuses before subscribing', async () => {
      await expect(client.db.User.$live({ where: { nope: 1 } as never })).rejects.toThrow(CerialUnknownFieldError);
      expect(await count()).toBe(1);
    });

    test.each([
      ['a string', 'age > 1'],
      ['a plain object shaped like a fragment', { strings: ['true'], values: [] }],
      ['a spread copy of a real fragment', { ...sql`age > ${1}` }],
      ['a request body', JSON.parse('{"strings":["true"],"values":[]}')],
    ])('an unbranded $raw (%s) refuses', async (_label, raw) => {
      await expect(client.db.User.$live({ where: { $raw: raw } as never })).rejects.toThrow(CerialValidationError);
      expect(await count()).toBe(1);
    });

    test('an unbranded $raw nested in AND/OR/NOT refuses', async () => {
      const forged = { strings: ['true'], values: [] };
      for (const where of [{ AND: [{ $raw: forged }] }, { OR: [{ NOT: { $raw: forged } }] }]) {
        await expect(client.db.User.$live({ where: where as never })).rejects.toThrow(CerialValidationError);
      }
      expect(await count()).toBe(1);
    });

    test('a $raw inside a relation filter refuses', async () => {
      await expect(client.db.Post.$live({ where: { author: { $raw: sql`true` } } as never })).rejects.toThrow(
        CerialValidationError,
      );
      expect(await count()).toBe(1);
    });

    test.each([['x'], [5], [[]], [null]])('a where of %p refuses', async (where) => {
      await expect(client.db.User.$live({ where: where as never })).rejects.toThrow(CerialValidationError);
    });

    test('a where whose keys all resolve to nothing refuses instead of watching every row', async () => {
      await expect(client.db.User.$live({ where: { name: undefined } })).rejects.toThrow(CerialValidationError);
    });

    test('a hostile string in a typed where is bound and deletes nothing', async () => {
      const handle = track(await client.db.User.$live({ where: { name: "x'; DELETE user; --" } }));
      await client.db.User.create({ data: user(31, 'other') });

      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
      expect(await count()).toBe(2);
    });

    test('a transaction refuses $live, in callback and manual mode', async () => {
      await client.$transaction(async (tx) => {
        expect(() => (tx.User as unknown as { $live: () => unknown }).$live()).toThrow(CerialTransactionError);
      });
      const tx = await client.$transaction();
      try {
        expect(() => (tx.User as unknown as { $live: () => unknown }).$live()).toThrow(CerialTransactionError);
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
      const handle = track(await own.db.User.$live());

      expect(handle.isManaged).toBe(true);
      expect(handle.isAlive).toBe(true);
    });

    test('a typed where notifies only on matching writes, with mapped rows', async () => {
      const handle = track(await own.db.User.$live({ where: { age: { gt: 50 } } }));
      await own.db.User.create({ data: user(10, 'low') });
      const high = await own.db.User.create({ data: user(99, 'high') });

      const first = await next(handle);

      expect(first.action).toBe('CREATE');
      expect(first.value.name).toBe('high');
      expect(first.value.id).toBeInstanceOf(CerialId);
      expect(first.value.id.equals(high.id)).toBe(true);
      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
    });

    test('create, update and delete each notify, and the delete carries the removed row', async () => {
      const handle = track(await own.db.User.$live({ where: { age: { gt: 50 } } }));
      const created = await own.db.User.create({ data: user(60, 'live') });
      await own.db.User.updateUnique({ where: { id: created.id }, data: { age: 70 } });
      await own.db.User.deleteUnique({ where: { id: created.id } });

      const seen = [await next(handle), await next(handle), await next(handle)];

      expect(seen.map((n) => n.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
      expect(seen.map((n) => n.value.age)).toEqual([60, 70, 70]);
      for (const n of seen) expect(n.value.id.equals(created.id)).toBe(true);
    });

    test('a $raw where notifies only on matching writes', async () => {
      const handle = track(await own.db.User.$live({ where: { $raw: sql`age > ${50}` } }));
      await own.db.User.create({ data: user(10, 'low') });
      await own.db.User.create({ data: user(77, 'raw') });

      const first = await next(handle);

      expect(first.value.name).toBe('raw');
      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
    });

    test('a $raw next to typed keys, under AND, narrows both ways', async () => {
      const handle = track(
        await own.db.User.$live({ where: { AND: [{ isActive: true }, { $raw: sql`age < ${30}` }] } }),
      );
      await own.db.User.create({ data: user(40, 'old') });
      await own.db.User.create({ data: user(25, 'young') });

      expect((await next(handle)).value.name).toBe('young');
    });

    test('a relation filter is checked against its target and notifies on matching rows', async () => {
      const author = await own.db.User.create({ data: user(33, 'author') });
      const other = await own.db.User.create({ data: user(34, 'other') });
      const handle = await own.db.Post.$live({ where: { author: { name: 'author' } } });
      track(handle);
      await own.db.Post.create({ data: { title: 'skip', authorId: other.id } });
      await own.db.Post.create({ data: { title: 'keep', authorId: author.id } });

      const result = await within(handle.next());

      expect(result).not.toBe(TIMEOUT);
      expect((result as IteratorResult<{ value: { title: string } }>).value.value.title).toBe('keep');
    });

    test('an empty where watches every row of the table only', async () => {
      const handle = track(await own.db.User.$live({ where: {} }));
      await own.db.Tag.create({ data: { name: 'elsewhere' } });
      await own.db.User.create({ data: user(41, 'mine') });

      expect((await next(handle)).value.name).toBe('mine');
    });

    test('kill() stops it and a later write does not notify', async () => {
      const handle = track(await own.db.User.$live());
      await handle.kill();
      await own.db.User.create({ data: user(41, 'after') });

      expect(handle.isAlive).toBe(false);
      expect(await within(handle.next())).toEqual({ value: undefined, done: true });
    });

    test('break in a for await kills the query', async () => {
      const handle = track(await own.db.User.$live());
      await own.db.User.create({ data: user(42, 'once') });
      for await (const notification of handle) {
        expect(notification.value.name).toBe('once');
        break;
      }

      expect(handle.isAlive).toBe(false);
    });

    test('a real KILL from a second connection ends the iterator cleanly, without mapping', async () => {
      const second = await openSecond();
      try {
        const handle = track(await own.db.User.$live());
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

  test('a deliberate disconnect ends a waiting model iterator cleanly', async () => {
    const own = createTestClient();
    await own.connect(testConfig);
    const handle = await own.db.User.$live();
    const pending = handle.next();
    await own.disconnect();

    expect(await within(pending)).toEqual({ value: undefined, done: true });
    expect(handle.isAlive).toBe(false);
  });
});
