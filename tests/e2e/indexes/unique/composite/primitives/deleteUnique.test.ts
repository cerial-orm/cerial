/**
 * E2E Tests: Composite Unique (Primitives) — deleteUnique
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests deleting records by composite unique key.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanAndPrepare, truncateIndexTables, createTestClient, CerialClient, testConfig } from '../../../test-helper';

describe('Composite Unique Primitives: deleteUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanAndPrepare(client);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateIndexTables(client);
  });

  test('delete by composite key, verify record is gone', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    // Verify record exists
    const before = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });
    expect(before).not.toBeNull();

    // Delete by composite key
    const result = await client.db.Staff.deleteUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });

    expect(result).toBe(true);

    // Verify record is gone
    const after = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });
    expect(after).toBeNull();
  });

  test('delete with return: true returns true when record exists', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
      },
    });

    const result = await client.db.Staff.deleteUnique({
      where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
      return: true,
    });

    expect(result).toBe(true);
  });

  test('delete with return: true returns false when record does not exist', async () => {
    const result = await client.db.Staff.deleteUnique({
      where: { staffFullName: { firstName: 'Nobody', lastName: 'Here' } },
      return: true,
    });

    expect(result).toBe(false);
  });

  test("delete with return: 'before' returns deleted record", async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Carol',
        lastName: 'Davis',
        department: 'Sales',
        email: 'carol.davis@test.com',
        age: 35,
      },
    });

    const result = await client.db.Staff.deleteUnique({
      where: { staffFullName: { firstName: 'Carol', lastName: 'Davis' } },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Carol');
    expect(result!.lastName).toBe('Davis');
    expect(result!.department).toBe('Sales');
    expect(result!.email).toBe('carol.davis@test.com');
    expect(result!.age).toBe(35);

    // Verify record is gone
    const after = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Carol', lastName: 'Davis' } },
    });
    expect(after).toBeNull();
  });
});
