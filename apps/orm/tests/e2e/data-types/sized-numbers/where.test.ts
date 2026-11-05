import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  ALL_SPECS,
  FLOAT_SPECS,
  INT_SPECS,
  type Row,
  WHOLE_SPECS,
  above,
  api,
  below,
  data,
  holds,
  overflow,
  read,
  rejection,
  setup,
} from './helpers';

describe('E2E sized numbers: where filters', () => {
  const { getClient } = setup();

  describe.each(ALL_SPECS)('$name', (spec) => {
    const model = () => api(getClient(), spec);
    const val = (n: number) => read(spec, n);
    const signed = spec.kind === 'float' || spec.min! < 0n;
    const seedRows = async () => {
      await model().create({
        data: data(1, { optVal: 1, nullVal: 1, arrVal: [1, 2], setVal: [1], objVal: { val: 1 }, tupVal: [1, 1] }),
      });
      await model().create({
        data: data(5, {
          optVal: 5,
          nullVal: null,
          arrVal: [5, 6],
          setVal: [5, 6],
          objVal: { val: 5, opt: 5 },
          tupVal: [5, null],
        }),
      });
      await model().create({
        data: data(10, { nullVal: 10, arrVal: [], setVal: [], objVal: { val: 10 }, tupVal: [10, 10] }),
      });
      if (signed)
        await model().create({
          data: data(-3, { nullVal: -3, arrVal: [-3], objVal: { val: -3 }, tupVal: [-3, null] }),
        });
    };
    const found = async (where: Row): Promise<unknown[]> =>
      (await model().findMany({ where, orderBy: { reqVal: 'asc' } })).map((r) => r.reqVal);

    test('plain value and eq', async () => {
      await seedRows();

      expect(await found({ reqVal: 5 })).toEqual([val(5)]);
      expect(await found({ reqVal: { eq: 5 } })).toEqual([val(5)]);
      expect(await found({ reqVal: 7 })).toEqual([]);
    });

    test('neq and NOT', async () => {
      await seedRows();
      const expected = signed ? [val(-3), val(1), val(10)] : [val(1), val(10)];

      expect(await found({ reqVal: { neq: 5 } })).toEqual(expected);
      expect(await found({ NOT: { reqVal: 5 } })).toEqual(expected);
    });

    test('gt, gte, lt and lte', async () => {
      await seedRows();
      const low = signed ? [val(-3)] : [];

      expect(await found({ reqVal: { gt: 5 } })).toEqual([val(10)]);
      expect(await found({ reqVal: { gte: 5 } })).toEqual([val(5), val(10)]);
      expect(await found({ reqVal: { lt: 5 } })).toEqual([...low, val(1)]);
      expect(await found({ reqVal: { lte: 5 } })).toEqual([...low, val(1), val(5)]);
      expect(await found({ reqVal: { gt: 10 } })).toEqual([]);
      expect(await found({ reqVal: { gt: 1, lt: 10 } })).toEqual([val(5)]);
    });

    test('between, in and notIn', async () => {
      await seedRows();
      const low = signed ? [val(-3)] : [];

      expect(await found({ reqVal: { between: [2, 10] } })).toEqual([val(5), val(10)]);
      expect(await found({ reqVal: { in: [1, 10, 99] } })).toEqual([val(1), val(10)]);
      expect(await found({ reqVal: { in: [] } })).toEqual([]);
      expect(await found({ reqVal: { notIn: [1, 10] } })).toEqual([...low, val(5)]);
    });

    test('AND and OR combine sized filters', async () => {
      await seedRows();

      expect(await found({ AND: [{ reqVal: { gt: 1 } }, { reqVal: { lt: 10 } }] })).toEqual([val(5)]);
      expect(await found({ OR: [{ reqVal: 1 }, { reqVal: 10 }] })).toEqual([val(1), val(10)]);
    });

    test('the optional, nullable and default fields filter like the required one', async () => {
      await seedRows();

      expect((await model().findMany({ where: { optVal: 5 } })).length).toBe(1);
      expect((await model().findMany({ where: { optVal: { gte: 1 } } })).length).toBe(2);
      expect((await model().findMany({ where: { nullVal: 10 } })).length).toBe(1);
      expect((await model().findMany({ where: { nullVal: null } })).length).toBe(1);
      expect((await model().findMany({ where: { dfltVal: spec.dflt } })).length).toBe(signed ? 4 : 3);
      expect((await model().findMany({ where: { dfltVal: { in: [spec.dflt] } } })).length).toBe(signed ? 4 : 3);
    });

    test('array and set operators', async () => {
      await seedRows();

      expect((await model().findMany({ where: { arrVal: { has: 5 } } })).length).toBe(1);
      expect((await model().findMany({ where: { arrVal: { hasAll: [1, 2] } } })).length).toBe(1);
      expect((await model().findMany({ where: { arrVal: { hasAll: [1, 6] } } })).length).toBe(0);
      expect((await model().findMany({ where: { arrVal: { hasAny: [2, 6] } } })).length).toBe(2);
      expect((await model().findMany({ where: { arrVal: { isEmpty: true } } })).length).toBe(1);
      expect((await model().findMany({ where: { setVal: { has: 6 } } })).length).toBe(1);
      expect((await model().findMany({ where: { setVal: { hasAny: [1, 5] } } })).length).toBe(2);
    });

    test('object sub-keys and tuple elements', async () => {
      await seedRows();

      expect((await model().findMany({ where: { objVal: { val: 5 } } })).length).toBe(1);
      expect((await model().findMany({ where: { objVal: { val: { gte: 5 } } } })).length).toBe(2);
      expect((await model().findMany({ where: { objVal: { opt: 5 } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 0: 10 } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 0: { lt: 10 } } } })).length).toBe(signed ? 3 : 2);
      expect((await model().findMany({ where: { tupVal: { 1: 10 } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 1: null } } })).length).toBe(signed ? 2 : 1);
    });

    test('count, updateMany and deleteMany use the same filter', async () => {
      await seedRows();

      expect(await model().count({ reqVal: { gte: 5 } })).toBe(2);
      expect((await model().updateMany({ where: { reqVal: { gte: 5 } }, data: { dfltVal: 3 } })).length).toBe(2);
      expect(await model().deleteMany({ where: { reqVal: 10 } })).toBe(1);
      expect(await model().count()).toBe(signed ? 3 : 2);
    });

    describe('values the type forbids are refused, and nothing is sent', () => {
      const refusedWhere = async (where: Row): Promise<Error> => {
        await model().create({ data: data(1) });
        const error = await rejection(() => model().findMany({ where }));

        expect(error).toBeInstanceOf(CerialValidationError);

        return error;
      };

      test('out of range, in a plain value, an operator and a list', async () => {
        if (spec.kind === 'float') return;
        const big = above(spec);
        const message = `Invalid where clause: Field "reqVal" is ${spec.name} and ${holds(spec)}, got ${big}`;

        expect((await refusedWhere({ reqVal: big })).message).toBe(message);
        expect((await refusedWhere({ reqVal: { gt: big } })).message).toBe(message);
        expect((await refusedWhere({ reqVal: { in: [1, big] } })).message).toBe(
          `Invalid where clause: Field "reqVal[1]" is ${spec.name} and ${holds(spec)}, got ${big}`,
        );
        expect((await refusedWhere({ objVal: { val: big } })).message).toContain(`Field "objVal.val" is ${spec.name}`);
        expect((await refusedWhere({ arrVal: { has: big } })).message).toContain(`is ${spec.name} and ${holds(spec)}`);
        expect((await refusedWhere({ tupVal: { 0: big } })).message).toContain(`is ${spec.name} and ${holds(spec)}`);
        expect((await refusedWhere({ reqVal: below(spec) })).message).toContain(`got ${below(spec)}`);
      });

      test('a float past the finite range', async () => {
        if (spec.kind !== 'float') return;
        const message = `Invalid where clause: Field "reqVal" is ${spec.name} and ${holds(spec)}, got ${overflow(spec)}`;

        expect((await refusedWhere({ reqVal: overflow(spec) })).message).toBe(message);
        expect((await refusedWhere({ reqVal: { lt: overflow(spec) } })).message).toBe(message);
      });

      test('a fraction on a whole-number kind', async () => {
        if (spec.kind === 'float') return;

        expect((await refusedWhere({ reqVal: 1.5 })).message).toBe(
          `Invalid where clause: Field "reqVal" is ${spec.name} and expects a whole number, got 1.5`,
        );
        expect((await refusedWhere({ reqVal: { between: [1, 2.5] } })).message).toContain(
          'expects a whole number, got 2.5',
        );
      });

      test('a bigint on a kind other than Uint64', async () => {
        if (spec.kind === 'u64') return;

        expect((await refusedWhere({ reqVal: 5n })).message).toBe(
          `Invalid where clause: Field "reqVal" is ${spec.name} and expects a number, got a bigint`,
        );
      });
    });
  });

  test('every kind: a filter refusal in a deleteMany deletes nothing', async () => {
    for (const spec of [...INT_SPECS, ...FLOAT_SPECS, ...WHOLE_SPECS.slice(-1)]) {
      await api(getClient(), spec).create({ data: data(1) });
      const bad = spec.kind === 'float' ? overflow(spec) : above(spec);
      const error = await rejection(() => api(getClient(), spec).deleteMany({ where: { reqVal: bad } }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(await api(getClient(), spec).count()).toBe(1);
    }
  });
});
