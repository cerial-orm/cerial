/**
 * E2E Tests: Constraint Violations — negative cases
 *
 * Tests that SurrealDB rejects unique constraint violations.
 * These are database-level errors (async), not Cerial validation errors.
 *
 * Schema: composite-unique-primitives.cerial
 * Model: Staff { firstName, lastName, department, email @unique, age?,
 *         @@unique(staffFullName, [firstName, lastName]) }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Constraint Violations — negative cases', () => {
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

  test('DB rejects duplicate @unique email on create', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice@example.com',
      },
    });

    let threw = false;
    try {
      await client.db.Staff.create({
        data: {
          firstName: 'Bob',
          lastName: 'Jones',
          department: 'HR',
          email: 'alice@example.com',
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('DB rejects duplicate composite unique (firstName + lastName)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice1@example.com',
      },
    });

    let threw = false;
    try {
      await client.db.Staff.create({
        data: {
          firstName: 'Alice',
          lastName: 'Smith',
          department: 'Marketing',
          email: 'alice2@example.com',
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('DB rejects duplicate @unique email on updateMany', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice@example.com',
      },
    });

    await client.db.Staff.create({
      data: {
        firstName: 'Bob',
        lastName: 'Jones',
        department: 'HR',
        email: 'bob@example.com',
      },
    });

    let threw = false;
    try {
      await client.db.Staff.updateMany({
        where: { firstName: 'Bob' },
        data: { email: 'alice@example.com' },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('allows partial composite key match (same firstName, different lastName)', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        department: 'Engineering',
        email: 'alice.smith@example.com',
      },
    });

    const result = await client.db.Staff.create({
      data: {
        firstName: 'Alice',
        lastName: 'Johnson',
        department: 'Marketing',
        email: 'alice.johnson@example.com',
      },
    });

    expect(result).toBeDefined();
    expect(result.lastName).toBe('Johnson');
  });
});
