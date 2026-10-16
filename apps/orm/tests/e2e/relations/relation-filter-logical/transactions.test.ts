/**
 * E2E Tests: relation-filter logical operators in every $transaction mode
 *
 * Array mode executes the compiled query, which is the path that let an earlier fix look complete
 * while the query it ran was still wrong. Each mode runs the same forward-relation filters and the
 * same reverse quantifier bodies, and each asserts the exact rows, not a count.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { forwardCases, namesOf, seedAuthorsAndPosts, titlesOf } from './helpers';

const TABLES = tables.oneToManyRequired;
const reverseWhere = { posts: { some: { OR: [{ title: 'a' }, { title: 'c' }] } } };

describe('E2E relation filter logical operators: $transaction modes', () => {
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
    await seedAuthorsAndPosts(client);
  });

  describe.each(forwardCases)('forward $label', ({ where, titles }) => {
    test('array mode', async () => {
      const [rows, count, exists] = await client.$transaction([
        client.db.PostRequired.findMany({ where }),
        client.db.PostRequired.count(where),
        client.db.PostRequired.exists(where),
      ]);

      expect(titlesOf(rows)).toEqual(titles);
      expect(count).toBe(titles.length);
      expect(exists).toBe(true);
    });

    test('callback mode', async () => {
      const result = await client.$transaction(async (tx) => ({
        rows: await tx.PostRequired.findMany({ where }),
        count: await tx.PostRequired.count(where),
        exists: await tx.PostRequired.exists(where),
      }));

      expect(titlesOf(result.rows)).toEqual(titles);
      expect(result.count).toBe(titles.length);
      expect(result.exists).toBe(true);
    });

    test('manual mode', async () => {
      const txn = await client.$transaction();
      const rows = await txn.PostRequired.findMany({ where });
      const count = await txn.PostRequired.count(where);
      const exists = await txn.PostRequired.exists(where);
      await txn.commit();

      expect(titlesOf(rows)).toEqual(titles);
      expect(count).toBe(titles.length);
      expect(exists).toBe(true);
    });

    test('array mode agrees with the same call outside a transaction', async () => {
      const [inside] = await client.$transaction([client.db.PostRequired.findMany({ where })]);
      const outside = await client.db.PostRequired.findMany({ where });

      expect(titlesOf(inside)).toEqual(titlesOf(outside));
    });
  });

  describe('forward writes', () => {
    const { where, titles } = forwardCases[0]!;

    test('array mode: updateMany touches only the matching rows', async () => {
      await client.$transaction([client.db.PostRequired.updateMany({ where, data: { body: 'touched' } })]);

      expect(titlesOf(await client.db.PostRequired.findMany({ where: { body: 'touched' } }))).toEqual(titles);
    });

    test('callback mode: deleteMany removes only the matching rows', async () => {
      await client.$transaction(async (tx) => {
        await tx.PostRequired.deleteMany({ where });
      });

      expect(titlesOf(await client.db.PostRequired.findMany())).toEqual(['c']);
    });

    test('manual mode: cancel leaves every row in place', async () => {
      const txn = await client.$transaction();
      await txn.PostRequired.deleteMany({ where });
      expect(titlesOf(await txn.PostRequired.findMany())).toEqual(['c']);
      await txn.cancel();

      expect(await client.db.PostRequired.count()).toBe(5);
    });

    test('manual mode: commit applies the delete', async () => {
      const txn = await client.$transaction();
      await txn.PostRequired.deleteMany({ where });
      await txn.commit();

      expect(titlesOf(await client.db.PostRequired.findMany())).toEqual(['c']);
    });
  });

  describe('reverse quantifier body with OR', () => {
    test('array mode', async () => {
      const [authors] = await client.$transaction([client.db.Author.findMany({ where: reverseWhere })]);

      expect(namesOf(authors)).toEqual(['Bob', 'Zed']);
    });

    test('callback mode', async () => {
      const authors = await client.$transaction(async (tx) => tx.Author.findMany({ where: reverseWhere }));

      expect(namesOf(authors)).toEqual(['Bob', 'Zed']);
    });

    test('manual mode', async () => {
      const txn = await client.$transaction();
      const authors = await txn.Author.findMany({ where: reverseWhere });
      await txn.commit();

      expect(namesOf(authors)).toEqual(['Bob', 'Zed']);
    });
  });

  describe('a bare operator under a reverse relation is refused in every mode', () => {
    const bare = { posts: { OR: [{ title: 'a' }] } };

    test('array mode: refused when the query is compiled, so nothing runs', async () => {
      // @ts-expect-error the reverse relation filter accepts only some, every and none
      const query = () => client.db.Author.findMany({ where: bare });

      await expect((async () => client.$transaction([query()]))()).rejects.toThrow(/Unknown key/);
    });

    test('callback mode', async () => {
      await expect(
        (async () =>
          // @ts-expect-error the reverse relation filter accepts only some, every and none
          client.$transaction(async (tx) => tx.Author.findMany({ where: bare })))(),
      ).rejects.toThrow(/Unknown key/);
    });

    test('manual mode', async () => {
      const txn = await client.$transaction();

      // @ts-expect-error the reverse relation filter accepts only some, every and none
      await expect((async () => txn.Author.findMany({ where: bare }))()).rejects.toThrow(/Unknown key/);
      await txn.cancel();
    });
  });
});
