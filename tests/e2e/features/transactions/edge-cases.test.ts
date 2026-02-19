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
} from '../../test-helper';

describe('E2E Transactions: Edge Cases', () => {
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

  test('empty transaction returns empty array', async () => {
    const results = await client.$transaction([]);

    expect(results).toEqual([]);
  });

  test('single item transaction returns wrapped result', async () => {
    const email = uniqueEmail();

    const [user] = await client.$transaction([
      client.db.User.create({ data: { email, name: 'Solo', isActive: true } }),
    ]);

    expect(user).toBeDefined();
    expect(user.email).toBe(email);
    expect(user.name).toBe('Solo');
    expect(isCerialId(user.id)).toBe(true);
  });

  test('large transaction with 10+ operations', async () => {
    const emails = Array.from({ length: 12 }, () => uniqueEmail());

    const queries = emails.map((email, i) =>
      client.db.User.create({ data: { email, name: `User${i}`, isActive: i % 2 === 0 } }),
    );

    const results = await client.$transaction(queries);

    expect(results.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(results[i]).toBeDefined();
      expect(results[i]!.email).toBe(emails[i]!);
      expect(results[i]!.name).toBe(`User${i}`);
      expect(isCerialId(results[i]!.id)).toBe(true);
    }

    const allUsers = await client.db.User.findMany();
    expect(allUsers.length).toBe(12);
  });

  test('duplicate unique field in transaction causes rollback', async () => {
    const email = uniqueEmail();

    await expect(
      (async () => {
        await client.$transaction([
          client.db.User.create({ data: { email, name: 'First', isActive: true } }),
          client.db.User.create({ data: { email, name: 'Duplicate', isActive: false } }),
        ]);
      })(),
    ).rejects.toThrow();

    const users = await client.db.User.findMany({ where: { email } });
    expect(users.length).toBe(0);
  });

  test('callback mode: error after successful operations rolls back', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    await expect(
      client.$transaction(async (tx) => {
        await tx.User.create({ data: { email: email1, name: 'Created', isActive: true } });
        await tx.User.create({ data: { email: email2, name: 'Also Created', isActive: false } });
        throw new Error('rollback after creates');
      }),
    ).rejects.toThrow('rollback after creates');

    const users = await client.db.User.findMany();
    expect(users.length).toBe(0);
  });

  test('concurrent transactions both succeed', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const [result1, result2] = await Promise.all([
      client.$transaction([client.db.User.create({ data: { email: email1, name: 'Concurrent1', isActive: true } })]),
      client.$transaction([client.db.User.create({ data: { email: email2, name: 'Concurrent2', isActive: false } })]),
    ]);

    expect(result1[0]).toBeDefined();
    expect(result1[0].name).toBe('Concurrent1');
    expect(result2[0]).toBeDefined();
    expect(result2[0].name).toBe('Concurrent2');

    const allUsers = await client.db.User.findMany();
    expect(allUsers.length).toBe(2);
  });

  test('array mode: mix of result types', async () => {
    const email = uniqueEmail();
    await client.db.User.create({ data: { email: uniqueEmail(), name: 'Existing', isActive: true } });

    const [created, allUsers, userCount, usersExist] = await client.$transaction([
      client.db.User.create({ data: { email, name: 'New', isActive: true } }),
      client.db.User.findMany(),
      client.db.User.count(),
      client.db.User.exists(),
    ]);

    expect(created).toBeDefined();
    expect(created.name).toBe('New');
    expect(Array.isArray(allUsers)).toBe(true);
    expect(allUsers.length).toBeGreaterThanOrEqual(2);
    expect(typeof userCount).toBe('number');
    expect(userCount).toBeGreaterThanOrEqual(2);
    expect(usersExist).toBe(true);
  });

  test('empty callback returns undefined', async () => {
    const result = await client.$transaction(async () => {});

    expect(result).toBeUndefined();
  });

  test('concurrent callback and array transactions', async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();

    const [callbackResult, arrayResult] = await Promise.all([
      client.$transaction(async (tx) => {
        const user = await tx.User.create({ data: { email: email1, name: 'CbUser', isActive: true } });

        return user;
      }),
      client.$transaction([client.db.User.create({ data: { email: email2, name: 'ArrUser', isActive: false } })]),
    ]);

    expect(callbackResult).toBeDefined();
    expect(callbackResult.name).toBe('CbUser');
    expect(arrayResult[0]).toBeDefined();
    expect(arrayResult[0].name).toBe('ArrUser');

    const allUsers = await client.db.User.findMany();
    expect(allUsers.length).toBe(2);
  });

  test('callback returns non-object value', async () => {
    const result = await client.$transaction(async (tx) => {
      await tx.User.create({ data: { email: uniqueEmail(), name: 'NumReturn', isActive: true } });

      return 999;
    });

    expect(result).toBe(999);
  });

  test('callback returns null explicitly', async () => {
    const result = await client.$transaction(async (tx) => {
      await tx.User.create({ data: { email: uniqueEmail(), name: 'NullReturn', isActive: true } });

      return null;
    });

    expect(result).toBeNull();
  });
});
