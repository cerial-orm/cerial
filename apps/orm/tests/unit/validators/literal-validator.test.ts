/**
 * Unit Tests: Literal Validator
 *
 * Tests validation that rejects nested object/tuple/complex-literal
 * fields in objects and tuples referenced by literal variants.
 * Only flat (primitive + simple literal) fields/elements are allowed.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

describe('Literal Validator', () => {
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
      const validationErrors = validateAll(ast);
      expect(validationErrors.filter((e) => e.message.includes('referenced in literal'))).toHaveLength(0);
    });

    test('should allow object with simple literal-typed field', () => {
      const schema = `
literal Status { 'active', 'inactive' }

object Details {
  name String
  status Status
}

literal WithDetails { 'empty', Details }
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
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
      const validationErrors = validateAll(ast);
      // The error should be on Base (which directly references Outer), not on Extended
      expect(validationErrors.some((e) => e.message.includes("Object 'Outer' referenced in literal 'Base'"))).toBe(
        true,
      );
    });
  });

  describe('names, variants, references and circularity', () => {
    const messages = (schema: string) => validateAll(parse(schema).ast).map((e) => e.message);
    const MODEL = 'model Host {\n  id Record @id\n}\n';

    test('rejects a literal named like a model', () => {
      expect(messages(`literal Host { 'a', 'b' }\n${MODEL}`)).toContain(
        "Literal name 'Host' conflicts with model name",
      );
    });

    test('rejects a literal named like an object', () => {
      expect(messages("literal Geo { 'a', 'b' }\nobject Geo {\n  lat Float\n}")).toContain(
        "Literal name 'Geo' conflicts with object name",
      );
    });

    test('rejects a literal named like a tuple', () => {
      expect(messages("literal Pair { 'a', 'b' }\ntuple Pair {\n  Int,\n  Int\n}")).toContain(
        "Literal name 'Pair' conflicts with tuple name",
      );
    });

    test('accepts a literal whose name is unique', () => {
      expect(messages(`literal Level { 'a', 'b' }\n${MODEL}`)).toEqual([]);
    });

    test('rejects a repeated variant of each kind', () => {
      expect(messages("literal L { 'a', 'a' }")).toContain('Duplicate variant in literal L');
      expect(messages('literal L { 1, 1 }')).toContain('Duplicate variant in literal L');
      expect(messages('literal L { String, String }')).toContain('Duplicate variant in literal L');
    });

    test('accepts the same value written as different kinds', () => {
      expect(messages("literal L { 'a', 1, true, String }")).toEqual([]);
    });

    test('rejects a two-literal cycle', () => {
      const found = messages("literal A { B, 'x' }\nliteral B { A, 'y' }");

      expect(found).toContain('Circular literal reference detected: A -> B');
      expect(found).toContain('Circular literal reference detected: B -> A');
    });

    test('rejects a three-literal cycle', () => {
      const found = messages("literal A { B, 'x' }\nliteral B { C, 'y' }\nliteral C { A, 'z' }");

      expect(found.filter((m) => m.startsWith('Circular literal reference'))).toHaveLength(3);
    });

    test('accepts a diamond of literal references', () => {
      const found = messages(
        "literal Base { 'x' }\nliteral L { Base, 'l' }\nliteral R { Base, 'r' }\nliteral Top { L, R }",
      );

      expect(found.filter((m) => m.startsWith('Circular'))).toEqual([]);
    });

    test('accepts a literal referencing an enum', () => {
      expect(messages("enum Role { A, B }\nliteral L { Role, 'x' }")).toEqual([]);
    });

    test('rejects a model field naming a literal that does not exist', () => {
      const ast = parse(`literal Level { 'a', 'b' }\nmodel Host {\n  id Record @id\n  level Level\n}`).ast;
      const field = ast.models[0]!.fields.find((f) => f.name === 'level')!;
      field.literalName = 'Gone';

      expect(validateAll(ast).map((e) => e.message)).toContain(
        "Field 'level' in model Host references unknown literal 'Gone'",
      );
    });

    test('rejects an object field naming a literal that does not exist', () => {
      const ast = parse("literal Level { 'a', 'b' }\nobject Box {\n  level Level\n}").ast;
      ast.objects[0]!.fields[0]!.literalName = 'Gone';

      expect(validateAll(ast).map((e) => e.message)).toContain(
        "Field 'level' in object Box references unknown literal 'Gone'",
      );
    });

    test('rejects a tuple element naming a literal that does not exist', () => {
      const ast = parse("literal Level { 'a', 'b' }\ntuple Box {\n  Level,\n  Int\n}").ast;
      ast.tuples[0]!.elements[0]!.literalName = 'Gone';

      expect(validateAll(ast).map((e) => e.message)).toContain(
        "Tuple element references unknown literal 'Gone' in tuple Box",
      );
    });

    test('accepts fields naming declared literals and enums', () => {
      expect(
        messages(
          `enum Role { A, B }\nliteral Level { 'a', 'b' }\nmodel Host {\n  id Record @id\n  role Role\n  level Level\n}`,
        ),
      ).toEqual([]);
    });
  });
});
