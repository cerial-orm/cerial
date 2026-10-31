/**
 * E2E Tests: `deleteUnique` by id with other where keys
 *
 * The id shortcut deletes by record id. It may only run when the id is the sole key; any other key (a field,
 * a `$raw` fragment) must still filter, on User and on a model with a cascade dependent (UserSetNull), under every return mode and inside both transaction forms. A delete that removed nothing
 * reports it under `return: true` and `'before'`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core, ...tables.oneToOneSetNull];

describe('E2E deleteUnique by id plus other keys', () => {
  let client: CerialClient;

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
  });

  type Target = {
    label: string;
    seed: () => Promise<{ id: never }>;
    count: () => Promise<number>;
    del: (where: object, ret?: true | 'before' | undefined) => PromiseLike<unknown>;
    tx: (where: object, ret?: true | 'before' | undefined) => PromiseLike<unknown>;
    cb: (where: object, ret?: true | 'before' | undefined) => PromiseLike<unknown>;
    name: string;
  };

  const user: Target = {
    label: 'User',
    name: 'Ann',
    seed: async () =>
      (await client.db.User.create({ data: { email: 'a@x.test', name: 'Ann', isActive: true } })) as never,
    count: async () => await client.db.User.count(),
    del: (where, ret) => client.db.User.deleteUnique({ where: where as never, return: ret as never }),
    tx: async (where, ret) =>
      (await client.$transaction([client.db.User.deleteUnique({ where: where as never, return: ret as never })]))[0],
    cb: (where, ret) =>
      client.$transaction(async (tx) => tx.User.deleteUnique({ where: where as never, return: ret as never })),
  };

  const cascade: Target = {
    label: 'UserSetNull (cascade dependent)',
    name: 'Ann',
    seed: async () => (await client.db.UserSetNull.create({ data: { email: 'a@x.test', name: 'Ann' } })) as never,
    count: async () => await client.db.UserSetNull.count(),
    del: (where, ret) => client.db.UserSetNull.deleteUnique({ where: where as never, return: ret as never }),
    tx: async (where, ret) =>
      (
        await client.$transaction([client.db.UserSetNull.deleteUnique({ where: where as never, return: ret as never })])
      )[0],
    cb: (where, ret) =>
      client.$transaction(async (tx) => tx.UserSetNull.deleteUnique({ where: where as never, return: ret as never })),
  };

  const refusals: Array<[string, (id: unknown) => object]> = [
    ['a $raw that is false', (id) => ({ id, $raw: sql`false` })],
    ['a field that does not match', (id) => ({ id, name: 'nobody' })],
  ];
  const runners = ['del', 'tx', 'cb'] as const;
  const rets: Array<[string, true | 'before' | undefined]> = [
    ['default', undefined],
    ['true', true],
    ['before', 'before'],
  ];

  describe.each([user, cascade])('$label', (target) => {
    describe.each(refusals)('%s keeps the row', (_label, mkWhere) => {
      for (const runner of runners) {
        test.each(rets)(`${runner}, return %s`, async (_r, ret) => {
          const row = await target.seed();
          const result = await target[runner](mkWhere(row.id), ret);

          expect(await target.count()).toBe(1);
          // The default form always reports completion; the others must report that nothing was removed
          if (ret === true) expect(result).toBe(false);
          if (ret === 'before') expect(result).toBeNull();
        });
      }
    });

    describe('a matching extra key still deletes', () => {
      for (const runner of runners) {
        test.each(rets)(`${runner}, return %s`, async (_r, ret) => {
          const row = await target.seed();
          const result = await target[runner]({ id: row.id, name: target.name, $raw: sql`true` }, ret);

          expect(await target.count()).toBe(0);
          if (ret === true) expect(result).toBe(true);
          if (ret === 'before') expect((result as { name: string }).name).toBe('Ann');
        });
      }
    });

    test('the id alone still deletes', async () => {
      const row = await target.seed();
      expect(await target.del({ id: row.id }, true)).toBe(true);
      expect(await target.count()).toBe(0);
    });

    test('{ email, $raw false } keeps the row and return true reports false', async () => {
      await target.seed();

      expect(await target.del({ email: 'a@x.test', $raw: sql`false` }, true)).toBe(false);
      expect(await target.count()).toBe(1);
    });
  });
});
