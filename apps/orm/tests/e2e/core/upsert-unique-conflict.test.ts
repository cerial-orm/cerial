/**
 * E2E Tests: upsert whose create path takes a value a @unique field already holds
 *
 * A where that matches nothing sends the upsert down its create path. When that row would repeat a
 * @unique email the write is refused as create refuses it and nothing is written.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialUniqueConstraintError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Upsert: create path on a held @unique value', () => {
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
    await client.db.User.create({ data: { name: 'Held', email: 'held@test.com', isActive: true } });
  });

  test('a non-unique where whose create repeats the email is refused and writes nothing', async () => {
    let error: unknown;
    try {
      await client.db.User.upsert({
        where: { name: 'Nobody' },
        create: { name: 'Nobody', email: 'held@test.com', isActive: true },
        update: { isActive: false },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    const violation = error as CerialUniqueConstraintError;
    expect(violation.model).toBe('User');
    expect(violation.operation).toBe('upsert');
    expect(violation.index).toBe('user_email_unique');
    expect(await client.db.User.count()).toBe(1);
    expect((await client.db.User.findUnique({ where: { email: 'held@test.com' } }))!.name).toBe('Held');
  });

  test('a non-unique where whose create takes a free email creates one row', async () => {
    const result = await client.db.User.upsert({
      where: { name: 'Nobody' },
      create: { name: 'Nobody', email: 'free@test.com', isActive: true },
      update: { isActive: false },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.email).toBe('free@test.com');
    expect(await client.db.User.count()).toBe(2);
  });

  test('a non-unique where that matches updates the row even when the create would clash', async () => {
    const result = await client.db.User.upsert({
      where: { name: 'Held' },
      create: { name: 'Held', email: 'held@test.com', isActive: true },
      update: { isActive: false },
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.isActive).toBe(false);
    expect(await client.db.User.count()).toBe(1);
  });

  test('a unique where whose create matches it still creates, and a second call updates', async () => {
    const created = await client.db.User.upsert({
      where: { email: 'new@test.com' },
      create: { name: 'New', email: 'new@test.com', isActive: true },
      update: { name: 'Again' },
    });
    const updated = await client.db.User.upsert({
      where: { email: 'new@test.com' },
      create: { name: 'New', email: 'new@test.com', isActive: true },
      update: { name: 'Again' },
    });

    expect(created!.name).toBe('New');
    expect(updated!.name).toBe('Again');
    expect(updated!.id.equals(created!.id)).toBe(true);
    expect(await client.db.User.count()).toBe(2);
  });
});
