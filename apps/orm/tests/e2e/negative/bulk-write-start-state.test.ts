/**
 * E2E Tests: a bulk write reaches exactly the rows its filter selects at the start
 *
 * SurrealDB re-runs a WHERE subquery for each row against the table as it is being written. A relation
 * filter that reads the written table (a reverse relation, a self relation) then saw earlier rows already
 * deleted or changed: `deleteMany` with `author.posts.every` removed a row the filter never selected, and
 * `updateMany` whose data changes the field the filter reads skipped rows it had selected.
 *
 * Each case asserts the exact rows the same filter selects through findMany before the write, then the rows
 * the write reached, through a direct call and all three `$transaction` modes. The positive cases keep the
 * ordinary results, counts, return shapes and cascades unchanged.
 *
 * Schemas: one-to-many (Author, PostRequired), self-referential (EmployeeWithReports)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CerialQueryPromise } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ALL_TABLES = [...tables.oneToManyRequired, ...tables.selfRefOneToManyWithReverse];

type Mode = 'direct' | 'array' | 'callback' | 'manual';
const MODES: readonly Mode[] = ['direct', 'array', 'callback', 'manual'];

type Models = Pick<CerialClient['db'], 'Author' | 'PostRequired' | 'EmployeeWithReports'>;

/** The bare id of a row (`p1`), without the table prefix or the angle brackets of a complex id */
const idOf = (id: { toString(): string }): string =>
  id
    .toString()
    .replace(/^[^:]+:⟨?/, '')
    .replace(/⟩$/, '');

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

describe('Bulk writes select their rows first — negative and positive cases', () => {
  let client: CerialClient;

  /**
   * Runs one write the way `mode` runs it. Array mode takes the query promise itself and the others run it
   * inside their transaction, so one `write` serves every mode.
   */
  async function run<T>(mode: Mode, write: (models: Models) => CerialQueryPromise<T>): Promise<T> {
    if (mode === 'direct') return write(client.db);
    if (mode === 'array') {
      const [result] = await client.$transaction([write(client.db)]);

      return result;
    }
    if (mode === 'callback') return client.$transaction(async (tx) => write(tx));

    const txn = await client.$transaction();
    try {
      const result = await write(txn);
      await txn.commit();

      return result;
    } catch (error) {
      await txn.cancel();
      throw error;
    }
  }

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
  });

  /** Ann owns the posts in `ann`, Bob the posts in `bob`; a post is [id, title] */
  async function seedPosts(
    ann: ReadonlyArray<readonly [string, string]>,
    bob: ReadonlyArray<readonly [string, string]>,
  ) {
    await client.db.Author.create({ data: { id: 'a-ann', name: 'Ann', email: 'ann@x.test' } });
    await client.db.Author.create({ data: { id: 'a-bob', name: 'Bob', email: 'bob@x.test' } });
    for (const [id, title] of ann) await client.db.PostRequired.create({ data: { id, title, authorId: 'a-ann' } });
    for (const [id, title] of bob) await client.db.PostRequired.create({ data: { id, title, authorId: 'a-bob' } });
  }

  const postIds = async (): Promise<string[]> =>
    sorted((await client.db.PostRequired.findMany()).map((r) => idOf(r.id)));
  const titles = async (): Promise<Record<string, string>> =>
    Object.fromEntries((await client.db.PostRequired.findMany()).map((r) => [idOf(r.id), r.title]));

  describe.each(MODES)('deleteMany, %s', (mode) => {
    // p1 'bad' and p3 'ok' are selected. Ann's p2 'ok' is not: Ann's posts are not all 'ok' at the start.
    // Deleting p1 first would leave Ann with only 'ok' posts and select p2 too
    const payload = {
      OR: [{ title: 'bad' }, { author: { posts: { every: { title: 'ok' } } } }],
    };

    test('the measured payload deletes the rows the filter selects, not the rows it would select afterwards', async () => {
      await seedPosts(
        [
          ['p1', 'bad'],
          ['p2', 'ok'],
        ],
        [['p3', 'ok']],
      );
      const selected = sorted((await client.db.PostRequired.findMany({ where: payload })).map((r) => idOf(r.id)));
      expect(selected).toEqual(['p1', 'p3']);

      const count = await run(mode, (m) => m.PostRequired.deleteMany({ where: payload }));

      expect(count).toBe(2);
      expect(await postIds()).toEqual(['p2']);
    });

    test('a direct relation filter on the written table deletes every row it selects', async () => {
      await seedPosts(
        [
          ['p1', 'x'],
          ['p2', 'z'],
        ],
        [['p3', 'y']],
      );
      const where = { author: { posts: { some: { title: 'x' } } } };
      expect(sorted((await client.db.PostRequired.findMany({ where })).map((r) => idOf(r.id)))).toEqual(['p1', 'p2']);

      const count = await run(mode, (m) => m.PostRequired.deleteMany({ where }));

      expect(count).toBe(2);
      expect(await postIds()).toEqual(['p3']);
    });

    test('a filter that selects nothing deletes nothing and returns 0', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const count = await run(mode, (m) => m.PostRequired.deleteMany({ where: { title: 'missing' } }));

      expect(count).toBe(0);
      expect(await postIds()).toEqual(['p1', 'p3']);
    });

    test('an ordinary field filter deletes the matching rows and returns their count', async () => {
      await seedPosts(
        [
          ['p1', 'x'],
          ['p2', 'x'],
        ],
        [['p3', 'y']],
      );

      const count = await run(mode, (m) => m.PostRequired.deleteMany({ where: { title: 'x' } }));

      expect(count).toBe(2);
      expect(await postIds()).toEqual(['p3']);
    });

    test('no where deletes every row', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const count = await run(mode, (m) => m.PostRequired.deleteMany({ where: {} }));

      expect(count).toBe(2);
      expect(await postIds()).toEqual([]);
    });

    test('a cascade still removes the children of the rows the filter selects', async () => {
      await seedPosts(
        [
          ['p1', 'bad'],
          ['p2', 'ok'],
        ],
        [['p3', 'ok']],
      );

      const count = await run(mode, (m) => m.Author.deleteMany({ where: { posts: { some: { title: 'bad' } } } }));

      expect(count).toBe(1);
      expect((await client.db.Author.findMany()).map((r) => idOf(r.id))).toEqual(['a-bob']);
      expect(await postIds()).toEqual(['p3']);
    });

    test('a self relation deletes the rows the filter selects at the start', async () => {
      const { a, b, c } = await seedEmployees();
      const where = { manager: { directReports: { some: { name: 'x' } } } };
      expect(sorted((await client.db.EmployeeWithReports.findMany({ where })).map((r) => idOf(r.id)))).toEqual(
        sorted([idOf(b), idOf(c)]),
      );

      const count = await run(mode, (m) => m.EmployeeWithReports.deleteMany({ where }));

      expect(count).toBe(2);
      expect((await client.db.EmployeeWithReports.findMany()).map((r) => idOf(r.id))).toEqual([idOf(a)]);
    });
  });

  describe.each(MODES)('updateMany, %s', (mode) => {
    test('data that changes the filtered field still reaches every row the filter selected', async () => {
      await seedPosts(
        [
          ['p1', 'x'],
          ['p2', 'w'],
        ],
        [['p3', 'w']],
      );
      const where = { author: { posts: { some: { title: 'x' } } } };
      expect(sorted((await client.db.PostRequired.findMany({ where })).map((r) => idOf(r.id)))).toEqual(['p1', 'p2']);

      const rows = await run(mode, (m) => m.PostRequired.updateMany({ where, data: { title: 'z' } }));

      expect(sorted(rows.map((r) => idOf(r.id)))).toEqual(['p1', 'p2']);
      expect(rows.every((r) => r.title === 'z')).toBe(true);
      expect(await titles()).toEqual({ p1: 'z', p2: 'z', p3: 'w' });
    });

    test('a self relation updates the rows the filter selects at the start', async () => {
      const { a, b, c } = await seedEmployees();
      const where = { manager: { directReports: { some: { name: 'x' } } } };

      const rows = await run(mode, (m) => m.EmployeeWithReports.updateMany({ where, data: { name: 'z' } }));

      expect(sorted(rows.map((r) => idOf(r.id)))).toEqual(sorted([idOf(b), idOf(c)]));
      const names = Object.fromEntries(
        (await client.db.EmployeeWithReports.findMany()).map((r) => [idOf(r.id), r.name]),
      );
      expect(names).toEqual({ [idOf(a)]: 'boss', [idOf(b)]: 'z', [idOf(c)]: 'z' });
    });

    test('an ordinary filter returns the updated rows and leaves the others', async () => {
      await seedPosts(
        [
          ['p1', 'x'],
          ['p2', 'x'],
        ],
        [['p3', 'y']],
      );

      const rows = await run(mode, (m) => m.PostRequired.updateMany({ where: { title: 'x' }, data: { body: 'B' } }));

      expect(sorted(rows.map((r) => idOf(r.id)))).toEqual(['p1', 'p2']);
      expect(rows.every((r) => r.body === 'B')).toBe(true);
      expect((await client.db.PostRequired.findMany({ where: { body: 'B' } })).length).toBe(2);
    });

    test('select returns only the selected keys of the updated rows', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const rows = await run(mode, (m) =>
        m.PostRequired.updateMany({ where: { title: 'x' }, data: { body: 'B' }, select: { id: true, body: true } }),
      );

      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!).sort()).toEqual(['body', 'id']);
    });

    test('include returns the related rows of the updated rows', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const rows = await run(mode, (m) =>
        m.PostRequired.updateMany({ where: { title: 'x' }, data: { body: 'B' }, include: { author: true } }),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.author.name).toBe('Ann');
    });

    test('unset clears the field on exactly the selected rows', async () => {
      await seedPosts(
        [
          ['p1', 'x'],
          ['p2', 'w'],
        ],
        [['p3', 'w']],
      );
      await client.db.PostRequired.updateMany({ where: {}, data: { body: 'B' } });

      await run(mode, (m) =>
        m.PostRequired.updateMany({
          where: { author: { posts: { some: { title: 'x' } } } },
          data: {},
          unset: { body: true },
        }),
      );

      const bodies = Object.fromEntries((await client.db.PostRequired.findMany()).map((r) => [idOf(r.id), r.body]));
      expect(bodies.p1).toBeUndefined();
      expect(bodies.p2).toBeUndefined();
      expect(bodies.p3).toBe('B');
    });

    test('a filter that selects nothing updates nothing and returns no rows', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const rows = await run(mode, (m) =>
        m.PostRequired.updateMany({ where: { title: 'missing' }, data: { title: 'z' } }),
      );

      expect(rows).toEqual([]);
      expect(await titles()).toEqual({ p1: 'x', p3: 'y' });
    });

    test('no where updates every row', async () => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      const rows = await run(mode, (m) => m.PostRequired.updateMany({ where: {}, data: { title: 'z' } }));

      expect(rows).toHaveLength(2);
      expect(await titles()).toEqual({ p1: 'z', p3: 'z' });
    });
  });

  describe('the destructive-filter guard still refuses a filter that resolved to nothing', () => {
    test.each(MODES)('deleteMany with AND: [] throws and deletes nothing, %s', async (mode) => {
      await seedPosts([['p1', 'x']], [['p3', 'y']]);

      await expect(run(mode, (m) => m.PostRequired.deleteMany({ where: { AND: [] } }))).rejects.toThrow(
        'resolved to no conditions',
      );
      expect(await postIds()).toEqual(['p1', 'p3']);
    });
  });

  describe('upsert with a non-unique where', () => {
    test.each(['direct', 'callback'] as const)(
      'updates every row the filter selected at the start even when the data changes the filtered field, %s',
      async (mode) => {
        await seedPosts(
          [
            ['p1', 'x'],
            ['p2', 'w'],
          ],
          [['p3', 'w']],
        );
        const where = { author: { posts: { some: { title: 'x' } } } };

        await run(mode, (m) =>
          m.PostRequired.upsert({
            where,
            create: { title: 'created', authorId: 'a-ann' },
            update: { title: 'z' },
          }),
        );

        expect(await titles()).toEqual({ p1: 'z', p2: 'z', p3: 'w' });
      },
    );
  });

  /** a (boss) manages b ('x') and c ('w'); a has no manager */
  async function seedEmployees() {
    const a = await client.db.EmployeeWithReports.create({ data: { name: 'boss' } });
    const b = await client.db.EmployeeWithReports.create({ data: { name: 'x', manager: { connect: a.id } } });
    const c = await client.db.EmployeeWithReports.create({ data: { name: 'w', manager: { connect: a.id } } });

    return { a: a.id, b: b.id, c: c.id };
  }
});
