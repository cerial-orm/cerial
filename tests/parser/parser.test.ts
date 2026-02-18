/**
 * Parser tests
 * New schema format: fieldName Type @decorators
 */

import { describe, expect, test } from 'bun:test';
import { parse, validateSchema } from '../../src/parser/parser';

describe('parser', () => {
  test('parses simple model', () => {
    const source = `model User {
  id Record @id
  name String
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    expect(result.ast.models.length).toBe(1);
    expect(result.ast.models[0]?.name).toBe('User');
    expect(result.ast.models[0]?.fields.length).toBe(2);
  });

  test('parses field with @id decorator', () => {
    const source = `model User {
  id Record @id
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const field = result.ast.models[0]?.fields[0];
    expect(field?.name).toBe('id');
    expect(field?.decorators.some((d) => d.type === 'id')).toBe(true);
  });

  test('parses field with @unique decorator', () => {
    const source = `model User {
  email Email @unique
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const field = result.ast.models[0]?.fields[0];
    expect(field?.name).toBe('email');
    expect(field?.decorators.some((d) => d.type === 'unique')).toBe(true);
  });

  test('parses field with @now decorator', () => {
    const source = `model User {
  createdAt Date @now
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const field = result.ast.models[0]?.fields[0];
    expect(field?.name).toBe('createdAt');
    expect(field?.decorators.some((d) => d.type === 'now')).toBe(true);
  });

  test('parses optional field', () => {
    const source = `model User {
  bio String?
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const field = result.ast.models[0]?.fields[0];
    expect(field?.name).toBe('bio');
    expect(field?.isOptional).toBe(true);
  });

  test('parses multiple models', () => {
    const source = `model User {
  id Record @id
}

model Post {
  id Record @id
  title String
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    expect(result.ast.models.length).toBe(2);
    expect(result.ast.models[0]?.name).toBe('User');
    expect(result.ast.models[1]?.name).toBe('Post');
  });

  test('parses all field types', () => {
    const source = `model Types {
  a String
  b Email
  c Int
  d Date
  e Bool
  f Float
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const fields = result.ast.models[0]?.fields ?? [];
    expect(fields.length).toBe(6);
    expect(fields[0]?.type).toBe('string');
    expect(fields[1]?.type).toBe('email');
    expect(fields[2]?.type).toBe('int');
    expect(fields[3]?.type).toBe('date');
    expect(fields[4]?.type).toBe('bool');
    expect(fields[5]?.type).toBe('float');
  });

  test('parses complex model with multiple decorators', () => {
    const source = `model User {
  id Record @id
  email Email @unique
  name String
  age Int?
  isActive Bool
  createdAt Date @now
  updatedAt Date @now
}`;
    const result = parse(source);

    expect(result.errors.length).toBe(0);
    const model = result.ast.models[0];
    expect(model?.fields.length).toBe(7);

    // Check id field
    const idField = model?.fields.find((f) => f.name === 'id');
    expect(idField?.decorators.some((d) => d.type === 'id')).toBe(true);

    // Check email field
    const emailField = model?.fields.find((f) => f.name === 'email');
    expect(emailField?.decorators.some((d) => d.type === 'unique')).toBe(true);

    // Check age field (optional)
    const ageField = model?.fields.find((f) => f.name === 'age');
    expect(ageField?.isOptional).toBe(true);

    // Check createdAt field
    const createdAtField = model?.fields.find((f) => f.name === 'createdAt');
    expect(createdAtField?.decorators.some((d) => d.type === 'now')).toBe(true);
  });
});

describe('validateSchema', () => {
  test('detects duplicate model names', () => {
    const source = `model User {
  id Record @id
}

model User {
  id Record @id
}`;
    const result = parse(source);
    const errors = validateSchema(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Duplicate model name'))).toBe(true);
  });

  test('detects duplicate field names', () => {
    const source = `model User {
  id Record @id
  id Int
}`;
    const result = parse(source);
    const errors = validateSchema(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Duplicate field name'))).toBe(true);
  });

  test('detects multiple @id decorators in same model', () => {
    const source = `model User {
  id Record @id
  otherId String @id
}`;
    const result = parse(source);
    const errors = validateSchema(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Multiple @id decorators'))).toBe(true);
  });

  test('allows single @id per model', () => {
    const source = `model User {
  id Record @id
  email Email @unique
}`;
    const result = parse(source);
    const errors = validateSchema(result.ast);

    expect(errors.length).toBe(0);
  });
});
