/**
 * E2E Tests: Composite Unique (Primitives) — findUnique
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests finding records by composite unique key.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Primitives: findUnique', () => {
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

  test('find by composite key returns correct record', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    const result = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Alice');
    expect(result!.lastName).toBe('Smith');
    expect(result!.department).toBe('Engineering');
    expect(result!.email).toBe('alice.smith@test.com');
    expect(result!.id).toBeDefined();
    expect(result!.id).toBeInstanceOf(CerialId);
  });

  test('return null when composite key not found (wrong lastName)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    const result = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Jones' } },
    });

    expect(result).toBeNull();
  });

  test('find with composite key and additional filters (department)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
      },
    });

    const result = await client.db.Staff.findUnique({
      where: {
        staffFullName: { firstName: 'Bob', lastName: 'Brown' },
        department: 'Marketing',
      },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.firstName).toBe('Bob');
    expect(result!.lastName).toBe('Brown');
    expect(result!.department).toBe('Marketing');
  });

  test('return null when composite matches but additional filter fails', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
      },
    });

    const result = await client.db.Staff.findUnique({
      where: {
        staffFullName: { firstName: 'Bob', lastName: 'Brown' },
        department: 'Engineering',
      },
    });

    expect(result).toBeNull();
  });

  test('find with select on composite key query', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Carol',
        lastName: 'Davis',
        department: 'Sales',
        email: 'carol.davis@test.com',
        age: 35,
      },
    });

    const result = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Carol', lastName: 'Davis' } },
      select: { id: true, firstName: true, lastName: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.firstName).toBe('Carol');
    expect(result!.lastName).toBe('Davis');
    expect((result as Record<string, unknown>).department).toBeUndefined();
    expect((result as Record<string, unknown>).email).toBeUndefined();
    expect((result as Record<string, unknown>).age).toBeUndefined();
  });
});
