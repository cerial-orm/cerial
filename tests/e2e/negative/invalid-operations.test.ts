/**
 * E2E Tests: Invalid Operations — negative cases
 *
 * Tests that Cerial rejects invalid query parameters:
 * - findUnique with non-unique fields
 * - Where clauses with unknown fields
 * - Where clauses with unknown operators
 *
 * Schema: test-basics.cerial (User), composite-unique-primitives.cerial (Staff)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Invalid Operations — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.core, ...tables.indexes]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.core, ...tables.indexes]);
  });

  describe('findUnique with non-unique fields', () => {
    test('findUnique throws when called with only non-unique field (Staff.age)', () => {
      expect(() => {
        client.db.Staff.findUnique({
          // @ts-expect-error — Testing runtime validation: age is not a unique field
          where: { age: 30 },
        });
      }).toThrow(/unique field/i);
    });

    test('findUnique throws when called with only non-unique field (Staff.department)', () => {
      expect(() => {
        client.db.Staff.findUnique({
          // @ts-expect-error — Testing runtime validation: department is not a unique field
          where: { department: 'Engineering' },
        });
      }).toThrow(/unique field/i);
    });

    test('findUnique throws when called with only non-unique field (User.name)', () => {
      expect(() => {
        client.db.User.findUnique({
          // @ts-expect-error — Testing runtime validation: name is not a unique field
          where: { name: 'Test' },
        });
      }).toThrow(/unique field/i);
    });
  });

  describe('where clause with unknown fields', () => {
    test('findMany throws for unknown field in where', () => {
      expect(() => {
        client.db.User.findMany({
          // @ts-expect-error — Testing runtime validation: nonExistentField doesn't exist
          where: { nonExistentField: 'value' },
        });
      }).toThrow('Unknown field');
    });

    test('updateMany throws for unknown field in where', () => {
      expect(() => {
        client.db.User.updateMany({
          // @ts-expect-error — Testing runtime validation: unknown field in where clause
          where: { fakeField: 'value' },
          data: { name: 'Updated' },
        });
      }).toThrow('Unknown field');
    });

    test('deleteMany throws for unknown field in where', () => {
      expect(() => {
        client.db.User.deleteMany({
          // @ts-expect-error — Testing runtime validation: unknown field in where clause
          where: { unknownField: 'value' },
        });
      }).toThrow('Unknown field');
    });
  });

  describe('where clause with unknown operators', () => {
    test('findMany throws for unknown operator on field', () => {
      expect(() => {
        client.db.User.findMany({
          where: {
            // @ts-expect-error — Testing runtime validation: 'like' is not a registered operator
            name: { like: '%test%' },
          },
        });
      }).toThrow('Unknown operator');
    });

    test('findMany throws for unknown operator on integer field', () => {
      expect(() => {
        client.db.User.findMany({
          where: {
            // @ts-expect-error — Testing runtime validation: 'regex' is not a registered operator
            age: { regex: '\\d+' },
          },
        });
      }).toThrow('Unknown operator');
    });
  });
});
