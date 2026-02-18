/**
 * E2E Tests: Composite Unique (Primitives) — upsert
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests upsert operations using composite unique key.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { cleanupTables, truncateTables, INDEX_TABLES, createTestClient, CerialClient, testConfig } from '../../../../test-helper';

describe('Composite Unique Primitives: upsert', () => {
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

  test('create path: composite key does not exist, creates with create data', async () => {
    const result = await client.db.Staff.upsert({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
      create: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
        age: 28,
      },
      update: { department: 'Research' },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(isCerialId(result!.id)).toBe(true);
    expect(result!.firstName).toBe('Alice');
    expect(result!.lastName).toBe('Smith');
    expect(result!.department).toBe('Engineering');
    expect(result!.email).toBe('alice.smith@test.com');
    expect(result!.age).toBe(28);

    // Verify record exists in DB
    const found = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });
    expect(found).not.toBeNull();
    expect(found!.department).toBe('Engineering');
  });

  test('update path: composite key exists, updates with update data', async () => {
    // Create existing record
    const created = await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
        age: 35,
      },
    });

    const result = await client.db.Staff.upsert({
      where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
      create: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Should Not Use',
        email: 'should.not@test.com',
      },
      update: { department: 'Sales', age: 36 },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id.equals(created.id)).toBe(true);
    expect(result!.firstName).toBe('Bob');
    expect(result!.lastName).toBe('Brown');
    expect(result!.department).toBe('Sales');
    expect(result!.age).toBe(36);
    // Email should be preserved from existing record
    expect(result!.email).toBe('bob.brown@test.com');
  });
});
