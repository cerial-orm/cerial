/**
 * E2E Tests: orderBy, limit and offset inside include — hostile and invalid input
 *
 * The include orderBy key used to be interpolated into the subquery unchecked, so a crafted key
 * closed the subquery and ran a second SELECT whose rows came back under the included relation.
 * Every payload here must be refused before any query runs. The victim is the `author` table:
 * its rows must still be there and must never appear in a result.
 *
 * Schemas: one-to-many (Author/PostRequired), relation-with-objects (RelObjCompany/RelObjEmployee)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ALL_TABLES = [...tables.oneToManyRequired, ...tables.relationWithObjects];

// Closes the subquery and opens a second projection over an unrelated table
const EXFILTRATE = 'title) AS posts, (SELECT name, email FROM author ORDER BY name';
// Closes the subquery and appends a destructive statement
const DESTROY = 'title ASC; REMOVE TABLE author; --';

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Hostile and invalid include orderBy', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);
    const ada = await client.db.Author.create({ data: { id: 'a-ada', name: 'Ada', email: 'ada@secret.test' } });
    await client.db.Author.create({ data: { id: 'a-bob', name: 'Bob', email: 'bob@secret.test' } });
    await client.db.PostRequired.create({ data: { id: 'p1', title: 'b', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { id: 'p2', title: 'a', authorId: ada.id } });
  });

  const authorsIntact = async () => {
    const authors = await client.db.Author.findMany({ orderBy: { name: 'asc' } });
    expect(authors.map((a) => a.email)).toEqual(['ada@secret.test', 'bob@secret.test']);
  };

  describe('injection through the key', () => {
    test('a payload that opens a second projection is refused, nothing leaks', async () => {
      let result: unknown;

      await rejects(async () => {
        result = await client.db.Author.findMany({
          // @ts-expect-error — not a PostRequired field, testing runtime guard
          include: { posts: { orderBy: { [EXFILTRATE]: 'asc' } } },
        });
      }, "Unknown field 'title) AS posts");

      expect(result).toBeUndefined();
      expect(JSON.stringify(result ?? null)).not.toContain('secret.test');
      await authorsIntact();
    });

    test('the same payload is refused on findOne and findUnique', async () => {
      await rejects(
        () =>
          client.db.Author.findOne({
            where: { id: 'a-ada' },
            // @ts-expect-error — not a PostRequired field, testing runtime guard
            include: { posts: { orderBy: { [EXFILTRATE]: 'asc' } } },
          }),
        'Unknown field',
      );
      await rejects(
        () =>
          client.db.Author.findUnique({
            where: { id: 'a-ada' },
            // @ts-expect-error — not a PostRequired field, testing runtime guard
            include: { posts: { orderBy: { [EXFILTRATE]: 'asc' } } },
          }),
        'Unknown field',
      );
      await authorsIntact();
    });

    test('a destructive payload is refused and the table survives', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — not a PostRequired field, testing runtime guard
            include: { posts: { orderBy: { [DESTROY]: 'asc' } } },
          }),
        'Unknown field',
      );
      await authorsIntact();
    });

    test('a payload in the key of a forward include is refused', async () => {
      await rejects(
        () =>
          client.db.PostRequired.findMany({
            // @ts-expect-error — orderBy is not offered on a single forward include, testing runtime guard
            include: { author: { orderBy: { [EXFILTRATE]: 'asc' } } },
          }),
        'Unknown field',
      );
      await authorsIntact();
    });

    test('a payload in a nested include is refused', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — not a PostRequired field, testing runtime guard
            include: { posts: { include: { author: { orderBy: { [EXFILTRATE]: 'asc' } } } } },
          }),
        'Unknown field',
      );
      await authorsIntact();
    });

    test('a payload one relation deep under the include orderBy is refused', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — not an Author field, testing runtime guard
            include: { posts: { orderBy: { author: { [EXFILTRATE]: 'asc' } } } },
          }),
        "Unknown field 'author.title) AS posts",
      );
      await authorsIntact();
    });
  });

  describe('unknown key', () => {
    test('a typo throws instead of returning unsorted rows, naming path and model', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — 'ttle' is not a PostRequired field, testing runtime guard
            include: { posts: { orderBy: { ttle: 'asc' } } },
          }),
        "Invalid orderBy in include 'posts': Unknown field 'ttle' on model PostRequired",
      );
    });

    test('a typo under a relation key names the full path', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — 'nmae' is not an Author field, testing runtime guard
            include: { posts: { orderBy: { author: { nmae: 'asc' } } } },
          }),
        "Unknown field 'author.nmae' on model Author",
      );
    });
  });

  describe('nested and malformed values', () => {
    test('a nested value under a scalar field is an error, never a TypeError', async () => {
      const run = () =>
        client.db.Author.findMany({
          // @ts-expect-error — 'title' is a string field with no sub-fields, testing runtime guard
          include: { posts: { orderBy: { title: { x: 'asc' } } } },
        });

      await rejects(run, "Cannot order by a nested path under 'title' on model PostRequired");
      await expect(
        (async () => {
          await run();
        })(),
      ).rejects.not.toBeInstanceOf(TypeError);
    });

    test('a bare direction on a relation key explains what to name', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — a relation needs a nested field, testing runtime guard
            include: { posts: { orderBy: { author: 'asc' } } },
          }),
        "Cannot order by relation 'author' on model PostRequired directly",
      );
    });

    test('an invalid direction is rejected', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — 'sideways' is not a direction, testing runtime guard
            include: { posts: { orderBy: { title: 'sideways' } } },
          }),
        "Order direction for 'title' must be 'asc' or 'desc'",
      );
    });

    test.each([
      [null],
      [5],
      [true],
      [['asc']],
    ])('a non-string direction %p is rejected, not a TypeError', async (bad) => {
      const run = () =>
        client.db.Author.findMany({
          // @ts-expect-error — not a direction, testing runtime guard
          include: { posts: { orderBy: { title: bad } } },
        });

      await expect(
        (async () => {
          await run();
        })(),
      ).rejects.toThrow('Order direction');
    });

    test('an object field with an unknown sub-key under include names the path', async () => {
      await rejects(
        () =>
          client.db.RelObjCompany.findMany({
            // @ts-expect-error — 'cty' is not an Address field, testing runtime guard
            include: { employees: { orderBy: { homeAddress: { cty: 'asc' } } } },
          }),
        "Unknown field 'homeAddress.cty' on model RelObjEmployee",
      );
    });
  });

  describe('limit and offset inside include', () => {
    test.each([-1, 1.5, '1; REMOVE TABLE author', Number.NaN])('limit %p is rejected', async (bad) => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — not a non-negative integer, testing runtime guard
            include: { posts: { limit: bad } },
          }),
        "in include 'posts'",
      );
      await authorsIntact();
    });

    test('an offset that is not a non-negative integer is rejected', async () => {
      await rejects(
        () =>
          client.db.Author.findMany({
            // @ts-expect-error — not a non-negative integer, testing runtime guard
            include: { posts: { offset: '1; REMOVE TABLE author' } },
          }),
        "in include 'posts'",
      );
      await authorsIntact();
    });
  });
});
