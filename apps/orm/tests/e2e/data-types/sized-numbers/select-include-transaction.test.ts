import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import { ALL_SPECS, api, data, outOfRange, read, rejection, setup } from './helpers';

describe('E2E sized numbers: select, include and $transaction', () => {
  const { getClient } = setup();

  describe.each(ALL_SPECS)('$name: select', (spec) => {
    const model = () => api(getClient(), spec);

    test('selects keep the mapped types, including nested object fields and tuples', async () => {
      const row = await model().create({
        data: data(3, { arrVal: [3, 4], objVal: { val: 3, opt: 4 }, tupVal: [3, 4] }),
      });
      const selected = await model().findOne({
        where: { id: row.id },
        select: { reqVal: true, arrVal: true, objVal: true, tupVal: true },
      });

      expect(selected).toEqual({
        reqVal: read(spec, 3),
        arrVal: [read(spec, 3), read(spec, 4)],
        objVal: { val: read(spec, 3), opt: read(spec, 4) },
        tupVal: [read(spec, 3), read(spec, 4)],
      });
    });

    test('a select of one field leaves the others out', async () => {
      const row = await model().create({ data: data(3) });
      const selected = await model().findMany({ where: { id: row.id }, select: { reqVal: true } });

      expect(selected).toEqual([{ reqVal: read(spec, 3) }]);
    });

    test('a select on a write returns the mapped values', async () => {
      const created = await model().create({ data: data(7), select: { reqVal: true, dfltVal: true } });

      expect(created).toEqual({ reqVal: read(spec, 7), dfltVal: read(spec, spec.dflt) });
    });
  });

  describe('include: sized fields on related rows', () => {
    const owner = () => getClient().db.SzOwner;
    const reading = () => getClient().db.SzReading;
    const U64_BIG = 2n ** 63n + 7n;

    const seed = async () => {
      const created = await owner().create({ data: { name: 'station' } });

      await reading().create({ data: { ownerId: created.id, channel: 3, level: 0.1, counter: U64_BIG } });
      await reading().create({ data: { ownerId: created.id, channel: 200, level: 16777217, counter: 5 } });

      return created;
    };

    test('related rows come back with each kind mapped', async () => {
      const station = await seed();
      const found = (await owner().findOne({ where: { id: station.id }, include: { readings: true } }))!;
      const rows = [...found.readings].sort((a, b) => a.channel - b.channel);

      expect(rows.map((r) => r.channel)).toEqual([3, 200]);
      expect(rows.map((r) => r.level)).toEqual([Math.fround(0.1), 16777216]);
      expect(rows.map((r) => r.counter)).toEqual([U64_BIG, 5n]);
      expect(typeof rows[1]!.counter).toBe('bigint');
    });

    test('an include can filter and order by the sized fields', async () => {
      const station = await seed();
      const found = (await owner().findOne({
        where: { id: station.id },
        include: { readings: { where: { counter: { gt: 5n } }, orderBy: { channel: 'desc' } } },
      }))!;

      expect(found.readings.map((r) => r.counter)).toEqual([U64_BIG]);

      const ordered = (await owner().findOne({
        where: { id: station.id },
        include: { readings: { orderBy: { counter: 'desc' } } },
      }))!;
      expect(ordered.readings.map((r) => r.counter)).toEqual([U64_BIG, 5n]);
    });

    test('the child side includes its owner and filters by the sized field of the owner relation', async () => {
      const station = await seed();
      const rows = await reading().findMany({
        where: { level: Math.fround(0.1) },
        include: { owner: true },
      });

      expect(rows.length).toBe(1);
      expect(rows[0]!.owner.id.toString()).toBe(station.id.toString());
      expect(rows[0]!.counter).toBe(U64_BIG);
    });

    test('a related create with an out-of-range sized value is refused and writes nothing', async () => {
      const station = await owner().create({ data: { name: 'x' } });
      const error = await rejection(() =>
        reading().create({ data: { ownerId: station.id, channel: 256, level: 1, counter: 1 } }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(error.message).toBe('Invalid data: Field "channel" is Uint8 and holds 0 to 255, got 256');
      expect(await reading().count()).toBe(0);
    });

    test('a sized field orders through a relation, as for Int', async () => {
      const a = await owner().create({ data: { name: 'a' } });
      const b = await owner().create({ data: { name: 'b' } });

      await reading().create({ data: { ownerId: b.id, channel: 1, level: 1, counter: 1 } });
      await reading().create({ data: { ownerId: a.id, channel: 2, level: 1, counter: 1 } });

      expect((await reading().findMany({ orderBy: { owner: { name: 'asc' } } })).map((r) => r.channel)).toEqual([2, 1]);
    });
  });

  describe.each(ALL_SPECS)('$name: $transaction', (spec) => {
    const model = () => api(getClient(), spec);

    test('callback mode: the rows written inside are read back typed, then committed', async () => {
      await getClient().$transaction(async (txn) => {
        await model().create({ data: data(3), txn });
        await model().create({ data: data(4), txn });
        const inside = await model().findMany({ orderBy: { reqVal: 'asc' }, txn });

        expect(inside.map((r) => r.reqVal)).toEqual([read(spec, 3), read(spec, 4)]);
      });

      expect(await model().count()).toBe(2);
    });

    test('a thrown error rolls the sized writes back', async () => {
      const attempt = async () => {
        await getClient().$transaction(async (txn) => {
          await model().create({ data: data(3), txn });
          throw new Error('stop');
        });
      };

      await expect(attempt()).rejects.toThrow('stop');
      expect(await model().count()).toBe(0);
    });

    test('an out-of-range value is refused inside a transaction and nothing commits', async () => {
      const attempt = async () => {
        await getClient().$transaction(async (txn) => {
          await model().create({ data: data(3), txn });
          await model().create({ data: data(outOfRange(spec)), txn });
        });
      };

      await expect(attempt()).rejects.toThrow(CerialValidationError);
      expect(await model().count()).toBe(0);
    });
  });

  describe('array mode, through the generated models', () => {
    test('Uint8 and Uint64 writes and reads in one transaction come back typed', async () => {
      const big = 2n ** 63n + 1n;
      const [small, large, rows] = await getClient().$transaction([
        getClient().db.SzUint8.create({
          data: { reqVal: 255, nullVal: null, arrVal: [], setVal: [], objVal: { val: 1 }, tupVal: [1, null] },
        }),
        getClient().db.SzUint64.create({
          data: { reqVal: big, nullVal: null, arrVal: [big], setVal: [], objVal: { val: big }, tupVal: [big, null] },
        }),
        getClient().db.SzUint64.findMany({ where: { reqVal: big } }),
      ]);

      expect(small.reqVal).toBe(255);
      expect(large.reqVal).toBe(big);
      expect(rows.map((r) => r.reqVal)).toEqual([big]);
    });

    test('an out-of-range item is refused before anything runs', async () => {
      const attempt = async () => {
        await getClient().$transaction([
          getClient().db.SzUint64.create({
            data: { reqVal: 1, nullVal: null, arrVal: [], setVal: [], objVal: { val: 1 }, tupVal: [1, null] },
          }),
          getClient().db.SzUint64.create({
            data: { reqVal: 2n ** 64n, nullVal: null, arrVal: [], setVal: [], objVal: { val: 1 }, tupVal: [1, null] },
          }),
        ]);
      };

      await expect(attempt()).rejects.toThrow(CerialValidationError);
      expect(await getClient().db.SzUint64.count()).toBe(0);
    });
  });

  test('Uint64 past 2^63 in a transaction round trips and filters exactly', async () => {
    const spec = ALL_SPECS[6]!;
    const big = 2n ** 63n + 99n;

    await getClient().$transaction(async (txn) => {
      await api(getClient(), spec).create({ data: data(big), txn });
      const rows = await api(getClient(), spec).findMany({ where: { reqVal: big }, txn });

      expect(rows.map((r) => r.reqVal)).toEqual([big]);
    });

    expect((await api(getClient(), spec).findMany({ where: { reqVal: big + 1n } })).length).toBe(0);
    expect((await api(getClient(), spec).findMany({ where: { reqVal: big } })).length).toBe(1);
  });
});
