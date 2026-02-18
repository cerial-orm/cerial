/**
 * E2E Tests: Composite Unique (Primitives) — updateUnique
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests updating records by composite unique key.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Primitives: updateUnique', () => {
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

  test('update record by composite key returns updated record', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
        age: 30,
      },
    });

    const result = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
      data: { department: 'Research', age: 31 },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Alice');
    expect(result!.lastName).toBe('Smith');
    expect(result!.department).toBe('Research');
    expect(result!.age).toBe(31);
    expect(result!.email).toBe('alice.smith@test.com');
  });

  test('return null when composite key not found', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    const result = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Jones' } },
      data: { department: 'Sales' },
    });

    expect(result).toBeNull();

    // Verify original record unchanged
    const original = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });
    expect(original).not.toBeNull();
    expect(original!.department).toBe('Engineering');
  });

  test('update with return: true returns boolean', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
      },
    });

    const resultExists = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
      data: { department: 'Sales' },
      return: true,
    });

    expect(resultExists).toBe(true);

    // Verify data was actually updated
    const found = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
    });
    expect(found!.department).toBe('Sales');

    // Non-existent composite key
    const resultMissing = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Bob', lastName: 'White' } },
      data: { department: 'HR' },
      return: true,
    });

    expect(resultMissing).toBe(false);
  });

  test("update with return: 'before' returns pre-update state", async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Carol',
        lastName: 'Davis',
        department: 'Sales',
        email: 'carol.davis@test.com',
        age: 40,
      },
    });

    const result = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Carol', lastName: 'Davis' } },
      data: { department: 'Executive', age: 41 },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Carol');
    expect(result!.lastName).toBe('Davis');
    expect(result!.department).toBe('Sales');
    expect(result!.age).toBe(40);

    // Verify the update actually happened
    const after = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Carol', lastName: 'Davis' } },
    });
    expect(after!.department).toBe('Executive');
    expect(after!.age).toBe(41);
  });
});
