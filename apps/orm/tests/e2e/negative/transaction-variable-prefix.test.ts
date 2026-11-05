/**
 * E2E Tests: $transaction renames only the statement's own variables
 *
 * prefixQueryVars used to scan the whole statement text, so a caller-chosen @flexible sub-key such as
 * `LET $this` made the builder's own `$this` / `$parent` get renamed inside array-mode and
 * function-item $transaction: an upsert on an existing row wrote the create payload and a `$parent`
 * include lost its join.
 *
 * Schema: transaction-prefix (TxpAcct/TxpPost)
 */

import { sql } from 'cerial';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const KEYS = ['LET $this', 'LET $parent', 'COMMIT TRANSACTION'] as const;

describe('Transaction variable prefix', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.transactionPrefix);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.transactionPrefix);
  });

  for (const key of KEYS) {
    describe(`flexible key "${key}"`, () => {
      const seed = async () =>
        client.db.TxpAcct.create({
          data: { email: 'o@x.io', role: 'owner', credits: 500, meta: { [key]: 'x' } },
        });
      const upsertArgs = {
        where: { email: 'o@x.io', meta: { [key]: 'x' } },
        create: { email: 'o@x.io', role: 'member', credits: 0, meta: { [key]: 'x' } },
        update: { credits: 501 },
      };

      test('array mode: upsert on an existing row updates, not the create payload', async () => {
        await seed();
        const [row] = await client.$transaction([client.db.TxpAcct.upsert(upsertArgs)]);

        expect(row?.role).toBe('owner');
        expect(row?.credits).toBe(501);
        expect(await client.db.TxpAcct.count()).toBe(1);
      });

      test('function item: upsert on an existing row updates, not the create payload', async () => {
        await seed();
        const [row] = await client.$transaction([() => client.db.TxpAcct.upsert(upsertArgs)]);

        expect(row?.role).toBe('owner');
        expect(row?.credits).toBe(501);
        expect(await client.db.TxpAcct.count()).toBe(1);
      });

      test('array mode: updateMany keyed by the hostile key changes only its row', async () => {
        await seed();
        await client.db.TxpAcct.create({ data: { email: 'p@x.io', role: 'member', credits: 1, meta: {} } });
        await client.$transaction([
          client.db.TxpAcct.updateMany({ where: { meta: { [key]: 'x' } }, data: { credits: 7 } }),
        ]);
        const rows = await client.db.TxpAcct.findMany({ orderBy: { email: 'asc' } });

        expect(rows.map((r) => [r.email, r.credits])).toEqual([
          ['o@x.io', 7],
          ['p@x.io', 1],
        ]);
      });

      test('array mode: a create stores the key under its own literal name', async () => {
        const [row] = await client.$transaction([
          client.db.TxpAcct.create({ data: { email: 'k@x.io', role: 'a', credits: 1, meta: { [key]: 'v' } } }),
        ]);
        const found = await client.db.TxpAcct.findUnique({ where: { id: row!.id } });

        expect(found?.meta).toEqual({ [key]: 'v' });
      });
    });
  }

  test('a $parent include still joins beside a "LET $parent" key', async () => {
    const acct = await client.db.TxpAcct.create({
      data: { email: 'o@x.io', role: 'owner', credits: 1, meta: { 'LET $parent': 'x' } },
    });
    await client.db.TxpPost.create({ data: { title: 'hello', acctId: acct.id } });

    const [rows] = await client.$transaction([
      client.db.TxpAcct.findMany({ where: { meta: { 'LET $parent': 'x' } }, include: { posts: true } }),
    ]);

    expect(rows?.[0]?.posts.map((p) => p.title)).toEqual(['hello']);
  });

  describe('positive: plain keys', () => {
    test('several statements in one array-mode transaction rename and run correctly', async () => {
      const acct = await client.db.TxpAcct.create({ data: { email: 'a@x.io', role: 'owner', credits: 1, meta: {} } });
      const upsertArgs = {
        where: { email: 'a@x.io' },
        create: { email: 'a@x.io', role: 'member', credits: 0, meta: {} },
        update: { credits: 9 },
      };

      const [upserted, created, found] = await client.$transaction([
        client.db.TxpAcct.upsert(upsertArgs),
        client.db.TxpPost.create({ data: { title: 'p', acctId: acct.id } }),
        client.db.TxpAcct.findMany({ where: { credits: { gte: 0 } }, include: { posts: true } }),
      ]);

      expect(upserted?.role).toBe('owner');
      expect(upserted?.credits).toBe(9);
      expect(created?.title).toBe('p');
      expect(found).toHaveLength(1);
    });

    test('function items see earlier results and rename correctly', async () => {
      const [acct, post] = await client.$transaction([
        client.db.TxpAcct.create({ data: { email: 'f@x.io', role: 'owner', credits: 1, meta: { tag: 't' } } }),
        (prev) => client.db.TxpPost.create({ data: { title: 'fp', acctId: prev[0].id } }),
      ]);

      expect(post?.acctId.equals(acct!.id)).toBe(true);
    });

    test('the same upsert outside $transaction updates the existing row', async () => {
      await client.db.TxpAcct.create({ data: { email: 'o@x.io', role: 'owner', credits: 500, meta: {} } });
      const row = await client.db.TxpAcct.upsert({
        where: { email: 'o@x.io' },
        create: { email: 'o@x.io', role: 'member', credits: 0, meta: {} },
        update: { credits: 501 },
      });

      expect(row?.role).toBe('owner');
      expect(row?.credits).toBe(501);
    });
  });

  describe('developer SQL is left alone', () => {
    const seed = async () => {
      await client.db.TxpAcct.create({ data: { email: 'o@x.io', role: 'owner', credits: 500, meta: {} } });
      await client.db.TxpAcct.create({ data: { email: 'p@x.io', role: 'member', credits: 1, meta: {} } });
    };
    const credits = async () =>
      (await client.db.TxpAcct.findMany({ orderBy: { email: 'asc' } })).map((r) => [r.email, r.credits]);

    test('a $raw item whose comment holds an apostrophe still binds its values', async () => {
      await seed();
      await client.$transaction([
        client.$raw(sql`-- don't touch the owner
UPDATE txp_acct SET credits = 0 WHERE email != ${'o@x.io'};`),
      ]);

      expect(await credits()).toEqual([
        ['o@x.io', 500],
        ['p@x.io', 0],
      ]);
    });

    test('a $raw where filter with a quote in a regex still matches', async () => {
      await seed();
      await client.$transaction([
        client.db.TxpAcct.updateMany({
          where: { $raw: sql`role != /O'Brien/`, email: 'p@x.io' },
          data: { credits: 7 },
        }),
      ]);

      expect(await credits()).toEqual([
        ['o@x.io', 500],
        ['p@x.io', 7],
      ]);
    });

    test('two $raw items that LET the same name both run', async () => {
      await seed();
      await client.$transaction([
        client.$raw(sql`LET $x = ${'o@x.io'}; UPDATE txp_acct SET credits = 1 WHERE email = $x;`),
        client.$raw(sql`LET $x = ${'p@x.io'}; UPDATE txp_acct SET credits = 2 WHERE email = $x;`),
      ]);

      expect(await credits()).toEqual([
        ['o@x.io', 1],
        ['p@x.io', 2],
      ]);
    });
  });

  describe('a selected key in a nested write is read by position', () => {
    test('a nested create selecting a COMMIT-spelling key commits, with earlier items intact', async () => {
      const key = 'x; COMMIT TRANSACTION; y';
      const [first, created] = await client.$transaction([
        client.db.TxpAcct.create({ data: { email: 'a@x.io', role: 'a', credits: 1, meta: {} } }),
        client.db.TxpAcct.create({
          data: { email: 'k@x.io', role: 'r', credits: 2, meta: { [key]: 'v' }, posts: { create: [{ title: 't' }] } },
          select: { email: true, meta: { tag: false, [key]: true } },
        }),
      ]);

      expect(first?.email).toBe('a@x.io');
      expect(created).toEqual({ email: 'k@x.io', meta: { [key]: 'v' } });
      expect(await client.db.TxpAcct.count()).toBe(2);
      expect(await client.db.TxpPost.count()).toBe(1);
    });

    test('a nested upsert selecting a RETURN-spelling key returns that key', async () => {
      const key = 'x\nRETURN y';
      await client.db.TxpAcct.create({ data: { email: 'o@x.io', role: 'owner', credits: 500, meta: { [key]: 'v' } } });
      const [row] = await client.$transaction([
        client.db.TxpAcct.upsert({
          where: { email: 'o@x.io' },
          create: { email: 'o@x.io', role: 'm', credits: 0, meta: {} },
          update: { credits: 501, posts: { create: [{ title: 'u' }] } },
          select: { credits: true, meta: { tag: false, [key]: true } },
        }),
      ]);

      expect(row).toEqual({ credits: 501, meta: { [key]: 'v' } });
      expect(await client.db.TxpPost.count()).toBe(1);
    });

    test('positive: the same nested writes with plain keys', async () => {
      const [created] = await client.$transaction([
        client.db.TxpAcct.create({
          data: { email: 'k@x.io', role: 'r', credits: 2, meta: { tag: 't' }, posts: { create: [{ title: 't' }] } },
          select: { email: true, meta: { tag: true } },
        }),
      ]);

      expect(created).toEqual({ email: 'k@x.io', meta: { tag: 't' } });
    });
  });
});
