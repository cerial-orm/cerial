/**
 * Unit Tests: Model Metadata
 *
 * Tests conversion from AST to runtime metadata.
 */

import { describe, expect, test } from 'bun:test';
import {
  fieldToMetadata,
  modelToMetadata,
  astToRegistry,
  getModelMetadata,
  getFieldMetadata,
  hasField,
  getUniqueFields,
  getRequiredFields,
  getOptionalFields,
  getNowFields,
  getFieldsWithDefaults,
} from '../../../src/parser/model-metadata';
import type { ASTField, ASTModel, SchemaAST } from '../../../src/types';

// Helper to create a minimal ASTField
function createASTField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    ...overrides,
  };
}

// Helper to create a minimal ASTModel
function createASTModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    ...overrides,
  };
}

describe('fieldToMetadata', () => {
  test('should convert basic field', () => {
    const field = createASTField({ name: 'email', type: 'string' });
    const metadata = fieldToMetadata(field);

    expect(metadata.name).toBe('email');
    expect(metadata.type).toBe('string');
    expect(metadata.isRequired).toBe(true);
  });

  test('should handle optional field', () => {
    const field = createASTField({ isOptional: true });
    const metadata = fieldToMetadata(field);

    expect(metadata.isRequired).toBe(false);
  });

  test('should handle array field', () => {
    const field = createASTField({ isArray: true });
    const metadata = fieldToMetadata(field);

    expect(metadata.isArray).toBe(true);
  });

  test('should handle @id decorator', () => {
    const field = createASTField({
      decorators: [
        {
          type: 'id',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.isId).toBe(true);
  });

  test('should handle @unique decorator', () => {
    const field = createASTField({
      decorators: [
        {
          type: 'unique',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.isUnique).toBe(true);
  });

  test('should handle @now decorator', () => {
    const field = createASTField({
      decorators: [
        {
          type: 'now',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.hasNowDefault).toBe(true);
  });

  test('should handle @default decorator', () => {
    const field = createASTField({
      decorators: [
        {
          type: 'default',
          value: 'testValue',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.defaultValue).toBe('testValue');
  });

  test('should handle relation field with @model', () => {
    const field = createASTField({
      name: 'user',
      type: 'relation',
      decorators: [
        {
          type: 'model',
          value: 'User',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.relationInfo).toBeDefined();
    expect(metadata.relationInfo?.targetModel).toBe('User');
    expect(metadata.relationInfo?.targetTable).toBe('user');
    expect(metadata.relationInfo?.isReverse).toBe(true);
  });

  test('should handle forward relation with @field', () => {
    const field = createASTField({
      name: 'user',
      type: 'relation',
      decorators: [
        {
          type: 'model',
          value: 'User',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
        {
          type: 'field',
          value: 'userId',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.relationInfo?.isReverse).toBe(false);
    expect(metadata.relationInfo?.fieldRef).toBe('userId');
  });

  test('should handle @onDelete decorator', () => {
    const field = createASTField({
      name: 'user',
      type: 'relation',
      decorators: [
        {
          type: 'model',
          value: 'User',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
        {
          type: 'onDelete',
          value: 'Cascade',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.relationInfo?.onDelete).toBe('Cascade');
  });

  test('should handle @key decorator', () => {
    const field = createASTField({
      name: 'author',
      type: 'relation',
      decorators: [
        {
          type: 'model',
          value: 'User',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
        {
          type: 'key',
          value: 'author',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
        },
      ],
    });
    const metadata = fieldToMetadata(field);

    expect(metadata.relationInfo?.key).toBe('author');
  });
});

describe('modelToMetadata', () => {
  test('should convert model with no fields', () => {
    const model = createASTModel({ name: 'User' });
    const metadata = modelToMetadata(model);

    expect(metadata.name).toBe('User');
    expect(metadata.tableName).toBe('user');
    expect(metadata.fields).toEqual([]);
  });

  test('should convert model name to snake_case table name', () => {
    const model = createASTModel({ name: 'UserProfile' });
    const metadata = modelToMetadata(model);

    expect(metadata.tableName).toBe('user_profile');
  });

  test('should convert model fields', () => {
    const model = createASTModel({
      name: 'User',
      fields: [createASTField({ name: 'id', type: 'string' }), createASTField({ name: 'email', type: 'string' })],
    });
    const metadata = modelToMetadata(model);

    expect(metadata.fields).toHaveLength(2);
    expect(metadata.fields[0]?.name).toBe('id');
    expect(metadata.fields[1]?.name).toBe('email');
  });
});

describe('astToRegistry', () => {
  test('should create empty registry from empty AST', () => {
    const ast: SchemaAST = { models: [], source: '' };
    const registry = astToRegistry(ast);

    expect(Object.keys(registry)).toHaveLength(0);
  });

  test('should create registry with multiple models', () => {
    const ast: SchemaAST = {
      models: [createASTModel({ name: 'User' }), createASTModel({ name: 'Post' })],
      source: '',
    };
    const registry = astToRegistry(ast);

    expect(Object.keys(registry)).toHaveLength(2);
    expect(registry['User']).toBeDefined();
    expect(registry['Post']).toBeDefined();
  });
});

describe('getModelMetadata', () => {
  test('should return model by name', () => {
    const ast: SchemaAST = {
      models: [createASTModel({ name: 'User' })],
      source: '',
    };
    const registry = astToRegistry(ast);

    const metadata = getModelMetadata(registry, 'User');
    expect(metadata?.name).toBe('User');
  });

  test('should return undefined for non-existent model', () => {
    const registry = astToRegistry({ models: [], source: '' });

    const metadata = getModelMetadata(registry, 'User');
    expect(metadata).toBeUndefined();
  });
});

describe('getFieldMetadata', () => {
  test('should return field by name', () => {
    const model = createASTModel({
      name: 'User',
      fields: [createASTField({ name: 'email' })],
    });
    const metadata = modelToMetadata(model);

    const field = getFieldMetadata(metadata, 'email');
    expect(field?.name).toBe('email');
  });

  test('should return undefined for non-existent field', () => {
    const model = createASTModel({ name: 'User' });
    const metadata = modelToMetadata(model);

    const field = getFieldMetadata(metadata, 'email');
    expect(field).toBeUndefined();
  });
});

describe('hasField', () => {
  test('should return true for existing field', () => {
    const model = createASTModel({
      fields: [createASTField({ name: 'email' })],
    });
    const metadata = modelToMetadata(model);

    expect(hasField(metadata, 'email')).toBe(true);
  });

  test('should return false for non-existent field', () => {
    const model = createASTModel();
    const metadata = modelToMetadata(model);

    expect(hasField(metadata, 'email')).toBe(false);
  });
});

describe('field filters', () => {
  const model = createASTModel({
    fields: [
      createASTField({
        name: 'id',
        decorators: [
          {
            type: 'unique',
            range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
          },
        ],
      }),
      createASTField({ name: 'name', isOptional: false }),
      createASTField({ name: 'bio', isOptional: true }),
      createASTField({
        name: 'createdAt',
        decorators: [
          { type: 'now', range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } } },
        ],
      }),
      createASTField({
        name: 'active',
        decorators: [
          {
            type: 'default',
            value: true,
            range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
          },
        ],
      }),
    ],
  });
  const metadata = modelToMetadata(model);

  describe('getUniqueFields', () => {
    test('should return unique fields', () => {
      const uniqueFields = getUniqueFields(metadata);
      expect(uniqueFields).toHaveLength(1);
      expect(uniqueFields[0]?.name).toBe('id');
    });
  });

  describe('getRequiredFields', () => {
    test('should return required fields', () => {
      const requiredFields = getRequiredFields(metadata);
      expect(requiredFields.map((f) => f.name)).not.toContain('bio');
    });
  });

  describe('getOptionalFields', () => {
    test('should return optional fields', () => {
      const optionalFields = getOptionalFields(metadata);
      expect(optionalFields.map((f) => f.name)).toContain('bio');
    });
  });

  describe('getNowFields', () => {
    test('should return fields with @now', () => {
      const nowFields = getNowFields(metadata);
      expect(nowFields).toHaveLength(1);
      expect(nowFields[0]?.name).toBe('createdAt');
    });
  });

  describe('getFieldsWithDefaults', () => {
    test('should return fields with defaults', () => {
      const defaultFields = getFieldsWithDefaults(metadata);
      expect(defaultFields.map((f) => f.name)).toContain('active');
      expect(defaultFields.map((f) => f.name)).toContain('createdAt');
    });
  });
});
