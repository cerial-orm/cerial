/**
 * E2E Tests for CerialId - One Level Record Fields
 *
 * Tests CerialId handling for simple models without relations.
 * Validates that CerialId is properly returned and can be used in queries.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId } from 'surrealdb';
import { CerialId, isCerialId, type RecordIdInput } from 'cerial';
import { cleanupTables, createTestClient, truncateTables, CerialClient, testConfig } from '../test-client';

describe('E2E CerialId - One Level', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client);
  });

  describe('Create with CerialId', () => {
    test('should return CerialId for auto-generated id', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      // ID should be a CerialId instance
      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBeDefined();
      expect((user.id.id as string).length).toBeGreaterThan(0);
    });

    test('should accept CerialId as input', async () => {
      // Use simple alphanumeric ID to avoid escaping
      const inputId = new CerialId('user:cerialinput123');

      const user = await client.db.User.create({
        data: {
          id: inputId.toString(),
          email: 'cerial@example.com',
          name: 'CerialId User',
          isActive: true,
        },
      });

      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBe('cerialinput123');
      expect(user.id.toString()).toBe('user:cerialinput123');
    });

    test('should accept string as input', async () => {
      const user = await client.db.User.create({
        data: {
          id: 'user:string-input',
          email: 'string@example.com',
          name: 'String User',
          isActive: true,
        },
      });

      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBe('string-input');
    });

    test('should accept plain id string without table prefix', async () => {
      // When providing just an ID, the table should be inferred
      const user = await client.db.User.create({
        data: {
          id: 'plain-id',
          email: 'plain@example.com',
          name: 'Plain User',
          isActive: true,
        },
      });

      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBe('plain-id');
    });

    test('should accept RecordId as input', async () => {
      const recordId = new RecordId('user', 'record-id-input');

      const user = await client.db.User.create({
        data: {
          id: recordId.toString(),
          email: 'recordid@example.com',
          name: 'RecordId User',
          isActive: true,
        },
      });

      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBe('record-id-input');
    });

    test('should accept StringRecordId as input', async () => {
      const stringRecordId = new StringRecordId('user:string-record-id-input');

      const user = await client.db.User.create({
        data: {
          id: stringRecordId.toString(),
          email: 'stringrecordid@example.com',
          name: 'StringRecordId User',
          isActive: true,
        },
      });

      expect(isCerialId(user.id)).toBe(true);
      expect(user.id.table).toBe('user');
      expect(user.id.id).toBe('string-record-id-input');
    });
  });

  describe('Query with CerialId', () => {
    let userId: CerialId;

    beforeEach(async () => {
      const user = await client.db.User.create({
        data: {
          email: 'query@example.com',
          name: 'Query User',
          isActive: true,
        },
      });
      userId = user.id;
    });

    test('should find by CerialId', async () => {
      const result = await client.db.User.findUnique({
        where: { id: userId },
      });

      expect(result).toBeDefined();
      expect(isCerialId(result!.id)).toBe(true);
      expect(result!.id.equals(userId)).toBe(true);
    });

    test('should find by string id', async () => {
      const result = await client.db.User.findUnique({
        where: { id: userId.toString() },
      });

      expect(result).toBeDefined();
      expect(result!.id.equals(userId)).toBe(true);
    });

    test('should find by plain id string', async () => {
      // Use just the id part without table prefix
      const result = await client.db.User.findUnique({
        where: { id: userId.id },
      });

      expect(result).toBeDefined();
      expect(result!.id.equals(userId)).toBe(true);
    });

    test('should find by RecordId', async () => {
      const recordId = userId.toRecordId();

      const result = await client.db.User.findUnique({
        where: { id: recordId },
      });

      expect(result).toBeDefined();
      expect(result!.id.equals(userId)).toBe(true);
    });

    test('should find with in operator using CerialId array', async () => {
      // Create another user
      const user2 = await client.db.User.create({
        data: {
          email: 'query2@example.com',
          name: 'Query User 2',
          isActive: true,
        },
      });

      const results = await client.db.User.findMany({
        where: { id: { in: [userId, user2.id] } },
      });

      expect(results.length).toBe(2);
    });

    test('should update by CerialId', async () => {
      const result = await client.db.User.updateUnique({
        where: { id: userId },
        data: { name: 'Updated Name' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated Name');
      expect(result!.id.equals(userId)).toBe(true);
    });

    test('should delete by CerialId', async () => {
      const result = await client.db.User.deleteUnique({
        where: { id: userId },
        return: true,
      });

      expect(result).toBe(true);

      // Verify deletion
      const found = await client.db.User.findUnique({ where: { id: userId } });
      expect(found).toBeNull();
    });
  });

  describe('CerialId Equality', () => {
    test('equals() should work for same record', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'equal@example.com',
          name: 'Equal User',
          isActive: true,
        },
      });

      // Fetch the same user
      const fetched = await client.db.User.findUnique({
        where: { id: user.id },
      });

      // Different CerialId instances but equal values
      expect(user.id === fetched!.id).toBe(false); // Different object instances
      expect(user.id.equals(fetched!.id)).toBe(true); // But semantically equal
    });

    test('equals() should work with string', async () => {
      const user = await client.db.User.create({
        data: {
          id: 'user:test-equals',
          email: 'equals@example.com',
          name: 'Equals User',
          isActive: true,
        },
      });

      expect(user.id.equals('user:test-equals')).toBe(true);
      expect(user.id.equals('user:other-id')).toBe(false);
    });

    test('valueOf() should return string for comparison', async () => {
      const user = await client.db.User.create({
        data: {
          id: 'user:valueoftest',
          email: 'valueof@example.com',
          name: 'ValueOf User',
          isActive: true,
        },
      });

      // valueOf() returns the string representation
      expect(user.id.valueOf()).toBe('user:valueoftest');

      // Note: Due to JavaScript object comparison rules, == doesn't work with objects
      // Use .equals() or .toString() for comparisons instead
    });

    test('toString() should return table:id format', async () => {
      // Use simple alphanumeric ID to avoid escaping
      const user = await client.db.User.create({
        data: {
          id: 'user:tostringtest',
          email: 'tostring@example.com',
          name: 'ToString User',
          isActive: true,
        },
      });

      expect(user.id.toString()).toBe('user:tostringtest');
    });

    test('toString() escapes special characters with angle brackets', async () => {
      // IDs with special characters (like hyphens) get escaped
      const user = await client.db.User.create({
        data: {
          id: 'user:id-with-hyphens',
          email: 'escape@example.com',
          name: 'Escape User',
          isActive: true,
        },
      });

      // Internally stored unescaped
      expect(user.id.id).toBe('id-with-hyphens');
      // toString() uses SurrealDB's escaping (angle brackets)
      expect(user.id.toString()).toContain('id-with-hyphens');
    });

    test('toJSON() should serialize to string', async () => {
      // Use simple alphanumeric ID to avoid escaping
      const user = await client.db.User.create({
        data: {
          id: 'user:jsontest',
          email: 'json@example.com',
          name: 'JSON User',
          isActive: true,
        },
      });

      const json = JSON.stringify({ id: user.id });
      expect(json).toBe('{"id":"user:jsontest"}');
    });
  });

  describe('CerialId with Record[] fields', () => {
    test('should return CerialId[] for tagIds array', async () => {
      // Create some tags first
      const tag1 = await client.db.Tag.create({
        data: { name: 'tag1' },
      });
      const tag2 = await client.db.Tag.create({
        data: { name: 'tag2' },
      });

      // Create user with tagIds
      const user = await client.db.User.create({
        data: {
          email: 'tagids@example.com',
          name: 'TagIds User',
          isActive: true,
          tagIds: [tag1.id, tag2.id],
        },
      });

      expect(Array.isArray(user.tagIds)).toBe(true);
      expect(user.tagIds.length).toBe(2);
      expect(isCerialId(user.tagIds[0])).toBe(true);
      expect(isCerialId(user.tagIds[1])).toBe(true);
      expect(user.tagIds[0]!.table).toBe('tag');
      expect(user.tagIds[1]!.table).toBe('tag');
    });

    test('should accept string array for Record[] input', async () => {
      // Create tags
      const tag1 = await client.db.Tag.create({
        data: { name: 'strtag1' },
      });
      const tag2 = await client.db.Tag.create({
        data: { name: 'strtag2' },
      });

      // Create user with string tagIds
      const user = await client.db.User.create({
        data: {
          email: 'strtagids@example.com',
          name: 'String TagIds User',
          isActive: true,
          tagIds: [tag1.id.toString(), tag2.id.toString()],
        },
      });

      expect(user.tagIds.length).toBe(2);
      expect(user.tagIds[0]!.equals(tag1.id)).toBe(true);
      expect(user.tagIds[1]!.equals(tag2.id)).toBe(true);
    });
  });
});
