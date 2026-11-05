import { describe, expect, test } from 'bun:test';
import { ALL_SPECS, FLOAT_SPECS, INT_SPECS, api, data, read, setup } from './helpers';

describe('E2E sized numbers: orderBy is numeric', () => {
  const { getClient } = setup();

  describe.each(ALL_SPECS)('$name', (spec) => {
    const model = () => api(getClient(), spec);
    const signed = spec.kind === 'float' || spec.min! < 0n;
    // 9, 10 and 100 sort differently as text, so a string sort would show up here
    const values = signed ? [100, 9, -3, 10, 0, 1] : [100, 9, 10, 0, 1];
    const ascending = [...values].sort((a, b) => a - b);

    const seed = async () => {
      for (const v of values) await model().create({ data: data(v, { objVal: { val: v }, tupVal: [v, null] }) });
    };

    test('ascending and descending', async () => {
      await seed();

      expect((await model().findMany({ orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal)).toEqual(
        ascending.map((v) => read(spec, v)),
      );
      expect((await model().findMany({ orderBy: { reqVal: 'desc' } })).map((r) => r.reqVal)).toEqual(
        [...ascending].reverse().map((v) => read(spec, v)),
      );
    });

    test('an object sub-key', async () => {
      await seed();
      const rows = await model().findMany({ orderBy: { objVal: { val: 'asc' } } });

      expect(rows.map((r) => (r.objVal as { val: unknown }).val)).toEqual(ascending.map((v) => read(spec, v)));
    });

    test('with limit and offset, and combined with a where', async () => {
      await seed();
      const page = await model().findMany({ orderBy: { reqVal: 'asc' }, limit: 2, offset: 1 });
      const filtered = await model().findMany({ where: { reqVal: { gte: 1 } }, orderBy: { reqVal: 'desc' }, limit: 2 });

      expect(page.map((r) => r.reqVal)).toEqual(ascending.slice(1, 3).map((v) => read(spec, v)));
      expect(filtered.map((r) => r.reqVal)).toEqual([read(spec, 100), read(spec, 10)]);
    });

    test('findOne takes the first of the order', async () => {
      await seed();

      expect((await model().findOne({ orderBy: { reqVal: 'desc' } }))!.reqVal).toBe(read(spec, 100));
      expect((await model().findOne({ orderBy: { reqVal: 'asc' } }))!.reqVal).toBe(read(spec, ascending[0]!));
    });
  });

  describe.each([...INT_SPECS.filter((s) => s.min! < 0n)])('$name: the full range sorts across zero', (spec) => {
    test('minimum, zero and maximum', async () => {
      const lo = Number(spec.min);
      const hi = Number(spec.max);

      for (const v of [0, hi, lo]) await api(getClient(), spec).create({ data: data(v) });

      expect((await api(getClient(), spec).findMany({ orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal)).toEqual([
        lo,
        0,
        hi,
      ]);
    });
  });

  describe.each(FLOAT_SPECS)('$name: fractions and large values', (spec) => {
    test('sorts fractions between integers', async () => {
      for (const v of [2.5, -0.5, 1, 0.25, -100.75]) await api(getClient(), spec).create({ data: data(v) });

      expect((await api(getClient(), spec).findMany({ orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal)).toEqual([
        -100.75, -0.5, 0.25, 1, 2.5,
      ]);
    });

    test('sorts the largest finite values at the ends', async () => {
      const max = spec.name === 'Float16' ? 65504 : 3.4028234663852886e38;

      for (const v of [0, max, -max]) await api(getClient(), spec).create({ data: data(v) });

      expect((await api(getClient(), spec).findMany({ orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal)).toEqual([
        -max,
        0,
        max,
      ]);
    });
  });
});
