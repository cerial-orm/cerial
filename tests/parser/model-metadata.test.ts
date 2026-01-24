/**
 * Model metadata tests
 * New schema format: fieldName Type @decorators
 */

import { describe, expect, test } from 'bun:test';
import {
  astToRegistry,
  fieldToMetadata,
  getNowFields,
  getUniqueFields,
  modelToMetadata,
} from '../../src/parser/model-metadata';
import { parse } from '../../src/parser/parser';

describe('model-metadata', () => {
  test('converts AST to registry', () => {
    const source = `model User {
  id String @id
  name String
  createdAt Date @now
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);

    expect(registry['User']).toBeDefined();
    expect(registry['User']?.name).toBe('User');
    expect(registry['User']?.tableName).toBe('user');
    expect(registry['User']?.fields.length).toBe(3);
  });

  test('converts field with @id to metadata', () => {
    const source = `model User {
  id String @id
  name String?
}`;
    const result = parse(source);
    const field1 = result.ast.models[0]?.fields[0];
    const field2 = result.ast.models[0]?.fields[1];

    if (field1) {
      const metadata1 = fieldToMetadata(field1);
      expect(metadata1.name).toBe('id');
      expect(metadata1.type).toBe('string');
      expect(metadata1.isId).toBe(true);
      // @id does NOT imply @unique - they are separate decorators
      expect(metadata1.isUnique).toBe(false);
      expect(metadata1.isRequired).toBe(true);
    }

    if (field2) {
      const metadata2 = fieldToMetadata(field2);
      expect(metadata2.name).toBe('name');
      expect(metadata2.isRequired).toBe(false);
    }
  });

  test('converts PascalCase model name to snake_case table name', () => {
    const source = `model UserProfile {
  id String @id
}`;
    const result = parse(source);
    const model = result.ast.models[0];

    if (model) {
      const metadata = modelToMetadata(model);
      expect(metadata.name).toBe('UserProfile');
      expect(metadata.tableName).toBe('user_profile');
    }
  });

  test('getUniqueFields returns unique fields (not @id)', () => {
    const source = `model User {
  id String @id
  email Email @unique
  name String
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const uniqueFields = getUniqueFields(registry['User']!);

    // Only email has @unique, @id is separate from @unique
    expect(uniqueFields.length).toBe(1);
    expect(uniqueFields[0]?.name).toBe('email');
    expect(uniqueFields[0]?.isUnique).toBe(true);
  });

  test('@id and @unique are separate decorators', () => {
    const source = `model User {
  id String @id
  email Email @unique
  code String @id @unique
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const user = registry['User']!;

    const idField = user.fields.find((f) => f.name === 'id');
    const emailField = user.fields.find((f) => f.name === 'email');
    const codeField = user.fields.find((f) => f.name === 'code');

    expect(idField?.isId).toBe(true);
    expect(idField?.isUnique).toBe(false);

    expect(emailField?.isId).toBe(false);
    expect(emailField?.isUnique).toBe(true);

    expect(codeField?.isId).toBe(true);
    expect(codeField?.isUnique).toBe(true);
  });

  test('getNowFields returns fields with @now decorator', () => {
    const source = `model User {
  id String @id
  createdAt Date @now
  updatedAt Date @now
}`;
    const result = parse(source);
    const registry = astToRegistry(result.ast);
    const nowFields = getNowFields(registry['User']!);

    expect(nowFields.length).toBe(2);
    expect(nowFields.every((f) => f.hasNowDefault)).toBe(true);
  });
});
