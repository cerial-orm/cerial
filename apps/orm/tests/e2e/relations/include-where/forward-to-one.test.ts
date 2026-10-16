/**
 * E2E Tests: include where on a forward to-one relation (PostRequired.author)
 *
 * A to-one include that the filter excludes comes back as null: the subquery yields no row and
 * the [0] accessor over it resolves to nothing. The generated type of a required relation does
 * not widen to include null when a where is given, so the type says the field is present while
 * the runtime says null; the assertions below are plain null comparisons, which the checker
 * accepts for either shape, with no cast.
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

describe('E2E include where: forward to-one relation', () => {
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

  test('the related row matches: it comes back', async () => {
    const post = await client.db.PostRequired.findOne({
      where: { title: 'a' },
      include: { author: { where: { name: 'Zed' } } },
    });

    expect(post?.author.name).toBe('Zed');
  });

  test('the related row is excluded: null', async () => {
    const post = await client.db.PostRequired.findOne({
      where: { title: 'a' },
      include: { author: { where: { name: 'Amy' } } },
    });

    expect(post).not.toBeNull();
    expect(post?.author).toBeNull();
  });

  test('across many parents, only the matching parents carry the related row', async () => {
    const posts = await client.db.PostRequired.findMany({
      orderBy: { title: 'asc' },
      include: { author: { where: { name: 'Amy' } } },
    });

    expect(posts.map((p) => [p.title, p.author === null ? null : p.author.name])).toEqual([
      ['a', null],
      ['b', null],
      ['c', null],
      ['d', null],
      ['e', null],
      ['x', 'Amy'],
    ]);
  });

  test('every parent matches: the same result as no filter', async () => {
    const filtered = await client.db.PostRequired.findMany({
      orderBy: { title: 'asc' },
      include: { author: { where: { name: { in: ['Zed', 'Amy'] } } } },
    });
    const plain = await client.db.PostRequired.findMany({ orderBy: { title: 'asc' }, include: { author: true } });

    expect(filtered.map((p) => p.author.name)).toEqual(plain.map((p) => p.author.name));
  });

  test('the parent row is kept when its related row is excluded', async () => {
    const posts = await client.db.PostRequired.findMany({ include: { author: { where: { name: 'nobody' } } } });

    expect(posts).toHaveLength(6);
  });

  test('a filter on a different field of the related row', async () => {
    const post = await client.db.PostRequired.findOne({
      where: { title: 'x' },
      include: { author: { where: { email: 'a@x.test' } } },
    });

    expect(post?.author.name).toBe('Amy');
  });
});
