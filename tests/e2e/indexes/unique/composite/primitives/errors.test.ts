/**
 * E2E Tests: Composite Unique (Primitives) — error handling
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff with @@unique(staffFullName, [firstName, lastName])
 *
 * Tests that duplicate composite key violations are rejected by the database,
 * and that partial matches on the composite key do not violate the constraint.
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

describe('Composite Unique Primitives: errors', () => {
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

  test('DB rejects duplicate composite key (same firstName + lastName, different email)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    // Same firstName + lastName = composite unique violation
    await expect(
      (async () => {
        await client.db.Staff.create({
          data: {
            firstName: 'Alice',
            lastName: 'Smith',
            department: 'Marketing',
            email: 'alice.smith.2@test.com',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('allows same firstName with different lastName (not a violation)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@test.com',
      },
    });

    // Same firstName but different lastName — should succeed
    const result = await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Johnson',
        department: 'Marketing',
        email: 'alice.johnson@test.com',
      },
    });

    expect(result).toBeDefined();
    expect(result.firstName).toBe('Alice');
    expect(result.lastName).toBe('Johnson');

    // Verify both records exist
    const count = await client.db.Staff.count();
    expect(count).toBe(2);
  });

  test('DB rejects duplicate single unique field (same email)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Brown',
        department: 'Sales',
        email: 'shared@test.com',
      },
    });

    // Different composite key but same email = single @unique violation
    await expect(
      (async () => {
        await client.db.Staff.create({
          data: {
            firstName: 'Carol',
            lastName: 'Davis',
            department: 'HR',
            email: 'shared@test.com',
          },
        });
      })(),
    ).rejects.toThrow();
  });
});
