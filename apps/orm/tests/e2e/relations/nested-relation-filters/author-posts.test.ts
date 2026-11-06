/**
 * E2E Tests: a relation key inside a relation filter body, on Author and PostRequired
 *
 * Author has the reverse array `posts`; PostRequired has the forward `author`, and deleting an author
 * cascades to its posts. The filters here are the shapes that used to compile to a comparison on the virtual
 * relation field (`author = $x`, `authorId.posts = $x`), which is never true: a NOT around it matched every
 * row, so `Author.deleteMany` removed all authors and cascaded their posts.
 *
 * Ann owns p1 ('x') and p2 ('z'), Bob owns p3 ('y'), Cat owns nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type AuthorWhere,
  type CerialClient,
  cleanupTables,
  createTestClient,
  type PostRequiredWhere,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const TABLES = tables.oneToManyRequired;
const AUTHORS = ['a-ann', 'a-bob', 'a-cat'] as const;
const POSTS = ['p1', 'p2', 'p3'] as const;
const without = (all: readonly string[], ...ids: string[]): string[] => all.filter((id) => !ids.includes(id));

describe('E2E nested relation filters: author and posts', () => {
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
    for (const [id, name] of [
      ['a-ann', 'Ann'],
      ['a-bob', 'Bob'],
      ['a-cat', 'Cat'],
    ] as const)
      await client.db.Author.create({ data: { id, name, email: `${id}@x.test` } });
    for (const [id, title, authorId] of [
      ['p1', 'x', 'a-ann'],
      ['p2', 'z', 'a-ann'],
      ['p3', 'y', 'a-bob'],
    ] as const)
      await client.db.PostRequired.create({ data: { id, title, authorId } });
  });

  const authorRows = (): Rows<AuthorWhere> => ({
    find: async (where) => (await client.db.Author.findMany({ where })).map((r) => idOf(r.id)),
    count: (where) => client.db.Author.count(where),
    update: async (where) => {
      await client.db.Author.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.Author.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.Author.deleteMany({ where });
    },
    survivors: async () => (await client.db.Author.findMany()).map((r) => idOf(r.id)),
    everything: AUTHORS,
  });

  const postRows = (): Rows<PostRequiredWhere> => ({
    find: async (where) => (await client.db.PostRequired.findMany({ where })).map((r) => idOf(r.id)),
    count: (where) => client.db.PostRequired.count(where),
    update: async (where) => {
      await client.db.PostRequired.updateMany({ where, data: { body: 'MARKED' } });
    },
    marked: async () => (await client.db.PostRequired.findMany({ where: { body: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.PostRequired.deleteMany({ where });
    },
    survivors: async () => (await client.db.PostRequired.findMany()).map((r) => idOf(r.id)),
    everything: POSTS,
  });

  const authorCases: Case<AuthorWhere>[] = [
    {
      label: 'NOT posts.some.author.name: the payload that deleted every author',
      where: { NOT: { posts: { some: { author: { name: 'Ann' } } } } },
      expected: ['a-bob', 'a-cat'],
    },
    {
      label: 'posts.some.author.name',
      where: { posts: { some: { author: { name: 'Ann' } } } },
      expected: ['a-ann'],
    },
    {
      label: 'posts.none.author.name: written as 3 rows before, 2 now',
      where: { posts: { none: { author: { name: 'Ann' } } } },
      expected: ['a-bob', 'a-cat'],
    },
    {
      label: 'posts.every.author.name requires a post',
      where: { posts: { every: { author: { name: 'Ann' } } } },
      expected: ['a-ann'],
    },
    {
      label: 'NOT posts.every.author.name',
      where: { NOT: { posts: { every: { author: { name: 'Ann' } } } } },
      expected: ['a-bob', 'a-cat'],
    },
    {
      label: 'posts.some.author.posts.some.title: reverse -> forward -> reverse',
      where: { posts: { some: { author: { posts: { some: { title: 'x' } } } } } },
      expected: ['a-ann'],
    },
    {
      label: 'posts.some.author.posts.every.title: depth 3 with every',
      where: { posts: { some: { author: { posts: { every: { title: { in: ['x', 'z'] } } } } } } },
      expected: ['a-ann'],
    },
    {
      label: 'NOT posts.some.author.posts.none.title',
      where: { NOT: { posts: { some: { author: { posts: { none: { title: 'x' } } } } } } },
      expected: without(AUTHORS, 'a-bob'),
    },
    {
      label: 'posts.author.name: shorthand for some',
      where: { posts: { author: { name: 'Bob' } } },
      expected: ['a-bob'],
    },
    {
      label: 'posts.some.author.{}: a post whose author exists',
      where: { posts: { some: { author: {} } } },
      expected: ['a-ann', 'a-bob'],
    },
    {
      label: 'NOT posts.some.author.{}',
      where: { NOT: { posts: { some: { author: {} } } } },
      expected: ['a-cat'],
    },
    {
      label: 'AND of a nested key and a field',
      where: { AND: [{ posts: { some: { author: { name: 'Ann' } } } }, { name: 'Ann' }] },
      expected: ['a-ann'],
    },
    {
      label: 'OR of a nested key and a field',
      where: { OR: [{ posts: { some: { author: { name: 'Bob' } } } }, { name: 'Cat' }] },
      expected: ['a-bob', 'a-cat'],
    },
  ];

  const postCases: Case<PostRequiredWhere>[] = [
    {
      label: 'NOT author.posts.some.title: the payload that matched every post',
      where: { NOT: { author: { posts: { some: { title: 'x' } } } } },
      expected: ['p3'],
    },
    {
      label: 'author.posts.some.title',
      where: { author: { posts: { some: { title: 'x' } } } },
      expected: ['p1', 'p2'],
    },
    {
      label: 'author.posts.none.title',
      where: { author: { posts: { none: { title: 'x' } } } },
      expected: ['p3'],
    },
    {
      label: 'author.posts.every.title',
      where: { author: { posts: { every: { title: { in: ['x', 'z'] } } } } },
      expected: ['p1', 'p2'],
    },
    {
      label: 'author.posts.isEmpty false',
      where: { author: { posts: { isEmpty: false } } },
      expected: ['p1', 'p2', 'p3'],
    },
    {
      label: 'author.posts.some.author.name: forward -> reverse -> forward',
      where: { author: { posts: { some: { author: { name: 'Bob' } } } } },
      expected: ['p3'],
    },
    {
      label: 'NOT author.posts.some.author.name',
      where: { NOT: { author: { posts: { some: { author: { name: 'Bob' } } } } } },
      expected: ['p1', 'p2'],
    },
    {
      label: 'author.OR over a nested key and a field',
      where: { author: { OR: [{ posts: { some: { title: 'y' } } }, { name: 'Zed' }] } },
      expected: ['p3'],
    },
    {
      label: 'author.NOT over a nested key',
      where: { author: { NOT: { posts: { some: { title: 'x' } } } } },
      expected: ['p3'],
    },
    {
      label: 'author.AND over a nested key and a field',
      where: { author: { AND: [{ posts: { some: { title: 'z' } } }, { name: 'Ann' }] } },
      expected: ['p1', 'p2'],
    },
  ];

  runCases('Author', authorRows, authorCases);
  runCases('PostRequired', postRows, postCases);

  test('the payload that used to delete every author keeps Ann and her posts, and cascades only Bob', async () => {
    await client.db.Author.deleteMany({
      where: { NOT: { posts: { some: { author: { name: 'Ann' } } } } },
    });

    expect((await client.db.Author.findMany()).map((a) => a.name)).toEqual(['Ann']);
    expect((await client.db.PostRequired.findMany()).map((p) => idOf(p.id)).sort()).toEqual(['p1', 'p2']);
  });

  test('the Post payload deletes only the post the written filter names', async () => {
    await client.db.PostRequired.deleteMany({ where: { NOT: { author: { posts: { some: { title: 'x' } } } } } });

    expect((await client.db.PostRequired.findMany()).map((p) => idOf(p.id)).sort()).toEqual(['p1', 'p2']);
    expect((await client.db.Author.findMany()).length).toBe(3);
  });

  describe('include where', () => {
    test('a reverse -> forward key on the included posts', async () => {
      const authors = await client.db.Author.findMany({
        include: { posts: { where: { author: { posts: { some: { title: 'x' } } } } } },
      });
      const byName = Object.fromEntries(authors.map((a) => [a.name, a.posts.map((p) => p.title).sort()]));

      expect(byName).toEqual({ Ann: ['x', 'z'], Bob: [], Cat: [] });
    });

    test('a NOT over a nested key on the included posts', async () => {
      const authors = await client.db.Author.findMany({
        include: { posts: { where: { NOT: { author: { posts: { some: { title: 'x' } } } } } } },
      });
      const byName = Object.fromEntries(authors.map((a) => [a.name, a.posts.map((p) => p.title).sort()]));

      expect(byName).toEqual({ Ann: [], Bob: ['y'], Cat: [] });
    });

    test('a nested key at the parent where, with an include beside it', async () => {
      const authors = await client.db.Author.findMany({
        where: { NOT: { posts: { some: { author: { name: 'Ann' } } } } },
        include: { posts: true },
      });

      expect(authors.map((a) => a.name).sort()).toEqual(['Bob', 'Cat']);
      expect(authors.find((a) => a.name === 'Bob')?.posts.map((p) => p.title)).toEqual(['y']);
    });
  });

  test('an unknown key at the inner level is refused and nothing is deleted', async () => {
    const bad = (where: unknown): never => where as never;

    for (const where of [
      { posts: { some: { author: { nmae: 'x' } } } },
      { posts: { some: { author: { posts: { some: { nmae: 'x' } } } } } },
      { NOT: { posts: { some: { author: { posts: { any: {} } } } } } },
    ]) {
      await expect((async () => await client.db.Author.deleteMany({ where: bad(where) }))()).rejects.toThrow();
      await expect((async () => await client.db.Author.findMany({ where: bad(where) }))()).rejects.toThrow();
    }
    expect(await client.db.Author.count()).toBe(3);
    expect(await client.db.PostRequired.count()).toBe(3);
  });
});
