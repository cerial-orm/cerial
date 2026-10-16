/**
 * Unit Tests: Extends/Abstract Parser
 *
 * Tests parsing of `abstract model`, `extends`, pick/omit bracket syntax
 * across all type kinds (model, object, tuple, enum, literal).
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';

describe('Extends Parser', () => {
  // ──────────────────────────────────────────────
  // I. Cross-kind: models using objects with extends
  // ──────────────────────────────────────────────
  describe('cross-kind interaction', () => {
    test('should parse model with extends and object field', () => {
      const schema = `
object Address {
  street String
  city String
}

abstract model Base {
  id Record @id
}

model User extends Base {
  name String
  address Address
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);
      expect(ast.objects).toHaveLength(1);

      const user = ast.models[1]!;
      expect(user.extends).toBe('Base');
      expect(user.fields).toHaveLength(2);

      const addrField = user.fields.find((f) => f.name === 'address')!;
      expect(addrField.type).toBe('object');
      expect(addrField.objectName).toBe('Address');
    });

    test('should parse object extends with model referencing it', () => {
      const schema = `
object BaseAddr {
  street String
}

object FullAddr extends BaseAddr {
  city String
}

model User {
  id Record @id
  address FullAddr
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.objects).toHaveLength(2);
      expect(ast.objects[1]!.extends).toBe('BaseAddr');

      const user = ast.models[0]!;
      const addrField = user.fields.find((f) => f.name === 'address')!;
      expect(addrField.objectName).toBe('FullAddr');
    });
  });

  // ──────────────────────────────────────────────
  // J. Mixed pick/omit error detection
  // ──────────────────────────────────────────────
  describe('mixed pick/omit error detection', () => {
    test('should emit error for model with mixed pick/omit', () => {
      const schema = `
model Child extends Parent[field1, !field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for object with mixed pick/omit', () => {
      const schema = `
object Child extends Parent[field1, !field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for tuple with mixed pick/omit', () => {
      const schema = `
tuple Child extends Parent[0, !1] {
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for literal with mixed pick/omit', () => {
      const schema = `
literal Child extends Parent['a', !'b'] {
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should emit error for enum with mixed pick/omit', () => {
      const schema = `
enum Child extends Parent[A, !B] {
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot mix pick and omit');
    });

    test('should NOT emit error for valid pick-only', () => {
      const schema = `
model Child extends Parent[field1, field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });

    test('should NOT emit error for valid omit-only', () => {
      const schema = `
model Child extends Parent[!field1, !field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });

    test('should NOT emit error for empty brackets', () => {
      const schema = `
model Child extends Parent[] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────
  // K. Unmatched bracket error detection
  // ──────────────────────────────────────────────
  describe('unmatched bracket error detection', () => {
    // --- Model ---
    test('should emit error for model with unclosed bracket (extends Foo[)', () => {
      const schema = `
model Child extends Parent[ {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for model with stray closing bracket (extends Foo])', () => {
      const schema = `
model Child extends Parent] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    test('should emit error for model with unclosed bracket containing fields', () => {
      const schema = `
model Child extends Parent[field1 {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should NOT emit bracket error for valid model extends with brackets', () => {
      const schema = `
model Child extends Parent[field1, field2] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.every((e) => !e.message.includes('Unclosed bracket') && !e.message.includes('Unexpected ]'))).toBe(
        true,
      );
    });

    test('should NOT emit bracket error for model extends without brackets', () => {
      const schema = `
model Child extends Parent {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.every((e) => !e.message.includes('Unclosed bracket') && !e.message.includes('Unexpected ]'))).toBe(
        true,
      );
    });

    // --- Object ---
    test('should emit error for object with unclosed bracket', () => {
      const schema = `
object Child extends Parent[ {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for object with stray closing bracket', () => {
      const schema = `
object Child extends Parent] {
  name String
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Tuple ---
    test('should emit error for tuple with unclosed bracket', () => {
      const schema = `
tuple Child extends Parent[ {
  Int, Int
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for tuple with stray closing bracket', () => {
      const schema = `
tuple Child extends Parent] {
  Int, Int
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Literal ---
    test('should emit error for literal with unclosed bracket', () => {
      const schema = `
literal Child extends Parent[ {
  'a', 'b'
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for literal with stray closing bracket', () => {
      const schema = `
literal Child extends Parent] {
  'a', 'b'
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });

    // --- Enum ---
    test('should emit error for enum with unclosed bracket', () => {
      const schema = `
enum Child extends Parent[ {
  A
  B
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unclosed bracket'))).toBe(true);
    });

    test('should emit error for enum with stray closing bracket', () => {
      const schema = `
enum Child extends Parent] {
  A
  B
}
`;
      const { errors } = parse(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('Unexpected ]'))).toBe(true);
    });
  });
});
