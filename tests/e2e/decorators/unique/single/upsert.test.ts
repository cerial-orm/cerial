/**
 * E2E Tests: Single-field @unique — upsert
 *
 * Tests upsert on Staff.email (single-field @unique).
 * Verifies create path when email doesn't exist and update path when it does.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('Single @unique — upsert', () => {
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

  describe('create path', () => {
    test('creates a new record when email does not exist', async () => {
      const result = await client.db.Staff.upsert({
        where: { email: 'new@example.com' },
        create: {
          firstName: 'Dan',
          lastName: 'Brown',
          department: 'Research',
          email: 'new@example.com',
          age: 28,
        },
        update: { department: 'Should Not Apply' },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.email).toBe('new@example.com');
      expect(result!.firstName).toBe('Dan');
      expect(result!.lastName).toBe('Brown');
      expect(result!.department).toBe('Research');
      expect(result!.age).toBe(28);
      expect(isCerialId(result!.id)).toBe(true);
    });

    test('create path does not apply update data', async () => {
      const result = await client.db.Staff.upsert({
        where: { email: 'fresh@example.com' },
        create: {
          firstName: 'Eve',
          lastName: 'White',
          department: 'Design',
          email: 'fresh@example.com',
        },
        update: { department: 'Not This', age: 99 },
      });

      expect(result).toBeDefined();
      expect(result!.department).toBe('Design');
      // age was only in update, so on create it should be NONE (absent)
      expect(result!.age).toBeUndefined();
    });
  });

  describe('update path', () => {
    test('updates an existing record when email already exists', async () => {
      // Pre-create the record
      await client.db.Staff.create({
        data: {
          firstName: 'Frank',
          lastName: 'Green',
          department: 'Support',
          email: 'frank@example.com',
          age: 45,
        },
      });

      const result = await client.db.Staff.upsert({
        where: { email: 'frank@example.com' },
        create: {
          firstName: 'Should Not See',
          lastName: 'Should Not See',
          department: 'Should Not See',
          email: 'frank@example.com',
        },
        update: { department: 'Operations', age: 46 },
      });

      expect(result).toBeDefined();
      expect(result!.email).toBe('frank@example.com');
      expect(result!.department).toBe('Operations');
      expect(result!.age).toBe(46);
      // Preserved fields from original record
      expect(result!.firstName).toBe('Frank');
      expect(result!.lastName).toBe('Green');
    });

    test('preserves record id after update path', async () => {
      const original = await client.db.Staff.create({
        data: {
          firstName: 'Grace',
          lastName: 'Lee',
          department: 'Legal',
          email: 'grace@example.com',
        },
      });

      const result = await client.db.Staff.upsert({
        where: { email: 'grace@example.com' },
        create: {
          firstName: 'New',
          lastName: 'Person',
          department: 'New Dept',
          email: 'grace@example.com',
        },
        update: { department: 'Compliance' },
      });

      expect(result).toBeDefined();
      expect(result!.id.equals(original.id)).toBe(true);
      expect(result!.department).toBe('Compliance');
    });

    test('create-only fields are preserved from existing record on update', async () => {
      await client.db.Staff.create({
        data: {
          firstName: 'Hank',
          lastName: 'Miller',
          department: 'IT',
          email: 'hank@example.com',
          age: 50,
        },
      });

      // age is only in create, not in update
      const result = await client.db.Staff.upsert({
        where: { email: 'hank@example.com' },
        create: {
          firstName: 'New',
          lastName: 'Person',
          department: 'New',
          email: 'hank@example.com',
          age: 99,
        },
        update: { department: 'DevOps' },
      });

      expect(result).toBeDefined();
      // age should be preserved from existing (50), not overwritten with create value (99)
      expect(result!.age).toBe(50);
      expect(result!.department).toBe('DevOps');
    });
  });
});
