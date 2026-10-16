/**
 * E2E Tests: include where combined with orderBy, limit and offset
 *
 * Author Zed owns posts a(draft) b(live) c(draft) d(live) e(live). Sorted by title, the first two
 * rows are a and b, of which only b is live. A filter applied before the limit therefore returns
 * [b, d]; a filter applied after it would return [b]. Every assertion below distinguishes the two.
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

describe('E2E include where: with orderBy, limit and offset', () => {
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

  const titles = (posts: { title: string }[] | undefined) => posts?.map((p) => p.title);

  test('the filter is applied before the limit, not after', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' }, orderBy: { title: 'asc' }, limit: 2 } },
    });

    expect(titles(zed?.posts)).toEqual(['b', 'd']);
  });

  test('the data separates the two orderings: limiting first and filtering after loses a row', async () => {
    const limited = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'asc' }, limit: 2 } },
    });
    const filteredAfter = limited?.posts.filter((p) => p.body === 'live').map((p) => p.title);

    expect(filteredAfter).toEqual(['b']);
  });

  test('descending order with a limit', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' }, orderBy: { title: 'desc' }, limit: 2 } },
    });

    // Unfiltered, the first two descending are e and d; c is the draft that sits between d and b
    expect(titles(zed?.posts)).toEqual(['e', 'd']);
  });

  test('a limit larger than the filtered set returns the whole filtered set', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' }, orderBy: { title: 'asc' }, limit: 4 } },
    });

    expect(titles(zed?.posts)).toEqual(['b', 'd', 'e']);
  });

  test('the offset counts filtered rows, not unfiltered ones', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' }, orderBy: { title: 'asc' }, limit: 1, offset: 1 } },
    });

    // Offset applied to the unfiltered set would skip a and land on b
    expect(titles(zed?.posts)).toEqual(['d']);
  });

  test('an offset past the filtered set returns an empty array', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'live' }, orderBy: { title: 'asc' }, offset: 3 } },
    });

    expect(zed?.posts).toEqual([]);
  });

  test('orderBy alone sorts the filtered set', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { where: { body: 'draft' }, orderBy: { title: 'desc' } } },
    });

    expect(titles(zed?.posts)).toEqual(['c', 'a']);
  });

  test('the same limit without a filter returns the first two of everything', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'asc' }, limit: 2 } },
    });

    expect(titles(zed?.posts)).toEqual(['a', 'b']);
  });
});
