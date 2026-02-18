/**
 * E2E Tests: Composite Unique (Primitives) — $transaction
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests composite unique key queries inside $transaction.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Primitives: $transaction', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, INDEX_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, INDEX_TABLES);
  });

  test('$transaction with findUnique by composite key', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
        age: 30,
      },
    });

    const [result] = await client.$transaction([
      client.db.Staff.findUnique({
        where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
      }),
    ]);

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Alice');
    expect(result!.lastName).toBe('Smith');
    expect(result!.department).toBe('Engineering');
    expect(isCerialId(result!.id)).toBe(true);
  });

  test('$transaction with multiple composite key queries', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
      },
    });

    const [alice, bob, count] = await client.$transaction([
      client.db.Staff.findUnique({
        where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
      }),
      client.db.Staff.findUnique({
        where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
      }),
      client.db.Staff.count(),
    ]);

    expect(alice).not.toBeNull();
    expect(alice!.firstName).toBe('Alice');
    expect(alice!.department).toBe('Engineering');

    expect(bob).not.toBeNull();
    expect(bob!.firstName).toBe('Bob');
    expect(bob!.department).toBe('Marketing');

    expect(count).toBe(2);
  });
});
