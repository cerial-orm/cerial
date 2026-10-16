/**
 * E2E Tests: AND, OR and NOT inside a forward-relation filter (PostRequired.author)
 *
 * Before the operators compiled on this path, a logical operator as the only key of the relation
 * filter dropped the whole clause and findMany returned every row. Each case asserts the exact
 * titles, which differ per operator, so a dropped clause fails every one of them.
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
import { forwardCases, seedAuthorsAndPosts, titlesOf } from './helpers';

const TABLES = tables.oneToManyRequired;

describe('E2E relation filter logical operators: forward path', () => {
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

  describe.each(forwardCases)('$label', ({ where, titles }) => {
    test('findMany selects exactly the matching rows', async () => {
      expect(titlesOf(await client.db.PostRequired.findMany({ where }))).toEqual(titles);
    });

    test('findOne returns one of the matching rows', async () => {
      const row = await client.db.PostRequired.findOne({ where });

      expect(row).not.toBeNull();
      expect(titles).toContain(row!.title);
    });

    test('count agrees with findMany', async () => {
      expect(await client.db.PostRequired.count(where)).toBe(titles.length);
    });

    test('exists is true', async () => {
      expect(await client.db.PostRequired.exists(where)).toBe(true);
    });

    test('updateMany touches exactly the matching rows', async () => {
      await client.db.PostRequired.updateMany({ where, data: { body: 'touched' } });

      const touched = await client.db.PostRequired.findMany({ where: { body: 'touched' } });
      expect(titlesOf(touched)).toEqual(titles);
    });

    test('deleteMany removes exactly the matching rows', async () => {
      await client.db.PostRequired.deleteMany({ where });

      const left = await client.db.PostRequired.findMany();
      expect(titlesOf(left)).toEqual(['a', 'b', 'c', 'd', 'e'].filter((t) => !titles.includes(t)));
    });
  });

  test('a filter that matches nothing returns no rows and exists is false', async () => {
    const where = { author: { AND: [{ name: 'Zed' }, { name: 'Amy' }] } };

    expect(await client.db.PostRequired.findMany({ where })).toEqual([]);
    expect(await client.db.PostRequired.count(where)).toBe(0);
    expect(await client.db.PostRequired.exists(where)).toBe(false);
  });

  test('OR nested inside AND nested inside OR', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: {
        author: {
          OR: [{ AND: [{ name: 'Zed' }, { OR: [{ email: 'z@x.test' }, { email: 'nope' }] }] }, { name: 'Bob' }],
        },
      },
    });

    expect(titlesOf(posts)).toEqual(['a', 'c', 'd']);
  });

  test('NOT of an OR is the complement of the OR', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: { author: { NOT: { OR: [{ name: 'Zed' }, { name: 'Amy' }] } } },
    });

    expect(titlesOf(posts)).toEqual(['c']);
  });

  test('a logical operator beside a plain key composes with AND', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: { author: { email: { in: ['z@x.test', 'a@x.test'] }, NOT: { name: 'Zed' } } },
    });

    expect(titlesOf(posts)).toEqual(['b', 'e']);
  });

  test('a relation filter beside a field of the model itself composes with AND', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: { title: { in: ['a', 'b', 'c'] }, author: { OR: [{ name: 'Zed' }, { name: 'Amy' }] } },
    });

    expect(titlesOf(posts)).toEqual(['a', 'b']);
  });

  test('an OR inside an operator-carrying branch keeps each operator', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: { author: { OR: [{ name: { startsWith: 'Z' } }, { email: { contains: 'b@' } }] } },
    });

    expect(titlesOf(posts)).toEqual(['a', 'c', 'd']);
  });

  test('an empty OR matches nothing rather than everything', async () => {
    expect(await client.db.PostRequired.findMany({ where: { author: { OR: [] } } })).toEqual([]);
  });

  test('deleteMany with an empty OR deletes nothing', async () => {
    await client.db.PostRequired.deleteMany({ where: { author: { OR: [] } } });

    expect(await client.db.PostRequired.count()).toBe(5);
  });

  test('a bound value in a branch is data, not query text', async () => {
    const posts = await client.db.PostRequired.findMany({
      where: { author: { OR: [{ name: "Zed' OR true OR '" }] } },
    });

    expect(posts).toEqual([]);
  });
});
