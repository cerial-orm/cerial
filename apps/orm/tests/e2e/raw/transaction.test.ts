/**
 * E2E Tests: `$raw` inside transactions
 *
 * Rollback first: a failing raw statement must take every earlier write with it, in array, callback and
 * manual mode, proved by counting. Then the end-of-transaction refusal, then results: the last statement,
 * `LET` scripts, mapping on a model versus none on the client, and `prev` of a function item.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  CerialDatabaseError,
  CerialId,
  CerialTransactionError,
  CerialUniqueConstraintError,
  CerialValidationError,
  sql,
} from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

const reject = async (run: () => PromiseLike<unknown>, error: new (...args: never[]) => Error): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(error);
};

describe('E2E $raw in transactions', () => {
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
  });

  // Raw writes go to tag, whose required array fields are few; the total spans both tables
  const users = async (): Promise<number> => (await client.db.User.count()) + (await client.db.Tag.count());
  const newUser = { email: 'n@x.test', name: 'New', isActive: true };

  describe('rollback', () => {
    test('array mode: a failing raw statement undoes an earlier write and a raw write', async () => {
      await reject(
        () =>
          client.$transaction([
            client.db.User.create({ data: newUser }),
            client.$raw(sql`CREATE tag SET name = 'raw', userIds = []`),
            client.$raw(sql`THROW 'no'`),
          ]),
        CerialDatabaseError,
      );
      expect(await users()).toBe(1);
    });

    test('array mode: a raw write followed by a failing typed item leaves nothing', async () => {
      await reject(
        () =>
          client.$transaction([
            client.$raw(sql`CREATE tag SET name = 'raw', userIds = []`),
            client.db.User.create({ data: { email: 'a@x.test', name: 'Dup', isActive: true } }),
          ]),
        CerialUniqueConstraintError,
      );
      expect(await users()).toBe(1);
    });

    test('callback mode: a failing raw statement undoes an earlier typed write and raw write', async () => {
      await reject(
        () =>
          client.$transaction(async (tx) => {
            await tx.User.create({ data: newUser });
            await tx.$raw(sql`CREATE tag SET name = 'raw', userIds = []`);
            await tx.$raw(sql`THROW 'no'`);
          }),
        CerialDatabaseError,
      );
      expect(await users()).toBe(1);
    });

    test('callback mode: a raw write is undone when the callback throws afterwards', async () => {
      await reject(
        () =>
          client.$transaction(async (tx) => {
            await tx.$raw(sql`CREATE tag SET name = 'raw', userIds = []`);
            throw new Error('abort');
          }),
        Error,
      );
      expect(await users()).toBe(1);
    });

    test('manual mode: cancel undoes a raw write', async () => {
      const tx = await client.$transaction();
      await tx.$raw(sql`CREATE tag SET name = 'raw', userIds = []`);
      await tx.cancel();
      expect(await users()).toBe(1);
    });

    test('manual mode: a failing raw statement then cancel leaves nothing', async () => {
      const tx = await client.$transaction();
      await tx.User.create({ data: newUser });
      await reject(() => tx.$raw(sql`THROW 'no'`), CerialDatabaseError);
      await tx.cancel();
      expect(await users()).toBe(1);
    });

    test('positive: commit keeps a raw write', async () => {
      const tx = await client.$transaction();
      await tx.$raw(sql`CREATE tag SET name = 'raw', userIds = []`);
      await tx.commit();
      expect(await users()).toBe(2);
    });
  });

  describe('array mode errors', () => {
    const failing = [
      ['a syntax error', sql`SELEC 1`],
      ['a THROW', sql`THROW 'no'`],
      ['a missing table', sql`SELECT * FROM table_that_does_not_exist`],
    ] as const;

    for (const [name, fragment] of failing) {
      test(`${name} in a client.$raw item is a CerialDatabaseError with the driver error as cause`, async () => {
        let error: unknown;
        try {
          await client.$transaction([client.$raw(fragment)]);
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(CerialDatabaseError);
        expect((error as CerialDatabaseError).operation).toBe('$transaction');
        expect((error as CerialDatabaseError).cause).toBeInstanceOf(Error);
      });
    }

    test('a typed item that fails is a CerialDatabaseError and rolls back an earlier write', async () => {
      await reject(
        () => client.$transaction([client.db.User.create({ data: newUser }), client.db.User.$raw(sql`THROW 'typed'`)]),
        CerialDatabaseError,
      );
      expect(await users()).toBe(1);
    });

    test('a function item that throws its own error keeps that error', async () => {
      const own = new Error('mine');
      let error: unknown;
      try {
        await client.$transaction([
          () => {
            throw own;
          },
        ]);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBe(own);
    });

    test('positive: a succeeding array still resolves', async () => {
      const [rows] = await client.$transaction([client.$raw<string>(sql`SELECT VALUE name FROM user`)]);
      expect(rows).toEqual(['Ann']);
    });
  });

  describe('refusals', () => {
    test('a BEGIN/COMMIT block inside tx.$raw is refused and writes nothing', async () => {
      const tx = await client.$transaction();
      await reject(
        () => tx.$raw(sql`BEGIN TRANSACTION; CREATE tag SET name = 'x', userIds = []; COMMIT TRANSACTION;`),
        CerialDatabaseError,
      );
      await tx.cancel();
      expect(await users()).toBe(1);
    });

    test('a raw statement after commit throws CerialTransactionError and writes nothing', async () => {
      const tx = await client.$transaction();
      await tx.commit();
      expect(() => tx.$raw(sql`DELETE user`)).toThrow(CerialTransactionError);
      expect(await users()).toBe(1);
    });

    test('a raw statement after cancel throws CerialTransactionError', async () => {
      const tx = await client.$transaction();
      await tx.cancel();
      expect(() => tx.$raw(sql`DELETE user`)).toThrow(CerialTransactionError);
    });

    test('an unbranded value refuses on tx, on tx.Model and as an array item, with rows intact', async () => {
      const forged = 'DELETE user' as never;
      const tx = await client.$transaction();
      expect(() => tx.$raw(forged)).toThrow(CerialValidationError);
      expect(() => tx.User.$raw(forged)).toThrow(CerialValidationError);
      await tx.cancel();
      expect(() => client.$raw(forged)).toThrow(CerialValidationError);
      expect(await users()).toBe(1);
    });

    test('tx.$raw is not read as a model named $raw', async () => {
      const tx = await client.$transaction();
      expect(typeof tx.$raw).toBe('function');
      await tx.cancel();
    });
  });

  describe('results', () => {
    test('tx.$raw returns the last statement unmapped', async () => {
      const rows = await client.$transaction((tx) => tx.$raw<{ id: unknown }>(sql`SELECT * FROM user`));
      expect(rows).toHaveLength(1);
      expect(CerialId.is(rows[0]!.id)).toBe(false);
    });

    test('tx.User.$raw maps object rows and passes scalars through', async () => {
      const [rows, names] = await client.$transaction(async (tx) => [
        await tx.User.$raw<{ id: unknown }>(sql`SELECT * FROM user`),
        await tx.User.$raw<string>(sql`SELECT VALUE name FROM user`),
      ]);
      expect(CerialId.is((rows as Array<{ id: unknown }>)[0]!.id)).toBe(true);
      expect(names).toEqual(['Ann']);
    });

    test('tx.$raw sees an earlier write of the same transaction', async () => {
      const rows = await client.$transaction(async (tx) => {
        await tx.User.create({ data: newUser });

        return tx.$raw<string>(sql`SELECT VALUE name FROM user ORDER BY name`);
      });
      expect(rows).toEqual(['Ann', 'New']);
    });

    test('array mode: model $raw maps and client $raw does not', async () => {
      const [mapped, plain] = await client.$transaction([
        client.db.User.$raw<{ id: unknown }>(sql`SELECT * FROM user`),
        client.$raw<{ id: unknown }>(sql`SELECT * FROM user`),
      ]);
      expect(CerialId.is(mapped[0]!.id)).toBe(true);
      expect(CerialId.is(plain[0]!.id)).toBe(false);
    });

    test('array mode: scalars, a scalar RETURN and NONE normalise to arrays', async () => {
      const [values, one, none] = await client.$transaction([
        client.db.User.$raw<string>(sql`SELECT VALUE name FROM user`),
        client.$raw<number>(sql`RETURN 1`),
        client.$raw(sql`RETURN NONE`),
      ]);
      expect(values).toEqual(['Ann']);
      expect(one).toEqual([1]);
      expect(none).toEqual([]);
    });

    test('array mode: the last statement of a LET script is the result and its names are prefixed', async () => {
      const [a, b] = await client.$transaction([
        client.$raw<number>(sql`LET $n = ${5}; SELECT VALUE $n + ${1} FROM user`),
        client.$raw<number>(sql`LET $n = ${7}; SELECT VALUE $n + ${1} FROM user`),
      ]);
      expect(a).toEqual([6]);
      expect(b).toEqual([8]);
    });

    test('array mode: a trailing NONE statement gives the last statement, not an earlier one', async () => {
      const [rows] = await client.$transaction([
        client.$raw(sql`SELECT * FROM user; UPDATE user SET age = 1 WHERE false`),
      ]);
      expect(rows).toEqual([]);
    });

    test('a raw result reaches the prev of a function item', async () => {
      const [, created] = await client.$transaction([
        client.$raw<string>(sql`SELECT VALUE name FROM user`),
        (prev) => client.db.User.create({ data: { ...newUser, name: (prev[0] as string[])[0]! } }),
      ]);
      expect(created.name).toBe('Ann');
      expect(await users()).toBe(2);
    });

    test('a raw write in an array commits with the other items', async () => {
      await client.$transaction([
        client.db.User.create({ data: newUser }),
        client.$raw(sql`CREATE tag SET name = 'raw', userIds = []`),
      ]);
      expect(await users()).toBe(3);
    });
  });

  describe('migration of a fresh client', () => {
    test('a client.$raw item as the only item migrates before it runs', async () => {
      const fresh = createTestClient();
      await fresh.connect(testConfig);
      try {
        const [rows] = await fresh.$transaction([fresh.$raw<string>(sql`SELECT VALUE name FROM user`)]);
        expect(rows).toEqual(['Ann']);
      } finally {
        await fresh.disconnect();
      }
    });

    test('a mixed array of a model item and a client.$raw item migrates both', async () => {
      const fresh = createTestClient();
      await fresh.connect(testConfig);
      try {
        const [created, rows] = await fresh.$transaction([
          fresh.db.Tag.$raw<unknown>(sql`SELECT * FROM tag`),
          fresh.$raw<string>(sql`SELECT VALUE name FROM user`),
        ]);
        expect(created).toEqual([]);
        expect(rows).toEqual(['Ann']);
      } finally {
        await fresh.disconnect();
      }
    });
  });
});
