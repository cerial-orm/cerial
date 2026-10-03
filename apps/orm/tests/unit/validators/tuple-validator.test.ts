/**
 * Unit Tests: Tuple Validator
 *
 * Tuple name collisions, element rules and references, validated through the same
 * checks `cerial generate` runs.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

describe('Tuple Validator', () => {
  describe('validation errors', () => {
    test('should error on duplicate tuple name', () => {
      const schema = `
tuple Point {
  Float,
  Float
}

tuple Point {
  Int,
  Int
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Duplicate tuple name: Point'))).toBe(true);
    });

    test('should error on tuple name conflicting with model name', () => {
      const schema = `
model User {
  id Record @id
  name String
}

tuple User {
  String,
  Int
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes("Tuple name 'User' conflicts with model name"))).toBe(true);
    });

    test('should error on tuple name conflicting with object name', () => {
      const schema = `
object Address {
  street String
}

tuple Address {
  String,
  String
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes("Tuple name 'Address' conflicts with object name"))).toBe(true);
    });

    test('should error on empty tuple (no elements)', () => {
      const schema = `
tuple Empty {
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('at least one element'))).toBe(true);
    });

    test('should error on duplicate named elements', () => {
      const schema = `
tuple Bad {
  x Float,
  x Float
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Duplicate element name'))).toBe(true);
    });

    test('should error on Relation type in tuple', () => {
      const schema = `
model User {
  id Record @id
}

tuple Bad {
  String,
  Relation
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('relation') || e.message.includes('Relation'))).toBe(true);
    });

    test('should error on Record type in tuple', () => {
      const schema = `
tuple Bad {
  String,
  Record
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('record') || e.message.includes('Record'))).toBe(true);
    });

    test('should error on required self-referencing tuple element', () => {
      const schema = `
tuple Bad {
  value Int,
  next Bad
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      expect(errors.some((e) => e.message.includes('Self-referencing') && e.message.includes('@nullable'))).toBe(true);
    });

    test('should NOT error on @nullable self-referencing tuple element', () => {
      const schema = `
tuple Good {
  value Int,
  next Good @nullable
}
`;
      const { ast } = parse(schema);
      const selfRefErrors = validateAll(ast).filter((e) => e.message.includes('Self-referencing'));
      expect(selfRefErrors).toHaveLength(0);
    });

    test('should NOT error on optional self-referencing tuple element', () => {
      const schema = `
tuple Good {
  value Int,
  next Good?
}
`;
      const { ast } = parse(schema);
      const errors = validateAll(ast);
      // Filter for self-referencing errors only
      const selfRefErrors = errors.filter((e) => e.message.includes('Self-referencing'));
      expect(selfRefErrors).toHaveLength(0);
    });

    test('should produce parse error on tuple element referencing non-existent type', () => {
      const schema = `
tuple Bad {
  String,
  NonExistent
}
`;
      const { errors } = parse(schema);
      // Unknown types are caught at parse time as invalid elements
      expect(errors.some((e) => e.message.includes('Invalid tuple element'))).toBe(true);
    });

    test('should produce parse error on tuple element with unknown tuple reference', () => {
      const schema = `
tuple Bad {
  String,
  NonExistentTuple
}
`;
      const { errors } = parse(schema);
      expect(errors.some((e) => e.message.includes('Invalid tuple element'))).toBe(true);
    });
  });

  // The parser rejects unknown type names itself, so these rewrite a parsed reference to prove
  // the validator also refuses a dangling one in an AST that arrives by another route.
  describe('dangling references', () => {
    test('should error on a tuple element naming an unknown object', () => {
      const { ast } = parse('object Geo {\n  lat Float\n}\ntuple Box {\n  Geo,\n  Int\n}');
      ast.tuples[0]!.elements[0]!.objectName = 'Gone';

      expect(validateAll(ast).map((e) => e.message)).toContain(
        "Tuple element references unknown object 'Gone' in tuple Box",
      );
    });

    test('should error on a tuple element naming an unknown tuple', () => {
      const { ast } = parse('tuple Inner {\n  Int,\n  Int\n}\ntuple Box {\n  Inner,\n  Int\n}');
      ast.tuples[1]!.elements[0]!.tupleName = 'Gone';

      expect(validateAll(ast).map((e) => e.message)).toContain(
        "Tuple element references unknown tuple 'Gone' in tuple Box",
      );
    });

    test('should not error on elements naming declared object and tuple types', () => {
      const { ast } = parse(
        'object Geo {\n  lat Float\n}\ntuple Inner {\n  Int,\n  Int\n}\ntuple Box {\n  Geo,\n  Inner\n}',
      );

      expect(validateAll(ast).filter((e) => e.message.includes('unknown'))).toEqual([]);
    });
  });
});
