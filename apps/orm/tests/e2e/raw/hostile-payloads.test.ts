/**
 * E2E Tests: hostile payloads through the raw hatch
 *
 * Real statements run through Cerial against the shared instance, with the payloads that were measured
 * against the driver: a payload in a hole, in a compute fragment, in a filter, in `sql.ident`, in a raw
 * statement and in a transaction. The victim is the `tag` table. Every case reads it back afterwards, and a
 * control shows the harness can see a deletion, so an unchanged count means something. String concatenation
 * is the contrast: it empties the victim.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

// Injection payloads with `user` as the queried table and `tag` as the victim
const A1 = 'name FROM tag; DELETE tag; SELECT name';
const A2 = 'user; DELETE tag';
const A3 = 'name; DELETE tag';
const A4 = "x' OR true; DELETE tag; --";
const N1 = 'SELECT name FROM tag; DELETE tag; SELECT name FROM user';
const E2 = 'x\\` FROM tag; DELETE tag; SELECT `y';
const E3 = 'a` FROM tag; DELETE tag; SELECT `b';
const E4 = 'user; DELETE tag';
const E1 = 'x\\⟩ FROM tag; DELETE tag; SELECT ⟨y';

describe('E2E hostile payloads', () => {
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
    for (const name of ['Ann', 'Bob', 'Cy'])
      await client.db.User.create({ data: { email: `${name.toLowerCase()}@x.test`, name, isActive: true, age: 20 } });
    for (const name of ['t1', 't2', 't3']) await client.db.Tag.create({ data: { name } });
  });

  // Read the victim back through a typed count, never through the path under test
  const intact = async (): Promise<void> => {
    expect(await client.db.Tag.count()).toBe(3);
    expect(await client.db.User.count()).toBe(3);
  };

  const fails = async (run: () => PromiseLike<unknown>, error: new (...args: never[]) => Error): Promise<void> => {
    await expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(error);
  };

  describe('control: the harness sees a deletion', () => {
    test('an unchecked string through client.query empties the victim (N1, concatenated)', async () => {
      await client.query(N1);

      expect(await client.db.Tag.count()).toBe(0);
      expect(await client.db.User.count()).toBe(3);
    });

    test('a real DELETE through a raw statement is visible too', async () => {
      await client.$raw(sql`DELETE tag`);

      expect(await client.db.Tag.count()).toBe(0);
    });
  });

  describe('a payload in a hole is a value', () => {
    test('A1: in compute, every row carries the string', async () => {
      const rows = await client.db.User.findMany({ compute: { c: sql<string>`${A1}` } });

      expect(rows.map((r) => r.c)).toEqual([A1, A1, A1]);
      await intact();
    });

    test('A1: as a column of a raw statement', async () => {
      const rows = await client.$raw<Record<string, unknown>>(sql`SELECT ${A1} FROM user`);

      expect(rows.length).toBe(3);
      expect(JSON.stringify(rows)).toContain(A1);
      await intact();
    });

    test('A2: as the table of a raw statement, it is one row', async () => {
      const rows = await client.$raw(sql`SELECT * FROM ${A2}`);

      expect(JSON.stringify(rows)).toContain(A2);
      await intact();
    });

    test('A3: in ORDER BY, the database refuses', async () => {
      await fails(() => client.$raw(sql`SELECT * FROM user ORDER BY ${A3}`), CerialDatabaseError);
      await intact();
    });

    test('A4: in a filter, findMany and deleteMany match nothing', async () => {
      expect(await client.db.User.findMany({ where: { $raw: sql`name = ${A4}` } })).toEqual([]);

      await client.db.User.deleteMany({ where: { $raw: sql`name = ${A4}` } });

      await intact();
    });

    test('N1: the whole statement text in a hole is a string, and runs nothing', async () => {
      const rows = await client.$raw<string>(sql`${N1}`);

      expect(rows).toEqual([N1]);
      await intact();
    });

    test('each payload as a value of an ordinary where, create and update', async () => {
      for (const payload of [A1, A2, A3, A4, N1, E1, E2, E3, E4]) {
        expect(await client.db.User.findMany({ where: { name: payload } })).toEqual([]);
        await client.db.User.updateMany({ where: { name: 'Ann' }, data: { name: payload } });
        expect(await client.db.User.count({ name: payload })).toBe(1);
        await client.db.User.updateMany({ where: { name: payload }, data: { name: 'Ann' } });
      }

      await intact();
    });
  });

  describe('a payload through sql.ident is quoted', () => {
    test('E2: as a projected field, every row is an empty object', async () => {
      const rows = await client.$raw(sql`SELECT ${sql.ident(E2)} FROM user`);

      expect(rows).toEqual([{}, {}, {}]);
      await intact();
    });

    test('E3: as an alias, the column carries the whole string', async () => {
      const rows = await client.$raw<Record<string, number>>(sql`SELECT 1 AS ${sql.ident(E3)} FROM user`);

      expect(rows.length).toBe(3);
      expect(rows.map((r) => r[E3])).toEqual([1, 1, 1]);
      await intact();
    });

    test('E4: as a table, the database finds no such table', async () => {
      await fails(() => client.$raw(sql`SELECT * FROM ${sql.ident(E4)}`), CerialDatabaseError);
      await intact();
    });

    test('E1: the escape that broke the old escaper stays one identifier', async () => {
      const rows = await client.$raw(sql`SELECT ${sql.ident(E1)} FROM user`);

      expect(rows).toEqual([{}, {}, {}]);
      await intact();
    });

    test('a backtick or backslash only ever lands inside the quotes', async () => {
      for (const payload of [E1, E2, E3, E4, '\\', '`', '\\`', '``', "'", '\n'])
        await client.$raw(sql`SELECT ${sql.ident(payload)} FROM user`);

      await intact();
    });

    test('in WHERE a keyword stays inert: true matches nothing, WHERE true matches every row', async () => {
      const quoted = await client.$raw(sql`SELECT * FROM user WHERE ${sql.ident('true')}`);
      const bare = await client.$raw(sql`SELECT * FROM user WHERE true`);

      expect(quoted).toEqual([]);
      expect(bare.length).toBe(3);
    });

    test('a payload in a nested fragment is bound, not spliced', async () => {
      const inner = sql`name = ${A4}`;
      const rows = await client.$raw(sql`SELECT * FROM user WHERE ${inner} OR ${sql`name = ${A1}`}`);

      expect(rows).toEqual([]);
      await intact();
    });
  });

  describe('a payload in compute', () => {
    test('each payload as a value, with sorting on the compute key', async () => {
      for (const payload of [A1, A2, A3, A4, N1, E2]) {
        const rows = await client.db.User.findMany({
          compute: { c: sql<string>`${payload}` },
          orderBy: { c: 'asc', name: 'asc' },
        });

        expect(rows.map((r) => r.c)).toEqual([payload, payload, payload]);
      }

      await intact();
    });

    test('a hostile key never reaches the query', async () => {
      for (const key of ['x` FROM tag; DELETE tag; SELECT `y', 'c; DELETE tag', 'name', '__cerial_x'])
        await fails(() => client.db.User.findMany({ compute: { [key]: sql`1` } } as never), CerialValidationError);

      await intact();
    });
  });

  describe('a payload in a model raw statement', () => {
    test('a hole is a value and rows still map', async () => {
      const rows = await client.db.User.$raw<{ name: string }>(sql`SELECT * FROM user WHERE name = ${A4}`);

      expect(rows).toEqual([]);
      await intact();
    });
  });

  describe('a payload in a transaction', () => {
    test('array mode: a table payload fails the transaction and nothing else runs', async () => {
      await fails(
        () =>
          client.$transaction([
            client.$raw(sql`SELECT ${A1} FROM user`),
            client.$raw(sql`SELECT * FROM ${sql.ident(E4)}`),
            client.db.User.findMany({ where: { $raw: sql`name = ${A4}` } }),
          ]),
        Error,
      );

      await intact();
    });

    test('array mode: a payload that is only a value commits and changes nothing else', async () => {
      const [a, b] = await client.$transaction([
        client.$raw<string>(sql`${N1}`),
        client.$raw(sql`SELECT ${sql.ident(E2)} FROM user`),
      ]);

      expect(a).toEqual([N1]);
      expect(b).toEqual([{}, {}, {}]);
      await intact();
    });

    test('callback mode: holes and identifiers run nothing', async () => {
      const [rows, a] = await client.$transaction(async (tx) => [
        await tx.$raw<string>(sql`${N1}`),
        await tx.$raw(sql`SELECT ${A1} FROM user`),
        await tx.User.count({ $raw: sql`name = ${A4}` }),
      ]);

      expect(rows).toEqual([N1]);
      expect(a.length).toBe(3);
      await intact();
    });

    test('manual mode: a hole and sql.ident run nothing before the commit', async () => {
      const tx = await client.$transaction();
      await tx.$raw(sql`SELECT ${A2} FROM user`);
      await tx.$raw(sql`SELECT ${sql.ident(E3)} FROM user`);
      await tx.commit();

      await intact();
    });
  });
});
