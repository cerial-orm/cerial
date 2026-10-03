/**
 * Unit Tests: Composite Directive Parsing and Validation
 *
 * Tests parsing of @@index and @@unique model-level directives,
 * including field resolution, validation, and error handling.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';

/** Helper: parse a schema and return the first model */
function parseModel(source: string) {
  const result = parse(source);

  return { model: result.ast.models[0], errors: result.errors, ast: result.ast };
}

describe('Composite Directive Parsing', () => {
  describe('@@index parsing', () => {
    test('should parse @@index with two fields', () => {
      const { model, errors } = parseModel(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@index(nameIdx, [firstName, lastName])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model?.directives).toHaveLength(1);
      expect(model!.directives![0]!.kind).toBe('index');
      expect(model!.directives![0]!.name).toBe('nameIdx');
      expect(model!.directives![0]!.fields).toEqual(['firstName', 'lastName']);
    });

    test('should parse @@index with three fields', () => {
      const { model, errors } = parseModel(`
        model User {
          id Record @id
          firstName String
          lastName String
          age Int
          @@index(fullIdx, [firstName, lastName, age])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model?.directives).toHaveLength(1);
      expect(model!.directives![0]!.fields).toEqual(['firstName', 'lastName', 'age']);
    });
  });

  describe('@@unique parsing', () => {
    test('should parse @@unique with two fields', () => {
      const { model, errors } = parseModel(`
        model User {
          id Record @id
          email Email
          username String
          @@unique(emailUsername, [email, username])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model?.directives).toHaveLength(1);
      expect(model!.directives![0]!.kind).toBe('unique');
      expect(model!.directives![0]!.name).toBe('emailUsername');
      expect(model!.directives![0]!.fields).toEqual(['email', 'username']);
    });
  });

  describe('dot-notation fields', () => {
    test('should parse @@unique with dot-notation object subfields', () => {
      const { model, errors } = parseModel(`
        object Address {
          city String
          zip String
        }

        model Store {
          id Record @id
          address Address
          @@unique(cityZip, [address.city, address.zip])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model?.directives).toHaveLength(1);
      expect(model!.directives![0]!.fields).toEqual(['address.city', 'address.zip']);
    });

    test('should parse @@index with mixed dot-notation and primitive fields', () => {
      const { model, errors } = parseModel(`
        object Address {
          city String
        }

        model Store {
          id Record @id
          name String
          address Address
          @@index(storeLocator, [address.city, name])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model!.directives![0]!.fields).toEqual(['address.city', 'name']);
    });
  });

  describe('multiple directives', () => {
    test('should parse multiple directives on one model', () => {
      const { model, errors } = parseModel(`
        model User {
          id Record @id
          firstName String
          lastName String
          email Email
          @@index(nameIdx, [firstName, lastName])
          @@unique(nameEmail, [firstName, email])
        }
      `);

      expect(errors).toHaveLength(0);
      expect(model?.directives).toHaveLength(2);
      expect(model!.directives![0]!.kind).toBe('index');
      expect(model!.directives![0]!.name).toBe('nameIdx');
      expect(model!.directives![1]!.kind).toBe('unique');
      expect(model!.directives![1]!.name).toBe('nameEmail');
    });
  });
});
