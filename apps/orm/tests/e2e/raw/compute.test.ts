/**
 * E2E Tests: the `compute` option
 *
 * Refusals run first against live rows and end by counting them again. Then the projection on findMany,
 * findOne and findUnique (by id and by unique field), with select, include, paging and a relation sort, and
 * sorting on a compute key. A hostile value is bound as data and a hostile key never reaches the query.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId, CerialValidationError, sql } from 'cerial';
import type { User } from '../generated';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

describe('E2E compute', () => {
  let client: CerialClient;
  let ann: User;
  let bob: User;

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
    ann = (await client.db.User.create({ data: { email: 'a@x.test', name: 'Ann', isActive: true, age: 20 } })) as never;
    bob = (await client.db.User.create({ data: { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 } })) as never;
    for (const [title, authorId] of [
      ['a', ann.id],
      ['bbb', bob.id],
      ['cc', ann.id],
      ['dddd', bob.id],
      ['eeeee', ann.id],
    ] as const)
      await client.db.Post.create({ data: { title, authorId } });
  });

  const refuses = async (run: () => PromiseLike<unknown>): Promise<void> => {
    await expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(CerialValidationError);
  };

  const intact = async (): Promise<void> => {
    expect(await client.db.Post.count()).toBe(5);
    expect(await client.db.User.count()).toBe(2);
  };

  describe('refusals leave every row in place', () => {
    const keys: Array<[string, string]> = [
      ['a statement in the key', 'a; DELETE post'],
      ['a backtick', 'a`b'],
      ['a field name', 'title'],
      ['the id', 'id'],
      ['a relation', 'author'],
      ['the internal prefix', '__cerial_ord_0'],
    ];

    test.each(keys)('findMany with %s as the key', async (_label, key) => {
      await refuses(() => client.db.Post.findMany({ compute: { [key]: sql`1` } } as never));
      await intact();
    });

    test('an unbranded value, as a request body would carry it', async () => {
      await refuses(() => client.db.Post.findMany({ compute: JSON.parse('{"s":"1; DELETE post"}') }));
      await intact();
    });

    test('an empty compute', async () => {
      await refuses(() => client.db.Post.findMany({ compute: {} }));
      await intact();
    });

    test('compute on every write method', async () => {
      const compute = { s: sql`1` };
      const where = { id: bob.id };
      const writes: Array<() => PromiseLike<unknown>> = [
        () => client.db.Post.create({ data: { title: 'z', authorId: ann.id }, compute } as never),
        () => client.db.Post.updateMany({ where: { title: 'a' }, data: { title: 'q' }, compute } as never),
        () => client.db.User.updateUnique({ where, data: { name: 'Q' }, compute } as never),
        () => client.db.Post.deleteMany({ where: { title: 'a' }, compute } as never),
        () => client.db.User.deleteUnique({ where, compute } as never),
        () =>
          client.db.User.upsert({
            where: { email: 'a@x.test' },
            create: { email: 'n@x.test', name: 'N', isActive: true },
            update: { name: 'Q' },
            compute,
          } as never),
      ];

      for (const write of writes) await refuses(write);
      await intact();
      expect((await client.db.Post.findMany({ where: { title: 'a' } })).length).toBe(1);
      expect((await client.db.User.findMany({ orderBy: { name: 'asc' } })).map((u) => u.name)).toEqual(['Ann', 'Bob']);
    });

    test('compute inside an include option', async () => {
      await refuses(() => client.db.Post.findMany({ include: { author: { compute: { s: sql`1` } } } } as never));
      await intact();
    });

    test('orderBy on a compute key with a sub-object, and on a key compute lacks', async () => {
      await expect(
        (async () => {
          await client.db.Post.findMany({ compute: { s: sql`1` }, orderBy: { s: { x: 'asc' } } } as never);
        })(),
      ).rejects.toThrow(CerialValidationError);
      await expect(
        (async () => {
          await client.db.Post.findMany({ orderBy: { s: 'asc' } } as never);
        })(),
      ).rejects.toThrow(/Unknown field 's'/);
      await intact();
    });
  });

  describe('hostile values are data', () => {
    test('a statement in a bound value is stored nowhere and the rows stay', async () => {
      const payload = 'x; DELETE post; SELECT 1';
      const rows = await client.db.Post.findMany({ compute: { echoed: sql<string>`${payload}` } });

      expect(rows.length).toBe(5);
      expect(rows.every((r) => r.echoed === payload)).toBe(true);
      await intact();
    });
  });

  describe('projection', () => {
    test('adds the key beside every stored field', async () => {
      const rows = await client.db.Post.findMany({
        compute: { len: sql<number>`string::len(title)` },
        orderBy: { title: 'asc' },
      });

      expect(rows.map((r) => [r.title, r.len])).toEqual([
        ['a', 1],
        ['bbb', 3],
        ['cc', 2],
        ['dddd', 4],
        ['eeeee', 5],
      ]);
      expect(rows[0]!.id).toBeInstanceOf(CerialId);
      expect(rows[0]!.authorId).toBeInstanceOf(CerialId);
    });

    test('binds a value, nested fragments included', async () => {
      const rows = await client.db.Post.findMany({
        compute: { shifted: sql<number>`string::len(title) + ${sql`${10}`}` },
        where: { title: 'bbb' },
      });

      expect(rows.map((r) => r.shifted)).toEqual([13]);
    });

    test('a keyword as the key', async () => {
      const rows = await client.db.Post.findMany({ compute: { true: sql`1` }, where: { title: 'a' } } as never);

      expect((rows[0] as unknown as Record<string, unknown>).true).toBe(1);
    });

    test('with select, only the selected fields and the key come back', async () => {
      const rows = await client.db.Post.findMany({
        select: { title: true },
        compute: { len: sql<number>`string::len(title)` },
        where: { title: 'cc' },
      });

      expect(rows).toEqual([{ title: 'cc', len: 2 }] as never);
    });

    test('a record id in a compute key is mapped to a CerialId', async () => {
      const rows = await client.db.Post.findMany({
        select: { title: true },
        compute: { owner: sql`authorId` },
        where: { title: 'a' },
      });

      expect(rows[0]!.owner).toBeInstanceOf(CerialId);
      expect((rows[0]!.owner as CerialId).equals(ann.id)).toBe(true);
    });

    test('with include', async () => {
      const rows = await client.db.Post.findMany({
        compute: { len: sql<number>`string::len(title)` },
        include: { author: true },
        where: { title: 'dddd' },
      });

      expect(rows[0]!.len).toBe(4);
      expect(rows[0]!.author.name).toBe('Bob');
    });

    test('a $raw filter and a compute together keep their own bindings', async () => {
      const rows = await client.db.Post.findMany({
        where: { $raw: sql`string::len(title) > ${2}` },
        compute: { len: sql<number>`string::len(title) * ${1}` },
        include: { author: { where: { $raw: sql`age > ${30}` } } },
        orderBy: { title: 'asc' },
      });

      expect(rows.map((r) => [r.title, r.len])).toEqual([
        ['bbb', 3],
        ['dddd', 4],
        ['eeeee', 5],
      ]);
    });

    test('findOne', async () => {
      const row = await client.db.Post.findOne({
        where: { title: 'eeeee' },
        compute: { len: sql<number>`string::len(title)` },
      });

      expect(row?.len).toBe(5);
    });

    test('findOne with nothing matching is null', async () => {
      expect(await client.db.Post.findOne({ where: { title: 'none' }, compute: { len: sql`1` } })).toBeNull();
    });

    test('findUnique by id', async () => {
      const post = (await client.db.Post.findOne({ where: { title: 'cc' } }))!;
      const row = await client.db.Post.findUnique({
        where: { id: post.id },
        compute: { len: sql<number>`string::len(title)` },
      });

      expect(row?.title).toBe('cc');
      expect(row?.len).toBe(2);
    });

    test('findUnique by a unique field', async () => {
      const row = await client.db.User.findUnique({
        where: { email: 'b@x.test' },
        compute: { doubled: sql<number>`age * ${2}` },
      });

      expect(row?.name).toBe('Bob');
      expect(row?.doubled).toBe(80);
    });

    test('findUnique with a compute key and a select', async () => {
      const row = await client.db.User.findUnique({
        where: { email: 'a@x.test' },
        select: { name: true },
        compute: { doubled: sql<number>`age * ${2}` },
      });

      expect(row).toEqual({ name: 'Ann', doubled: 40 } as never);
    });

    test('findMany with no compute reads as before', async () => {
      const rows = await client.db.Post.findMany({ orderBy: { title: 'asc' } });

      expect(rows.length).toBe(5);
      expect('len' in rows[0]!).toBe(false);
    });
  });

  describe('sorting on a compute key', () => {
    const len = { len: sql<number>`string::len(title)` };
    const titles = (rows: Array<{ title: string }>): string[] => rows.map((r) => r.title);

    test('descending', async () => {
      expect(titles(await client.db.Post.findMany({ compute: len, orderBy: { len: 'desc' } }))).toEqual([
        'eeeee',
        'dddd',
        'bbb',
        'cc',
        'a',
      ]);
    });

    test('ascending', async () => {
      expect(titles(await client.db.Post.findMany({ compute: len, orderBy: { len: 'asc' } }))).toEqual([
        'a',
        'cc',
        'bbb',
        'dddd',
        'eeeee',
      ]);
    });

    test('paging follows the sort', async () => {
      const page = await client.db.Post.findMany({ compute: len, orderBy: { len: 'desc' }, limit: 2, offset: 1 });

      expect(titles(page)).toEqual(['dddd', 'bbb']);
    });

    test('a computed distance from a bound target', async () => {
      const rows = await client.db.Post.findMany({
        compute: { gap: sql<number>`math::abs(string::len(title) - ${3})` },
        orderBy: { gap: 'asc', title: 'asc' },
      });

      expect(titles(rows)).toEqual(['bbb', 'cc', 'dddd', 'a', 'eeeee']);
    });

    test('beside a stored field in the same orderBy', async () => {
      const rows = await client.db.Post.findMany({
        compute: { parity: sql<number>`string::len(title) % 2` },
        orderBy: { parity: 'asc', title: 'desc' },
      });

      expect(titles(rows)).toEqual(['dddd', 'cc', 'eeeee', 'bbb', 'a']);
    });

    test('with a relation sort, paging after both', async () => {
      const rows = await client.db.Post.findMany({
        compute: len,
        orderBy: { author: { name: 'asc' }, len: 'desc' },
        limit: 3,
        offset: 1,
      });

      expect(rows.map((r) => [r.title, r.len])).toEqual([
        ['cc', 2],
        ['a', 1],
        ['dddd', 4],
      ]);
      expect(Object.keys(rows[0]!).some((k) => k.startsWith('__cerial_'))).toBe(false);
    });

    test('with select and include', async () => {
      const rows = await client.db.Post.findMany({
        select: { title: true },
        compute: len,
        include: { author: true },
        orderBy: { len: 'desc' },
        limit: 2,
      });

      expect(rows.map((r) => [r.title, r.len, r.author.name])).toEqual([
        ['eeeee', 5, 'Ann'],
        ['dddd', 4, 'Bob'],
      ]);
    });

    test('findOne takes the first of the sort', async () => {
      const row = await client.db.Post.findOne({ compute: len, orderBy: { len: 'desc' } });

      expect(row?.title).toBe('eeeee');
    });
  });
});
