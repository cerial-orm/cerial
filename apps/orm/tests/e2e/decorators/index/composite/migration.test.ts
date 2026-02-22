/**
 * E2E Tests: @@index (Composite) — migration
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@index(staffDeptName, [department, firstName])
 *
 * Tests that @@index generates a DEFINE INDEX statement in the DB
 * and that it does NOT enforce uniqueness.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('@@index Composite: migration', () => {
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
  });

  test('after migration, the composite index exists in the DB', async () => {
    const surreal = client.getSurreal();
    expect(surreal).toBeDefined();

    const [info] = await surreal!.query<[Record<string, unknown>]>('INFO FOR TABLE staff;');
    const indexes = info.indexes as Record<string, string>;

    // The composite @@index generates: DEFINE INDEX staffDeptName ON staff COLUMNS department, firstName
    const deptNameIndex = indexes.staffDeptName;
    expect(deptNameIndex).toBeDefined();
    expect(deptNameIndex).toContain('department');
    expect(deptNameIndex).toContain('firstName');
    // Should NOT contain UNIQUE
    expect(deptNameIndex).not.toContain('UNIQUE');
  });

  test('composite index does NOT enforce uniqueness — can create two staff with same department+firstName', async () => {
    const first = await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    // Same department + firstName but different lastName and email — should succeed
    const second = await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Johnson',
        department: 'Engineering',
        email: 'alice.johnson@test.com',
      },
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first.firstName).toBe('Alice');
    expect(first.department).toBe('Engineering');
    expect(second.firstName).toBe('Alice');
    expect(second.department).toBe('Engineering');
    expect(first.lastName).toBe('Smith');
    expect(second.lastName).toBe('Johnson');

    // Both records exist
    const count = await client.db.Staff.count({ department: 'Engineering', firstName: 'Alice' });
    expect(count).toBe(2);
  });
});
