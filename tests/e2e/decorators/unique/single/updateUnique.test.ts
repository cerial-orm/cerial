/**
 * E2E Tests: Single-field @unique — updateUnique
 *
 * Tests updateUnique on Staff.email (single-field @unique).
 * Verifies update by email, null on miss, return: true, and return: 'before'.
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
} from '../../../test-helper';

describe('Single @unique — updateUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.indexes);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.indexes);

    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Jones',
        department: 'Sales',
        email: 'bob@example.com',
        age: 40,
      },
    });
  });

  test('updates a record by unique email and returns updated record', async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'bob@example.com' },
      data: { department: 'Marketing', age: 41 },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.email).toBe('bob@example.com');
    expect(result!.department).toBe('Marketing');
    expect(result!.age).toBe(41);
    // Unchanged fields preserved
    expect(result!.firstName).toBe('Bob');
    expect(result!.lastName).toBe('Jones');
    expect(isCerialId(result!.id)).toBe(true);
  });

  test('returns null when email not found', async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'nobody@example.com' },
      data: { department: 'HR' },
    });

    expect(result).toBeNull();
  });

  test('return: true returns boolean true when record exists', async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'bob@example.com' },
      data: { department: 'Legal' },
      return: true,
    });

    expect(result).toBe(true);

    // Verify the update was applied
    const found = await client.db.Staff.findUnique({ where: { email: 'bob@example.com' } });
    expect(found!.department).toBe('Legal');
  });

  test('return: true returns false when record does not exist', async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'ghost@example.com' },
      data: { department: 'Legal' },
      return: true,
    });

    expect(result).toBe(false);
  });

  test("return: 'before' returns the pre-update state", async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'bob@example.com' },
      data: { department: 'Finance', age: 50 },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    // Should reflect pre-update values
    expect(result!.department).toBe('Sales');
    expect(result!.age).toBe(40);
    expect(result!.email).toBe('bob@example.com');

    // Verify the update actually happened
    const found = await client.db.Staff.findUnique({ where: { email: 'bob@example.com' } });
    expect(found!.department).toBe('Finance');
    expect(found!.age).toBe(50);
  });

  test("return: 'before' returns null when record does not exist", async () => {
    const result = await client.db.Staff.updateUnique({
      where: { email: 'missing@example.com' },
      data: { department: 'Ops' },
      return: 'before',
    });

    expect(result).toBeNull();
  });
});
