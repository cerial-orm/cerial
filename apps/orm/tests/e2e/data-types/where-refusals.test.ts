/**
 * E2E: filters that can only match by accident are refused, and refused before any row is touched
 *
 * Ordering an array or @set field, comparing an optional field to null, a null between bound and an ISO
 * string against a literal with a Date variant each used to run and select the wrong rows, so a negated
 * deleteMany removed rows the caller never meant.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { tables } from '../test-helper';
import { setupDataTypeTests } from './test-factory';

const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

describe('E2E: where refusals', () => {
  const { getClient } = setupDataTypeTests([...tables.set, ...tables.number, ...tables.literals]);

  describe('ordering on array and @set fields', () => {
    beforeEach(async () => {
      const { db } = getClient();
      for (const [name, n] of [
        ['a', 1],
        ['b', 2],
        ['c', 5],
      ] as const) {
        await db.SetBasic.create({ data: { name, tags: [], numbers: [n], uuids: [] } });
        await db.NumberBasic.create({ data: { name, price: n, weight: null, scores: [n] } });
      }
    });

    const rows = async (): Promise<[number, number]> => {
      const { db } = getClient();

      return [await db.SetBasic.count(), await db.NumberBasic.count()];
    };

    test.each(['gt', 'gte', 'lt', 'lte'])(
      'deleteMany NOT %s on a @set field is refused and deletes nothing',
      async (op) => {
        await refuses(
          () => getClient().db.SetBasic.deleteMany({ where: loose({ NOT: { numbers: { [op]: [3] } } }) }),
          /numbers/,
        );
        expect(await rows()).toEqual([3, 3]);
      },
    );

    test('the audited payload is refused and the rows survive', async () => {
      await refuses(
        () => getClient().db.SetBasic.deleteMany({ where: loose({ NOT: { numbers: { gt: [3] } } }) }),
        /numbers.*gt/,
      );
      await refuses(
        () => getClient().db.SetBasic.updateMany({ where: loose({ numbers: { gt: [3] } }), data: { name: 'hit' } }),
        /numbers/,
      );
      const names = (await getClient().db.SetBasic.findMany()).map((r) => r.name).sort();
      expect(names).toEqual(['a', 'b', 'c']);
    });

    test('a plain array field refuses ordering and between too', async () => {
      await refuses(
        () => getClient().db.NumberBasic.deleteMany({ where: loose({ NOT: { scores: { lt: [3] } } }) }),
        /scores/,
      );
      await refuses(
        () => getClient().db.NumberBasic.deleteMany({ where: loose({ scores: { between: [[1], [3]] } }) }),
        /scores/,
      );
      expect(await rows()).toEqual([3, 3]);
    });

    test('the operators an array does take still select rows', async () => {
      const { db } = getClient();
      expect(await db.SetBasic.count({ numbers: { has: 2 } })).toBe(1);
      expect(await db.SetBasic.count(loose({ numbers: { eq: [5] } }))).toBe(1);
      expect(await db.NumberBasic.count({ price: { gt: 1 } })).toBe(2);
    });
  });

  describe('null operands', () => {
    beforeEach(async () => {
      const { db } = getClient();
      await db.NumberBasic.create({ data: { name: 'a', price: 1, weight: null, scores: [] } });
      await db.NumberBasic.create({ data: { name: 'b', price: 2, rating: 3, weight: 2, scores: [] } });
    });

    test('an optional field that is not @nullable refuses null and deletes nothing', async () => {
      const { db } = getClient();
      await refuses(() => db.NumberBasic.deleteMany({ where: loose({ NOT: { rating: null } }) }), /rating/);
      await refuses(() => db.NumberBasic.deleteMany({ where: loose({ NOT: { rating: { eq: null } } }) }), /rating/);
      expect(await db.NumberBasic.count()).toBe(2);
    });

    test('isNone finds the rows without the optional field, and a @nullable field still matches null', async () => {
      const { db } = getClient();
      expect((await db.NumberBasic.findMany({ where: { rating: { isNone: true } } })).map((r) => r.name)).toEqual([
        'a',
      ]);
      expect((await db.NumberBasic.findMany({ where: { weight: null } })).map((r) => r.name)).toEqual(['a']);
    });

    test('a null between bound is refused whether the field is nullable or not, and deletes nothing', async () => {
      const { db } = getClient();
      await refuses(
        () => db.NumberBasic.deleteMany({ where: loose({ NOT: { price: { between: [1, null] } } }) }),
        /price/,
      );
      await refuses(
        () => db.NumberBasic.deleteMany({ where: loose({ NOT: { weight: { between: [null, 2] } } }) }),
        /weight/,
      );
      expect(await db.NumberBasic.count()).toBe(2);
    });
  });

  describe('a literal with a Date variant', () => {
    const MOMENTS = ['2021-01-01T00:00:00.000Z', '2022-01-01T00:00:00.000Z', '2023-01-01T00:00:00.000Z'];

    beforeEach(async () => {
      const { db } = getClient();
      for (const moment of MOMENTS)
        await db.LiteralNumberKinds.create({ data: loose({ ratio: 0.5, amount: 1, moment }) });
      await db.LiteralNumberKinds.create({ data: { ratio: 0.5, amount: 1, moment: true } });
    });

    test('create stores a Date for the ISO string', async () => {
      const created = await getClient().db.LiteralNumberKinds.create({
        data: loose({ ratio: 0.5, amount: 1, moment: '2024-05-06T00:00:00.000Z' }),
      });
      // The database refuses a string for a Date member, so a stored row proves the conversion
      expect(typeof created.moment).not.toBe('string');
      expect(await getClient().db.LiteralNumberKinds.count(loose({ moment: '2024-05-06T00:00:00.000Z' }))).toBe(1);
    });

    test('where selects exactly the matching rows, and NOT the others', async () => {
      const { db } = getClient();
      expect(await db.LiteralNumberKinds.count(loose({ moment: MOMENTS[1] }))).toBe(1);
      expect(await db.LiteralNumberKinds.count(loose({ NOT: { moment: MOMENTS[1] } }))).toBe(3);
      expect(await db.LiteralNumberKinds.count(loose({ moment: { in: [MOMENTS[0], MOMENTS[2]] } }))).toBe(2);
    });

    test('a negated deleteMany removes only the rows it names', async () => {
      const { db } = getClient();
      const removed = await db.LiteralNumberKinds.deleteMany({ where: loose({ NOT: { moment: MOMENTS[1] } }) });
      expect(removed).toBe(3);
      expect(await db.LiteralNumberKinds.count()).toBe(1);
    });

    test('a string that is no date is refused on create and where', async () => {
      const { db } = getClient();
      await refuses(
        () => db.LiteralNumberKinds.create({ data: loose({ ratio: 0.5, amount: 1, moment: 'nope' }) }),
        /moment/,
      );
      await refuses(() => db.LiteralNumberKinds.deleteMany({ where: loose({ NOT: { moment: 'nope' } }) }), /moment/);
      expect(await db.LiteralNumberKinds.count()).toBe(4);
    });
  });
});
