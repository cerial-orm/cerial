import { describe, expect, test } from 'bun:test';
import { ALL_SPECS, api, data, read, rejection, setup } from './helpers';

describe('E2E sized numbers: create and read back, every form', () => {
  const { getClient } = setup();

  describe.each(ALL_SPECS)('$name', (spec) => {
    const model = () => api(getClient(), spec);
    const val = (n: number) => read(spec, n);

    test('a required field is stored and read back', async () => {
      const row = await model().create({ data: data(3) });

      expect(row.reqVal).toBe(val(3));
      expect((await model().findOne({ where: { id: row.id } }))!.reqVal).toBe(val(3));
    });

    test('a read is a bigint on Uint64, even for 3, and a number on every other kind', async () => {
      const row = await model().create({ data: data(3, { arrVal: [3], optVal: 3, nullVal: 3 }) });

      for (const found of [row, (await model().findOne({ where: { id: row.id } }))!]) {
        const expected = spec.kind === 'u64' ? 'bigint' : 'number';

        expect(typeof found.reqVal).toBe(expected);
        expect(typeof found.optVal).toBe(expected);
        expect(typeof found.nullVal).toBe(expected);
        expect(typeof (found.arrVal as unknown[])[0]).toBe(expected);
        expect(typeof (found.objVal as Record<string, unknown>).val).toBe(expected);
        expect(typeof (found.tupVal as unknown[])[0]).toBe(expected);
      }
    });

    test('an optional field is absent when omitted and holds a value when given', async () => {
      const absent = await model().create({ data: data(1) });
      const given = await model().create({ data: data(1, { optVal: 4 }) });

      expect(absent.optVal).toBeUndefined();
      expect((await model().findOne({ where: { id: absent.id } }))!.optVal).toBeUndefined();
      expect(given.optVal).toBe(val(4));
    });

    test('a nullable field holds null and holds a value', async () => {
      const nul = await model().create({ data: data(1, { nullVal: null }) });
      const some = await model().create({ data: data(1, { nullVal: 9 }) });

      expect((await model().findOne({ where: { id: nul.id } }))!.nullVal).toBeNull();
      expect((await model().findOne({ where: { id: some.id } }))!.nullVal).toBe(val(9));
    });

    test('a required field refuses null and an omitted value', async () => {
      expect((await rejection(() => model().create({ data: data(1, { reqVal: null }) }))).message).toContain(
        'reqVal is required',
      );
      const { reqVal: _omitted, ...withoutReq } = data(1);
      expect((await rejection(() => model().create({ data: withoutReq }))).message).toContain('reqVal is required');
      expect(await model().count()).toBe(0);
    });

    test('an array defaults to empty and keeps the order and the duplicates it was given', async () => {
      const { arrVal: _a, setVal: _s, ...bare } = data(1);
      const empty = await model().create({ data: bare });
      const full = await model().create({ data: data(1, { arrVal: [3, 1, 3, 2] }) });

      expect(empty.arrVal).toEqual([]);
      expect(full.arrVal).toEqual([val(3), val(1), val(3), val(2)]);
      expect((await model().findOne({ where: { id: full.id } }))!.arrVal).toEqual([val(3), val(1), val(3), val(2)]);
    });

    test('a @set array defaults to empty and drops duplicates', async () => {
      const { arrVal: _a, setVal: _s, ...bare } = data(1);
      const empty = await model().create({ data: bare });
      const full = await model().create({ data: data(1, { setVal: [3, 1, 3, 2, 1] }) });
      const stored = (await model().findOne({ where: { id: full.id } }))!.setVal as Array<number | bigint>;

      expect(empty.setVal).toEqual([]);
      expect(stored.map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(stored.every((v) => typeof v === (spec.kind === 'u64' ? 'bigint' : 'number'))).toBe(true);
    });

    test('@default fills an omitted field and an explicit value wins', async () => {
      const filled = await model().create({ data: data(1) });
      const explicit = await model().create({ data: data(1, { dfltVal: 2 }) });

      expect(filled.dfltVal).toBe(read(spec, spec.dflt));
      expect((await model().findOne({ where: { id: filled.id } }))!.dfltVal).toBe(read(spec, spec.dflt));
      expect(explicit.dfltVal).toBe(val(2));
    });

    test('an object sub-field, required and optional', async () => {
      const row = await model().create({ data: data(1, { objVal: { val: 6, opt: 8 } }) });
      const bare = await model().create({ data: data(1, { objVal: { val: 6 } }) });

      expect((await model().findOne({ where: { id: row.id } }))!.objVal).toEqual({ val: val(6), opt: val(8) });
      expect((await model().findOne({ where: { id: bare.id } }))!.objVal).toEqual({ val: val(6) });
    });

    test('a tuple element, plain and nullable', async () => {
      const full = await model().create({ data: data(1, { tupVal: [6, 8] }) });
      const nul = await model().create({ data: data(1, { tupVal: [6, null] }) });

      expect((await model().findOne({ where: { id: full.id } }))!.tupVal).toEqual([val(6), val(8)]);
      expect((await model().findOne({ where: { id: nul.id } }))!.tupVal).toEqual([val(6), null]);
    });

    test('a tuple also takes the object form', async () => {
      const row = await model().create({ data: data(1, { tupVal: { 0: 6, 1: 8 } }) });

      expect((await model().findOne({ where: { id: row.id } }))!.tupVal).toEqual([val(6), val(8)]);
    });

    test('zero is stored, not mistaken for a missing value', async () => {
      const row = await model().create({ data: data(0, { optVal: 0, nullVal: 0, arrVal: [0] }) });
      const found = (await model().findOne({ where: { id: row.id } }))!;

      expect(found.reqVal).toBe(val(0));
      expect(found.optVal).toBe(val(0));
      expect(found.nullVal).toBe(val(0));
      expect(found.arrVal).toEqual([val(0)]);
    });

    test('findMany returns every row with the same typing', async () => {
      await model().create({ data: data(1) });
      await model().create({ data: data(2) });
      const rows = await model().findMany({ orderBy: { reqVal: 'asc' } });

      expect(rows.map((r) => r.reqVal)).toEqual([val(1), val(2)]);
    });
  });
});
