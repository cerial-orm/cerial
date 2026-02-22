/**
 * E2E Tests: Type Validation — negative cases
 *
 * Tests that Cerial's data validator rejects wrong data types at runtime.
 * Validation errors throw synchronously during query compilation (before DB call).
 *
 * Schema: test-basics.cerial
 * Model: User { id, email Email, name String, age Int?, isActive Bool, ... }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Type Validation — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  test('create rejects string where int expected (age)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test',
          isActive: true,
          // @ts-expect-error — Testing runtime validation: age expects int, passing string
          age: 'not a number',
        },
      });
    }).toThrow('must be of type int');
  });

  test('create rejects number where string expected (name)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          // @ts-expect-error — Testing runtime validation: name expects string, passing number
          name: 123,
          isActive: true,
        },
      });
    }).toThrow('must be of type string');
  });

  test('create rejects boolean where string expected (name)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          // @ts-expect-error — Testing runtime validation: name expects string, passing boolean
          name: true,
          isActive: true,
        },
      });
    }).toThrow('must be of type string');
  });

  test('create rejects invalid email format', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'not-a-valid-email',
          name: 'Test',
          isActive: true,
        },
      });
    }).toThrow('must be a valid email');
  });

  test('create rejects object where string expected (name)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          // @ts-expect-error — Testing runtime validation: name expects string, passing object
          name: { first: 'John' },
          isActive: true,
        },
      });
    }).toThrow('must be of type string');
  });

  test('create rejects string where boolean expected (isActive)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test',
          // @ts-expect-error — Testing runtime validation: isActive expects bool, passing string
          isActive: 'yes',
        },
      });
    }).toThrow('must be of type bool');
  });

  test('create rejects non-array value for array field (nicknames)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test',
          isActive: true,
          // @ts-expect-error — Testing runtime validation: nicknames expects string[], passing string
          nicknames: 'not-an-array',
        },
      });
    }).toThrow('must be an array');
  });

  test('create rejects wrong element type in array field (scores)', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test',
          isActive: true,
          // @ts-expect-error — Testing runtime validation: scores expects int[], passing string elements
          scores: ['a', 'b'],
        },
      });
    }).toThrow('must be of type int');
  });
});
