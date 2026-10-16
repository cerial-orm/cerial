/**
 * E2E Tests: include where combined with select inside the same include
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
import { seedAuthorsAndPosts, seedStudentsAndCourses } from './helpers';

const TABLES = [...tables.oneToManyRequired, ...tables.manyToMany];

describe('E2E include where: with select', () => {
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
    await seedStudentsAndCourses(client);
  });

  test('the filter may name a field the select leaves out', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      select: { name: true },
      include: { posts: { where: { body: 'live' } } },
    });

    expect(zed?.posts.map((p) => p.title).sort()).toEqual(['b', 'd', 'e']);
  });

  test('top-level select and include where together on a reverse relation', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      select: { name: true },
      include: { posts: { where: { title: 'a' } } },
    });

    expect(zed?.name).toBe('Zed');
    expect(zed?.posts.map((p) => p.title)).toEqual(['a']);
  });

  test('forward array relation: select and include where together', async () => {
    const ann = await client.db.Student.findOne({
      where: { name: 'Ann' },
      select: { name: true },
      include: { courses: { where: { name: 'Art' } } },
    });

    expect(ann?.name).toBe('Ann');
    expect(ann?.courses.map((c) => c.name)).toEqual(['Art']);
  });

  test('forward to-one relation: select and include where together', async () => {
    const post = await client.db.PostRequired.findOne({
      where: { title: 'x' },
      select: { title: true },
      include: { author: { where: { name: 'Amy' } } },
    });

    expect(post?.title).toBe('x');
    expect(post?.author.name).toBe('Amy');
  });

  test('select with an include whose filter matches nothing', async () => {
    const zed = await client.db.Author.findOne({
      where: { name: 'Zed' },
      select: { name: true },
      include: { posts: { where: { title: 'nothing' } } },
    });

    expect(zed?.name).toBe('Zed');
    expect(zed?.posts).toEqual([]);
  });
});
