/**
 * E2E Tests: Single-field @unique — findUnique
 *
 * Tests findUnique on Staff.email (single-field @unique).
 * Verifies lookup by unique email, null on miss, select support, and id fallback.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialId, isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('Single @unique — findUnique', () => {
  let client: CerialClient;
  let staffId: CerialId<string>;

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

    const staff = await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice@example.com',
        age: 30,
      },
    });
    staffId = staff.id;
  });

  test('finds a record by unique email', async () => {
    const result = await client.db.Staff.findUnique({
      where: { email: 'alice@example.com' },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.email).toBe('alice@example.com');
    expect(result!.firstName).toBe('Alice');
    expect(result!.lastName).toBe('Smith');
    expect(result!.department).toBe('Engineering');
    expect(result!.age).toBe(30);
    expect(isCerialId(result!.id)).toBe(true);
  });

  test('returns null when email not found', async () => {
    const result = await client.db.Staff.findUnique({
      where: { email: 'nonexistent@example.com' },
    });

    expect(result).toBeNull();
  });

  test('returns only selected fields when using select', async () => {
    const result = await client.db.Staff.findUnique({
      where: { email: 'alice@example.com' },
      select: { id: true, email: true, firstName: true },
    });

    expect(result).toBeDefined();
    expect(result!.id).toBeDefined();
    expect(result!.email).toBe('alice@example.com');
    expect(result!.firstName).toBe('Alice');
    // Non-selected fields should be absent
    expect('lastName' in result!).toBe(false);
    expect('department' in result!).toBe(false);
    expect('age' in result!).toBe(false);
  });

  test('finds a record by id on a model with @unique fields', async () => {
    const result = await client.db.Staff.findUnique({
      where: { id: staffId },
    });

    expect(result).toBeDefined();
    expect(result!.id.equals(staffId)).toBe(true);
    expect(result!.email).toBe('alice@example.com');
    expect(result!.firstName).toBe('Alice');
  });
});
