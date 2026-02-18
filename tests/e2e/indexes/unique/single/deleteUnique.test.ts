/**
 * E2E Tests: Single-field @unique — deleteUnique
 *
 * Tests deleteUnique on Staff.email (single-field @unique).
 * Verifies delete by email, return: true semantics, and return: 'before'.
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
} from '../../../test-helper';

describe('Single @unique — deleteUnique', () => {
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

    await client.db.Staff.create({
      data: {
        firstName: 'Carol',
        lastName: 'Davis',
        department: 'Engineering',
        email: 'carol@example.com',
        age: 35,
      },
    });
  });

  test('deletes a record by unique email and verifies it is gone', async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { email: 'carol@example.com' },
    });

    // Default return is true (operation succeeded)
    expect(result).toBe(true);

    // Verify the record no longer exists
    const found = await client.db.Staff.findUnique({ where: { email: 'carol@example.com' } });
    expect(found).toBeNull();
  });

  test('return: true returns true for existing record', async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { email: 'carol@example.com' },
      return: true,
    });

    expect(result).toBe(true);
  });

  test('return: true returns false for non-existing record', async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { email: 'nobody@example.com' },
      return: true,
    });

    expect(result).toBe(false);
  });

  test("return: 'before' returns the deleted record data", async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { email: 'carol@example.com' },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.email).toBe('carol@example.com');
    expect(result!.firstName).toBe('Carol');
    expect(result!.lastName).toBe('Davis');
    expect(result!.department).toBe('Engineering');
    expect(result!.age).toBe(35);
    expect(isCerialId(result!.id)).toBe(true);

    // Verify the record is deleted
    const found = await client.db.Staff.findUnique({ where: { email: 'carol@example.com' } });
    expect(found).toBeNull();
  });

  test("return: 'before' returns null for non-existing record", async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { email: 'phantom@example.com' },
      return: 'before',
    });

    expect(result).toBeNull();
  });
});
