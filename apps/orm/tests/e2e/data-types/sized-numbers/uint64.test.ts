import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import { U64_SPEC, api, data, rejection, setup } from './helpers';

const TWO_53 = 2n ** 53n;
const TWO_63 = 2n ** 63n;
const MAX = 2n ** 64n - 1n;
/** Values that a double cannot tell apart, and the ones past the signed 64-bit range. */
const BIG_VALUES = [
  TWO_53 - 1n,
  TWO_53,
  TWO_53 + 1n,
  TWO_53 + 3n,
  TWO_63 - 1n,
  TWO_63,
  TWO_63 + 1n,
  TWO_63 + 12345n,
  MAX - 1n,
  MAX,
];

describe('E2E Uint64: values past 2^53 and past 2^63', () => {
  const { getClient } = setup();
  const model = () => api(getClient(), U64_SPEC);
  const seed = async (values: readonly bigint[]) => {
    for (const v of values) await model().create({ data: data(v) });
  };

  describe('round trip', () => {
    test.each(BIG_VALUES.map((v) => [v]))('%p is stored and read back exactly in every form', async (v) => {
      const row = await model().create({
        data: data(v, {
          optVal: v,
          nullVal: v,
          arrVal: [v, 1n],
          setVal: [v],
          dfltVal: v,
          objVal: { val: v, opt: v },
          tupVal: [v, v],
        }),
      });
      const found = (await model().findOne({ where: { id: row.id } }))!;

      for (const result of [row, found]) {
        expect(result.reqVal).toBe(v);
        expect(result.optVal).toBe(v);
        expect(result.nullVal).toBe(v);
        expect(result.arrVal).toEqual([v, 1n]);
        expect(result.setVal).toEqual([v]);
        expect(result.dfltVal).toBe(v);
        expect(result.objVal).toEqual({ val: v, opt: v });
        expect(result.tupVal).toEqual([v, v]);
      }
    });

    test('2^53 + 1 does not collapse to 2^53, as a double would', async () => {
      const row = await model().create({ data: data(TWO_53 + 1n) });

      expect((await model().findOne({ where: { id: row.id } }))!.reqVal).toBe(TWO_53 + 1n);
      expect(Number(TWO_53 + 1n)).toBe(Number(TWO_53));
    });

    test('a safe number input reads back as a bigint of the same value', async () => {
      const row = await model().create({ data: data(Number.MAX_SAFE_INTEGER, { arrVal: [7] }) });

      expect(row.reqVal).toBe(BigInt(Number.MAX_SAFE_INTEGER));
      expect(row.arrVal).toEqual([7n]);
    });

    test('updateUnique writes a value past 2^63 and an array push does too', async () => {
      const row = await model().create({ data: data(1, { arrVal: [1] }) });
      const updated = await model().updateUnique({
        where: { id: row.id },
        data: { reqVal: MAX, objVal: { val: TWO_63 + 5n }, tupVal: [TWO_63, null] },
      });

      expect(updated!.reqVal).toBe(MAX);
      expect(updated!.objVal).toEqual({ val: TWO_63 + 5n });
      expect(updated!.tupVal).toEqual([TWO_63, null]);

      const pushed = await model().updateUnique({ where: { id: row.id }, data: { arrVal: { push: TWO_63 + 1n } } });
      expect(pushed!.arrVal).toEqual([1n, TWO_63 + 1n]);

      const pushed53 = await model().updateUnique({ where: { id: row.id }, data: { arrVal: { push: [TWO_53] } } });
      expect(pushed53!.arrVal).toEqual([1n, TWO_63 + 1n, TWO_53]);
      expect((await model().findOne({ where: { id: row.id } }))!.arrVal).toEqual([1n, TWO_63 + 1n, TWO_53]);
    });
  });

  describe('the signed 64-bit boundary, where the wire type changes from bigint to U64', () => {
    test('the number 2 ** 53 - 1 and the neighbours of 2 ** 53 are created, read and found', async () => {
      const row = await model().create({ data: data(2 ** 53 - 1, { arrVal: [2 ** 53 - 1] }) });

      expect(row.reqVal).toBe(TWO_53 - 1n);
      expect(row.arrVal).toEqual([TWO_53 - 1n]);
      expect((await model().findOne({ where: { reqVal: 2 ** 53 - 1 } }))!.id).toEqual(row.id);
      expect((await model().findMany({ where: { reqVal: { gt: TWO_53 } } })).length).toBe(0);
      expect((await model().findMany({ where: { reqVal: { lt: TWO_53 } } })).length).toBe(1);
    });

    test('exactly 2^53 is created, read and found, and compares against its neighbours', async () => {
      // SDK 2.2.1's own codec drops a response holding this u64; Cerial's codec reads it
      const row = await model().create({ data: data(TWO_53, { arrVal: [TWO_53], objVal: { val: TWO_53 } }) });
      await seed([TWO_53 - 1n, TWO_53 + 1n]);
      const values = async (where: Record<string, unknown>) =>
        (await model().findMany({ where: { reqVal: where }, orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal);

      expect(row.reqVal).toBe(TWO_53);
      expect(row.arrVal).toEqual([TWO_53]);
      expect(row.objVal).toEqual({ val: TWO_53 });
      expect((await model().findOne({ where: { id: row.id } }))!.reqVal).toBe(TWO_53);
      expect((await model().findOne({ where: { reqVal: TWO_53 } }))!.id).toEqual(row.id);
      expect(await values({ eq: TWO_53 })).toEqual([TWO_53]);
      expect(await values({ gt: TWO_53 })).toEqual([TWO_53 + 1n]);
      expect(await values({ gte: TWO_53 })).toEqual([TWO_53, TWO_53 + 1n]);
      expect(await values({ lt: TWO_53 })).toEqual([TWO_53 - 1n]);
      expect(await values({ lte: TWO_53 })).toEqual([TWO_53 - 1n, TWO_53]);
      expect(await values({ in: [TWO_53, TWO_53 + 1n] })).toEqual([TWO_53, TWO_53 + 1n]);
      expect(await values({ notIn: [TWO_53] })).toEqual([TWO_53 - 1n, TWO_53 + 1n]);
      expect((await model().findMany({ where: { arrVal: { has: TWO_53 } } })).length).toBe(1);
      expect((await model().findMany({ where: { objVal: { val: TWO_53 } } })).length).toBe(1);
    });

    test('the signed maximum and one above it both round trip and filter', async () => {
      await seed([TWO_63 - 1n, TWO_63]);

      expect((await model().findMany({ where: { reqVal: TWO_63 - 1n } })).map((r) => r.reqVal)).toEqual([TWO_63 - 1n]);
      expect((await model().findMany({ where: { reqVal: { gt: TWO_63 - 1n } } })).map((r) => r.reqVal)).toEqual([
        TWO_63,
      ]);
    });
  });

  describe('filtering is exact', () => {
    test('equality finds the one neighbour of four that a double could not separate', async () => {
      await seed([TWO_53, TWO_53 + 1n, TWO_53 + 2n, TWO_53 + 3n]);

      for (const target of [TWO_53, TWO_53 + 1n, TWO_53 + 2n, TWO_53 + 3n]) {
        const rows = await model().findMany({ where: { reqVal: target } });

        expect(rows.map((r) => r.reqVal)).toEqual([target]);
      }
    });

    test('equality past 2^63 and at the maximum', async () => {
      await seed([TWO_63 - 1n, TWO_63, TWO_63 + 1n, MAX - 1n, MAX]);

      for (const target of [TWO_63 - 1n, TWO_63, TWO_63 + 1n, MAX - 1n, MAX]) {
        expect((await model().findMany({ where: { reqVal: target } })).map((r) => r.reqVal)).toEqual([target]);
        expect((await model().findMany({ where: { reqVal: { eq: target } } })).length).toBe(1);
      }
    });

    test('neq excludes exactly one', async () => {
      await seed([TWO_63 - 1n, TWO_63, TWO_63 + 1n]);

      const rows = await model().findMany({ where: { reqVal: { neq: TWO_63 } }, orderBy: { reqVal: 'asc' } });
      expect(rows.map((r) => r.reqVal)).toEqual([TWO_63 - 1n, TWO_63 + 1n]);
    });

    test('gt, gte, lt and lte compare across the signed boundary', async () => {
      await seed([TWO_63 - 1n, TWO_63, TWO_63 + 1n, MAX]);
      const values = async (where: Record<string, unknown>) =>
        (await model().findMany({ where: { reqVal: where }, orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal);

      expect(await values({ gt: TWO_63 - 1n })).toEqual([TWO_63, TWO_63 + 1n, MAX]);
      expect(await values({ gte: TWO_63 })).toEqual([TWO_63, TWO_63 + 1n, MAX]);
      expect(await values({ lt: TWO_63 })).toEqual([TWO_63 - 1n]);
      expect(await values({ lte: TWO_63 })).toEqual([TWO_63 - 1n, TWO_63]);
      expect(await values({ gt: MAX })).toEqual([]);
      expect(await values({ lte: MAX })).toEqual([TWO_63 - 1n, TWO_63, TWO_63 + 1n, MAX]);
      expect(await values({ gt: TWO_63, lt: MAX })).toEqual([TWO_63 + 1n]);
    });

    test('in, notIn and between take bigints', async () => {
      await seed([TWO_53 + 1n, TWO_63, MAX]);
      const values = async (where: Record<string, unknown>) =>
        (await model().findMany({ where: { reqVal: where }, orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal);

      expect(await values({ in: [TWO_63, MAX] })).toEqual([TWO_63, MAX]);
      expect(await values({ in: [TWO_53] })).toEqual([]);
      await seed([TWO_53]);
      expect(await values({ in: [TWO_53] })).toEqual([TWO_53]);
      expect(await values({ notIn: [TWO_63] })).toEqual([TWO_53, TWO_53 + 1n, MAX]);
      expect(await values({ between: [TWO_53 + 2n, MAX - 1n] })).toEqual([TWO_63]);
    });

    test('a safe number filter value finds the bigint row', async () => {
      await seed([5n, 6n]);

      expect((await model().findMany({ where: { reqVal: 5 } })).map((r) => r.reqVal)).toEqual([5n]);
      expect((await model().findMany({ where: { reqVal: { in: [5, 6n] } } })).length).toBe(2);
    });

    test('array, object and tuple filters compare exactly', async () => {
      await model().create({
        data: data(1, { arrVal: [TWO_63 + 1n], objVal: { val: TWO_53 + 1n }, tupVal: [MAX, null] }),
      });
      await model().create({
        data: data(1, { arrVal: [TWO_63], objVal: { val: TWO_53 + 2n }, tupVal: [MAX - 1n, null] }),
      });

      expect((await model().findMany({ where: { arrVal: { has: TWO_63 + 1n } } })).length).toBe(1);
      expect((await model().findMany({ where: { arrVal: { hasAny: [TWO_63, TWO_63 + 1n] } } })).length).toBe(2);
      expect((await model().findMany({ where: { arrVal: { hasAll: [TWO_63, TWO_63 + 1n] } } })).length).toBe(0);
      expect((await model().findMany({ where: { objVal: { val: TWO_53 + 1n } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 0: MAX } } })).length).toBe(1);
    });

    test('a filter on an unsafe number is refused with the hint to use a bigint', async () => {
      const error = await rejection(() => model().findMany({ where: { reqVal: 2 ** 63 } }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(error.message).toContain('Field "reqVal" is Uint64');
      expect(error.message).toContain('pass a bigint');
    });

    test('a filter below zero or above the maximum is refused', async () => {
      const low = await rejection(() => model().findMany({ where: { reqVal: -1 } }));
      const high = await rejection(() => model().findMany({ where: { reqVal: { lte: 2n ** 64n } } }));

      expect(low.message).toBe(
        'Invalid where clause: Field "reqVal" is Uint64 and holds 0 to 18446744073709551615, got -1',
      );
      expect(high.message).toBe(
        'Invalid where clause: Field "reqVal" is Uint64 and holds 0 to 18446744073709551615, got 18446744073709551616',
      );
    });

    test('a fraction in a filter is refused', async () => {
      const error = await rejection(() => model().findMany({ where: { reqVal: 1.5 } }));

      expect(error.message).toBe('Invalid where clause: Field "reqVal" is Uint64 and expects a whole number, got 1.5');
    });

    test('updateMany and deleteMany select by exact bigint', async () => {
      await seed([TWO_63, TWO_63 + 1n]);

      const updated = await model().updateMany({ where: { reqVal: TWO_63 + 1n }, data: { dfltVal: MAX } });
      expect(updated.length).toBe(1);
      expect(updated[0]!.dfltVal).toBe(MAX);
      expect(await model().deleteMany({ where: { reqVal: TWO_63 } })).toBe(1);
      expect((await model().findMany()).map((r) => r.reqVal)).toEqual([TWO_63 + 1n]);
    });
  });

  describe('ordering is numeric across 2^63', () => {
    const shuffled = [TWO_63 + 12345n, 3n, MAX, TWO_63 - 1n, TWO_53 + 1n, TWO_63, 10n, TWO_53, 100n];
    const ascending = [...shuffled].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    test('ascending', async () => {
      await seed(shuffled);

      expect((await model().findMany({ orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal)).toEqual(ascending);
    });

    test('descending', async () => {
      await seed(shuffled);

      expect((await model().findMany({ orderBy: { reqVal: 'desc' } })).map((r) => r.reqVal)).toEqual(
        [...ascending].reverse(),
      );
    });

    test('limit and offset page the sorted values', async () => {
      await seed(shuffled);
      const page = await model().findMany({ orderBy: { reqVal: 'asc' }, limit: 3, offset: 4 });

      expect(page.map((r) => r.reqVal)).toEqual(ascending.slice(4, 7));
    });

    test('an object sub-key sorts the same way', async () => {
      for (const v of shuffled) await model().create({ data: data(1, { objVal: { val: v } }) });
      const rows = await model().findMany({ orderBy: { objVal: { val: 'desc' } } });

      expect(rows.map((r) => (r.objVal as { val: bigint }).val)).toEqual([...ascending].reverse());
    });
  });
});
