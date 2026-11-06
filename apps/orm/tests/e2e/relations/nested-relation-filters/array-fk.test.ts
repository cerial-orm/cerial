/**
 * E2E Tests: array-FK (many-to-many) relations inside and around nested relation filters
 *
 * KitchenSinkUser has the reverse array `posts` and the array-FK `tags`; KitchenSinkPost has the forward
 * `author`; KitchenSinkTag has the array-FK `users`. Covers an array-FK inside a reverse or forward body,
 * a reverse or forward relation inside an array-FK body, and an array-FK inside an array-FK.
 *
 *   Ann: tags red, blue; posts p1, p2     Bob: tag red; post p3
 *   Cy:  tag blue; post p4                Dee: no tags, no posts
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  type KitchenSinkPostWhere,
  type KitchenSinkTagWhere,
  type KitchenSinkUserWhere,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const TABLES = tables.kitchenSink;
const USERS = ['u-ann', 'u-bob', 'u-cy', 'u-dee'] as const;
const POSTS = ['p1', 'p2', 'p3', 'p4'] as const;
const TAGS = ['t-red', 't-blue'] as const;

describe('E2E nested relation filters: array-FK relations', () => {
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
    await client.db.KitchenSinkTag.create({ data: { id: 't-red', name: 'red' } });
    await client.db.KitchenSinkTag.create({ data: { id: 't-blue', name: 'blue' } });
    for (const [id, name, tags] of [
      ['u-ann', 'Ann', ['t-red', 't-blue']],
      ['u-bob', 'Bob', ['t-red']],
      ['u-cy', 'Cy', ['t-blue']],
      ['u-dee', 'Dee', []],
    ] as const)
      await client.db.KitchenSinkUser.create({
        data: { id, name, email: `${id}@x.test`, ...(tags.length ? { tags: { connect: [...tags] } } : {}) },
      });
    for (const [id, title, authorId] of [
      ['p1', 'one', 'u-ann'],
      ['p2', 'two', 'u-ann'],
      ['p3', 'three', 'u-bob'],
      ['p4', 'four', 'u-cy'],
    ] as const)
      await client.db.KitchenSinkPost.create({ data: { id, title, authorId } });
  });

  const userRows = (): Rows<KitchenSinkUserWhere> => ({
    find: async (where) => (await client.db.KitchenSinkUser.findMany({ where })).map((r) => idOf(r.id)),
    count: (where) => client.db.KitchenSinkUser.count(where),
    update: async (where) => {
      await client.db.KitchenSinkUser.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () =>
      (await client.db.KitchenSinkUser.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.KitchenSinkUser.deleteMany({ where });
    },
    survivors: async () => (await client.db.KitchenSinkUser.findMany()).map((r) => idOf(r.id)),
    everything: USERS,
  });

  const postRows = (): Rows<KitchenSinkPostWhere> => ({
    find: async (where) => (await client.db.KitchenSinkPost.findMany({ where })).map((r) => idOf(r.id)),
    count: (where) => client.db.KitchenSinkPost.count(where),
    update: async (where) => {
      await client.db.KitchenSinkPost.updateMany({ where, data: { title: 'MARKED' } });
    },
    marked: async () =>
      (await client.db.KitchenSinkPost.findMany({ where: { title: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.KitchenSinkPost.deleteMany({ where });
    },
    survivors: async () => (await client.db.KitchenSinkPost.findMany()).map((r) => idOf(r.id)),
    everything: POSTS,
  });

  const tagRows = (): Rows<KitchenSinkTagWhere> => ({
    find: async (where) => (await client.db.KitchenSinkTag.findMany({ where })).map((r) => idOf(r.id)),
    count: (where) => client.db.KitchenSinkTag.count(where),
    update: async (where) => {
      await client.db.KitchenSinkTag.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.KitchenSinkTag.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.KitchenSinkTag.deleteMany({ where });
    },
    survivors: async () => (await client.db.KitchenSinkTag.findMany()).map((r) => idOf(r.id)),
    everything: TAGS,
  });

  const userCases: Case<KitchenSinkUserWhere>[] = [
    {
      label: 'tags.some.name: the array-FK on its own',
      where: { tags: { some: { name: 'blue' } } },
      expected: ['u-ann', 'u-cy'],
    },
    {
      label: 'tags.every.name requires a tag',
      where: { tags: { every: { name: 'red' } } },
      expected: ['u-bob'],
    },
    {
      label: 'tags.none.name keeps users without tags',
      where: { tags: { none: { name: 'red' } } },
      expected: ['u-cy', 'u-dee'],
    },
    {
      label: 'tags.some.{}: has a tag',
      where: { tags: { some: {} } },
      expected: ['u-ann', 'u-bob', 'u-cy'],
    },
    {
      label: 'tags.none.{}: has no tag',
      where: { tags: { none: {} } },
      expected: ['u-dee'],
    },
    {
      label: 'tags.every.{} requires a tag',
      where: { tags: { every: {} } },
      expected: ['u-ann', 'u-bob', 'u-cy'],
    },
    {
      label: 'reverse -> array-FK: posts.some.author.tags.some.name',
      where: { posts: { some: { author: { tags: { some: { name: 'blue' } } } } } },
      expected: ['u-ann', 'u-cy'],
    },
    {
      label: 'NOT reverse -> forward -> array-FK',
      where: { NOT: { posts: { some: { author: { tags: { some: { name: 'blue' } } } } } } },
      expected: ['u-bob', 'u-dee'],
    },
    {
      label: 'array-FK -> array-FK: tags.some.users.some.name',
      where: { tags: { some: { users: { some: { name: 'Bob' } } } } },
      expected: ['u-ann', 'u-bob'],
    },
    {
      label: 'array-FK -> array-FK with every: tags.every.users.some.name',
      where: { tags: { every: { users: { some: { name: 'Cy' } } } } },
      expected: ['u-cy'],
    },
    {
      label: 'array-FK -> array-FK with none',
      where: { tags: { none: { users: { some: { name: 'Cy' } } } } },
      expected: ['u-bob', 'u-dee'],
    },
    {
      label: 'array-FK -> reverse: tags.some.users.some.posts.some.title',
      where: { tags: { some: { users: { some: { posts: { some: { title: 'three' } } } } } } },
      expected: ['u-ann', 'u-bob'],
    },
    {
      label: 'array-FK -> reverse inside AND with a field',
      where: {
        AND: [{ tags: { some: { users: { some: { posts: { some: { title: 'four' } } } } } } }, { name: 'Ann' }],
      },
      expected: ['u-ann'],
    },
    {
      label: 'array-FK -> reverse inside OR',
      where: {
        OR: [{ tags: { some: { users: { some: { posts: { some: { title: 'three' } } } } } } }, { name: 'Dee' }],
      },
      expected: ['u-ann', 'u-bob', 'u-dee'],
    },
  ];

  const postCases: Case<KitchenSinkPostWhere>[] = [
    {
      label: 'forward -> array-FK: author.tags.some.name',
      where: { author: { tags: { some: { name: 'red' } } } },
      expected: ['p1', 'p2', 'p3'],
    },
    {
      label: 'author.tags.every.name',
      where: { author: { tags: { every: { name: 'red' } } } },
      expected: ['p3'],
    },
    {
      label: 'author.tags.none.name',
      where: { author: { tags: { none: { name: 'red' } } } },
      expected: ['p4'],
    },
    {
      label: 'NOT author.tags.some.name',
      where: { NOT: { author: { tags: { some: { name: 'red' } } } } },
      expected: ['p4'],
    },
    {
      label: 'author.tags.some.users.some.name: forward -> array-FK -> array-FK',
      where: { author: { tags: { some: { users: { some: { name: 'Cy' } } } } } },
      expected: ['p1', 'p2', 'p4'],
    },
    {
      label: 'NOT author.tags.some.{}: every author has a tag, so no post',
      where: { NOT: { author: { tags: { some: {} } } } },
      expected: [],
    },
  ];

  const tagCases: Case<KitchenSinkTagWhere>[] = [
    {
      label: 'users.some.posts.some.title: array-FK -> reverse',
      where: { users: { some: { posts: { some: { title: 'three' } } } } },
      expected: ['t-red'],
    },
    {
      label: 'users.none.posts.some.title',
      where: { users: { none: { posts: { some: { title: 'three' } } } } },
      expected: ['t-blue'],
    },
    {
      label: 'users.every.posts.some.title requires every user to match',
      where: { users: { every: { posts: { some: { title: { in: ['one', 'three'] } } } } } },
      expected: ['t-red'],
    },
    {
      label: 'users.some.posts.some.author.name: array-FK -> reverse -> forward',
      where: { users: { some: { posts: { some: { author: { name: 'Cy' } } } } } },
      expected: ['t-blue'],
    },
    {
      label: 'NOT users.some.posts.some.author.name',
      where: { NOT: { users: { some: { posts: { some: { author: { name: 'Cy' } } } } } } },
      expected: ['t-red'],
    },
    {
      label: 'users.some.tags.every.name: array-FK -> array-FK',
      where: { users: { some: { tags: { every: { name: 'red' } } } } },
      expected: ['t-red'],
    },
  ];

  runCases('KitchenSinkUser', userRows, userCases);
  runCases('KitchenSinkPost', postRows, postCases);
  runCases('KitchenSinkTag', tagRows, tagCases);

  test('the NOT payload over a reverse -> forward -> array-FK key deletes Bob and Dee and cascades only Bob posts', async () => {
    await client.db.KitchenSinkUser.deleteMany({
      where: { NOT: { posts: { some: { author: { tags: { some: { name: 'blue' } } } } } } },
    });

    expect((await client.db.KitchenSinkUser.findMany()).map((u) => u.name).sort()).toEqual(['Ann', 'Cy']);
    expect((await client.db.KitchenSinkPost.findMany()).map((p) => idOf(p.id)).sort()).toEqual(['p1', 'p2', 'p4']);
    expect((await client.db.KitchenSinkTag.findMany()).length).toBe(2);
  });

  describe('include where', () => {
    test('a reverse -> forward key on the users included under each tag', async () => {
      const tags = await client.db.KitchenSinkTag.findMany({
        include: { users: { where: { posts: { some: { author: { name: 'Bob' } } } } } },
      });
      const byName = Object.fromEntries(tags.map((t) => [t.name, t.users.map((u) => u.name).sort()]));

      expect(byName).toEqual({ red: ['Bob'], blue: [] });
    });

    test('an array-FK key on the posts included under each user', async () => {
      const users = await client.db.KitchenSinkUser.findMany({
        include: { posts: { where: { author: { tags: { some: { name: 'blue' } } } } } },
      });
      const byName = Object.fromEntries(users.map((u) => [u.name, u.posts.map((p) => p.title).sort()]));

      expect(byName).toEqual({ Ann: ['one', 'two'], Bob: [], Cy: ['four'], Dee: [] });
    });

    test('a NOT over a nested array-FK key on included posts', async () => {
      const users = await client.db.KitchenSinkUser.findMany({
        include: { posts: { where: { NOT: { author: { tags: { some: { name: 'blue' } } } } } } },
      });
      const byName = Object.fromEntries(users.map((u) => [u.name, u.posts.map((p) => p.title).sort()]));

      expect(byName).toEqual({ Ann: [], Bob: ['three'], Cy: [], Dee: [] });
    });
  });

  test('an unknown key inside a nested array-FK body is refused and nothing is deleted', async () => {
    const bad = (where: unknown): never => where as never;

    for (const where of [
      { tags: { some: { users: { some: { nmae: 'x' } } } } },
      { posts: { some: { author: { tags: { some: { nmae: 'x' } } } } } },
      { tags: { any: { name: 'x' } } },
    ]) {
      await expect((async () => await client.db.KitchenSinkUser.deleteMany({ where: bad(where) }))()).rejects.toThrow();
      await expect((async () => await client.db.KitchenSinkUser.findMany({ where: bad(where) }))()).rejects.toThrow();
    }
    expect(await client.db.KitchenSinkUser.count()).toBe(USERS.length);
  });
});
