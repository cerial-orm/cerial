/**
 * Unit Tests: !!private Parser
 *
 * Tests parsing of `!!private` marker on model/object fields and tuple elements.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { parseFieldDeclaration } from '../../../src/parser/types/model/field-declaration-parser';

describe('Private Parser', () => {
  // ──────────────────────────────────────────────
  // A. Field-level !!private via parseFieldDeclaration
  // ──────────────────────────────────────────────
  describe('parseFieldDeclaration with !!private', () => {
    test('should parse field with !!private at end', () => {
      const result = parseFieldDeclaration('id Record @id !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('id');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isPrivate).toBe(true);
      expect(result.field!.decorators.some((d) => d.type === 'id')).toBe(true);
    });

    test('should parse field without !!private', () => {
      const result = parseFieldDeclaration('name String', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('name');
      expect(result.field!.isPrivate).toBeUndefined();
    });

    test('should parse field with decorator and !!private', () => {
      const result = parseFieldDeclaration('email Email @unique !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('email');
      expect(result.field!.type).toBe('email');
      expect(result.field!.isPrivate).toBe(true);
      expect(result.field!.decorators.some((d) => d.type === 'unique')).toBe(true);
    });

    test('should parse optional field with !!private', () => {
      const result = parseFieldDeclaration('secret String? !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('secret');
      expect(result.field!.isOptional).toBe(true);
      expect(result.field!.isPrivate).toBe(true);
    });

    test('should parse array field with !!private', () => {
      const result = parseFieldDeclaration('tags String[] !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('tags');
      expect(result.field!.isArray).toBe(true);
      expect(result.field!.isPrivate).toBe(true);
    });

    test('should parse field with multiple decorators and !!private', () => {
      const result = parseFieldDeclaration('createdAt Date @createdAt @readonly !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('createdAt');
      expect(result.field!.isPrivate).toBe(true);
      expect(result.field!.decorators).toHaveLength(2);
    });

    test('should parse field with @default and !!private', () => {
      const result = parseFieldDeclaration('status String @default("active") !!private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.isPrivate).toBe(true);
      expect(result.field!.decorators.some((d) => d.type === 'default')).toBe(true);
    });

    test('should not treat !!private as a decorator', () => {
      const result = parseFieldDeclaration('name String !!private', 1);
      expect(result.field).not.toBeNull();
      expect(result.field!.decorators).toHaveLength(0);
      expect(result.field!.isPrivate).toBe(true);
    });

    test('should handle !!private with comment after it', () => {
      const result = parseFieldDeclaration('name String !!private // this is private', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('name');
      expect(result.field!.isPrivate).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // B. Tuple element !!private
  // ──────────────────────────────────────────────
  describe('tuple element !!private', () => {
    test('should parse tuple with private element', () => {
      const schema = `
tuple SecretPair {
  Float,
  Float !!private
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.tuples).toHaveLength(1);

      const tuple = ast.tuples[0]!;
      expect(tuple.elements).toHaveLength(2);
      expect(tuple.elements[0]!.isPrivate).toBeUndefined();
      expect(tuple.elements[1]!.isPrivate).toBe(true);
    });

    test('should parse tuple with named private element', () => {
      const schema = `
tuple Coord {
  lat Float,
  lng Float !!private
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const tuple = ast.tuples[0]!;
      expect(tuple.elements[0]!.name).toBe('lat');
      expect(tuple.elements[0]!.isPrivate).toBeUndefined();
      expect(tuple.elements[1]!.name).toBe('lng');
      expect(tuple.elements[1]!.isPrivate).toBe(true);
    });

    test('should parse tuple with !!private and decorator on element', () => {
      const schema = `
tuple Tagged {
  String @nullable !!private,
  Int
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const tuple = ast.tuples[0]!;
      expect(tuple.elements[0]!.isPrivate).toBe(true);
      expect(tuple.elements[0]!.isNullable).toBe(true);
    });

    test('should parse single-line tuple with !!private', () => {
      const schema = `tuple Pair { Float, Float !!private }`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const tuple = ast.tuples[0]!;
      expect(tuple.elements).toHaveLength(2);
      expect(tuple.elements[1]!.isPrivate).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // C. Full parse integration with !!private
  // ──────────────────────────────────────────────
  describe('full parse integration', () => {
    test('should parse model with private fields', () => {
      const schema = `
model User {
  id Record @id
  name String
  secret String !!private
  email Email @unique
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const user = ast.models[0]!;
      expect(user.fields).toHaveLength(4);

      const secret = user.fields.find((f) => f.name === 'secret')!;
      expect(secret.isPrivate).toBe(true);

      const name = user.fields.find((f) => f.name === 'name')!;
      expect(name.isPrivate).toBeUndefined();

      const email = user.fields.find((f) => f.name === 'email')!;
      expect(email.isPrivate).toBeUndefined();
    });

    test('should parse object with private fields', () => {
      const schema = `
object Credentials {
  username String
  password String !!private
  token String? !!private
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const cred = ast.objects[0]!;
      expect(cred.fields).toHaveLength(3);

      expect(cred.fields[0]!.isPrivate).toBeUndefined();
      expect(cred.fields[1]!.isPrivate).toBe(true);
      expect(cred.fields[2]!.isPrivate).toBe(true);
    });

    test('should parse abstract model with private fields and extends', () => {
      const schema = `
abstract model Base {
  id Record @id
  internalCode String !!private
}

model User extends Base {
  name String
  apiKey String !!private
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(2);

      const base = ast.models[0]!;
      expect(base.abstract).toBe(true);
      expect(base.fields[1]!.name).toBe('internalCode');
      expect(base.fields[1]!.isPrivate).toBe(true);

      const user = ast.models[1]!;
      expect(user.extends).toBe('Base');
      expect(user.fields[1]!.name).toBe('apiKey');
      expect(user.fields[1]!.isPrivate).toBe(true);
    });

    test('should handle model with all private fields', () => {
      const schema = `
model Secret {
  id Record @id !!private
  data String !!private
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const model = ast.models[0]!;
      expect(model.fields[0]!.isPrivate).toBe(true);
      expect(model.fields[1]!.isPrivate).toBe(true);
    });

    test('should handle mixed extends and !!private', () => {
      const schema = `
object BaseAddr {
  street String
  city String
}

object SecretAddr extends BaseAddr {
  secretCode String !!private
  zip String
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);

      const sa = ast.objects[1]!;
      expect(sa.extends).toBe('BaseAddr');
      expect(sa.fields[0]!.name).toBe('secretCode');
      expect(sa.fields[0]!.isPrivate).toBe(true);
      expect(sa.fields[1]!.name).toBe('zip');
      expect(sa.fields[1]!.isPrivate).toBeUndefined();
    });
  });
});
