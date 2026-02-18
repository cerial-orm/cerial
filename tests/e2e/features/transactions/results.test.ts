/**
 * E2E Tests: $transaction Results
 *
 * Schema: test-basics.cerial
 * Tests result ordering, typing, and mapping in $transaction.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
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

describe('E2E Transactions: Results', () => {
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

  test('results match input order', async () => {
    const tag = await client.db.Tag.create({ data: { name: `tag-${uniqueId()}` } });

    const [user, tagResult] = await client.$transaction([
      client.db.User.create({
        data: { email: uniqueEmail(), name: 'Alice', isActive: true },
      }),
      client.db.Tag.findOne({ where: { id: tag.id } }),
    ]);

    // First result should be the created User
    expect(user).toBeDefined();
    expect(user.name).toBe('Alice');
    expect(user.isActive).toBe(true);

    // Second result should be the Tag
    expect(tagResult).toBeDefined();
    expect(tagResult!.id.toString()).toBe(tag.id.toString());
  });

  test('CerialId mapping works for all results', async () => {
    const [user1, user2] = await client.$transaction([
      client.db.User.create({
        data: { email: uniqueEmail('u1'), name: 'User 1', isActive: true },
      }),
      client.db.User.create({
        data: { email: uniqueEmail('u2'), name: 'User 2', isActive: false },
      }),
    ]);

    expect(isCerialId(user1.id)).toBe(true);
    expect(isCerialId(user2.id)).toBe(true);
  });

  test('Date fields are mapped to Date objects', async () => {
    const [user] = await client.$transaction([
      client.db.User.create({
        data: { email: uniqueEmail(), name: 'DateUser', isActive: true },
      }),
    ]);

    expect(user.createdAt).toBeInstanceOf(Date);
  });

  test('null result for findOne with no match', async () => {
    const [result] = await client.$transaction([
      client.db.User.findOne({ where: { email: 'nonexistent@example.com' } }),
    ]);

    expect(result).toBeNull();
  });

  test('count returns number', async () => {
    await client.db.User.create({
      data: { email: uniqueEmail('c1'), name: 'Count1', isActive: true },
    });
    await client.db.User.create({
      data: { email: uniqueEmail('c2'), name: 'Count2', isActive: true },
    });

    const [count] = await client.$transaction([client.db.User.count()]);

    expect(typeof count).toBe('number');
    expect(count).toBe(2);
  });

  test('exists returns boolean', async () => {
    const email = uniqueEmail();
    await client.db.User.create({
      data: { email, name: 'ExistsUser', isActive: true },
    });

    const [exists] = await client.$transaction([client.db.User.exists({ email })]);

    expect(typeof exists).toBe('boolean');
    expect(exists).toBe(true);
  });

  test('deleteMany returns count', async () => {
    await client.db.User.create({
      data: { email: uniqueEmail('d1'), name: 'Del1', isActive: true },
    });
    await client.db.User.create({
      data: { email: uniqueEmail('d2'), name: 'Del2', isActive: true },
    });

    const [deleted] = await client.$transaction([client.db.User.deleteMany({ where: { isActive: true } })]);

    expect(typeof deleted).toBe('number');
    expect(deleted).toBe(2);
  });

  test('mixed result types in same transaction', async () => {
    const email = uniqueEmail();
    await client.db.User.create({
      data: { email, name: 'Mixed', isActive: true },
    });

    const [created, found, count, exists] = await client.$transaction([
      client.db.User.create({
        data: { email: uniqueEmail('mix'), name: 'NewUser', isActive: true },
      }),
      client.db.User.findMany(),
      client.db.User.count(),
      client.db.User.exists({ email }),
    ]);

    // create returns a single object (T)
    expect(created).toBeDefined();
    expect(created.name).toBe('NewUser');

    // findMany returns an array (T[])
    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(2);

    // count returns a number
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(2);

    // exists returns a boolean
    expect(typeof exists).toBe('boolean');
    expect(exists).toBe(true);
  });
});
