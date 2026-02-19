// Array overload type only accepts CerialQueryPromise<any>[]; function items
// require `as any` casts until the template accepts TransactionArrayItem[].

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

describe('E2E Transactions: Array Mode Function Items', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('function item returns CerialQueryPromise', async () => {
    const email = uniqueEmail();

    const [user, post] = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'FnUser', isActive: true } }),
      ((prev: unknown[]) => {
        const created = prev[0] as { id: any };

        return client.db.Post.create({ data: { title: 'FnPost', authorId: created.id } });
      }) as any,
    ] as any)) as any[];

    expect(user).toBeDefined();
    expect(user.email).toBe(email);
    expect(post).toBeDefined();
    expect(post.title).toBe('FnPost');

    const users = await client.db.User.findMany();
    expect(users.length).toBe(1);
    const posts = await client.db.Post.findMany();
    expect(posts.length).toBe(1);
  });

  test('function item returns plain value', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'PlainVal', isActive: true } }),
      ((prev: unknown[]) => {
        const created = prev[0] as { name: string };

        return created.name;
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].email).toBe(email);
    expect(results[1]).toBe('PlainVal');
  });

  test('function item returns void (undefined)', async () => {
    const email = uniqueEmail();
    let sideEffectRan = false;

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'Void', isActive: true } }),
      (() => {
        sideEffectRan = true;
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[1]).toBeUndefined();
    expect(sideEffectRan).toBe(true);
  });

  test('async function item', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'AsyncFn', isActive: true } }),
      (async (prev: unknown[]) => {
        const created = prev[0] as { id: any };

        return client.db.Post.create({ data: { title: 'AsyncPost', authorId: created.id } });
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].name).toBe('AsyncFn');
    expect(results[1]).toBeDefined();
    expect(results[1].title).toBe('AsyncPost');
  });

  test('sync function item returning CerialQueryPromise', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'SyncFn', isActive: true } }),
      (() => client.db.Post.findMany()) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].name).toBe('SyncFn');
    expect(Array.isArray(results[1])).toBe(true);
  });

  test('function receives previous results correctly — Cerial-mapped', async () => {
    const email = uniqueEmail();
    let receivedPrev: unknown[] = [];

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'PrevCheck', isActive: true } }),
      ((prev: unknown[]) => {
        receivedPrev = [...prev];
        const created = prev[0] as { id: unknown; name: string; email: string };

        expect(isCerialId(created.id)).toBe(true);
        expect(created.name).toBe('PrevCheck');
        expect(created.email).toBe(email);

        return 'checked';
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[1]).toBe('checked');
    expect(receivedPrev.length).toBe(1);
  });

  test('function throw rolls back entire transaction', async () => {
    const email = uniqueEmail();

    await expect(
      (async () => {
        await client.$transaction([
          client.db.User.create({ data: { email, name: 'Rollback', isActive: true } }),
          (() => {
            throw new Error('abort');
          }) as any,
        ] as any);
      })(),
    ).rejects.toThrow();

    const users = await client.db.User.findMany({ where: { email } });
    expect(users.length).toBe(0);
  });

  test('mix of CerialQueryPromise and function items', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email: email1, name: 'Mix1', isActive: true } }),
      ((prev: unknown[]) => {
        const user = prev[0] as { id: any };

        return client.db.Post.create({ data: { title: 'MixPost', authorId: user.id } });
      }) as any,
      client.db.User.create({ data: { email: email2, name: 'Mix2', isActive: false } }),
      ((prev: unknown[]) => prev.length) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].name).toBe('Mix1');
    expect(results[1]).toBeDefined();
    expect(results[1].title).toBe('MixPost');
    expect(results[2]).toBeDefined();
    expect(results[2].name).toBe('Mix2');
    expect(results[3]).toBe(3);
  });

  test('function at position 0 receives empty array', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      ((prev: unknown[]) => {
        expect(prev).toEqual([]);

        return client.db.User.create({ data: { email, name: 'First', isActive: true } });
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].name).toBe('First');
  });

  test('multiple consecutive functions', async () => {
    const results = (await client.$transaction([
      ((prev: unknown[]) => {
        expect(prev).toEqual([]);

        return 'first';
      }) as any,
      ((prev: unknown[]) => {
        expect(prev).toEqual(['first']);

        return 'second';
      }) as any,
      ((prev: unknown[]) => {
        expect(prev).toEqual(['first', 'second']);

        return 'third';
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBe('first');
    expect(results[1]).toBe('second');
    expect(results[2]).toBe('third');
  });

  test('function result accumulates for subsequent functions', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'Accumulate', isActive: true } }),
      ((_prev: unknown[]) => 42) as any,
      ((prev: unknown[]) => {
        const num = prev[1] as number;

        return num * 2;
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[0].name).toBe('Accumulate');
    expect(results[1]).toBe(42);
    expect(results[2]).toBe(84);
  });

  test('async function with delay executes correctly', async () => {
    const email = uniqueEmail();

    const results = (await client.$transaction([
      client.db.User.create({ data: { email, name: 'Delayed', isActive: true } }),
      (async (prev: unknown[]) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const user = prev[0] as { name: string };

        return `processed-${user.name}`;
      }) as any,
    ] as any)) as any[];

    expect(results[0]).toBeDefined();
    expect(results[1]).toBe('processed-Delayed');
  });
});
