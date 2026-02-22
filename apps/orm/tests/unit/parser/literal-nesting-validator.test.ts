/**
 * Unit Tests: Literal Nesting Validator
 *
 * Tests parser validation that rejects nested object/tuple/complex-literal
 * fields in objects and tuples referenced by literal variants.
 * Only flat (primitive + simple literal) fields/elements are allowed.
 */

import { describe, expect, test } from 'bun:test';
import { parse, validateSchema } from '../../../src/parser/parser';

describe('Literal Nesting Validator', () => {
  describe('object variants — valid cases', () => {
    test('should allow object with only primitive fields', () => {
      const schema = `
object Point {
  x Int
  y Int
}

literal WithObj { 'none', Point }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow object with simple literal-typed field', () => {
      const schema = `
literal Status { 'active', 'inactive' }

object Info {
  name String
  status Status
}

literal WithInfo { 'empty', Info }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow object with optional and array primitive fields', () => {
      const schema = `
object Data {
  name String
  count Int?
  tags String[]
}

literal WithData { 'none', Data }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow object with all primitive types', () => {
      const schema = `
object AllTypes {
  name String
  count Int
  score Float
  active Bool
  created Date
}

literal WithAll { 'none', AllTypes }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });
  });

  describe('object variants — rejected cases', () => {
    test('should error when object has nested object field', () => {
      const schema = `
object Inner {
  x Int
}

object Outer {
  name String
  inner Inner
}

literal Bad { 'none', Outer }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Object 'Outer' referenced in literal 'Bad'") &&
            e.message.includes('object field') &&
            e.message.includes("'inner'"),
        ),
      ).toBe(true);
    });

    test('should error when object has nested tuple field', () => {
      const schema = `
tuple Coord {
  Float,
  Float
}

object Location {
  name String
  coord Coord
}

literal Bad { 'none', Location }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Object 'Location' referenced in literal 'Bad'") &&
            e.message.includes('tuple field') &&
            e.message.includes("'coord'"),
        ),
      ).toBe(true);
    });

    test('should error when object has literal field with complex literal', () => {
      const schema = `
object Inner {
  x Int
}

literal Complex { 'a', Inner }

object Wrapper {
  name String
  kind Complex
}

literal Bad { 'none', Wrapper }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Object 'Wrapper' referenced in literal 'Bad'") &&
            e.message.includes("literal field 'kind'") &&
            e.message.includes("'Complex'") &&
            e.message.includes('non-primitive variants'),
        ),
      ).toBe(true);
    });

    test('should error when object has literal field with literalRef variant', () => {
      const schema = `
literal Base { 'a', 'b' }
literal Extended { Base, 'c' }

object Data {
  name String
  kind Extended
}

literal Bad { 'none', Data }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Object 'Data' referenced in literal 'Bad'") &&
            e.message.includes("literal field 'kind'") &&
            e.message.includes("'Extended'") &&
            e.message.includes('non-primitive variants'),
        ),
      ).toBe(true);
    });
  });

  describe('tuple variants — valid cases', () => {
    test('should allow tuple with only primitive elements', () => {
      const schema = `
tuple Pair {
  Float,
  Float
}

literal WithTuple { 'none', Pair }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow tuple with named primitive elements', () => {
      const schema = `
tuple Coord {
  x Float,
  y Float
}

literal WithCoord { 'none', Coord }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow tuple with simple literal element', () => {
      const schema = `
literal Status { 'active', 'inactive' }

tuple Tagged {
  String,
  Status
}

literal WithTagged { 'none', Tagged }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });
  });

  describe('tuple variants — rejected cases', () => {
    test('should error when tuple has object element', () => {
      const schema = `
object Addr {
  city String
}

tuple Located {
  String,
  Addr
}

literal Bad { 'none', Located }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Tuple 'Located' referenced in literal 'Bad'") && e.message.includes('object element'),
        ),
      ).toBe(true);
    });

    test('should error when tuple has nested tuple element', () => {
      const schema = `
tuple Inner {
  Int,
  Int
}

tuple Outer {
  String,
  Inner
}

literal Bad { 'none', Outer }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Tuple 'Outer' referenced in literal 'Bad'") &&
            e.message.includes('nested tuple element'),
        ),
      ).toBe(true);
    });

    test('should error when tuple has literal element with complex literal', () => {
      const schema = `
tuple Simple {
  Int,
  Int
}

literal Complex { 'a', Simple }

tuple WithComplex {
  String,
  Complex
}

literal Bad { 'none', WithComplex }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(
        validationErrors.some(
          (e) =>
            e.message.includes("Tuple 'WithComplex' referenced in literal 'Bad'") &&
            e.message.includes('literal element') &&
            e.message.includes("'Complex'") &&
            e.message.includes('non-primitive variants'),
        ),
      ).toBe(true);
    });
  });

  describe('multiple errors', () => {
    test('should report errors for multiple problematic fields in an object', () => {
      const schema = `
object Inner {
  x Int
}

tuple Pair {
  Int,
  Int
}

object Bad {
  name String
  nested Inner
  coords Pair
}

literal Lit { 'none', Bad }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      const literalErrors = validationErrors.filter((e) => e.message.includes("referenced in literal 'Lit'"));
      expect(literalErrors.length).toBe(2);
      expect(literalErrors.some((e) => e.message.includes("object field 'nested'"))).toBe(true);
      expect(literalErrors.some((e) => e.message.includes("tuple field 'coords'"))).toBe(true);
    });

    test('should report errors for both object and tuple variants in same literal', () => {
      const schema = `
object Inner {
  x Int
}

object Outer {
  name String
  inner Inner
}

tuple Nested {
  String,
  Inner
}

literal Bad { 'none', Outer, Nested }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      const literalErrors = validationErrors.filter((e) => e.message.includes("referenced in literal 'Bad'"));
      expect(literalErrors.length).toBe(2);
      expect(literalErrors.some((e) => e.message.includes("Object 'Outer'"))).toBe(true);
      expect(literalErrors.some((e) => e.message.includes("Tuple 'Nested'"))).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should not error when object is used directly (not through literal)', () => {
      const schema = `
object Inner {
  x Int
}

object Outer {
  name String
  inner Inner
}

model MyModel {
  id Record @id
  data Outer
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      // No literal-related errors since no literal is involved
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow same object used in literal AND directly on model', () => {
      const schema = `
object Point {
  x Int
  y Int
}

literal WithPoint { 'none', Point }

model MyModel {
  id Record @id
  point Point
  data WithPoint
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should validate through literalRef expansion', () => {
      // If a literal references another literal that has an objectRef with nested types,
      // the nesting check should apply to the original objectRef literal, not the referencing one
      const schema = `
object Inner {
  x Int
}

object Outer {
  name String
  inner Inner
}

literal Base { 'a', Outer }
literal Extended { Base, 'b' }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateSchema(ast);
      // The error should be on Base (which directly references Outer), not on Extended
      expect(validationErrors.some((e) => e.message.includes("Object 'Outer' referenced in literal 'Base'"))).toBe(
        true,
      );
    });
  });
});
