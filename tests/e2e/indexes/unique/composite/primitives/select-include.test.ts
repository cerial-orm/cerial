/**
 * E2E Tests: Composite Unique (Primitives) — select & include
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests select projections with composite unique key queries.
 * Staff has no relations, so include is not applicable — only select is tested.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupIndexClient, CerialClient } from '../../../test-helper';

describe('Composite Unique Primitives: select', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = await setupIndexClient();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('findUnique with composite key and select returns only selected fields', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
        age: 30,
      },
    });

    const result = await client.db.Staff.findUnique({
      where: { staffFullName: { firstName: 'Alice', lastName: 'Smith' } },
      select: { id: true, firstName: true, department: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.firstName).toBe('Alice');
    expect(result!.department).toBe('Engineering');
    // Non-selected fields should be absent
    expect((result as Record<string, unknown>).lastName).toBeUndefined();
    expect((result as Record<string, unknown>).email).toBeUndefined();
    expect((result as Record<string, unknown>).age).toBeUndefined();
  });

  test('updateUnique with composite key and select returns only selected fields', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Marketing',
        email: 'bob.brown@test.com',
        age: 40,
      },
    });

    const result = await client.db.Staff.updateUnique({
      where: { staffFullName: { firstName: 'Bob', lastName: 'Brown' } },
      data: { department: 'Sales', age: 41 },
      select: { id: true, department: true, age: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.department).toBe('Sales');
    expect(result!.age).toBe(41);
    // Non-selected fields should be absent
    expect((result as Record<string, unknown>).firstName).toBeUndefined();
    expect((result as Record<string, unknown>).lastName).toBeUndefined();
    expect((result as Record<string, unknown>).email).toBeUndefined();
  });
});
