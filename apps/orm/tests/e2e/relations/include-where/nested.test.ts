/**
 * E2E Tests: include where at two levels of nesting
 *
 * Each level compiles its own filter, and sibling filters on the same field name do not collide.
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

describe('E2E include where: nested includes', () => {
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

  test('reverse then forward to-one: a filter at each level', async () => {
    const authors = await client.db.Author.findMany({
      orderBy: { name: 'asc' },
      include: {
        posts: { where: { body: 'live' }, include: { author: { where: { name: 'Zed' } } } },
      },
    });

    const zed = authors.find((a) => a.name === 'Zed');
    expect(zed?.posts.map((p) => [p.title, p.author?.name]).sort()).toEqual([
      ['b', 'Zed'],
      ['d', 'Zed'],
      ['e', 'Zed'],
    ]);
    expect(authors.find((a) => a.name === 'Amy')?.posts).toEqual([]);
  });

  test('the inner filter keeps the outer child and leaves its excluded to-one row empty', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: {
        posts: { where: { body: 'live' }, include: { author: { where: { name: 'Amy' } } } },
      },
    });

    expect(zed?.posts).toHaveLength(3);
    for (const post of zed?.posts ?? []) expect(post.author).toBeNull();
  });

  test('a nested excluded to-one row is null, as it is at the top level', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: {
        posts: { where: { body: 'live' }, include: { author: { where: { name: 'Amy' } } } },
      },
    });

    for (const post of zed?.posts ?? []) expect(post.author).toBeNull();
  });

  test('forward array then forward array, filtering the same field name at both levels', async () => {
    const students = await client.db.Student.findMany({
      orderBy: { name: 'asc' },
      include: {
        courses: {
          where: { name: { in: ['Math', 'Art'] } },
          include: { students: { where: { name: { in: ['Ben', 'Cy'] } } } },
        },
      },
    });

    const shape = students.map((s) => [
      s.name,
      s.courses
        .map((c) => [c.name, c.students.map((x) => x.name).sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ]);

    expect(shape).toEqual([
      [
        'Ann',
        [
          ['Art', ['Cy']],
          ['Math', ['Ben']],
        ],
      ],
      ['Ben', [['Math', ['Ben']]]],
      ['Cy', [['Art', ['Cy']]]],
    ]);
  });

  test('limit and orderBy at the outer level with a filter at the inner level', async () => {
    const [zed] = await client.db.Author.findMany({
      where: { name: 'Zed' },
      include: {
        posts: {
          orderBy: { title: 'asc' },
          limit: 2,
          include: { author: { where: { email: 'z@x.test' } } },
        },
      },
    });

    expect(zed?.posts.map((p) => [p.title, p.author?.name])).toEqual([
      ['a', 'Zed'],
      ['b', 'Zed'],
    ]);
  });
});
