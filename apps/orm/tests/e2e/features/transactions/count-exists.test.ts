/**
 * E2E Tests for Count and Exists operations inside $transaction
 *
 * Tests that count() and exists() queries work correctly when executed
 * within a transaction alongside other query types.
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
  uniqueId,
} from '../../test-helper';

describe('E2E Transactions: Count and Exists', () => {
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

  test('count inside transaction', async () => {
    const email1 = uniqueEmail('count');
    const email2 = uniqueEmail('count');
    const email3 = uniqueEmail('count');

    await client.db.User.create({
      data: { email: email1, name: `User ${uniqueId()}`, isActive: true },
    });
    await client.db.User.create({
      data: { email: email2, name: `User ${uniqueId()}`, isActive: true },
    });
    await client.db.User.create({
      data: { email: email3, name: `User ${uniqueId()}`, isActive: false },
    });

    const [count] = await client.$transaction([client.db.User.count()]);

    expect(count).toBe(3);
  });

  test('exists inside transaction', async () => {
    const email = uniqueEmail('exists');

    await client.db.User.create({
      data: { email, name: `User ${uniqueId()}`, isActive: true },
    });

    const [exists] = await client.$transaction([client.db.User.exists({ email })]);

    expect(exists).toBe(true);
  });

  test('count + exists + findMany in same transaction', async () => {
    const email1 = uniqueEmail('combo');
    const email2 = uniqueEmail('combo');

    await client.db.User.create({
      data: { email: email1, name: `User ${uniqueId()}`, isActive: true },
    });
    await client.db.User.create({
      data: { email: email2, name: `User ${uniqueId()}`, isActive: false },
    });

    const [count, exists, users] = await client.$transaction([
      client.db.User.count(),
      client.db.User.exists({ email: email1 }),
      client.db.User.findMany({ where: { isActive: true } }),
    ]);

    expect(count).toBe(2);
    expect(exists).toBe(true);
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe(email1);
  });

  test('count returns 0 for empty table', async () => {
    const [count] = await client.$transaction([client.db.User.count()]);

    expect(count).toBe(0);
  });

  test('exists returns false for no match', async () => {
    const nonExistentEmail = uniqueEmail('ghost');

    const [exists] = await client.$transaction([client.db.User.exists({ email: nonExistentEmail })]);

    expect(exists).toBe(false);
  });
});
