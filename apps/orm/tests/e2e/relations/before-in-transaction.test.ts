/**
 * E2E Tests for `select` on `return: 'before'` inside `$transaction`
 *
 * RETURN BEFORE hands back the whole stored row, so the narrowing has to happen in the query itself
 * for the result to survive every transaction mode. Each case asserts the exact key set, and the
 * transaction result is compared with the same call made outside one.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** The keys a row carries, sorted. */
const keysOf = (row: object | null | undefined) => (row ? Object.keys(row).sort() : row);

describe('E2E return before honours select inside $transaction', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.core, ...tables.objects]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.core, ...tables.objects]);
  });

  const userData = { name: 'probe', email: 'probe@x.io', isActive: true, age: 1 };
  const upsertArgs = {
    where: { email: 'probe@x.io' },
    create: userData,
    update: { age: 9 },
    select: { name: true, age: true },
    return: 'before' as const,
  };

  describe('array mode', () => {
    test('upsert by unique field returns only the selected keys', async () => {
      await client.db.User.create({ data: userData });
      const [row] = await client.$transaction([client.db.User.upsert(upsertArgs)]);

      expect(keysOf(row)).toEqual(['age', 'name']);
      expect(row).toEqual({ name: 'probe', age: 1 });
    });

    test('upsert by id returns only the selected keys', async () => {
      const user = await client.db.User.create({ data: userData });
      const [row] = await client.$transaction([client.db.User.upsert({ ...upsertArgs, where: { id: user.id } })]);

      expect(keysOf(row)).toEqual(['age', 'name']);
      expect(row).toEqual({ name: 'probe', age: 1 });
    });

    test('upsert by a non-unique where returns the selected keys of every matched row', async () => {
      await client.db.User.create({ data: userData });
      const [rows] = await client.$transaction([client.db.User.upsert({ ...upsertArgs, where: { name: 'probe' } })]);

      expect(rows.map(keysOf)).toEqual([['age', 'name']]);
    });

    test('updateUnique returns only the selected keys', async () => {
      const user = await client.db.User.create({ data: userData });
      const [row] = await client.$transaction([
        client.db.User.updateUnique({
          where: { id: user.id },
          data: { age: 9 },
          select: { name: true },
          return: 'before',
        }),
      ]);

      expect(keysOf(row)).toEqual(['name']);
    });

    test('a function item returns only the selected keys', async () => {
      await client.db.User.create({ data: userData });
      const [, row] = await client.$transaction([client.db.User.count(), () => client.db.User.upsert(upsertArgs)]);

      expect(keysOf(row)).toEqual(['age', 'name']);
    });

    test('a record that did not exist comes back null', async () => {
      const [row] = await client.$transaction([client.db.User.upsert(upsertArgs)]);

      expect(row).toBeNull();
    });

    test('the write still happens', async () => {
      await client.db.User.create({ data: userData });
      await client.$transaction([client.db.User.upsert(upsertArgs)]);
      const after = await client.db.User.findOne({ where: { email: 'probe@x.io' } });

      expect(after?.age).toBe(9);
    });

    test('without select the whole before row comes back', async () => {
      await client.db.User.create({ data: userData });
      const [row] = await client.$transaction([
        client.db.User.upsert({ where: upsertArgs.where, create: userData, update: { age: 9 }, return: 'before' }),
      ]);

      expect(keysOf(row)).toContain('email');
      expect(keysOf(row)).toContain('isActive');
      expect(row?.age).toBe(1);
    });
  });

  describe('callback mode', () => {
    test('upsert returns only the selected keys', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.$transaction(async (tx) => tx.User.upsert(upsertArgs));

      expect(keysOf(row)).toEqual(['age', 'name']);
      expect(row).toEqual({ name: 'probe', age: 1 });
    });

    test('upsert by id returns only the selected keys', async () => {
      const user = await client.db.User.create({ data: userData });
      const row = await client.$transaction(async (tx) => tx.User.upsert({ ...upsertArgs, where: { id: user.id } }));

      expect(keysOf(row)).toEqual(['age', 'name']);
    });

    test('updateUnique returns only the selected keys', async () => {
      const user = await client.db.User.create({ data: userData });
      const row = await client.$transaction(async (tx) =>
        tx.User.updateUnique({ where: { id: user.id }, data: { age: 9 }, select: { name: true }, return: 'before' }),
      );

      expect(keysOf(row)).toEqual(['name']);
    });
  });

  describe('manual mode', () => {
    test('upsert returns only the selected keys', async () => {
      await client.db.User.create({ data: userData });
      const txn = await client.$transaction();
      const row = await txn.User.upsert(upsertArgs);
      await txn.commit();

      expect(keysOf(row)).toEqual(['age', 'name']);
      expect(row).toEqual({ name: 'probe', age: 1 });
    });
  });

  describe('equivalence with the call outside a transaction', () => {
    test('upsert by unique field gives the same row in every mode', async () => {
      await client.db.User.create({ data: userData });
      const plain = await client.db.User.upsert(upsertArgs);

      await truncateTables(client, tables.core);
      await client.db.User.create({ data: userData });
      const [array] = await client.$transaction([client.db.User.upsert(upsertArgs)]);

      await truncateTables(client, tables.core);
      await client.db.User.create({ data: userData });
      const callback = await client.$transaction(async (tx) => tx.User.upsert(upsertArgs));

      expect(array).toEqual(plain);
      expect(callback).toEqual(plain);
      expect(keysOf(array)).toEqual(keysOf(plain));
      expect(keysOf(callback)).toEqual(keysOf(plain));
    });
  });

  describe('a nested sub-key select', () => {
    const address = { street: '1 Main', city: 'Oslo', state: 'NO', zipCode: '0150' };
    const seed = () => client.db.ObjectTestUser.create({ data: { name: 'geo', address } });
    const selectCity = { address: { city: true } };

    test('plain updateUnique narrows the object to the selected sub-key', async () => {
      const user = await seed();
      const row = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { name: 'moved' },
        select: selectCity,
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['address']);
      expect(keysOf(row?.address)).toEqual(['city']);
      expect(row?.address.city).toBe('Oslo');
    });

    test('updateUnique inside a transaction narrows it the same way', async () => {
      const user = await seed();
      const [row] = await client.$transaction([
        client.db.ObjectTestUser.updateUnique({
          where: { id: user.id },
          data: { name: 'moved' },
          select: selectCity,
          return: 'before',
        }),
      ]);

      expect(keysOf(row)).toEqual(['address']);
      expect(keysOf(row?.address)).toEqual(['city']);
    });

    test('upsert inside a transaction narrows it the same way', async () => {
      const user = await seed();
      const [row] = await client.$transaction([
        client.db.ObjectTestUser.upsert({
          where: { id: user.id },
          create: { name: 'geo', address },
          update: { name: 'moved' },
          select: selectCity,
          return: 'before',
        }),
      ]);

      expect(keysOf(row)).toEqual(['address']);
      expect(keysOf(row?.address)).toEqual(['city']);
    });

    test('without a sub-key select the whole object comes back', async () => {
      const user = await seed();
      const row = await client.db.ObjectTestUser.updateUnique({
        where: { id: user.id },
        data: { name: 'moved' },
        select: { address: true },
        return: 'before',
      });

      expect(keysOf(row?.address)).toEqual(['city', 'state', 'street', 'zipCode']);
    });
  });
});
