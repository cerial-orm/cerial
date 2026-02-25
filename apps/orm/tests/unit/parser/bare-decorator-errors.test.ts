/**
 * Unit Tests: Bare Value-Requiring Decorator Errors
 *
 * Tests that decorators which require a value in parentheses
 * (@default, @defaultAlways, @model, @field, @onDelete, @key)
 * produce parse errors when written without parentheses/value.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';

describe('Bare Value-Requiring Decorator Errors', () => {
  // ──────────────────────────────────────────────
  // A. Bare decorators should produce parse errors
  // ──────────────────────────────────────────────

  describe('bare @default (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model Test {
  id Record @id
  name String @default
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@default'))).toBe(true);
    });
  });

  describe('bare @defaultAlways (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model Test {
  id Record @id
  name String @defaultAlways
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@defaultAlways'))).toBe(true);
    });
  });

  describe('bare @model (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @model @field(authorId)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    });
  });

  describe('bare @field (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field @model(User)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@field'))).toBe(true);
    });
  });

  describe('bare @onDelete (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation? @field(authorId) @model(User) @onDelete
  authorId Record?
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@onDelete'))).toBe(true);
    });
  });

  describe('bare @key (no value)', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field(authorId) @model(User) @key
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@key'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // B. Decorators WITH values should still work
  // ──────────────────────────────────────────────

  describe('@default with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model Test {
  id Record @id
  name String @default("test")
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  describe('@defaultAlways with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model Test {
  id Record @id
  name String @defaultAlways("test")
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  describe('@model with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field(authorId) @model(User)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  describe('@field with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field(authorId) @model(User)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  describe('@onDelete with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation? @field(authorId) @model(User) @onDelete(Cascade)
  authorId Record?
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  describe('@key with value still works', () => {
    test('should parse without errors', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field(authorId) @model(User) @key(authorKey)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // C. Empty parentheses should produce parse errors
  // ──────────────────────────────────────────────

  describe('empty parentheses @default()', () => {
    test('should produce a parse error', () => {
      const schema = `
model Test {
  id Record @id
  name String @default()
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@default'))).toBe(true);
    });
  });

  describe('empty parentheses @defaultAlways()', () => {
    test('should produce a parse error', () => {
      const schema = `
model Test {
  id Record @id
  name String @defaultAlways()
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@defaultAlways'))).toBe(true);
    });
  });

  describe('empty parentheses @model()', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @model() @field(authorId)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@model'))).toBe(true);
    });
  });

  describe('empty parentheses @field()', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field() @model(User)
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@field'))).toBe(true);
    });
  });

  describe('empty parentheses @onDelete()', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation? @field(authorId) @model(User) @onDelete()
  authorId Record?
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@onDelete'))).toBe(true);
    });
  });

  describe('empty parentheses @key()', () => {
    test('should produce a parse error', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field(authorId) @model(User) @key()
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@key'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // D. Edge cases
  // ──────────────────────────────────────────────

  describe('multiple bare decorators on one field', () => {
    test('should produce errors for each bare decorator', () => {
      const schema = `
model User {
  id Record @id
}
model Post {
  id Record @id
  author Relation @field @model
  authorId Record
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors.some((e) => e.message.includes('@field') && e.message.includes('requires a value'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@model') && e.message.includes('requires a value'))).toBe(true);
    });
  });

  describe('mix of valid and bare decorators', () => {
    test('should parse valid decorator and error on bare', () => {
      const schema = `
model Test {
  id Record @id
  name String @unique @default
}`;
      const { errors, ast } = parse(schema);
      // Should have an error for bare @default
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('@default') && e.message.includes('requires a value'))).toBe(true);
      // @unique should still be parsed
      const testModel = ast.models.find((m) => m.name === 'Test');
      const nameField = testModel?.fields.find((f) => f.name === 'name');
      expect(nameField?.decorators.some((d) => d.type === 'unique')).toBe(true);
    });
  });

  describe('no-value decorators still work bare', () => {
    test('@id works without value', () => {
      const schema = `
model Test {
  id Record @id
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@unique works without value', () => {
      const schema = `
model Test {
  id Record @id
  name String @unique
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@nullable works without value', () => {
      const schema = `
model Test {
  id Record @id
  name String @nullable
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@now works without value', () => {
      const schema = `
model Test {
  id Record @id
  ts Date @now
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@createdAt works without value', () => {
      const schema = `
model Test {
  id Record @id
  createdAt Date @createdAt
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@updatedAt works without value', () => {
      const schema = `
model Test {
  id Record @id
  updatedAt Date @updatedAt
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@readonly works without value', () => {
      const schema = `
model Test {
  id Record @id
  code String @readonly
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@flexible works without value', () => {
      const schema = `
object Meta {
  key String
}
model Test {
  id Record @id
  meta Meta @flexible
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@set works without value', () => {
      const schema = `
model Test {
  id Record @id
  tags String[] @set
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });

    test('@sort works without value (bare @sort = ascending default)', () => {
      const schema = `
model Test {
  id Record @id
  tags String[] @sort
}`;
      const { errors } = parse(schema);
      expect(errors.length).toBe(0);
    });
  });
});
