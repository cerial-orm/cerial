/**
 * E2E Tests: orderBy, limit and offset inside include — valid input
 *
 * Schemas: one-to-many (Author/PostRequired), relation-with-objects (RelObjCompany/RelObjEmployee).
 * Every case asserts the actual row order.
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

const ALL_TABLES = [...tables.oneToManyRequired, ...tables.relationWithObjects];

describe('E2E orderBy inside include', () => {
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

    // Titles sort differently from insertion order; authors sort differently from their ids
    const zed = await client.db.Author.create({ data: { id: 'a-zed', name: 'Zed', email: 'z@x.test' } });
    const amy = await client.db.Author.create({ data: { id: 'a-amy', name: 'Amy', email: 'a@x.test' } });
    await client.db.PostRequired.create({ data: { id: 'p1', title: 'c', authorId: zed.id } });
    await client.db.PostRequired.create({ data: { id: 'p2', title: 'a', authorId: amy.id } });
    await client.db.PostRequired.create({ data: { id: 'p3', title: 'd', authorId: zed.id } });
    await client.db.PostRequired.create({ data: { id: 'p4', title: 'b', authorId: zed.id } });

    const co = await client.db.RelObjCompany.create({
      data: { id: 'co', name: 'Co', headquarters: { street: 's', city: 'c', state: 'x' } },
    });
    const home = (city: string) => ({ street: 's', city, state: 'x' });
    await client.db.RelObjEmployee.create({
      data: { id: 'e1', name: 'one', homeAddress: home('Oslo'), companyId: co.id },
    });
    await client.db.RelObjEmployee.create({
      data: { id: 'e2', name: 'two', homeAddress: home('Bergen'), companyId: co.id },
    });
    await client.db.RelObjEmployee.create({
      data: { id: 'e3', name: 'three', homeAddress: home('Tromso'), companyId: co.id },
    });
  });

  const titles = (posts: { title: string }[] | undefined) => posts?.map((p) => p.title);

  test('ascending', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'asc' } } },
    });

    expect(titles(authors[0]?.posts)).toEqual(['b', 'c', 'd']);
  });

  test('descending', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'desc' } } },
    });

    expect(titles(authors[0]?.posts)).toEqual(['d', 'c', 'b']);
  });

  test('limit and offset apply after sorting', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'desc' }, limit: 2, offset: 1 } },
    });

    expect(titles(authors[0]?.posts)).toEqual(['c', 'b']);
  });

  test('limit and offset without orderBy still page', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { limit: 2 } },
    });

    expect(authors[0]?.posts).toHaveLength(2);
  });

  test('limit 0 is honoured', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'asc' }, limit: 0 } },
    });

    expect(authors[0]?.posts).toEqual([]);
  });

  test('sorts through a relation key, ascending and descending', async () => {
    const asc = await client.db.Author.findMany({
      include: { posts: { orderBy: { author: { name: 'asc' }, title: 'desc' } } },
    });
    const zedAsc = asc.find((a) => a.name === 'Zed');
    const desc = await client.db.Author.findMany({
      include: { posts: { orderBy: { title: 'desc' } } },
    });

    // Same author for every Zed post, so the secondary key decides
    expect(titles(zedAsc?.posts)).toEqual(['d', 'c', 'b']);
    expect(titles(desc.find((a) => a.name === 'Amy')?.posts)).toEqual(['a']);
  });

  test('relation key result carries no internal alias', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { author: { name: 'asc' } } } },
    });

    expect(authors[0]?.posts).toHaveLength(3);
    expect(Object.keys(authors[0]?.posts[0] ?? {}).some((k) => k.startsWith('__cerial'))).toBe(false);
  });

  test('sorts by an object sub-field, ascending and descending', async () => {
    const asc = await client.db.RelObjCompany.findMany({
      include: { employees: { orderBy: { homeAddress: { city: 'asc' } } } },
    });
    const desc = await client.db.RelObjCompany.findMany({
      include: { employees: { orderBy: { homeAddress: { city: 'desc' } } } },
    });

    expect(asc[0]?.employees.map((e) => e.homeAddress.city)).toEqual(['Bergen', 'Oslo', 'Tromso']);
    expect(desc[0]?.employees.map((e) => e.homeAddress.city)).toEqual(['Tromso', 'Oslo', 'Bergen']);
  });

  test('sorts and pages together with a nested include', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { title: 'asc' }, limit: 2, include: { author: true } } },
    });

    expect(titles(authors[0]?.posts)).toEqual(['b', 'c']);
    expect(authors[0]?.posts.map((p) => p.author?.name)).toEqual(['Zed', 'Zed']);
  });

  test('sorts a relation key together with a nested include', async () => {
    const authors = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: { posts: { orderBy: { author: { name: 'asc' }, title: 'asc' }, include: { author: true } } },
    });

    expect(titles(authors[0]?.posts)).toEqual(['b', 'c', 'd']);
    expect(authors[0]?.posts.map((p) => p.author?.name)).toEqual(['Zed', 'Zed', 'Zed']);
  });
});
