/**
 * E2E Tests: Transactions - Basic CRUD
 *
 * Schema: test-basics.cerial
 * Tests basic create, read, update, delete operations within $transaction.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../test-helper';

describe('E2E Transactions: Basic CRUD', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('multiple creates in same transaction', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const [user1, user2] = await client.$transaction([
      client.db.User.create({ data: { email: email1, name: 'User One', isActive: true } }),
      client.db.User.create({ data: { email: email2, name: 'User Two', isActive: false } }),
    ]);

    expect(user1).toBeDefined();
    expect(user1.email).toBe(email1);
    expect(user1.name).toBe('User One');
    expect(user1.isActive).toBe(true);

    expect(user2).toBeDefined();
    expect(user2.email).toBe(email2);
    expect(user2.name).toBe('User Two');
    expect(user2.isActive).toBe(false);

    // Verify both exist in DB
    const all = await client.db.User.findMany();
    expect(all.length).toBe(2);
  });

  test('findMany inside transaction', async () => {
    // Insert data outside transaction
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Alice', isActive: true } });
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Bob', isActive: false } });

    const [users] = await client.$transaction([client.db.User.findMany()]);

    expect(users.length).toBe(2);
  });

  test('updateUnique inside transaction', async () => {
    const user = await client.db.User.create({
      data: { email: uniqueEmail(), name: 'Before Update', isActive: true },
    });

    const [updated] = await client.$transaction([
      client.db.User.updateUnique({
        where: { id: user.id },
        data: { name: 'After Update' },
      }),
    ]);

    expect(updated).toBeDefined();
    expect(updated?.name).toBe('After Update');

    // Verify in DB
    const found = await client.db.User.findUnique({ where: { id: user.id } });
    expect(found?.name).toBe('After Update');
  });

  test('deleteUnique inside transaction', async () => {
    const user = await client.db.User.create({
      data: { email: uniqueEmail(), name: 'To Delete', isActive: true },
    });

    const [result] = await client.$transaction([client.db.User.deleteUnique({ where: { id: user.id } })]);

    expect(result).toBe(true);

    // Verify deleted
    const found = await client.db.User.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();
  });

  test('deleteMany inside transaction', async () => {
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Del 1', isActive: true } });
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Del 2', isActive: true } });
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Keep', isActive: false } });

    const [count] = await client.$transaction([client.db.User.deleteMany({ where: { isActive: true } })]);

    expect(count).toBe(2);

    const remaining = await client.db.User.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.name).toBe('Keep');
  });

  test('single operation in transaction', async () => {
    const email = uniqueEmail();

    const [user] = await client.$transaction([
      client.db.User.create({ data: { email, name: 'Solo', isActive: true } }),
    ]);

    expect(user).toBeDefined();
    expect(user.email).toBe(email);
  });

  test('empty transaction returns empty array', async () => {
    const results = await client.$transaction([]);

    expect(results).toEqual([]);
  });

  test('create returns record with CerialId', async () => {
    const [user] = await client.$transaction([
      client.db.User.create({ data: { email: uniqueEmail(), name: 'CerialId Test', isActive: true } }),
    ]);

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(isCerialId(user.id)).toBe(true);
    expect(user.id.table).toBe('user');
    expect(user.id.id.length).toBeGreaterThan(0);
  });
});
