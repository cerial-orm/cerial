/**
 * E2E Tests: the `$raw` where key
 *
 * Destructive refusals first: a `$raw` key holding `undefined` must refuse and leave every row, because the
 * condition builder would otherwise skip it and `deleteMany({ where: { isActive: false } })` would run.
 * Then filter semantics with precedence, on every method that takes a where, a cascading delete and an
 * array `$transaction` item.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core, ...tables.oneToManyCascade];

describe('E2E $raw filter', () => {
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
    for (const data of [
      { email: 'a@x.test', name: 'Ann', isActive: false, age: 20 },
      { email: 'b@x.test', name: 'Bob', isActive: false, age: 40 },
      { email: 'c@x.test', name: 'Cy', isActive: true, age: 40 },
      { email: 'd@x.test', name: 'Di', isActive: true, age: 60 },
    ])
      await client.db.User.create({ data });
  });

  const names = async (where?: object): Promise<string[]> =>
    (await client.db.User.findMany({ where: where as never, orderBy: { name: 'asc' } })).map((u) => u.name);

  // CerialQueryPromise is a thenable, not a Promise, so it is awaited inside a real one
  const refuses = async (run: () => PromiseLike<unknown>): Promise<void> => {
    await expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(CerialValidationError);
  };

  // A conditional fragment that came out undefined, as `cond ? sql`...` : undefined` does
  const maybe = (cond: boolean) => (cond ? sql`age > ${30}` : undefined);

  describe('undefined refuses and nothing is deleted or changed', () => {
    test('deleteMany at the top level', async () => {
      await refuses(() => client.db.User.deleteMany({ where: { isActive: false, $raw: maybe(false) } }));

      expect(await client.db.User.count()).toBe(4);
    });

    test('deleteMany inside OR', async () => {
      await refuses(() => client.db.User.deleteMany({ where: { OR: [{ isActive: false }, { $raw: maybe(false) }] } }));

      expect(await client.db.User.count()).toBe(4);
    });

    test('updateMany changes nothing', async () => {
      await refuses(() =>
        client.db.User.updateMany({ where: { isActive: false, $raw: maybe(false) }, data: { name: 'X' } }),
      );

      expect(await names()).toEqual(['Ann', 'Bob', 'Cy', 'Di']);
    });

    test('reads refuse too', async () => {
      const where = { isActive: false, $raw: maybe(false) };

      await refuses(() => client.db.User.findMany({ where }));
      await refuses(() => client.db.User.count(where));
    });

    test('include where, top level and under OR', async () => {
      await client.db.User.create({
        data: { email: 'e@x.test', name: 'Ed', isActive: true, posts: { create: [{ title: 'p1' }] } },
      });

      await refuses(() => client.db.User.findMany({ include: { posts: { where: { $raw: maybe(false) } } } }));
      await refuses(() =>
        client.db.User.findMany({ include: { posts: { where: { OR: [{ title: 'p1' }, { $raw: maybe(false) }] } } } }),
      );
    });

    test('an array $transaction item refuses and the earlier item does not commit', async () => {
      await refuses(() =>
        client.$transaction([
          client.db.User.create({ data: { email: 'z@x.test', name: 'Zed', isActive: true } }),
          client.db.User.deleteMany({ where: { $raw: maybe(false) } }),
        ]),
      );

      expect(await client.db.User.count()).toBe(4);
    });
  });

  describe('a forged $raw refuses', () => {
    test('a string never runs as text', async () => {
      const where = JSON.parse('{"isActive":false,"$raw":"true"}');

      await refuses(() => client.db.User.deleteMany({ where }));
      expect(await client.db.User.count()).toBe(4);
    });

    test('a relation filter refuses a real fragment', async () => {
      await refuses(() => client.db.Post.findMany({ where: { author: { $raw: sql`true` } } as never }));
      await refuses(() => client.db.User.findMany({ where: { posts: { some: { $raw: sql`true` } } } as never }));
    });
  });

  describe('a fragment filters with the right precedence', () => {
    test('findMany: the fragment is grouped, so its own OR does not leak', async () => {
      // Without the grouping this reads isActive = false AND age = 20 OR age = 60
      const found = await names({ isActive: false, $raw: sql`age = ${20} OR age = ${60}` });

      expect(found).toEqual(['Ann']);
    });

    test('OR beside a top-level key', async () => {
      const found = await names({ isActive: true, OR: [{ name: 'Cy' }, { $raw: sql`age = ${60}` }] });

      expect(found).toEqual(['Cy', 'Di']);
    });

    test('NOT and AND at depth', async () => {
      expect(await names({ AND: [{ NOT: { $raw: sql`age = ${40}` } }] })).toEqual(['Ann', 'Di']);
    });

    test('a conditional fragment that is present narrows the result', async () => {
      expect(await names({ isActive: true, $raw: maybe(true) })).toEqual(['Cy', 'Di']);
    });

    test('findOne', async () => {
      const user = await client.db.User.findOne({ where: { $raw: sql`age = ${60}` } });

      expect(user?.name).toBe('Di');
    });

    test('count and exists', async () => {
      expect(await client.db.User.count({ $raw: sql`age = ${40}` })).toBe(2);
      expect(await client.db.User.exists({ $raw: sql`age = ${99}` })).toBe(false);
      expect(await client.db.User.exists({ $raw: sql`age = ${20}` })).toBe(true);
    });

    test('updateMany touches only the matching rows', async () => {
      await client.db.User.updateMany({ where: { isActive: false, $raw: sql`age > ${30}` }, data: { name: 'Bobby' } });

      expect(await names()).toEqual(['Ann', 'Bobby', 'Cy', 'Di']);
    });

    test('deleteMany deletes only the matching rows', async () => {
      await client.db.User.deleteMany({ where: { isActive: false, $raw: sql`age = ${20} OR age = ${60}` } });

      expect(await names()).toEqual(['Bob', 'Cy', 'Di']);
    });

    test('deleteMany with a true fragment hits every row, as stated', async () => {
      await client.db.User.deleteMany({ where: { $raw: sql`true` } });

      expect(await client.db.User.count()).toBe(0);
    });

    test('an array $transaction item binds its own fragment variables', async () => {
      await client.$transaction([
        client.db.User.deleteMany({ where: { $raw: sql`age = ${20}` } }),
        client.db.User.deleteMany({ where: { $raw: sql`age = ${60}` } }),
      ]);

      expect(await names()).toEqual(['Bob', 'Cy']);
    });
  });

  describe('include where', () => {
    beforeEach(async () => {
      await client.db.User.create({
        data: {
          email: 'e@x.test',
          name: 'Ed',
          isActive: true,
          posts: { create: [{ title: 'p1' }, { title: 'p2' }, { title: 'p3' }] },
        },
      });
    });

    const titles = async (where: object): Promise<string[]> => {
      const ed = await client.db.User.findOne({
        where: { name: 'Ed' },
        include: { posts: { where: where as never } },
      });

      return (ed?.posts ?? []).map((p) => p.title).sort();
    };

    test('a fragment filters the included rows', async () => {
      expect(await titles({ $raw: sql`title = ${'p2'}` })).toEqual(['p2']);
    });

    test('OR, NOT and AND depth inside the include, beside the top-level filter', async () => {
      expect(await titles({ OR: [{ title: 'p1' }, { $raw: sql`title = ${'p3'}` }] })).toEqual(['p1', 'p3']);
      expect(await titles({ AND: [{ NOT: { $raw: sql`title = ${'p1'}` } }] })).toEqual(['p2', 'p3']);
    });

    test('a nested include carries the fragment too', async () => {
      const ed = await client.db.User.findOne({
        where: { $raw: sql`name = ${'Ed'}` },
        include: { posts: { where: { $raw: sql`title = ${'p1'}` }, include: { author: true } } },
      });

      expect(ed?.posts.map((p) => p.title)).toEqual(['p1']);
      expect(ed?.posts[0]?.author?.name).toBe('Ed');
    });
  });

  describe('cascading deleteMany', () => {
    test('every statement of the multi-statement delete resolves the fragment variable', async () => {
      const team = await client.db.Team.create({
        data: { name: 'T1', members: { create: [{ name: 'm1' }, { name: 'm2' }] } },
      });
      await client.db.Team.create({ data: { name: 'T2', members: { create: [{ name: 'm3' }] } } });

      await client.db.Team.deleteMany({ where: { $raw: sql`name = ${'T1'}` } });

      expect(await client.db.Team.findOne({ where: { id: team.id } })).toBeNull();
      expect((await client.db.Member.findMany()).map((m) => m.name)).toEqual(['m3']);
    });

    test('an undefined $raw deletes neither the team nor its members', async () => {
      await client.db.Team.create({ data: { name: 'T1', members: { create: [{ name: 'm1' }] } } });

      await refuses(() => client.db.Team.deleteMany({ where: { name: 'T1', $raw: maybe(false) } }));

      expect(await client.db.Team.count()).toBe(1);
      expect(await client.db.Member.count()).toBe(1);
    });
  });
});
