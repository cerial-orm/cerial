/**
 * E2E Tests: graph edges through the raw hatch
 *
 * The edge table is private (`rawsf_follows`), created and removed by this file, because edges cannot be
 * declared in a schema. Refusals first: a bound edge table is a parse error and writes nothing, and a
 * hostile edge name through `sql.ident` stays an identifier. Then RELATE by `$raw`, traversal in a `$raw`
 * filter (also negated), traversal in `compute`, and a dynamic edge table through `sql.ident`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, type CerialId, sql } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const TABLES = [...tables.core];
const EDGE = 'rawsf_follows';
const OTHER_EDGE = 'rawsf_blocks';

describe('E2E raw surface: graph edges', () => {
  let client: CerialClient;
  let ann: CerialId;
  let bob: CerialId;
  let cy: CerialId;

  const edgeCount = async (edge = EDGE): Promise<number> => {
    const [row] = await client.$raw<{ n: number }>(sql`SELECT count() AS n FROM ${sql.ident(edge)} GROUP ALL`);

    return row?.n ?? 0;
  };

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
    for (const edge of [EDGE, OTHER_EDGE])
      await client.$raw(sql`DEFINE TABLE OVERWRITE ${sql.ident(edge)} TYPE RELATION SCHEMALESS`);
  });

  afterAll(async () => {
    for (const edge of [EDGE, OTHER_EDGE]) await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(edge)}`);
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    for (const edge of [EDGE, OTHER_EDGE]) await client.$raw(sql`DELETE ${sql.ident(edge)}`);
    const make = async (name: string, age: number) =>
      (await client.db.User.create({ data: { email: `${name}@x.test`, name, isActive: true, age } })).id;
    ann = await make('Ann', 20);
    bob = await make('Bob', 30);
    cy = await make('Cy', 40);
  });

  const relate = (from: CerialId, to: CerialId, since: number) =>
    client.$raw(sql`RELATE ${rid(from)}->${sql.ident(EDGE)}->${rid(to)} SET since = ${since}`);

  const rid = (id: CerialId) => id;

  describe('refusals', () => {
    test('a bound edge table is a parse error and creates no edge', async () => {
      await expect(
        (async () => {
          await client.$raw(sql`RELATE ${rid(ann)}->${EDGE}->${rid(bob)}`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
      expect(await edgeCount()).toBe(0);
    });

    test('a hostile edge name through sql.ident stays an identifier and deletes nothing', async () => {
      await relate(ann, bob, 1);
      // The whole payload is one table name, so the database reports that table missing and runs nothing else.
      await expect(
        (async () => {
          await client.$raw(sql`SELECT * FROM ${sql.ident('x` ; DELETE user; --')}`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
      expect(await client.db.User.count()).toBe(3);
      expect(await edgeCount()).toBe(1);
    });
  });

  describe('RELATE by $raw', () => {
    test('creates the edge with in, out and its own field', async () => {
      const [edge] = await relate(ann, bob, 2020);
      const rows = await client.$raw<{ since: number }>(sql`SELECT since FROM ${sql.ident(EDGE)}`);

      expect(edge).toBeDefined();
      expect(rows).toEqual([{ since: 2020 }]);
      expect(await edgeCount()).toBe(1);
    });
  });

  describe('traversal in a $raw filter', () => {
    beforeEach(async () => {
      await relate(ann, bob, 2020);
      await relate(cy, bob, 2021);
      await relate(bob, ann, 2022);
    });

    test('finds the users that follow a given user, and only them', async () => {
      const rows = await client.db.User.findMany({
        where: { $raw: sql`->${sql.ident(EDGE)}->user CONTAINS ${rid(bob)}` },
        orderBy: { name: 'asc' },
      });

      expect(rows.map((u) => u.name)).toEqual(['Ann', 'Cy']);
    });

    test('combines with a typed filter: the matching user outside it is excluded', async () => {
      const rows = await client.db.User.findMany({
        where: { age: { gt: 30 }, $raw: sql`->${sql.ident(EDGE)}->user CONTAINS ${rid(bob)}` },
      });

      expect(rows.map((u) => u.name)).toEqual(['Cy']);
    });

    test('NOT excludes the followers', async () => {
      const rows = await client.db.User.findMany({
        where: { NOT: { $raw: sql`->${sql.ident(EDGE)}->user CONTAINS ${rid(bob)}` } },
      });

      expect(rows.map((u) => u.name)).toEqual(['Bob']);
    });

    test('an edge of another table does not match', async () => {
      const rows = await client.db.User.findMany({
        where: { $raw: sql`->${sql.ident(OTHER_EDGE)}->user CONTAINS ${rid(bob)}` },
      });

      expect(rows).toEqual([]);
    });
  });

  describe('traversal in compute', () => {
    beforeEach(async () => {
      await relate(ann, bob, 2020);
      await relate(ann, cy, 2021);
      await relate(bob, cy, 2022);
    });

    test('counts outgoing edges per user and sorts on the count', async () => {
      const rows = await client.db.User.findMany({
        compute: { follows: sql<number>`count(->${sql.ident(EDGE)}->user)` },
        orderBy: { follows: 'desc' },
      });

      expect(rows.map((u) => [u.name, u.follows])).toEqual([
        ['Ann', 2],
        ['Bob', 1],
        ['Cy', 0],
      ]);
    });

    test('projects the names behind the edges', async () => {
      const row = await client.db.User.findOne({
        where: { name: 'Ann' },
        compute: { followed: sql<string[]>`->${sql.ident(EDGE)}->user.name` },
      });

      expect([...(row?.followed ?? [])].sort()).toEqual(['Bob', 'Cy']);
    });
  });
});
