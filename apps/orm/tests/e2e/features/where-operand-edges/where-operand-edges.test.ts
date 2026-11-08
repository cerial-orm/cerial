/**
 * E2E: edges of the where operand path, against a live database
 *
 * - a tuple in object form or an object bound whole is refused when it leaves out a position or a required
 *   array, on create and in a negated filter, before any row is touched
 * - a Record inside an object is compared as create stored it, so a negated delete spares the row holding it
 *
 * Destructive calls come first in each group: the refused ones must leave every row, the accepted ones must
 * remove exactly the rows the typed equivalent selects.
 */

import { describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../../data-types/test-factory';

const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

describe('E2E: where operand edges', () => {
  const { getClient } = setupDataTypeTests(tables.whereOperandEdges);

  const names = async (where?: unknown): Promise<string[]> =>
    (await getClient().db.WoHolder.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((r) => r.name);

  describe('tuples and objects bound whole', () => {
    const seed = async (): Promise<void> => {
      const { db } = getClient();
      await db.WoHolder.create({ data: { name: 'h1', lists: [], duos: [], withList: [1, { tags: [1] }] } });
      await db.WoHolder.create({ data: { name: 'h2', lists: [], duos: [], withList: [2, { tags: [] }] } });
      await db.WoHolder.create({ data: { name: 'h3', lists: [], duos: [], duo: [3, 'c'] } });
    };

    test('a negated deleteMany with a short object element is refused and deletes nothing', async () => {
      await seed();
      await refuses(
        () => getClient().db.WoHolder.deleteMany({ where: loose({ NOT: { withList: [1, {}] } }) }),
        /withList/,
      );
      expect(await names()).toEqual(['h1', 'h2', 'h3']);
    });

    test('a negated deleteMany with a short tuple is refused and deletes nothing', async () => {
      await seed();
      await refuses(() => getClient().db.WoHolder.deleteMany({ where: loose({ NOT: { duo: [3] } }) }), /duo/);
      expect(await names()).toEqual(['h1', 'h2', 'h3']);
    });

    test('updateMany with such a filter is refused and changes nothing', async () => {
      await seed();
      await refuses(
        () => getClient().db.WoHolder.updateMany({ where: loose({ NOT: { withList: [1, {}] } }), data: { name: 'x' } }),
        /withList/,
      );
      expect(await names()).toEqual(['h1', 'h2', 'h3']);
    });

    test('an array $transaction with such a filter is refused and deletes nothing', async () => {
      await seed();
      const { db } = getClient();
      await refuses(
        () => getClient().$transaction([db.WoHolder.deleteMany({ where: loose({ NOT: { duo: [3] } }) })]),
        /duo/,
      );
      expect(await names()).toEqual(['h1', 'h2', 'h3']);
    });

    test('the complete value selects exactly the typed equivalent rows', async () => {
      await seed();
      expect(await names({ NOT: { withList: [1, { tags: [1] }] } })).toEqual(['h2', 'h3']);
      expect(
        await getClient().db.WoHolder.deleteMany({ where: loose({ NOT: { withList: [1, { tags: [1] }] } }) }),
      ).toBe(2);
      expect(await names()).toEqual(['h1']);
    });

    test.each([
      ['an object-form tuple missing a position', { duo: { 0: 1 } }, /duo/],
      ['an object-form tuple with no position', { duo: {} }, /duo/],
      ['a short tuple in an array of tuples', { duos: [{ 0: 1 }] }, /duos\[0\]/],
      ['an object element missing its required array', { withList: [1, {}] }, /withList\[1\]\.tags/],
      ['an object-form tuple whose object element misses its array', { withList: { 0: 1, 1: {} } }, /tags/],
      ['an element of an array of objects missing its array', { lists: [{ n: 1 }] }, /lists\[0\]\.tags/],
    ])('create refuses %s and writes no row', async (_name, data, pattern) => {
      await refuses(
        () => getClient().db.WoHolder.create({ data: loose({ name: 'x', lists: [], duos: [], ...data }) }),
        pattern,
      );
      expect(await getClient().db.WoHolder.count()).toBe(0);
    });

    test('create accepts the complete forms', async () => {
      const { db } = getClient();
      await db.WoHolder.create({
        data: {
          name: 'ok',
          lists: [{ tags: [] }],
          duos: [{ 0: 1, 1: 'a' } as never, [2, 'b']],
          duo: { 0: 1, 1: 'a' } as never,
          withList: { 0: 1, 1: { tags: [2] } } as never,
        },
      });
      const row = await db.WoHolder.findOne({ where: { name: 'ok' } });
      expect(row?.duo).toEqual([1, 'a']);
      expect(row?.withList).toEqual([1, { tags: [2] }]);
    });
  });

  describe('a Record inside an object', () => {
    const seed = async (): Promise<void> => {
      const { db } = getClient();
      await db.WoHolder.create({
        data: loose({ name: 'h1', lists: [], duos: [], box: { ref: 'wo_tag:v1', refs: ['wo_tag:v1', 'wo_tag:v2'] } }),
      });
      await db.WoHolder.create({
        data: loose({ name: 'h2', lists: [], duos: [], box: { ref: 'wo_tag:v2', refs: ['wo_tag:v2'] } }),
      });
      await db.WoHolder.create({ data: { name: 'h3', lists: [], duos: [] } });
    };

    test('a negated deleteMany by a string spares the row holding it', async () => {
      await seed();
      expect(await getClient().db.WoHolder.deleteMany({ where: loose({ NOT: { box: { ref: 'wo_tag:v1' } } }) })).toBe(
        2,
      );
      expect(await names()).toEqual(['h1']);
    });

    test('a negated deleteMany by a CerialId spares the row holding it', async () => {
      await seed();
      const where = { NOT: { box: { ref: CerialId.parse('wo_tag:v2') } } };
      expect(await getClient().db.WoHolder.deleteMany({ where: loose(where) })).toBe(2);
      expect(await names()).toEqual(['h2']);
    });

    test('updateMany by a string changes exactly the rows holding it', async () => {
      await seed();
      const changed = await getClient().db.WoHolder.updateMany({
        where: loose({ box: { ref: 'wo_tag:v1' } }),
        data: { name: 'changed' },
      });
      expect(changed.map((r) => r.id.toString()).length).toBe(1);
      expect(await names()).toEqual(['changed', 'h2', 'h3']);
    });

    test('eq, neq, has and in match by key', async () => {
      await seed();
      expect(await names({ box: { ref: 'wo_tag:v1' } })).toEqual(['h1']);
      // A row with no box has no ref, which is not v1
      expect(await names({ box: { ref: { neq: 'wo_tag:v1' } } })).toEqual(['h2', 'h3']);
      expect(await names({ box: { ref: { in: ['wo_tag:v1', 'wo_tag:v2'] } } })).toEqual(['h1', 'h2']);
      expect(await names({ box: { refs: { has: 'wo_tag:v1' } } })).toEqual(['h1']);
      expect(await names({ box: { refs: { has: CerialId.parse('wo_tag:v2') } } })).toEqual(['h1', 'h2']);
    });

    test('a value that names no table is refused and deletes nothing', async () => {
      await seed();
      await refuses(
        () => getClient().db.WoHolder.deleteMany({ where: loose({ NOT: { box: { ref: 'v1' } } }) }),
        /box\.ref/,
      );
      expect(await names()).toEqual(['h1', 'h2', 'h3']);
    });
  });
});
