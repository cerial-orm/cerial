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

  // Records a gap rather than endorsing it: a String element is not type-checked, so a number or an
  // object reaches String() and is stored as '5' or '[object Object]'. A model String field refuses
  // all three with CerialValidationError, so the two paths disagree. Until the decorators fired, the
  // write failed on arity before the value was ever stored, which is why nothing caught this.
  test('a String element coerces instead of refusing, unlike a model String field', async () => {
    const result = await client.db.TupleStamped.create({
      // @ts-expect-error the label element is a String
      data: { name: 'coerced', stamp: { label: 5 } },
    });

    expect(result.stamp[0]).toBe('5');
    await expect(
      (async () => {
        await client.db.TupleStamped.create({ data: { name: 'refused', label: 5 } as never });
      })(),
    ).rejects.toThrow();
  });
});
