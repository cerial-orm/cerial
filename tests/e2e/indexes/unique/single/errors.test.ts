/**
 * E2E Tests: Single-field @unique — error cases
 *
 * Tests that the DB rejects duplicate @unique email values on create,
 * and that findUnique throws when called with only non-unique fields.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupIndexClient, CerialClient } from '../../test-helper';

describe('Single @unique — errors', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = await setupIndexClient();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('DB rejects duplicate @unique email on create', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Iris',
        lastName: 'Taylor',
        department: 'Finance',
        email: 'iris@example.com',
      },
    });

    await expect(
      (async () => {
        await client.db.Staff.create({
          data: {
            firstName: 'Iris',
            lastName: 'Other',
            department: 'HR',
            email: 'iris@example.com',
          },
        });
      })(),
    ).rejects.toThrow();
  });

  test('findUnique throws when called with only non-unique fields', async () => {
    await client.db.Staff.create({
      data: {
        firstName: 'Jack',
        lastName: 'Wilson',
        department: 'Engineering',
        email: 'jack@example.com',
        age: 30,
      },
    });

    await expect(
      (async () => {
        await client.db.Staff.findUnique({
          // @ts-expect-error - Testing runtime validation: age is not a unique field, type system prevents this
          where: { age: 30 },
        });
      })(),
    ).rejects.toThrow(/unique field/i);
  });
});
