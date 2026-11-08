/**
 * E2E Tests: the update half of upsert merges object fields like updateUnique, on every where form
 *
 * Schemas: complex-types/objects.cerial (ObjectTestOrder), decorators/composite-unique-objects.cerial (Warehouse),
 *          decorators/unique-nulls.cerial (NnUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

interface Tree {
  payload: number;
  children: Tree[];
}
const n = (payload: number, children: Tree[] = []): Tree => ({ payload, children });
const billingAddress = { street: '1 Main', city: 'Oslo', state: 'OS' };
const item = (productName: string) => ({ productName, quantity: 1, price: 1, tags: [] });

describe('E2E Objects: upsert update half merges', () => {
  let client: CerialClient;
  const touched = [...tables.objects, ...tables.indexes, ...tables.uniqueNulls];

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, touched);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, touched);
  });

  const seedOrder = (data: { metadata?: Tree; items?: ReturnType<typeof item>[] } = {}) =>
    client.db.ObjectTestOrder.create({ data: { billingAddress, items: [], ...data } });
  const orderOf = async (row: { id: unknown }) =>
    (await client.db.ObjectTestOrder.findOne({ where: { id: row.id as never } }))!;

  describe('id where', () => {
    test('partial object merge keeps the untouched sub-keys', async () => {
      const row = await seedOrder();
      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [] },
        update: { billingAddress: { city: 'Bergen' } },
      });

      expect((await orderOf(row)).billingAddress).toEqual({ ...billingAddress, city: 'Bergen' });
    });

    test('nested object merge keeps the untouched sub-keys', async () => {
      const row = await seedOrder({ metadata: n(1, [n(2)]) });
      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [] },
        update: { metadata: { payload: 7 } },
      });

      expect((await orderOf(row)).metadata).toEqual(n(7, [n(2)]));
    });

    test('object-array push keeps the payload and appends the child', async () => {
      const row = await seedOrder({ metadata: n(1, [n(2)]) });
      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [] },
        // The generated input type of a self-referencing object's own list does not list push/set; the runtime takes them
        update: { metadata: { children: { push: n(3) } } } as never,
      });

      expect((await orderOf(row)).metadata).toEqual(n(1, [n(2), n(3)]));
    });

    test('object-array set replaces the children and keeps the payload', async () => {
      const row = await seedOrder({ metadata: n(1, [n(2)]) });
      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [] },
        // See above: push/set on the self-referencing list are runtime-only in the input type
        update: { metadata: { children: { set: [n(5), n(6)] } } } as never,
      });

      expect((await orderOf(row)).metadata).toEqual(n(1, [n(5), n(6)]));
    });

    test('top-level object array: push, set and replace', async () => {
      const row = await seedOrder({ items: [item('a')] });
      const upsert = (items: never) =>
        client.db.ObjectTestOrder.upsert({
          where: { id: row.id },
          create: { billingAddress, items: [] },
          update: { items },
        });

      await upsert({ push: item('b') } as never);
      expect((await orderOf(row)).items.map((i) => i.productName)).toEqual(['a', 'b']);
      await upsert({ set: [item('c')] } as never);
      expect((await orderOf(row)).items.map((i) => i.productName)).toEqual(['c']);
      await upsert([item('d'), item('e')] as never);
      expect((await orderOf(row)).items.map((i) => i.productName)).toEqual(['d', 'e']);
    });

    test('{ set } still replaces the whole object', async () => {
      const row = await seedOrder();
      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [] },
        update: { billingAddress: { set: { street: 'S', city: 'C', state: 'T' } } },
      });

      expect((await orderOf(row)).billingAddress).toEqual({ street: 'S', city: 'C', state: 'T' });
    });

    test('the create half still creates the full object', async () => {
      const id = 'f-create';
      const created = await client.db.ObjectTestOrder.upsert({
        where: { id },
        create: { id, billingAddress, items: [], metadata: n(1, [n(2)]) },
        update: { billingAddress: { city: 'Bergen' } },
      });

      expect(created?.billingAddress).toEqual(billingAddress);
      expect(created?.metadata).toEqual(n(1, [n(2)]));
    });

    test('an undeclared key is refused and the row is untouched', async () => {
      const row = await seedOrder();
      const attempt = (async () => {
        await client.db.ObjectTestOrder.upsert({
          where: { id: row.id },
          create: { billingAddress, items: [] },
          update: { billingAddress: { bogus: 'x' } as never },
        });
      })();

      await expect(attempt).rejects.toThrow();
      expect((await orderOf(row)).billingAddress).toEqual(billingAddress);
    });
  });

  describe('non-unique where', () => {
    const where = { billingAddress: { city: 'Oslo' } };

    test('partial merge and array push on the first match only', async () => {
      const a = await seedOrder({ metadata: n(1, [n(2)]) });
      const b = await seedOrder({ metadata: n(1, [n(2)]) });
      await client.db.ObjectTestOrder.upsert({
        where,
        create: { billingAddress, items: [] },
        update: { billingAddress: { city: 'Oslo' }, metadata: { children: { push: n(3) } } } as never,
      });

      const rows = [await orderOf(a), await orderOf(b)];
      const updated = rows.filter((r) => r.metadata?.children.length === 2);
      expect(updated).toHaveLength(1);
      expect(updated[0]!.metadata).toEqual(n(1, [n(2), n(3)]));
      expect(updated[0]!.billingAddress).toMatchObject({ street: '1 Main', state: 'OS' });
      expect(rows.filter((r) => r.metadata?.children.length === 1)).toHaveLength(1);
    });

    test('no match creates the full object and leaves others alone', async () => {
      const other = await seedOrder();
      await client.db.ObjectTestOrder.upsert({
        where: { billingAddress: { city: 'Nowhere' } },
        create: { billingAddress: { ...billingAddress, city: 'Nowhere' }, items: [] },
        update: { billingAddress: { street: 'X' } },
      });

      const rows = await client.db.ObjectTestOrder.findMany({ where: { billingAddress: { city: 'Nowhere' } } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.billingAddress).toEqual({ ...billingAddress, city: 'Nowhere' });
      expect((await orderOf(other)).billingAddress).toEqual(billingAddress);
    });
  });

  describe('composite unique where', () => {
    const where = { cityZip: { location: { city: 'NYC', zip: '10001' } } };
    const location = { city: 'NYC', zip: '10001', street: '5th Ave' };

    test('partial merge keeps the key sub-fields', async () => {
      await client.db.Warehouse.create({ data: { name: 'Downtown', location, capacity: 5 } });
      await client.db.Warehouse.upsert({
        where,
        create: { name: 'New', location },
        update: { location: { street: 'Broadway' }, capacity: 9 },
      });

      const rows = await client.db.Warehouse.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.location).toEqual({ ...location, street: 'Broadway' });
      expect(rows[0]!.capacity).toBe(9);
      expect(rows[0]!.name).toBe('Downtown');
    });

    test('no match creates the full object', async () => {
      const created = await client.db.Warehouse.upsert({
        where,
        create: { name: 'New', location },
        update: { location: { street: 'Broadway' } },
      });

      expect(created?.location).toEqual(location);
    });
  });

  describe('unique field and nullsNotDistinct where', () => {
    test('unique field: object merge and untouched fields survive', async () => {
      await client.db.NnUser.create({
        data: { email: 'a@b.co', nickname: 'nick', plainNick: 'plain', profile: { handle: 'h1' } },
      });
      await client.db.NnUser.upsert({
        where: { email: 'a@b.co' },
        create: { email: 'a@b.co' },
        update: { profile: { handle: 'h2' } },
      });

      const rows = await client.db.NnUser.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ nickname: 'nick', plainNick: 'plain', profile: { handle: 'h2' } });
    });

    test('nullsNotDistinct: a null key matches the existing null row, one row stays', async () => {
      await client.db.NnUser.create({ data: { email: 'a@b.co', nickname: null, profile: { handle: 'h1' } } });
      await client.db.NnUser.upsert({
        where: { nickname: null },
        create: { email: 'new@b.co', nickname: null },
        update: { profile: { handle: 'h2' } },
      });

      const rows = await client.db.NnUser.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.profile).toEqual({ handle: 'h2' });
    });

    test('an undefined unique key is still refused', async () => {
      const attempt = (async () => {
        await client.db.NnUser.upsert({
          where: { email: undefined } as never,
          create: { email: 'a@b.co' },
          update: { profile: { handle: 'h' } },
        });
      })();

      await expect(attempt).rejects.toThrow();
      expect(await client.db.NnUser.findMany()).toHaveLength(0);
    });
  });
});
