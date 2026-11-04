import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Tuples: @createdAt, @updatedAt and @defaultAlways elements', () => {
  let client: CerialClient;
  const born = new Date('2020-01-01T00:00:00.000Z');
  const touched = new Date('2021-01-01T00:00:00.000Z');

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  test('explicit values are kept on create', async () => {
    const result = await client.db.TupleStamped.create({
      data: { name: 'explicit', stamp: ['x', born, touched, 3] },
    });

    expect(result.stamp[1].toISOString()).toBe(born.toISOString());
    expect(result.stamp[2].toISOString()).toBe(touched.toISOString());
    expect(result.stamp[3]).toBe(3);
  });

  const stamp = (label: string): [string, Date, Date, number] => [label, born, touched, 3];

  test('the stored value survives a read unchanged', async () => {
    const created = await client.db.TupleStamped.create({ data: { name: 'read', stamp: stamp('x') } });
    const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

    expect(found?.stamp[1].toISOString()).toBe(born.toISOString());
    expect(found?.stamp[3]).toBe(3);
  });

  test('updating another field leaves every element as it was', async () => {
    const created = await client.db.TupleStamped.create({ data: { name: 'before', stamp: stamp('x') } });

    await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { name: 'after' } });
    const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

    expect(found?.name).toBe('after');
    expect(found?.stamp[1].toISOString()).toBe(born.toISOString());
    expect(found?.stamp[2].toISOString()).toBe(touched.toISOString());
  });

  test('replacing the tuple stores the new elements', async () => {
    const created = await client.db.TupleStamped.create({ data: { name: 'replace', stamp: stamp('x') } });
    const later = new Date('2022-02-02T00:00:00.000Z');

    await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: ['y', later, later, 9] } });
    const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

    expect(found?.stamp[0]).toBe('y');
    expect(found?.stamp[2].toISOString()).toBe(later.toISOString());
    expect(found?.stamp[3]).toBe(9);
  });

  test('an uncoercible element type is rejected', async () => {
    await expect(
      (async () => {
        // @ts-expect-error the hits element is an Int
        await client.db.TupleStamped.create({ data: { name: 'bad', stamp: { label: 'a', hits: 'abc' } } });
      })(),
    ).rejects.toThrow();
    expect(await client.db.TupleStamped.count()).toBe(0);
  });

  // A String element refuses a number, as a model String field does, instead of storing '5'.
  test('a String element refuses a number, like a model String field', async () => {
    await expect(
      (async () => {
        // @ts-expect-error the label element is a String
        await client.db.TupleStamped.create({ data: { name: 'refused-element', stamp: { label: 5 } } });
      })(),
    ).rejects.toThrow('stamp.label must be of type string');
    await expect(
      (async () => {
        await client.db.TupleStamped.create({ data: { name: 'refused', label: 5 } as never });
      })(),
    ).rejects.toThrow();
  });

  const nearNow = (value: Date): boolean => Math.abs(Date.now() - value.getTime()) < 10_000;
  const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  describe('@default', () => {
    test('an omitted position stores the declared default', async () => {
      const result = await client.db.TupleDefaulted.create({ data: { name: 'omit', meta: { label: 'a' } } });
      const found = await client.db.TupleDefaulted.findOne({ where: { id: result.id } });

      expect(result.meta).toEqual(['a', 1]);
      expect(found?.meta).toEqual(['a', 1]);
    });

    test('a supplied value is stored instead of the default', async () => {
      const result = await client.db.TupleDefaulted.create({ data: { name: 'given', meta: ['a', 5] } });

      expect(result.meta).toEqual(['a', 5]);
    });

    test('an explicit zero is kept, not replaced by the default', async () => {
      const result = await client.db.TupleDefaulted.create({ data: { name: 'zero', meta: ['a', 0] } });

      expect(result.meta[1]).toBe(0);
    });

    test('updating another field does not rewrite the defaulted position', async () => {
      const created = await client.db.TupleDefaulted.create({ data: { name: 'keep', meta: ['a', 5] } });

      await client.db.TupleDefaulted.updateMany({ where: { id: created.id }, data: { name: 'kept' } });
      const found = await client.db.TupleDefaulted.findOne({ where: { id: created.id } });

      expect(found?.meta).toEqual(['a', 5]);
    });

    test('a per-element update of another position keeps the stored default', async () => {
      const created = await client.db.TupleDefaulted.create({ data: { name: 'elem', meta: { label: 'a' } } });

      await client.db.TupleDefaulted.updateMany({ where: { id: created.id }, data: { meta: { label: 'b' } } });
      const found = await client.db.TupleDefaulted.findOne({ where: { id: created.id } });

      expect(found?.meta).toEqual(['b', 1]);
    });
  });

  describe('@createdAt', () => {
    test('an omitted position stores a timestamp close to now', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'omit', stamp: { label: 'a' } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: result.id } });

      expect(result.stamp[1]).toBeInstanceOf(Date);
      expect(nearNow(result.stamp[1])).toBe(true);
      expect(found?.stamp[1].toISOString()).toBe(result.stamp[1].toISOString());
    });

    test('a supplied timestamp survives', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'given', stamp: ['a', born, touched, 3] } });

      expect(result.stamp[1].toISOString()).toBe(born.toISOString());
    });

    test('updating another field does not move the created timestamp', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'before', stamp: { label: 'a' } } });
      await pause(30);

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { name: 'after' } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[1].toISOString()).toBe(created.stamp[1].toISOString());
    });

    test('a per-element update of another position does not move the created timestamp', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'elem', stamp: { label: 'a' } } });
      await pause(30);

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: { label: 'b' } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[0]).toBe('b');
      expect(found?.stamp[1].toISOString()).toBe(created.stamp[1].toISOString());
    });
  });

  describe('@updatedAt', () => {
    test('an omitted position stores a timestamp close to now', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'omit', stamp: { label: 'a' } } });

      expect(nearNow(result.stamp[2])).toBe(true);
    });

    test('a supplied timestamp survives create', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'given', stamp: ['a', born, touched, 3] } });

      expect(result.stamp[2].toISOString()).toBe(touched.toISOString());
    });

    test('a per-element update of another position moves the timestamp', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'elem', stamp: { label: 'a' } } });
      await pause(30);

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: { label: 'b' } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[2].getTime()).toBeGreaterThan(created.stamp[2].getTime());
      expect(nearNow(found!.stamp[2])).toBe(true);
    });

    test('updating a different field leaves the stored timestamp untouched', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'before', stamp: { label: 'a' } } });
      await pause(30);

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { name: 'after' } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[2].toISOString()).toBe(created.stamp[2].toISOString());
    });

    test('an explicit value on a per-element update is stored', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'explicit', stamp: { label: 'a' } } });

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: { touched } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[2].toISOString()).toBe(touched.toISOString());
    });

    test('an explicit value in a whole-tuple replace is stored', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'replace', stamp: { label: 'a' } } });

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: ['b', born, touched, 4] } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[2].toISOString()).toBe(touched.toISOString());
    });
  });

  describe('@defaultAlways', () => {
    test('an omitted position stores the default', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'omit', stamp: { label: 'a' } } });

      expect(result.stamp[3]).toBe(7);
    });

    test('an explicit value on create wins over the default', async () => {
      const result = await client.db.TupleStamped.create({ data: { name: 'given', stamp: ['a', born, touched, 3] } });
      const found = await client.db.TupleStamped.findOne({ where: { id: result.id } });

      expect(result.stamp[3]).toBe(3);
      expect(found?.stamp[3]).toBe(3);
    });

    test('a per-element update of another position resets the position to the default', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'reset', stamp: ['a', born, touched, 3] } });

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: { label: 'b' } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[3]).toBe(7);
    });

    test('an explicit value on a per-element update is stored', async () => {
      const created = await client.db.TupleStamped.create({ data: { name: 'explicit', stamp: { label: 'a' } } });

      await client.db.TupleStamped.updateMany({ where: { id: created.id }, data: { stamp: { hits: 9 } } });
      const found = await client.db.TupleStamped.findOne({ where: { id: created.id } });

      expect(found?.stamp[3]).toBe(9);
    });
  });

  describe('boundary rows', () => {
    test('the whole tuple absent on an optional tuple field stores no tuple and no fill', async () => {
      const created = await client.db.TupleDecoratedNest.create({
        data: { name: 'absent', outer: { label: 'a', 1: { count: 1 } } },
      });
      const found = await client.db.TupleDecoratedNest.findOne({ where: { id: created.id } });

      expect(found?.maybe).toBeUndefined();
    });

    test('an optional tuple that is supplied gets its omitted decorated positions filled', async () => {
      const created = await client.db.TupleDecoratedNest.create({
        data: { name: 'present', outer: { label: 'a', 1: { count: 1 } }, maybe: { label: 'm' } },
      });

      expect(created.maybe?.[3]).toBe(7);
      expect(nearNow(created.maybe![1])).toBe(true);
    });

    test('object input with the decorated key missing fills it', async () => {
      const result = await client.db.TupleStamped.create({
        data: { name: 'object-form', stamp: { label: 'a', hits: 4 } },
      });

      expect(result.stamp[0]).toBe('a');
      expect(nearNow(result.stamp[1])).toBe(true);
      expect(nearNow(result.stamp[2])).toBe(true);
      expect(result.stamp[3]).toBe(4);
    });

    test('a nested tuple whose inner element is decorated gets a timestamp when omitted', async () => {
      const result = await client.db.TupleDecoratedNest.create({
        data: { name: 'nested', outer: { label: 'a', 1: { count: 2 } } },
      });
      const found = await client.db.TupleDecoratedNest.findOne({ where: { id: result.id } });

      expect(found?.outer[1][0]).toBe(2);
      expect(nearNow(found!.outer[1][1])).toBe(true);
    });

    test('a nested tuple keeps a timestamp supplied for the inner element', async () => {
      const result = await client.db.TupleDecoratedNest.create({
        data: { name: 'nested-given', outer: ['a', [2, born]] },
      });

      expect(result.outer[1][1].toISOString()).toBe(born.toISOString());
    });
  });
});
