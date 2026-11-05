import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  ALL_SPECS,
  type Row,
  WHOLE_SPECS,
  above,
  api,
  data,
  holds,
  outOfRange,
  read,
  rejection,
  setup,
} from './helpers';

/** Update bodies that put `v` in one place each. */
const UPDATE_FORMS: ReadonlyArray<{ path: string; body: (v: number | bigint) => Row }> = [
  { path: 'reqVal', body: (v) => ({ reqVal: v }) },
  { path: 'optVal', body: (v) => ({ optVal: v }) },
  { path: 'nullVal', body: (v) => ({ nullVal: v }) },
  { path: 'arrVal[1]', body: (v) => ({ arrVal: [1, v] }) },
  { path: 'setVal[1]', body: (v) => ({ setVal: [1, v] }) },
  { path: 'dfltVal', body: (v) => ({ dfltVal: v }) },
  { path: 'objVal.val', body: (v) => ({ objVal: { val: v } }) },
  { path: 'objVal.opt', body: (v) => ({ objVal: { opt: v } }) },
  { path: 'tupVal[0]', body: (v) => ({ tupVal: [v, null] }) },
  { path: 'tupVal[1]', body: (v) => ({ tupVal: [1, v] }) },
];

describe('E2E sized numbers: updateUnique, updateMany and upsert', () => {
  const { getClient } = setup();

  describe.each(ALL_SPECS)('$name', (spec) => {
    const model = () => api(getClient(), spec);
    const val = (n: number) => read(spec, n);
    const kind = spec.kind === 'u64' ? 'bigint' : 'number';

    describe('updateUnique', () => {
      test('replaces every form and reads each back with the right type', async () => {
        const row = await model().create({ data: data(1) });
        const updated = await model().updateUnique({
          where: { id: row.id },
          data: {
            reqVal: 2,
            optVal: 3,
            nullVal: 4,
            arrVal: [5, 6],
            setVal: [7, 7, 8],
            dfltVal: 9,
            objVal: { val: 10, opt: 11 },
            tupVal: [12, 13],
          },
        });
        const found = (await model().findOne({ where: { id: row.id } }))!;

        for (const result of [updated!, found]) {
          expect(result.reqVal).toBe(val(2));
          expect(result.optVal).toBe(val(3));
          expect(result.nullVal).toBe(val(4));
          expect(result.arrVal).toEqual([val(5), val(6)]);
          expect((result.setVal as unknown[]).map(Number).sort((a, b) => a - b)).toEqual([7, 8]);
          expect(result.dfltVal).toBe(val(9));
          expect(result.objVal).toEqual({ val: val(10), opt: val(11) });
          expect(result.tupVal).toEqual([val(12), val(13)]);
          expect(typeof result.reqVal).toBe(kind);
        }
      });

      test('a nullable field goes to null and back', async () => {
        const row = await model().create({ data: data(1, { nullVal: 5 }) });

        expect((await model().updateUnique({ where: { id: row.id }, data: { nullVal: null } }))!.nullVal).toBeNull();
        expect((await model().updateUnique({ where: { id: row.id }, data: { nullVal: 6 } }))!.nullVal).toBe(val(6));
      });

      test('an optional field is cleared by unset', async () => {
        const row = await model().create({ data: data(1, { optVal: 5 }) });
        const cleared = await model().updateUnique({ where: { id: row.id }, data: {}, unset: { optVal: true } });

        expect(cleared!.optVal).toBeUndefined();
        expect((await model().findOne({ where: { id: row.id } }))!.optVal).toBeUndefined();
      });

      test('an object sub-field updates alone and leaves its sibling', async () => {
        const row = await model().create({ data: data(1, { objVal: { val: 2, opt: 3 } }) });
        const updated = await model().updateUnique({ where: { id: row.id }, data: { objVal: { val: 9 } } });

        expect(updated!.objVal).toEqual({ val: val(9), opt: val(3) });
      });

      test('a tuple element updates through the object form and leaves the rest', async () => {
        const row = await model().create({ data: data(1, { tupVal: [2, 3] }) });
        const updated = await model().updateUnique({ where: { id: row.id }, data: { tupVal: { 0: 9 } } });

        expect(updated!.tupVal).toEqual([val(9), val(3)]);
      });

      test('push appends one value or several, in range', async () => {
        const row = await model().create({ data: data(1, { arrVal: [1] }) });

        await model().updateUnique({ where: { id: row.id }, data: { arrVal: { push: 2 } } });
        const updated = await model().updateUnique({ where: { id: row.id }, data: { arrVal: { push: [3, 4] } } });

        expect(updated!.arrVal).toEqual([val(1), val(2), val(3), val(4)]);
      });

      test.each([
        ['push of one value', (v: number | bigint) => ({ push: v }), 'arrVal[0]'],
        ['push of several values names the index within them', (v: number | bigint) => ({ push: [1, v] }), 'arrVal[1]'],
        ['set', (v: number | bigint) => ({ set: [1, v] }), 'arrVal[1]'],
      ])('array %s out of range is refused naming the field and the array stays', async (_label, op, path) => {
        const row = await model().create({ data: data(1, { arrVal: [1] }) });
        const error = await rejection(() =>
          model().updateUnique({ where: { id: row.id }, data: { arrVal: op(outOfRange(spec)) } }),
        );

        expect(error).toBeInstanceOf(CerialValidationError);
        expect(error.message).toBe(
          `Invalid data: Field "${path}" is ${spec.name} and ${holds(spec)}, got ${outOfRange(spec)}`,
        );
        expect((await model().findOne({ where: { id: row.id } }))!.arrVal).toEqual([val(1)]);
      });

      test('push out of range into a set field and through updateMany and upsert is refused too', async () => {
        const row = await model().create({ data: data(1, { setVal: [1] }) });
        const message = `Invalid data: Field "setVal[0]" is ${spec.name} and ${holds(spec)}, got ${outOfRange(spec)}`;

        expect(
          (await rejection(() => model().updateMany({ data: { setVal: { push: outOfRange(spec) } } }))).message,
        ).toBe(message);
        expect(
          (
            await rejection(() =>
              model().upsert({
                where: { id: row.id },
                create: data(1),
                update: { setVal: { push: outOfRange(spec) } },
              }),
            )
          ).message,
        ).toBe(message);
        expect((await model().findOne({ where: { id: row.id } }))!.setVal).toEqual([val(1)]);
      });

      test('push of the range ends is accepted', async () => {
        if (spec.kind === 'float') return;
        const row = await model().create({ data: data(1, { arrVal: [] }) });
        const updated = await model().updateUnique({
          where: { id: row.id },
          data: { arrVal: { push: [spec.min!, spec.max!].map((n) => (spec.kind === 'u64' ? n : Number(n))) } },
        });

        expect(updated!.arrVal).toEqual([spec.min, spec.max].map((n) => (spec.kind === 'u64' ? n : Number(n))));
      });

      test.each(UPDATE_FORMS)(
        '$path out of range is refused naming the field, and the row is untouched',
        async ({ path, body }) => {
          const row = await model().create({
            data: data(1, { optVal: 1, nullVal: 1, arrVal: [1, 1], setVal: [1], objVal: { val: 1, opt: 1 } }),
          });
          const before = await model().findOne({ where: { id: row.id } });
          const error = await rejection(() =>
            model().updateUnique({ where: { id: row.id }, data: body(outOfRange(spec)) }),
          );

          expect(error).toBeInstanceOf(CerialValidationError);
          expect(error.message).toBe(
            `Invalid data: Field "${path}" is ${spec.name} and ${holds(spec)}, got ${outOfRange(spec)}`,
          );
          expect(await model().findOne({ where: { id: row.id } })).toEqual(before);
        },
      );

      test('a bigint on a kind other than Uint64 is refused', async () => {
        if (spec.kind === 'u64') return;
        const row = await model().create({ data: data(1) });
        const error = await rejection(() => model().updateUnique({ where: { id: row.id }, data: { reqVal: 5n } }));

        expect(error.message).toBe(`Invalid data: Field "reqVal" is ${spec.name} and expects a number, got a bigint`);
      });
    });

    describe('updateMany', () => {
      test('sets every matching row and only those', async () => {
        await model().create({ data: data(1) });
        await model().create({ data: data(1) });
        await model().create({ data: data(2) });
        const updated = await model().updateMany({ where: { reqVal: 1 }, data: { reqVal: 9, arrVal: [4] } });
        const all = await model().findMany({ orderBy: { reqVal: 'asc' } });

        expect(updated.map((r) => r.reqVal)).toEqual([val(9), val(9)]);
        expect(all.map((r) => r.reqVal)).toEqual([val(2), val(9), val(9)]);
        expect(all.filter((r) => (r.arrVal as unknown[]).length).length).toBe(2);
      });

      test('an out-of-range value is refused and no row changes', async () => {
        await model().create({ data: data(1) });
        await model().create({ data: data(1) });
        const error = await rejection(() =>
          model().updateMany({ where: { reqVal: 1 }, data: { reqVal: outOfRange(spec) } }),
        );

        expect(error).toBeInstanceOf(CerialValidationError);
        expect(error.message).toContain(`Field "reqVal" is ${spec.name}`);
        expect((await model().findMany()).map((r) => r.reqVal)).toEqual([val(1), val(1)]);
      });

      test('a where that matches nothing updates nothing', async () => {
        await model().create({ data: data(1) });

        expect(await model().updateMany({ where: { reqVal: 5 }, data: { reqVal: 6 } })).toEqual([]);
      });
    });

    describe('upsert', () => {
      test('creates when the row is absent and updates when it is there', async () => {
        const created = await model().upsert({
          where: { id: 'up1' },
          create: data(1, { id: 'up1' }),
          update: { reqVal: 2 },
        });

        expect(created.reqVal).toBe(val(1));
        expect(typeof created.reqVal).toBe(kind);

        const updated = await model().upsert({
          where: { id: 'up1' },
          create: data(1, { id: 'up1' }),
          update: { reqVal: 2 },
        });

        expect(updated.reqVal).toBe(val(2));
        expect(await model().count()).toBe(1);
      });

      test('an out-of-range value on the create side is refused and nothing is created', async () => {
        const error = await rejection(() =>
          model().upsert({
            where: { id: 'up2' },
            create: data(1, { id: 'up2', reqVal: outOfRange(spec) }),
            update: { reqVal: 2 },
          }),
        );

        expect(error).toBeInstanceOf(CerialValidationError);
        expect(error.message).toContain(`Field "reqVal" is ${spec.name} and ${holds(spec)}`);
        expect(await model().count()).toBe(0);
      });

      test('an out-of-range value on the update side is refused and the row keeps its value', async () => {
        await model().create({ data: data(1, { id: 'up3' }) });
        const error = await rejection(() =>
          model().upsert({
            where: { id: 'up3' },
            create: data(1, { id: 'up3' }),
            update: { reqVal: outOfRange(spec) },
          }),
        );

        expect(error).toBeInstanceOf(CerialValidationError);
        expect((await model().findOne({ where: { id: 'up3' } }))!.reqVal).toBe(val(1));
      });

      test('a where-based upsert reads back typed values', async () => {
        const rows = (await model().upsert({
          where: { reqVal: 4 },
          create: data(4),
          update: { arrVal: [5] },
        })) as unknown as Row[];

        expect(Array.isArray(rows)).toBe(true);
        expect(rows[0]!.reqVal).toBe(val(4));
      });
    });
  });

  describe.each(WHOLE_SPECS)('$name: no increment operator exists, so a past-range sum cannot be sent', (spec) => {
    test('the only way past the range is a literal value, and that is refused before sending', async () => {
      const row = await api(getClient(), spec).create({ data: data(1) });
      const error = await rejection(() =>
        api(getClient(), spec).updateUnique({ where: { id: row.id }, data: { reqVal: above(spec) } }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
    });
  });
});
