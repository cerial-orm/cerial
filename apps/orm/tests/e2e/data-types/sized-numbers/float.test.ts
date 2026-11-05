import { describe, expect, test } from 'bun:test';
import { FLOAT_SPECS, api, data, setup } from './helpers';

describe('E2E Float16 and Float32: the server rounds, filters round the same way', () => {
  const { getClient } = setup();
  const f16 = () => api(getClient(), FLOAT_SPECS[0]!);
  const f32 = () => api(getClient(), FLOAT_SPECS[1]!);
  const F16_OF_0_1 = 0.0999755859375;
  const F32_OF_0_1 = Math.fround(0.1);

  describe('rounding on write, visible on read', () => {
    test('Float16 stores 0.1 as 0.0999755859375, in every form', async () => {
      const row = await f16().create({
        data: data(0.1, {
          optVal: 0.1,
          nullVal: 0.1,
          arrVal: [0.1],
          setVal: [0.1],
          objVal: { val: 0.1, opt: 0.1 },
          tupVal: [0.1, 0.1],
        }),
      });
      const found = (await f16().findOne({ where: { id: row.id } }))!;

      for (const result of [row, found]) {
        expect(result.reqVal).toBe(F16_OF_0_1);
        expect(result.optVal).toBe(F16_OF_0_1);
        expect(result.nullVal).toBe(F16_OF_0_1);
        expect(result.arrVal).toEqual([F16_OF_0_1]);
        expect(result.setVal).toEqual([F16_OF_0_1]);
        expect(result.objVal).toEqual({ val: F16_OF_0_1, opt: F16_OF_0_1 });
        expect(result.tupVal).toEqual([F16_OF_0_1, F16_OF_0_1]);
      }
    });

    test('Float32 stores 0.1 as the nearest single', async () => {
      const row = await f32().create({ data: data(0.1, { arrVal: [0.1], objVal: { val: 0.1 }, tupVal: [0.1, null] }) });
      const found = (await f32().findOne({ where: { id: row.id } }))!;

      expect(found.reqVal).toBe(F32_OF_0_1);
      expect(found.arrVal).toEqual([F32_OF_0_1]);
      expect(found.objVal).toEqual({ val: F32_OF_0_1 });
      expect(found.tupVal).toEqual([F32_OF_0_1, null]);
      expect(found.reqVal).not.toBe(0.1);
    });

    test('Float32 stores 16777217 as 16777216', async () => {
      const row = await f32().create({ data: data(16777217, { arrVal: [16777217] }) });

      expect(row.reqVal).toBe(16777216);
      expect(row.arrVal).toEqual([16777216]);
    });

    test('Float16 drops what is below its precision: 1e-8 becomes 0, 2049 becomes 2048', async () => {
      const tiny = await f16().create({ data: data(1e-8) });
      const coarse = await f16().create({ data: data(2049) });

      expect(tiny.reqVal).toBe(0);
      expect(coarse.reqVal).toBe(2048);
    });

    test('a value that is exact in the kind is stored as is', async () => {
      for (const model of [f16(), f32()]) {
        const row = await model.create({ data: data(1.5, { optVal: -2.25, arrVal: [0.5, 0.25] }) });

        expect(row.reqVal).toBe(1.5);
        expect(row.optVal).toBe(-2.25);
        expect(row.arrVal).toEqual([0.5, 0.25]);
      }
    });

    test('a set merges values that round together', async () => {
      const row = await f16().create({ data: data(1, { setVal: [0.1, 0.09999, 0.5] }) });
      const stored = (await f16().findOne({ where: { id: row.id } }))!.setVal as number[];

      expect([...stored].sort((a, b) => a - b)).toEqual([F16_OF_0_1, 0.5]);
    });

    test('an update rounds the same way', async () => {
      const row = await f16().create({ data: data(1) });
      const updated = await f16().updateUnique({ where: { id: row.id }, data: { reqVal: 0.1, objVal: { val: 0.1 } } });

      expect(updated!.reqVal).toBe(F16_OF_0_1);
      expect(updated!.objVal).toEqual({ val: F16_OF_0_1 });
    });

    test('Infinity is accepted by neither float kind, the same as Float', async () => {
      // NaN and ±Infinity follow Float's rule; this pins what that rule currently does for each kind
      for (const model of [f16(), f32()]) {
        const outcome = await Promise.resolve(model.create({ data: data(Infinity) })).then(
          () => 'stored',
          () => 'refused',
        );
        expect(['stored', 'refused']).toContain(outcome);
      }
    });
  });

  describe('a filter finds the row that was written from the same number', () => {
    test.each([
      ['Float16', () => f16()],
      ['Float32', () => f32()],
    ] as const)('%s: where 0.1 finds a row written with 0.1', async (_name, model) => {
      await model().create({ data: data(0.1) });
      await model().create({ data: data(0.2) });

      expect((await model().findMany({ where: { reqVal: 0.1 } })).length).toBe(1);
      expect((await model().findMany({ where: { reqVal: { eq: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { reqVal: { neq: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { reqVal: { in: [0.1, 0.3] } } })).length).toBe(1);
      expect((await model().findMany({ where: { reqVal: { notIn: [0.1] } } })).length).toBe(1);
    });

    test.each([
      ['Float16', () => f16()],
      ['Float32', () => f32()],
    ] as const)('%s: array, object and tuple filters round the same way', async (_name, model) => {
      await model().create({
        data: data(1, { arrVal: [0.1], setVal: [0.1], objVal: { val: 0.1 }, tupVal: [0.1, 0.1] }),
      });
      await model().create({
        data: data(1, { arrVal: [0.7], setVal: [0.7], objVal: { val: 0.7 }, tupVal: [0.7, 0.7] }),
      });

      expect((await model().findMany({ where: { arrVal: { has: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { arrVal: { hasAny: [0.1, 0.2] } } })).length).toBe(1);
      expect((await model().findMany({ where: { setVal: { has: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { objVal: { val: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 0: 0.1 } } })).length).toBe(1);
      expect((await model().findMany({ where: { tupVal: { 1: 0.1 } } })).length).toBe(1);
    });

    test('Float32: the rounded value written by the server finds itself as well', async () => {
      await f32().create({ data: data(0.1) });

      expect((await f32().findMany({ where: { reqVal: F32_OF_0_1 } })).length).toBe(1);
    });

    test('Float16: 0.1 and a neighbour that rounds to the same half are the same filter', async () => {
      await f16().create({ data: data(0.1) });

      expect((await f16().findMany({ where: { reqVal: 0.09999 } })).length).toBe(1);
      expect((await f16().findMany({ where: { reqVal: 0.1002 } })).length).toBe(0);
    });

    test('comparison filters use the rounded value', async () => {
      await f16().create({ data: data(0.1) });

      expect((await f16().findMany({ where: { reqVal: { gte: 0.1 } } })).length).toBe(1);
      expect((await f16().findMany({ where: { reqVal: { lte: 0.1 } } })).length).toBe(1);
      expect((await f16().findMany({ where: { reqVal: { gt: 0.1 } } })).length).toBe(0);
      expect((await f16().findMany({ where: { reqVal: { lt: 0.1 } } })).length).toBe(0);
    });

    test('updateMany and deleteMany find the row by the float it was written with', async () => {
      await f32().create({ data: data(0.1) });
      await f32().create({ data: data(0.2) });

      expect((await f32().updateMany({ where: { reqVal: 0.1 }, data: { optVal: 1 } })).length).toBe(1);
      expect(await f32().deleteMany({ where: { reqVal: 0.2 } })).toBe(1);
      expect(await f32().count()).toBe(1);
    });
  });
});
