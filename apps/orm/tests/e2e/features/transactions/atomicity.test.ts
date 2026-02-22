/**
 * E2E Tests: $transaction Atomicity
 *
 * Schema: test-basics.cerial
 * Tests rollback behavior - if one query fails, all should be rolled back.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

describe('E2E Transactions: Atomicity', () => {
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

  test('rolls back all creates if one fails', async () => {
    const duplicateEmail = uniqueEmail('dup');

    // Create a user with the email that will be duplicated
    await client.db.User.create({
      data: { email: duplicateEmail, name: 'Existing', isActive: true },
    });

    const countBefore = await client.db.User.count();

    // Transaction: create User A (valid) + create User B (duplicate @unique email)
    // The duplicate should cause the entire transaction to fail
    let threw = false;
    try {
      await client.$transaction([
        client.db.User.create({
          data: { email: uniqueEmail('a'), name: 'User A', isActive: true },
        }),
        client.db.User.create({
          data: { email: duplicateEmail, name: 'User B', isActive: false },
        }),
      ]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // User A should NOT have been created (rolled back)
    const countAfter = await client.db.User.count();
    expect(countAfter).toBe(countBefore);
  });

  test('rolls back updates if subsequent create fails', async () => {
    const duplicateEmail = uniqueEmail('dup');

    // Create the user we'll try to update, and a user with the duplicate email
    const user = await client.db.User.create({
      data: { email: uniqueEmail('upd'), name: 'Original', isActive: true },
    });
    await client.db.User.create({
      data: { email: duplicateEmail, name: 'Blocker', isActive: true },
    });

    // Transaction: update user name + create with duplicate email
    let threw = false;
    try {
      await client.$transaction([
        client.db.User.updateMany({
          where: { id: user.id },
          data: { name: 'Updated' },
        }),
        client.db.User.create({
          data: { email: duplicateEmail, name: 'Duplicate', isActive: false },
        }),
      ]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // User name should be unchanged (rolled back)
    const unchanged = await client.db.User.findOne({ where: { id: user.id } });
    expect(unchanged).toBeDefined();
    expect(unchanged!.name).toBe('Original');
  });

  test('successful transaction commits all', async () => {
    const [user1, user2] = await client.$transaction([
      client.db.User.create({
        data: { email: uniqueEmail('s1'), name: 'Success 1', isActive: true },
      }),
      client.db.User.create({
        data: { email: uniqueEmail('s2'), name: 'Success 2', isActive: false },
      }),
    ]);

    // Both users should exist after the transaction
    const found1 = await client.db.User.findOne({ where: { id: user1.id } });
    const found2 = await client.db.User.findOne({ where: { id: user2.id } });

    expect(found1).toBeDefined();
    expect(found1!.name).toBe('Success 1');
    expect(found2).toBeDefined();
    expect(found2!.name).toBe('Success 2');
  });

  test('error includes meaningful message', async () => {
    const duplicateEmail = uniqueEmail('err');

    await client.db.User.create({
      data: { email: duplicateEmail, name: 'First', isActive: true },
    });

    try {
      await client.$transaction([
        client.db.User.create({
          data: { email: duplicateEmail, name: 'Second', isActive: true },
        }),
      ]);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBeTruthy();
      expect((error as Error).message.length).toBeGreaterThan(0);
    }
  });
});
