import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E findAll', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  test('should return empty array when table is empty', async () => {
    const results = await client.db.User.findAll();

    expect(results).toEqual([]);
    expect(results.length).toBe(0);
  });

  test('should return all records after creating 1 record', async () => {
    await client.db.User.create({
      data: {
        email: 'single@example.com',
        name: 'Single User',
        isActive: true,
      },
    });

    const results = await client.db.User.findAll();

    expect(results.length).toBe(1);
    expect(results[0]!.email).toBe('single@example.com');
    expect(results[0]!.name).toBe('Single User');
  });

  test('should return all records after creating multiple records', async () => {
    await client.db.User.create({
      data: { email: 'user1@example.com', name: 'User 1', isActive: true },
    });
    await client.db.User.create({
      data: { email: 'user2@example.com', name: 'User 2', isActive: false },
    });
    await client.db.User.create({
      data: {
        email: 'user3@example.com',
        name: 'User 3',
        isActive: true,
        age: 30,
      },
    });

    const results = await client.db.User.findAll();

    expect(results.length).toBe(3);

    const emails = results.map((u) => u.email).sort();
    expect(emails).toEqual(['user1@example.com', 'user2@example.com', 'user3@example.com']);
  });

  test('should return full model shape with all fields', async () => {
    await client.db.User.create({
      data: {
        email: 'shape@example.com',
        name: 'Shape User',
        isActive: true,
        age: 25,
        nicknames: ['nick1'],
        scores: [100],
      },
    });

    const results = await client.db.User.findAll();

    expect(results.length).toBe(1);
    const user = results[0]!;

    expect(isCerialId(user.id)).toBe(true);
    expect(user.id.table).toBe('user');
    expect(user.email).toBe('shape@example.com');
    expect(user.name).toBe('Shape User');
    expect(user.isActive).toBe(true);
    expect(user.age).toBe(25);
    expect(user.nicknames).toEqual(['nick1']);
    expect(user.scores).toEqual([100]);
  });

  test('should be equivalent to findMany() with no options', async () => {
    await client.db.User.create({
      data: { email: 'equiv1@example.com', name: 'Equiv 1', isActive: true },
    });
    await client.db.User.create({
      data: { email: 'equiv2@example.com', name: 'Equiv 2', isActive: false },
    });

    const findAllResults = await client.db.User.findAll();
    const findManyResults = await client.db.User.findMany();

    expect(findAllResults.length).toBe(findManyResults.length);

    const findAllEmails = findAllResults.map((u) => u.email).sort();
    const findManyEmails = findManyResults.map((u) => u.email).sort();
    expect(findAllEmails).toEqual(findManyEmails);
  });

  test('should return records with default array fields as empty arrays', async () => {
    await client.db.User.create({
      data: {
        email: 'defaults@example.com',
        name: 'Defaults User',
        isActive: true,
      },
    });

    const results = await client.db.User.findAll();

    expect(results.length).toBe(1);
    const user = results[0]!;
    expect(user.nicknames).toEqual([]);
    expect(user.scores).toEqual([]);
    expect(user.tagIds).toEqual([]);
  });

  test('should return records with optional fields as undefined when not set', async () => {
    await client.db.User.create({
      data: { email: 'noage@example.com', name: 'No Age', isActive: true },
    });

    const results = await client.db.User.findAll();

    expect(results.length).toBe(1);
    expect(results[0]!.age).toBeUndefined();
  });
});
