/**
 * Unit Tests: Object Name Validator
 *
 * Tests validation of object names (PascalCase, duplicates, collisions)
 * and object references (field type resolution).
 */

import { describe, expect, test } from 'bun:test';
import { validateObjectNames, validateObjectReferences } from '../../../src/cli/validators/schema-validator';
import type { ASTField, ASTModel, ASTObject, SchemaAST } from '../../../src/types';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function createField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range,
    ...overrides,
  };
}

function createModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range,
    ...overrides,
  };
}

function createObject(overrides: Partial<ASTObject> = {}): ASTObject {
  return {
    name: 'TestObject',
    fields: [],
    range,
    ...overrides,
  };
}

function createAST(models: ASTModel[] = [], objects: ASTObject[] = []): SchemaAST {
  return { source: '', models, objects, tuples: [], literals: [], enums: [] };
}

describe('Object Name Validator', () => {
  describe('validateObjectNames', () => {
    describe('negative tests - invalid PascalCase', () => {
      test('should fail for lowercase object name', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'address',
              range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Invalid object name: address');
        expect(errors[0]!.message).toContain('Must be PascalCase');
        expect(errors[0]!.line).toBe(5);
      });

      test('should fail for snake_case object name', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'user_profile',
              range: { start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Invalid object name: user_profile');
        expect(errors[0]!.message).toContain('Must be PascalCase');
        expect(errors[0]!.line).toBe(10);
      });

      test('should fail for kebab-case object name', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'user-profile',
              range: { start: { line: 15, column: 1, offset: 0 }, end: { line: 15, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Invalid object name: user-profile');
        expect(errors[0]!.message).toContain('Must be PascalCase');
      });

      test('should fail for object name starting with lowercase', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'addressInfo',
              range: { start: { line: 20, column: 1, offset: 0 }, end: { line: 20, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Invalid object name: addressInfo');
      });
    });

    describe('negative tests - duplicate object names', () => {
      test('should fail for duplicate object names', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'Address',
              range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
            }),
            createObject({
              name: 'Address',
              range: { start: { line: 15, column: 1, offset: 0 }, end: { line: 15, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Duplicate object name: Address');
        expect(errors[0]!.line).toBe(15);
      });

      test('should fail for three duplicate object names', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'Profile',
              range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
            }),
            createObject({
              name: 'Profile',
              range: { start: { line: 15, column: 1, offset: 0 }, end: { line: 15, column: 1, offset: 0 } },
            }),
            createObject({
              name: 'Profile',
              range: { start: { line: 25, column: 1, offset: 0 }, end: { line: 25, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(2);
        expect(errors[0]!.message).toContain('Duplicate object name: Profile');
        expect(errors[1]!.message).toContain('Duplicate object name: Profile');
      });
    });

    describe('negative tests - collision with model names', () => {
      test('should fail when object name collides with model name', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
            }),
          ],
          [
            createObject({
              name: 'User',
              range: { start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain("Object name 'User' conflicts with model name");
        expect(errors[0]!.line).toBe(10);
      });

      test('should fail when multiple objects collide with model names', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
            }),
            createModel({
              name: 'Post',
              range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
            }),
          ],
          [
            createObject({
              name: 'User',
              range: { start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 0 } },
            }),
            createObject({
              name: 'Post',
              range: { start: { line: 20, column: 1, offset: 0 }, end: { line: 20, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(2);
        expect(errors[0]!.message).toContain("Object name 'User' conflicts with model name");
        expect(errors[1]!.message).toContain("Object name 'Post' conflicts with model name");
      });
    });

    describe('positive tests - valid object names', () => {
      test('should pass for valid PascalCase object name', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for multiple valid PascalCase object names', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'Address',
            }),
            createObject({
              name: 'Profile',
            }),
            createObject({
              name: 'ContactInfo',
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for single letter PascalCase object name', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'A',
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for object name with numbers', () => {
        const ast = createAST(
          [],
          [
            createObject({
              name: 'Address2',
            }),
            createObject({
              name: 'Profile3D',
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for empty AST', () => {
        const ast = createAST([], []);

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass when object names do not collide with model names', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
            }),
            createModel({
              name: 'Post',
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
            createObject({
              name: 'Profile',
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors).toHaveLength(0);
      });
    });

    describe('edge cases', () => {
      test('should report multiple errors for single object (invalid name + collision)', () => {
        const ast = createAST(
          [
            createModel({
              name: 'user',
            }),
          ],
          [
            createObject({
              name: 'user',
              range: { start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 0 } },
            }),
          ],
        );

        const errors = validateObjectNames(ast);
        expect(errors.length).toBeGreaterThanOrEqual(1);
        expect(errors.some((e) => e.message.includes('Invalid object name'))).toBe(true);
        expect(errors.some((e) => e.message.includes('conflicts with model name'))).toBe(true);
      });
    });
  });

  describe('validateObjectReferences', () => {
    describe('negative tests - unknown object type references', () => {
      test('should fail when field references nonexistent object type', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'address',
                type: 'object',
                objectName: 'Address',
                range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
              }),
            ],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toContain('Field "address" in model "User"');
        expect(errors[0]!.message).toContain('references unknown object type "Address"');
        expect(errors[0]!.model).toBe('User');
        expect(errors[0]!.field).toBe('address');
        expect(errors[0]!.line).toBe(5);
      });

      test('should fail for multiple fields referencing nonexistent objects', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'address',
                type: 'object',
                objectName: 'Address',
                range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
              }),
              createField({
                name: 'profile',
                type: 'object',
                objectName: 'Profile',
                range: { start: { line: 10, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 0 } },
              }),
            ],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(2);
        expect(errors[0]!.message).toContain('references unknown object type "Address"');
        expect(errors[1]!.message).toContain('references unknown object type "Profile"');
      });

      test('should fail when multiple models have fields referencing nonexistent objects', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'address',
                type: 'object',
                objectName: 'Address',
                range: { start: { line: 5, column: 1, offset: 0 }, end: { line: 5, column: 1, offset: 0 } },
              }),
            ],
          }),
          createModel({
            name: 'Post',
            fields: [
              createField({
                name: 'metadata',
                type: 'object',
                objectName: 'Metadata',
                range: { start: { line: 15, column: 1, offset: 0 }, end: { line: 15, column: 1, offset: 0 } },
              }),
            ],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(2);
        expect(errors[0]!.model).toBe('User');
        expect(errors[1]!.model).toBe('Post');
      });

      test('should pass when object field references existing object in nested context', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'profile',
                  type: 'object',
                  objectName: 'Profile',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Profile',
              fields: [
                createField({
                  name: 'settings',
                  type: 'object',
                  objectName: 'Settings',
                }),
              ],
            }),
            createObject({
              name: 'Settings',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });
    });

    describe('positive tests - valid object references', () => {
      test('should pass when field references existing object type', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for multiple fields referencing existing objects', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                }),
                createField({
                  name: 'profile',
                  type: 'object',
                  objectName: 'Profile',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
            createObject({
              name: 'Profile',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for non-object fields (skipped)', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'name',
                type: 'string',
              }),
              createField({
                name: 'age',
                type: 'int',
              }),
              createField({
                name: 'email',
                type: 'email',
              }),
            ],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for mixed field types with valid object references', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'id',
                  type: 'record',
                }),
                createField({
                  name: 'name',
                  type: 'string',
                }),
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                }),
                createField({
                  name: 'age',
                  type: 'int',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for empty AST', () => {
        const ast = createAST([], []);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for model with no fields', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for object field in array form', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'addresses',
                  type: 'object',
                  objectName: 'Address',
                  isArray: true,
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for object field in optional form', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                  isOptional: true,
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass for nested object references', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'profile',
                  type: 'object',
                  objectName: 'Profile',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Profile',
              fields: [
                createField({
                  name: 'settings',
                  type: 'object',
                  objectName: 'Settings',
                }),
              ],
            }),
            createObject({
              name: 'Settings',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });
    });

    describe('edge cases', () => {
      test('should handle object field without objectName property gracefully', () => {
        const ast = createAST([
          createModel({
            name: 'User',
            fields: [
              createField({
                name: 'data',
                type: 'object',
                // objectName is undefined
              }),
            ],
          }),
        ]);

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass when same object is referenced by multiple fields', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'homeAddress',
                  type: 'object',
                  objectName: 'Address',
                }),
                createField({
                  name: 'workAddress',
                  type: 'object',
                  objectName: 'Address',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });

      test('should pass when same object is referenced by multiple models', () => {
        const ast = createAST(
          [
            createModel({
              name: 'User',
              fields: [
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                }),
              ],
            }),
            createModel({
              name: 'Company',
              fields: [
                createField({
                  name: 'address',
                  type: 'object',
                  objectName: 'Address',
                }),
              ],
            }),
          ],
          [
            createObject({
              name: 'Address',
            }),
          ],
        );

        const errors = validateObjectReferences(ast);
        expect(errors).toHaveLength(0);
      });
    });
  });
});
