/**
 * E2E Tests: whole raw statements on the client and on models
 *
 * Refusals run first against live rows and end by counting them again. Then the result rule (the last
 * statement's result, as an array), the mapping difference between `client.$raw` and `Model.$raw`, scalars
 * that must survive mapping, writes, bound hostile values and database failures.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialId, CerialValidationError, sql } from 'cerial';
import { RecordId } from 'surrealdb';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

describe('E2E raw statements', () => {
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
    await client.db.User.create({ data: { email: 'a@x.test', name: 'Ann', isActive: true, age: 20 } });
    await client.db.User.create({ data: { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 } });
  });

  const refuses = async (run: () => PromiseLike<unknown>): Promise<void> => {
    await expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(CerialValidationError);
  };

  const intact = async (): Promise<void> => {
    expect(await client.db.User.count()).toBe(2);
  };

  describe('refusals leave every row in place', () => {
    const forged: Array<[string, unknown]> = [
      ['a plain string', 'DELETE user'],
      ['a plain object', { strings: ['DELETE user'], values: [] }],
      ['a JSON round trip of a fragment', JSON.parse(JSON.stringify(sql`DELETE user`))],
      ['a spread fragment', { ...sql`DELETE user` }],
    ];

    test.each(forged)('client.$raw with %s', async (_label, value) => {
      await refuses(async () => client.$raw(value as never));
      await intact();
    });

    test.each(forged)('Model.$raw with %s', async (_label, value) => {
      await refuses(async () => client.db.User.$raw(value as never));
      await intact();
    });

    test('a hostile string interpolated into the text is a value, never syntax', async () => {
      const rows = await client.$raw(sql`SELECT * FROM user WHERE name = ${'x; DELETE user'}`);

      expect(rows).toEqual([]);
      await intact();
    });
  });

  describe('client.$raw returns the last statement, unmapped', () => {
    test('rows keep the driver values', async () => {
      const rows = await client.$raw<{ id: unknown; name: string }>(sql`SELECT * FROM user ORDER BY name`);

      expect(rows.map((r) => r.name)).toEqual(['Ann', 'Bob']);
      expect(rows[0]!.id).toBeInstanceOf(RecordId);
      expect(rows[0]!.id).not.toBeInstanceOf(CerialId);
    });

    test('a scalar statement wraps into an array', async () => {
      expect(await client.$raw<number>(sql`RETURN 1`)).toEqual([1]);
    });

    test('SELECT VALUE returns plain values', async () => {
      expect(await client.$raw<string>(sql`SELECT VALUE name FROM user ORDER BY name`)).toEqual(['Ann', 'Bob']);
    });

    test('the last of several statements wins, even when an earlier one has rows', async () => {
      const rows = await client.$raw<number>(sql`SELECT * FROM user; RETURN 5`);

      expect(rows).toEqual([5]);
    });

    test('an empty last result is an empty array, not an earlier statement', async () => {
      const rows = await client.$raw(sql`SELECT * FROM user; SELECT * FROM user WHERE name = ${'nobody'}`);

      expect(rows).toEqual([]);
    });

    test('a LET as the last statement gives an empty array', async () => {
      expect(await client.$raw(sql`SELECT * FROM user; LET $x = 1`)).toEqual([]);
    });

    test('a LET followed by a query keeps the variable in scope', async () => {
      const rows = await client.$raw<string>(sql`LET $n = ${'Ann'}; SELECT VALUE email FROM user WHERE name = $n`);

      expect(rows).toEqual(['a@x.test']);
    });

    test('runs on a fresh client with nothing migrated yet', async () => {
      const fresh = createTestClient();
      await fresh.connect(testConfig);
      try {
        expect(await fresh.$raw<number>(sql`RETURN 2`)).toEqual([2]);
      } finally {
        await fresh.disconnect();
      }
    });
  });

  describe('Model.$raw maps object rows and keeps everything else', () => {
    test('object rows map ids to CerialId', async () => {
      const rows = await client.db.User.$raw<{ id: CerialId; name: string }>(sql`SELECT * FROM user ORDER BY name`);

      expect(rows.map((r) => r.name)).toEqual(['Ann', 'Bob']);
      expect(rows[0]!.id).toBeInstanceOf(CerialId);
    });

    test('SELECT VALUE name does not silently return an empty array', async () => {
      expect(await client.db.User.$raw<string>(sql`SELECT VALUE name FROM user ORDER BY name`)).toEqual(['Ann', 'Bob']);
    });

    test('SELECT VALUE id keeps a record id as a value', async () => {
      const ids = await client.db.User.$raw(sql`SELECT VALUE id FROM user`);

      expect(ids).toHaveLength(2);
      for (const id of ids) expect(id).toBeDefined();
    });

    test('RETURN 1 keeps its result', async () => {
      expect(await client.db.User.$raw<number>(sql`RETURN 1`)).toEqual([1]);
    });

    test('a null result is kept', async () => {
      expect(await client.db.User.$raw(sql`RETURN null`)).toEqual([null]);
    });

    test('mixed object and scalar rows all arrive', async () => {
      const rows = await client.db.User.$raw<unknown>(sql`RETURN [{ name: 'x' }, 'y', 3]`);

      expect(rows).toHaveLength(3);
      expect((rows[0] as { name: string }).name).toBe('x');
      expect(rows.slice(1)).toEqual(['y', 3]);
    });

    test('an empty result is an empty array', async () => {
      expect(await client.db.User.$raw(sql`SELECT * FROM user WHERE name = ${'nobody'}`)).toEqual([]);
    });
  });

  describe('writes through a raw statement', () => {
    test('a bound DELETE removes only the matching row', async () => {
      await client.$raw(sql`DELETE user WHERE name = ${'Ann'}`);

      expect(await client.db.User.count()).toBe(1);
      expect(await client.db.User.exists({ name: 'Bob' })).toBe(true);
    });

    test('a hostile value in a DELETE matches nothing', async () => {
      await client.$raw(sql`DELETE user WHERE name = ${"x' OR true OR '"}`);

      await intact();
    });

    test('a CREATE returns the created row, mapped on the model', async () => {
      const [row] = await client.db.User.$raw<{ id: CerialId; name: string }>(
        sql`CREATE user SET email = ${'c@x.test'}, name = ${'Cy'}, isActive = true, loginDates = [], nicknames = [], scores = []`,
      );

      expect(row!.name).toBe('Cy');
      expect(row!.id).toBeInstanceOf(CerialId);
      expect(await client.db.User.count()).toBe(3);
    });
  });

  describe('failures', () => {
    test('a parse error is a CerialDatabaseError from the client', async () => {
      await expect(
        (async () => {
          await client.$raw(sql`SELEKT * FROM user`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
      await intact();
    });

    test('a parse error is a CerialDatabaseError from a model', async () => {
      await expect(
        (async () => {
          await client.db.User.$raw(sql`SELEKT * FROM user`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
      await intact();
    });

    test('a failing later statement raises and does not return an earlier result', async () => {
      await expect(
        (async () => {
          await client.$raw(sql`SELECT * FROM user; THROW 'no'`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
    });
  });
});
