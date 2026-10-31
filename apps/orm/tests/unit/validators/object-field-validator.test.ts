/**
 * Unit Tests: Object Field Validator
 *
 * Rules on object definitions and their fields, validated through the same
 * checks `cerial generate` runs.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

describe('Object Field Validator', () => {
  describe('validation errors', () => {
    test('should error on object with id field', () => {
      const schema = `
object Bad {
  id Record @id
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes("Objects cannot have an 'id' field"))).toBe(true);
    });

    test('should error on object with @id decorator', () => {
      const schema = `
object Bad {
  myId Record @id
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Decorator @id is not allowed on object fields'))).toBe(true);
    });

    test('should error on object with Relation field', () => {
      const schema = `
model User {
  id Record @id
}

object Bad {
  user Relation @model(User)
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Objects cannot have Relation fields'))).toBe(true);
    });

    test('should error on object with @field decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @field(something)
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(
        errors.some((e) => e.message.includes('@field') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    test('should error on object with @id decorator (disallowed)', () => {
      const schema = `
object Bad {
  ref Record @id
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('@id') && e.message.includes('not allowed on object fields'))).toBe(
        true,
      );
    });

    test('should error on object with @model decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @model(User)
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(
        errors.some((e) => e.message.includes('@model') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    test('should error on object with @key decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @key(something)
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('@key') && e.message.includes('not allowed on object fields'))).toBe(
        true,
      );
    });

    test('should error on object with @onDelete decorator (disallowed)', () => {
      const schema = `
object Bad {
  name String @onDelete(Cascade)
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(
        errors.some((e) => e.message.includes('@onDelete') && e.message.includes('not allowed on object fields')),
      ).toBe(true);
    });

    // Allowed decorators on object fields
    test('should allow @unique on object fields', () => {
      const schema = `
object Address {
  zip String @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @index on object fields', () => {
      const schema = `
object Address {
  city String @index
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should allow @default on object fields', () => {
      const schema = `
object Address {
  city String @default("Unknown")
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    test('should disallow @now on object Date fields (COMPUTED must be top-level)', () => {
      const schema = `
object Metadata {
  createdAt Date @now
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      const nowErrors = errors.filter((e) => e.message.includes('@now') && e.message.includes('not allowed'));
      expect(nowErrors).toHaveLength(1);
      expect(nowErrors[0]!.message).toContain('COMPUTED');
    });

    test('should allow @distinct and @sort on array fields in objects', () => {
      const schema = `
object Tags {
  values String[] @distinct @sort
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.filter((e) => e.message.includes('not allowed'))).toHaveLength(0);
    });

    // Validation rules for allowed decorators
    test('should error on @index and @unique on same object field', () => {
      const schema = `
object Address {
  zip String @index @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('@index') && e.message.includes('@unique'))).toBe(true);
    });

    test('should error on @unique on array field in object', () => {
      const schema = `
object Tags {
  values String[] @unique
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('array') && e.message.includes('@unique'))).toBe(true);
    });

    test('should error on @distinct on non-array field in object', () => {
      const schema = `
object Address {
  city String @distinct
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('distinct') && e.message.includes('array'))).toBe(true);
    });

    test('should error on @sort on non-array field in object', () => {
      const schema = `
object Address {
  city String @sort
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('sort') && e.message.includes('array'))).toBe(true);
    });

    test('should error on duplicate object name', () => {
      const schema = `
object Address {
  street String
}

object Address {
  city String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Duplicate object name: Address'))).toBe(true);
    });

    test('should error on object name same as model name', () => {
      const schema = `
model User {
  id Record @id
  name String
}

object User {
  street String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.map((e) => e.message)).toContain(
        'Duplicate name: User (declared as model in <input>:2 and as object in <input>:7)',
      );
    });

    test('should error on required self-referencing field', () => {
      const schema = `
object TreeNode {
  payload Int
  self TreeNode
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Self-referencing object fields must be optional or array'))).toBe(
        true,
      );
    });

    test('should error on duplicate field name within object', () => {
      const schema = `
object Bad {
  name String
  name String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Duplicate field name: name in object Bad'))).toBe(true);
    });
  });
});
