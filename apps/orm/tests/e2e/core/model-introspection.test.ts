import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig } from '../test-helper';

describe('E2E Model Introspection', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  describe('getName', () => {
    test('User model returns User', () => {
      expect(client.User.getName()).toBe('User');
    });

    test('Post model returns Post', () => {
      expect(client.Post.getName()).toBe('Post');
    });

    test('Profile model returns Profile', () => {
      expect(client.Profile.getName()).toBe('Profile');
    });

    test('Tag model returns Tag', () => {
      expect(client.Tag.getName()).toBe('Tag');
    });
  });

  describe('getTableName', () => {
    test('User model returns user', () => {
      expect(client.User.getTableName()).toBe('user');
    });

    test('Post model returns post', () => {
      expect(client.Post.getTableName()).toBe('post');
    });

    test('Profile model returns profile', () => {
      expect(client.Profile.getTableName()).toBe('profile');
    });

    test('Tag model returns tag', () => {
      expect(client.Tag.getTableName()).toBe('tag');
    });
  });

  describe('getMetadata', () => {
    test('returns object with name, tableName, and fields', () => {
      const metadata = client.User.getMetadata();

      expect(metadata.name).toBe('User');
      expect(metadata.tableName).toBe('user');
      expect(Array.isArray(metadata.fields)).toBe(true);
      expect(metadata.fields.length).toBeGreaterThan(0);
    });

    test('name matches getName result', () => {
      const metadata = client.User.getMetadata();

      expect(metadata.name).toBe(client.User.getName());
    });

    test('tableName matches getTableName result', () => {
      const metadata = client.User.getMetadata();

      expect(metadata.tableName).toBe(client.User.getTableName());
    });

    test('fields contain id field with isId true', () => {
      const metadata = client.User.getMetadata();
      const idField = metadata.fields.find((f) => f.name === 'id');

      expect(idField).toBeDefined();
      expect(idField!.isId).toBe(true);
      expect(idField!.type).toBe('record');
    });

    test('fields contain email field with isUnique true', () => {
      const metadata = client.User.getMetadata();
      const emailField = metadata.fields.find((f) => f.name === 'email');

      expect(emailField).toBeDefined();
      expect(emailField!.isUnique).toBe(true);
      expect(emailField!.type).toBe('email');
    });

    test('fields contain expected field names for User', () => {
      const metadata = client.User.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('isActive');
      expect(fieldNames).toContain('nicknames');
      expect(fieldNames).toContain('scores');
    });

    test('Post model metadata has correct structure', () => {
      const metadata = client.Post.getMetadata();

      expect(metadata.name).toBe('Post');
      expect(metadata.tableName).toBe('post');
      expect(Array.isArray(metadata.fields)).toBe(true);

      const fieldNames = metadata.fields.map((f) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('title');
      expect(fieldNames).toContain('authorId');
    });

    test('optional field has isRequired false', () => {
      const metadata = client.User.getMetadata();
      const ageField = metadata.fields.find((f) => f.name === 'age');

      expect(ageField).toBeDefined();
      expect(ageField!.isRequired).toBe(false);
    });

    test('required field has isRequired true', () => {
      const metadata = client.User.getMetadata();
      const nameField = metadata.fields.find((f) => f.name === 'name');

      expect(nameField).toBeDefined();
      expect(nameField!.isRequired).toBe(true);
    });
  });
});
