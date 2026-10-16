/**
 * E2E Tests: include where on a reverse array relation (Author.posts)
 *
 * Only the matching related rows come back; the parent rows are never filtered by it.
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
import { seedAuthorsAndPosts } from './helpers';

const TABLES = tables.oneToManyRequired;

describe('E2E include where: reverse array relation', () => {
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

  const titles = (posts: { title: string }[] | undefined) => posts?.map((p) => p.title).sort();

  test('matches some related rows', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' } } },
    });

    expect(titles(zed?.posts)).toEqual(['b', 'd', 'e']);
  });

  test('matches none: an empty array, not a missing key', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'nothing-has-this' } } },
    });

    expect(zed?.posts).toEqual([]);
  });

  test('matches all: the same rows as no filter', async () => {
    const [filtered] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { where: { title: { in: ['a', 'b', 'c', 'd', 'e'] } } } },
    });
    const [plain] = await client.db.Author.findMany({ where: { name: 'Zed' }, include: { posts: true } });

    expect(titles(filtered?.posts)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(titles(filtered?.posts)).toEqual(titles(plain?.posts));
  });

  test('every parent is still returned, each with its own filtered children', async () => {
    const authors = await client.db.Author.findMany({
      orderBy: { name: 'asc' },
      include: { posts: { where: { body: 'live' } } },
    });

    expect(authors.map((a) => [a.name, titles(a.posts)])).toEqual([
      ['Amy', []],
      ['Bob', []],
      ['Zed', ['b', 'd', 'e']],
    ]);
  });

  test('an operator filter narrows the related rows', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { where: { title: { notIn: ['a', 'b'] } } } },
    });

    expect(titles(zed?.posts)).toEqual(['c', 'd', 'e']);
  });

  test('OR, AND and NOT inside the filter compose', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: {
        posts: {
          where: { OR: [{ title: 'a' }, { AND: [{ body: 'live' }, { NOT: { title: 'e' } }] }] },
        },
      },
    });

    expect(titles(zed?.posts)).toEqual(['a', 'b', 'd']);
  });

  test('works through findOne and findUnique', async () => {
    const one = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { title: 'a' } } },
    });
    const unique = await client.db.Author.findUnique({
      where: { email: 'z@x.test' },
      include: { posts: { where: { title: 'b' } } },
    });

    expect(titles(one?.posts)).toEqual(['a']);
    expect(titles(unique?.posts)).toEqual(['b']);
  });

  test('a bound value is data, not query text', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { where: { title: "a' OR true OR '" } } },
    });

    expect(zed?.posts).toEqual([]);
  });
});
