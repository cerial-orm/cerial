/**
 * E2E Tests: Required Fields — negative cases
 *
 * Tests that Cerial's data validator rejects missing required fields.
 * Validation errors throw synchronously during query compilation.
 *
 * Schema: test-basics.cerial
 * Model: User { email Email @unique, name String, isActive Bool, ... }
 * Model: Post { title String, authorId Record, ... }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Required Fields — negative cases', () => {
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

  test('create rejects missing required email field', () => {
    expect(() => {
      client.db.User.create({
        // @ts-expect-error — Testing runtime validation: omitting required email field
        data: {
          name: 'Test',
          isActive: true,
        },
      });
    }).toThrow('email is required');
  });

  test('create rejects missing required name field', () => {
    expect(() => {
      client.db.User.create({
        // @ts-expect-error — Testing runtime validation: omitting required name field
        data: {
          email: 'test@example.com',
          isActive: true,
        },
      });
    }).toThrow('name is required');
  });

  test('create rejects missing required isActive field', () => {
    expect(() => {
      client.db.User.create({
        // @ts-expect-error — Testing runtime validation: omitting required isActive field
        data: {
          email: 'test@example.com',
          name: 'Test',
        },
      });
    }).toThrow('isActive is required');
  });

  test('create rejects empty data object (all required fields missing)', () => {
    expect(() => {
      // @ts-expect-error — Testing runtime validation: empty data with all required fields missing
      client.db.User.create({ data: {} });
    }).toThrow('is required');
  });

  test('create rejects null for required non-nullable field', () => {
    expect(() => {
      client.db.User.create({
        data: {
          email: 'test@example.com',
          // @ts-expect-error — Testing runtime validation: null for required non-nullable name
          name: null,
          isActive: true,
        },
      });
    }).toThrow('name is required');
  });

  test('create rejects missing required authorId on Post', () => {
    expect(() => {
      client.db.Post.create({
        // @ts-expect-error — Testing runtime validation: omitting required authorId
        data: {
          title: 'My Post',
        },
      });
    }).toThrow('authorId is required');
  });

  test('create rejects missing required title on Post', () => {
    expect(() => {
      client.db.Post.create({
        // @ts-expect-error — Testing runtime validation: omitting required title
        data: {
          authorId: 'user:test',
        },
      });
    }).toThrow('title is required');
  });
});
