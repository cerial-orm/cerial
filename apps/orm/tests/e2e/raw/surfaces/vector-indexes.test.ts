/**
 * E2E Tests: vector indexes through the raw hatch
 *
 * The indexed table is private (`rawsf_doc`), created and removed by this file, because an HNSW index
 * cannot be declared in a schema. Refusals first: a bound value in the k slot of the KNN operator is a parse
 * error and `sql.int` refuses anything that is not a safe integer. Then the HNSW definition, KNN with a
 * dynamic k through `sql.int`, a nearest-neighbour filter that excludes the far rows, and a similarity
 * `compute` with a sort on it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialValidationError, sql } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const TABLES = [...tables.core];
const DOC = 'rawsf_doc';
const INDEX = 'rawsf_doc_embedding';
const DOCS: Array<[string, number[]]> = [
  ['east', [1, 0, 0]],
  ['north-east', [1, 1, 0]],
  ['north', [0, 1, 0]],
  ['west', [-1, 0, 0]],
];

describe('E2E raw surface: vector indexes', () => {
  let client: CerialClient;

  const labels = async (k: number, query: number[]): Promise<string[]> => {
    const rows = await client.$raw<{ label: string }>(
      sql`SELECT label FROM ${sql.ident(DOC)} WHERE embedding <|${sql.int(k)},40|> ${query}`,
    );

    return rows.map((r) => r.label).sort();
  };

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(DOC)}`);
    await client.$raw(sql`DEFINE TABLE ${sql.ident(DOC)} SCHEMALESS`);
    await client.$raw(
      sql`DEFINE INDEX ${sql.ident(INDEX)} ON ${sql.ident(DOC)} FIELDS embedding HNSW DIMENSION 3 DIST COSINE`,
    );
  });

  afterAll(async () => {
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(DOC)}`);
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.$raw(sql`DELETE ${sql.ident(DOC)}`);
    for (const [label, embedding] of DOCS)
      await client.$raw(sql`CREATE ${sql.ident(DOC)} SET label = ${label}, embedding = ${embedding}`);
    for (const [name, scores] of DOCS)
      await client.db.User.create({ data: { email: `${name}@x.test`, name, isActive: true, scores } });
  });

  describe('refusals', () => {
    test('a bound value in the k slot is a parse error', async () => {
      await expect(
        (async () => {
          await client.$raw(sql`SELECT label FROM ${sql.ident(DOC)} WHERE embedding <|${2},40|> ${[1, 0, 0]}`);
        })(),
      ).rejects.toThrow(CerialDatabaseError);
    });

    test.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [2 ** 60]])('sql.int(%p) refuses', (value) => {
      expect(() => sql.int(value)).toThrow(CerialValidationError);
    });

    test('sql.int refuses a string, which would otherwise be text', () => {
      expect(() => sql.int('2); DELETE user; --' as never)).toThrow(CerialValidationError);
    });
  });

  describe('HNSW through $raw', () => {
    test('the index is defined on the table', async () => {
      const [info] = await client.$raw<{ indexes: Record<string, string> }>(sql`INFO FOR TABLE ${sql.ident(DOC)}`);

      expect(Object.keys(info!.indexes)).toEqual([INDEX]);
      expect(info!.indexes[INDEX]).toContain('HNSW');
    });

    test('KNN with a dynamic k returns the k nearest and excludes the rest', async () => {
      expect(await labels(2, [1, 0.1, 0])).toEqual(['east', 'north-east']);
      expect(await labels(1, [0, 1, 0.1])).toEqual(['north']);
    });

    test('a larger k reaches further, and the opposite vector is last', async () => {
      expect(await labels(3, [1, 0.1, 0])).not.toContain('west');
      expect(await labels(4, [1, 0.1, 0])).toContain('west');
    });
  });

  describe('similarity compute and sort', () => {
    test('orders the users by cosine similarity to the query vector', async () => {
      const rows = await client.db.User.findMany({
        compute: { sim: sql<number>`vector::similarity::cosine(scores, ${[1, 0, 0]})` },
        orderBy: { sim: 'desc' },
      });

      expect(rows.map((u) => u.name)).toEqual(['east', 'north-east', 'north', 'west']);
      expect(rows[0]!.sim).toBeCloseTo(1, 5);
      expect(rows[3]!.sim).toBeCloseTo(-1, 5);
    });

    test('a $raw similarity threshold excludes the dissimilar users', async () => {
      const rows = await client.db.User.findMany({
        where: { $raw: sql`vector::similarity::cosine(scores, ${[1, 0, 0]}) > ${0.5}` },
        orderBy: { name: 'asc' },
      });

      expect(rows.map((u) => u.name)).toEqual(['east', 'north-east']);
    });
  });
});
