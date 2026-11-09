/**
 * E2E: an object inside an array or tuple element missing a required scalar
 *
 * The database refuses such a create, and a filter comparing the same whole value used to be accepted: a
 * negated deleteMany with it removed every row. Each is refused naming the field before any row is touched.
 * Destructive calls come first.
 *
 * Schemas: objects.cerial (ObjectTestOrder.items, OrderItem with required scalars) and tuples.cerial
 * (TupleObjInTuple.place, a tuple holding an object with required street and city).
 */

import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../../data-types/test-factory';

const loose = (value: unknown): never => value as never;

const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

const address = { street: 's', city: 'c', state: 'st' };
const item = { productName: 'p', quantity: 1, price: 1.5, tags: [] as string[] };

describe('E2E: an element missing a required scalar', () => {
  const { getClient } = setupDataTypeTests([...tables.objects, ...tables.tuples]);

  describe('an array of objects', () => {
    const seed = async (): Promise<void> => {
      for (const n of [1, 2, 3])
        await getClient().db.ObjectTestOrder.create({
          data: { billingAddress: address, items: [{ ...item, quantity: n }] },
        });
    };
    const count = async (): Promise<number> => getClient().db.ObjectTestOrder.count();

    test.each([
      ['an empty element', [{}], /items\[0\]\.productName is required/],
      ['an element missing quantity', [{ productName: 'p', price: 1, tags: [] }], /items\[0\]\.quantity is required/],
      ['the second element only', [item, { productName: 'p' }], /items\[1\]\./],
    ])('a negated deleteMany with %s is refused and deletes nothing', async (_name, items, pattern) => {
      await seed();
      await refuses(() => getClient().db.ObjectTestOrder.deleteMany({ where: loose({ NOT: { items } }) }), pattern);
      expect(await count()).toBe(3);
    });

    test('updateMany and count with such a value are refused and change nothing', async () => {
      await seed();
      await refuses(
        () =>
          getClient().db.ObjectTestOrder.updateMany({
            where: loose({ NOT: { items: [{}] } }),
            data: { metadata: null } as never,
          }),
        /items\[0\]/,
      );
      await refuses(() => getClient().db.ObjectTestOrder.count(loose({ items: [{}] })), /items\[0\]/);
      expect(await count()).toBe(3);
    });

    test('create refuses it naming the field, before the database does', async () => {
      await refuses(
        () =>
          getClient().db.ObjectTestOrder.create({
            data: loose({ billingAddress: address, items: [{ productName: 'p' }] }),
          }),
        /items\[0\]\.quantity is required/,
      );
      expect(await count()).toBe(0);
    });

    test('an update writing a whole array with such an element is refused and keeps the row', async () => {
      await seed();
      await refuses(
        () =>
          getClient().db.ObjectTestOrder.updateMany({
            where: { billingAddress: { street: 's' } },
            data: loose({ items: [{ productName: 'p' }] }),
          }),
        /items\[0\]\./,
      );
      expect((await getClient().db.ObjectTestOrder.findMany()).every((o) => o.items.length === 1)).toBe(true);
    });

    test('a complete element is accepted: the same negated filter deletes the others and spares the match', async () => {
      await seed();
      const where = loose({ NOT: { items: [{ ...item, quantity: 2 }] } });
      expect(await getClient().db.ObjectTestOrder.deleteMany({ where })).toBe(2);
      const left = await getClient().db.ObjectTestOrder.findMany();
      expect(left.map((o) => o.items[0]?.quantity)).toEqual([2]);
    });

    test('a filter on one element field is partial and still works', async () => {
      await seed();
      expect(await getClient().db.ObjectTestOrder.count({ items: { some: { quantity: 2 } } })).toBe(1);
    });
  });

  describe('an object inside a tuple', () => {
    const seed = async (): Promise<void> => {
      for (const tag of ['a', 'b', 'c'])
        await getClient().db.TupleObjInTuple.create({ data: { place: [tag, { street: 's', city: 'c' }] } });
    };
    const count = async (): Promise<number> => getClient().db.TupleObjInTuple.count();

    test('a negated deleteMany with an object missing a required scalar is refused and deletes nothing', async () => {
      await seed();
      for (const place of [
        ['a', {}],
        ['a', { street: 's' }],
        ['a', { city: 'c' }],
      ])
        await refuses(
          () => getClient().db.TupleObjInTuple.deleteMany({ where: loose({ NOT: { place } }) }),
          /place\[1\]\.(street|city) is required/,
        );
      expect(await count()).toBe(3);
    });

    test('create refuses it naming the field, in array and object form', async () => {
      await refuses(
        () => getClient().db.TupleObjInTuple.create({ data: loose({ place: ['a', { street: 's' }] }) }),
        /place\[1\]\.city is required/,
      );
      await refuses(
        () => getClient().db.TupleObjInTuple.create({ data: loose({ place: { 0: 'a', 1: { street: 's' } } }) }),
        /place\.1\.city is required/,
      );
      expect(await count()).toBe(0);
    });

    test('a complete tuple is accepted and a negated filter on it spares only that row', async () => {
      await seed();
      const where = loose({ NOT: { place: ['b', { street: 's', city: 'c' }] } });
      expect(await getClient().db.TupleObjInTuple.deleteMany({ where })).toBe(2);
      expect((await getClient().db.TupleObjInTuple.findMany()).map((r) => r.place[0])).toEqual(['b']);
    });

    test('a filter by element is partial and still works', async () => {
      await seed();
      expect(await getClient().db.TupleObjInTuple.count(loose({ place: { 1: { street: 's' } } }))).toBe(3);
    });
  });
});
