/**
 * E2E: disconnect and set on the reverse side of a relation, against a live database
 *
 * The rows that point at the parent hold the foreign key. A disconnect unlinks only the rows it names that
 * point at the parent, `[]` changes nothing, and a set leaves exactly the named rows pointing at it. Each
 * case seeds several linked rows and asserts exactly which stay linked, so a statement that clears every
 * child of the parent fails it. Destructive calls come first in each group.
 *
 * - a single optional foreign key (Publisher.books over Book.publisherId)
 * - a required foreign key (Author.posts over PostRequired.authorId), which cannot be cleared
 * - a one-directional Record[] foreign key (WoTag.posts over WoPost.tagIds)
 */

import { describe, expect, test } from 'bun:test';
import { tables } from '../test-helper';
import { setupDataTypeTests } from '../data-types/test-factory';

const loose = (value: unknown): never => value as never;

describe('E2E: reverse-side disconnect and set', () => {
  const { getClient } = setupDataTypeTests([
    ...tables.oneToManyOptional,
    ...tables.oneToManyRequired,
    ...tables.whereOperandEdges,
  ]);

  describe('a single optional foreign key', () => {
    let p1: string;
    let p2: string;

    // p1 holds a, b, c and p2 holds d
    const seed = async (): Promise<void> => {
      const { db } = getClient();
      p1 = (await db.Publisher.create({ data: { name: 'p1' } })).id.toString();
      p2 = (await db.Publisher.create({ data: { name: 'p2' } })).id.toString();
      for (const [id, parent] of [
        ['a', 'p1'],
        ['b', 'p1'],
        ['c', 'p1'],
        ['d', 'p2'],
      ] as const)
        await db.Book.create({
          data: loose({ id, title: id, isbn: id, publisher: { connect: parent === 'p1' ? p1 : p2 } }),
        });
    };

    /** Which parent each book points at, by title */
    const links = async (): Promise<Record<string, string | null>> => {
      const books = await getClient().db.Book.findMany({ orderBy: { title: 'asc' } });

      return Object.fromEntries(
        books.map((b) => [b.title, b.publisherId ? (b.publisherId.toString() === p1 ? 'p1' : 'p2') : null]),
      );
    };
    const UNCHANGED = { a: 'p1', b: 'p1', c: 'p1', d: 'p2' };

    test('disconnecting one of three linked rows leaves the other two linked', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: ['a'] } }) });
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test('disconnecting a list unlinks exactly those rows', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({
        where: { id: p1 },
        data: loose({ books: { disconnect: ['a', 'c'] } }),
      });
      expect(await links()).toEqual({ a: null, b: 'p1', c: null, d: 'p2' });
    });

    test('a single id disconnects that row only', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: 'b' } }) });
      expect(await links()).toEqual({ a: 'p1', b: null, c: 'p1', d: 'p2' });
    });

    test('a row linked to another parent is not unlinked by this parent', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: ['d'] } }) });
      expect(await links()).toEqual(UNCHANGED);
    });

    test('a list mixing a linked row and another parent’s row unlinks only the first', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({
        where: { id: p1 },
        data: loose({ books: { disconnect: ['a', 'd'] } }),
      });
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test.each([[[]], [false]])('disconnect %j changes nothing', async (disconnect) => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect } }) });
      expect(await links()).toEqual(UNCHANGED);
    });

    test('true unlinks every child of this parent and none of another', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: true } }) });
      expect(await links()).toEqual({ a: null, b: null, c: null, d: 'p2' });
    });

    test('an id that names no row changes nothing', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({
        where: { id: p1 },
        data: loose({ books: { disconnect: ['nosuchbook'] } }),
      });
      expect(await links()).toEqual(UNCHANGED);
    });

    test('an id of another table is refused and nothing is unlinked', async () => {
      await seed();
      await expect(
        (async () => {
          await getClient().db.Publisher.updateUnique({
            where: { id: p1 },
            data: loose({ books: { disconnect: ['publisher:x'] } }),
          });
        })(),
      ).rejects.toThrow(/book/);
      expect(await links()).toEqual(UNCHANGED);
    });

    test('disconnect on updateMany unlinks only the named row', async () => {
      await seed();
      await getClient().db.Publisher.updateMany({
        where: { name: 'p1' },
        data: loose({ books: { disconnect: ['a'] } }),
      });
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test('disconnect on upsert unlinks only the named row', async () => {
      await seed();
      await getClient().db.Publisher.upsert({
        where: { id: p1 },
        create: { name: 'p1' },
        update: loose({ books: { disconnect: ['a'] } }),
      });
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test('disconnect inside an array transaction unlinks only the named row', async () => {
      await seed();
      const { db } = getClient();
      await getClient().$transaction([
        db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: ['a'] } }) }),
      ]);
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test('disconnect inside a callback transaction unlinks only the named row', async () => {
      await seed();
      await getClient().$transaction(async (tx) =>
        tx.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: ['a'] } }) }),
      );
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p2' });
    });

    test('a nullable key is cleared to null, so { publisherId: null } finds it', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { disconnect: ['a'] } }) });
      const orphans = await getClient().db.Book.findMany({ where: { publisherId: null } });
      expect(orphans.map((b) => b.title)).toEqual(['a']);
    });

    test('connect and disconnect in one write both apply', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({
        where: { id: p1 },
        data: loose({ books: { disconnect: ['a'], connect: ['d'] } }),
      });
      expect(await links()).toEqual({ a: null, b: 'p1', c: 'p1', d: 'p1' });
    });

    test('set leaves exactly the named rows linked and unlinks the other children', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { set: ['a'] } }) });
      expect(await links()).toEqual({ a: 'p1', b: null, c: null, d: 'p2' });
    });

    test('set takes a row from another parent, and leaves that parent’s others alone', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p2 }, data: loose({ books: { set: ['a'] } }) });
      expect(await links()).toEqual({ a: 'p2', b: 'p1', c: 'p1', d: null });
    });

    test('set with several rows, one of them new', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { set: ['b', 'd'] } }) });
      expect(await links()).toEqual({ a: null, b: 'p1', c: null, d: 'p1' });
    });

    test('set to the rows already linked changes nothing', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({
        where: { id: p1 },
        data: loose({ books: { set: ['a', 'b', 'c'] } }),
      });
      expect(await links()).toEqual(UNCHANGED);
    });

    test('an empty set unlinks every child of this parent and no other', async () => {
      await seed();
      await getClient().db.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { set: [] } }) });
      expect(await links()).toEqual({ a: null, b: null, c: null, d: 'p2' });
    });

    test('set naming a row that does not exist is refused and changes nothing', async () => {
      await seed();
      await expect(
        (async () => {
          await getClient().db.Publisher.updateUnique({
            where: { id: p1 },
            data: loose({ books: { set: ['a', 'nosuchbook'] } }),
          });
        })(),
      ).rejects.toThrow(/nosuchbook/);
      expect(await links()).toEqual(UNCHANGED);
    });

    test('set on updateMany and inside a transaction behaves the same', async () => {
      await seed();
      await getClient().db.Publisher.updateMany({ where: { name: 'p1' }, data: loose({ books: { set: ['a'] } }) });
      expect(await links()).toEqual({ a: 'p1', b: null, c: null, d: 'p2' });
      await getClient().$transaction(async (tx) =>
        tx.Publisher.updateUnique({ where: { id: p1 }, data: loose({ books: { set: ['b'] } }) }),
      );
      expect(await links()).toEqual({ a: null, b: 'p1', c: null, d: 'p2' });
    });
  });

  describe('a required foreign key cannot be cleared', () => {
    let a1: string;

    const seed = async (): Promise<void> => {
      const { db } = getClient();
      a1 = (await db.Author.create({ data: { name: 'a1', email: 'a1@x.co' } })).id.toString();
      const a2 = (await db.Author.create({ data: { name: 'a2', email: 'a2@x.co' } })).id.toString();
      for (const [id, owner] of [
        ['x', a1],
        ['y', a1],
        ['z', a2],
      ] as const)
        await db.PostRequired.create({ data: loose({ id, title: id, author: { connect: owner } }) });
    };
    const owners = async (): Promise<Array<[string, string]>> =>
      (await getClient().db.PostRequired.findMany({ orderBy: { title: 'asc' } })).map((p) => [
        p.title,
        p.authorId.toString() === a1 ? 'a1' : 'a2',
      ]);
    const UNCHANGED: Array<[string, string]> = [
      ['x', 'a1'],
      ['y', 'a1'],
      ['z', 'a2'],
    ];

    test('disconnecting a linked row is refused, naming the field, and nothing changes', async () => {
      await seed();
      await expect(
        (async () => {
          await getClient().db.Author.updateUnique({
            where: { id: a1 },
            data: loose({ posts: { disconnect: ['x'] } }),
          });
        })(),
      ).rejects.toThrow(/authorId/);
      expect(await owners()).toEqual(UNCHANGED);
    });

    test('an empty set that would unlink every post is refused and nothing changes', async () => {
      await seed();
      await expect(
        (async () => {
          await getClient().db.Author.updateUnique({ where: { id: a1 }, data: loose({ posts: { set: [] } }) });
        })(),
      ).rejects.toThrow(/authorId/);
      expect(await owners()).toEqual(UNCHANGED);
    });

    test('a set that would leave a post unlinked is refused and nothing changes', async () => {
      await seed();
      await expect(
        (async () => {
          await getClient().db.Author.updateUnique({ where: { id: a1 }, data: loose({ posts: { set: ['x', 'z'] } }) });
        })(),
      ).rejects.toThrow(/authorId/);
      expect(await owners()).toEqual(UNCHANGED);
    });

    test('disconnecting a row linked to another author changes nothing and is not refused', async () => {
      await seed();
      await getClient().db.Author.updateUnique({ where: { id: a1 }, data: loose({ posts: { disconnect: ['z'] } }) });
      expect(await owners()).toEqual(UNCHANGED);
    });

    test('disconnect [] changes nothing', async () => {
      await seed();
      await getClient().db.Author.updateUnique({ where: { id: a1 }, data: loose({ posts: { disconnect: [] } }) });
      expect(await owners()).toEqual(UNCHANGED);
    });

    test('a set that moves a post from another author, and leaves none dangling, is accepted', async () => {
      await seed();
      await getClient().db.Author.updateUnique({
        where: { id: a1 },
        data: loose({ posts: { set: ['x', 'y', 'z'] } }),
      });
      expect(await owners()).toEqual([
        ['x', 'a1'],
        ['y', 'a1'],
        ['z', 'a1'],
      ]);
    });
  });

  describe('a one-directional Record[] foreign key', () => {
    // posts qa [t1, t2], qb [t1, t3], qc [t2], qd [t3]; the tag side is the reverse relation
    const seed = async (): Promise<void> => {
      const { db } = getClient();
      for (const id of ['t1', 't2', 't3']) await db.WoTag.create({ data: loose({ id, name: id }) });
      for (const [name, tags] of [
        ['qa', ['t1', 't2']],
        ['qb', ['t1', 't3']],
        ['qc', ['t2']],
        ['qd', ['t3']],
      ] as const)
        await db.WoPost.create({ data: loose({ name, tagIds: [], tags: { connect: tags } }) });
    };
    const tagsOf = async (): Promise<Record<string, string[]>> => {
      const posts = await getClient().db.WoPost.findMany({ orderBy: { name: 'asc' } });

      return Object.fromEntries(
        posts.map((p) => [p.name, p.tagIds.map((t) => t.toString().replace('wo_tag:', '')).sort()]),
      );
    };
    const UNCHANGED = { qa: ['t1', 't2'], qb: ['t1', 't3'], qc: ['t2'], qd: ['t3'] };
    const postIds = async (...names: string[]): Promise<string[]> =>
      (await getClient().db.WoPost.findMany({ where: { name: { in: names } }, orderBy: { name: 'asc' } })).map((p) =>
        p.id.toString(),
      );

    test('disconnecting one post removes the tag from it and from no other', async () => {
      await seed();
      const [qa] = await postIds('qa');
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { disconnect: [qa] } }) });
      expect(await tagsOf()).toEqual({ qa: ['t2'], qb: ['t1', 't3'], qc: ['t2'], qd: ['t3'] });
    });

    test('disconnecting a post that does not hold the tag changes nothing', async () => {
      await seed();
      const [qc] = await postIds('qc');
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { disconnect: [qc] } }) });
      expect(await tagsOf()).toEqual(UNCHANGED);
    });

    test('disconnect [] and a single id behave as on a single key', async () => {
      await seed();
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { disconnect: [] } }) });
      expect(await tagsOf()).toEqual(UNCHANGED);
      const [qb] = await postIds('qb');
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { disconnect: qb } }) });
      expect(await tagsOf()).toEqual({ qa: ['t1', 't2'], qb: ['t3'], qc: ['t2'], qd: ['t3'] });
    });

    test('set leaves the tag on exactly the named posts and keeps every other tag', async () => {
      await seed();
      const [qc] = await postIds('qc');
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { set: [qc] } }) });
      expect(await tagsOf()).toEqual({ qa: ['t2'], qb: ['t3'], qc: ['t1', 't2'], qd: ['t3'] });
    });

    test('set to the posts that already hold the tag changes nothing, and adds no duplicate', async () => {
      await seed();
      const named = await postIds('qa', 'qb');
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { set: named } }) });
      expect(await tagsOf()).toEqual(UNCHANGED);
    });

    test('an empty set removes the tag from every post and no other tag', async () => {
      await seed();
      await getClient().db.WoTag.updateUnique({ where: { id: 't1' }, data: loose({ posts: { set: [] } }) });
      expect(await tagsOf()).toEqual({ qa: ['t2'], qb: ['t3'], qc: ['t2'], qd: ['t3'] });
    });

    test('include returns the posts that hold the tag', async () => {
      await seed();
      const tag = await getClient().db.WoTag.findOne({ where: { id: 't1' }, include: { posts: true } });
      expect(tag?.posts.map((p) => p.name).sort()).toEqual(['qa', 'qb']);
      const none = await getClient().db.WoTag.findMany({ include: { posts: true }, orderBy: { name: 'asc' } });
      expect(none.map((t) => [t.name, t.posts.map((p) => p.name).sort()])).toEqual([
        ['t1', ['qa', 'qb']],
        ['t2', ['qa', 'qc']],
        ['t3', ['qb', 'qd']],
      ]);
    });

    test('include filters, orders and limits the posts it returns', async () => {
      await seed();
      const tag = await getClient().db.WoTag.findOne({
        where: { id: 't1' },
        include: { posts: { where: { name: { neq: 'qa' } }, orderBy: { name: 'desc' }, limit: 5 } },
      });
      expect(tag?.posts.map((p) => p.name)).toEqual(['qb']);
    });

    test('include reflects a disconnect made by the same call', async () => {
      await seed();
      const [qa] = await postIds('qa');
      const tag = await getClient().db.WoTag.updateUnique({
        where: { id: 't1' },
        data: loose({ posts: { disconnect: [qa] } }),
        include: { posts: true },
      });
      const written: unknown = tag;
      expect((written as { posts: Array<{ name: string }> }).posts.map((p) => p.name)).toEqual(['qb']);
    });
  });
});
