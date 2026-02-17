import { describe, expect, test } from 'bun:test';
import { generateFieldWhereType, generateWhereInterface } from '../../../src/generators/types/where-generator';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'record',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

describe('Where Generator - Typed Record IDs', () => {
  describe('generateFieldWhereType - single Record', () => {
    test('plain Record (no recordIdTypes) uses RecordIdInput', () => {
      const result = generateFieldWhereType(field({ type: 'record', isRequired: true }));

      expect(result).toContain('RecordIdInput |');
      expect(result).not.toContain('RecordIdInput<');
    });

    test('Record with recordIdTypes: ["int"] uses RecordIdInput<number>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['int'] }));

      expect(result).toContain('RecordIdInput<number>');
      expect(result).not.toMatch(/[^<]RecordIdInput[^<]/);
    });

    test('Record with recordIdTypes: ["string", "int"] uses RecordIdInput<string | number>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['string', 'int'] }));

      expect(result).toContain('RecordIdInput<string | number>');
    });

    test('Record with recordIdTypes: ["uuid"] uses RecordIdInput<string>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['uuid'] }));

      expect(result).toContain('RecordIdInput<string>');
    });

    test('Record with recordIdTypes: ["float"] uses RecordIdInput<number>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['float'] }));

      expect(result).toContain('RecordIdInput<number>');
    });

    test('Record with recordIdTypes: ["number"] uses RecordIdInput<number>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['number'] }));

      expect(result).toContain('RecordIdInput<number>');
    });

    test('Record with recordIdTypes: ["int", "float"] deduplicates to RecordIdInput<number>', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['int', 'float'] }));

      expect(result).toContain('RecordIdInput<number>');
      // Should NOT be RecordIdInput<number | number>
      expect(result).not.toContain('number | number');
    });

    test('typed RecordIdInput appears in eq/neq operators', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['int'] }));

      expect(result).toContain('eq?: RecordIdInput<number>');
      expect(result).toContain('neq?: RecordIdInput<number>');
    });

    test('typed RecordIdInput appears in in/notIn operators', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['int'] }));

      expect(result).toContain('in?: RecordIdInput<number>[]');
      expect(result).toContain('notIn?: RecordIdInput<number>[]');
    });

    test('typed RecordIdInput appears in string operators (contains/startsWith/endsWith still string)', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: ['int'] }));

      // String ops remain string-based (record IDs are stringified for these)
      expect(result).toContain('contains?: string');
      expect(result).toContain('startsWith?: string');
      expect(result).toContain('endsWith?: string');
    });
  });

  describe('generateFieldWhereType - @id Record with typed IDs', () => {
    test('@id field with recordIdTypes: ["int"] uses typed input', () => {
      const result = generateFieldWhereType(
        field({ type: 'record', isId: true, isRequired: true, recordIdTypes: ['int'] }),
      );

      expect(result).toContain('RecordIdInput<number>');
      // @id fields should not have isNull/isNone/not
      expect(result).not.toContain('isNull');
      expect(result).not.toContain('isNone');
      expect(result).not.toContain('not?');
    });

    test('@id field without recordIdTypes uses plain RecordIdInput', () => {
      const result = generateFieldWhereType(field({ type: 'record', isId: true, isRequired: true }));

      expect(result).toContain('RecordIdInput |');
      expect(result).not.toContain('RecordIdInput<');
    });
  });

  describe('generateFieldWhereType - optional/nullable Record with typed IDs', () => {
    test('optional Record with typed IDs includes not/isNone', () => {
      const result = generateFieldWhereType(field({ type: 'record', isRequired: false, recordIdTypes: ['string'] }));

      expect(result).toContain('RecordIdInput<string>');
      expect(result).toContain('not?');
      expect(result).toContain('isNone');
    });

    test('nullable Record with typed IDs includes null prefix and isNull', () => {
      const result = generateFieldWhereType(
        field({ type: 'record', isRequired: true, isNullable: true, recordIdTypes: ['int'] }),
      );

      expect(result).toContain('null | RecordIdInput<number>');
      expect(result).toContain('isNull');
    });
  });

  describe('generateFieldWhereType - array Record with typed IDs', () => {
    test('Record[] with recordIdTypes: ["int"] uses typed input in array ops', () => {
      const result = generateFieldWhereType(field({ type: 'record', isArray: true, recordIdTypes: ['int'] }));

      expect(result).toContain('RecordIdInput<number>[]');
      expect(result).toContain('has?: RecordIdInput<number>');
      expect(result).toContain('hasAll?: RecordIdInput<number>[]');
      expect(result).toContain('hasAny?: RecordIdInput<number>[]');
      expect(result).toContain('isEmpty?: boolean');
    });

    test('Record[] without recordIdTypes uses plain RecordIdInput', () => {
      const result = generateFieldWhereType(field({ type: 'record', isArray: true }));

      expect(result).toContain('RecordIdInput[]');
      expect(result).toContain('has?: RecordIdInput');
      expect(result).not.toContain('RecordIdInput<');
    });

    test('Record[] with recordIdTypes: ["string", "int"] uses union typed input', () => {
      const result = generateFieldWhereType(field({ type: 'record', isArray: true, recordIdTypes: ['string', 'int'] }));

      expect(result).toContain('RecordIdInput<string | number>[]');
      expect(result).toContain('has?: RecordIdInput<string | number>');
    });
  });

  describe('generateWhereInterface - model with typed @id', () => {
    test('model with typed @id Record generates correct where interface', () => {
      const m = model('Post', 'post', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true, recordIdTypes: ['int'] }),
        field({ name: 'title', type: 'string', isRequired: true }),
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('export interface PostWhere');
      expect(result).toContain('id?: RecordIdInput<number>');
      expect(result).toContain('title?:');
      expect(result).toContain('AND?: PostWhere[]');
      expect(result).toContain('OR?: PostWhere[]');
      expect(result).toContain('NOT?: PostWhere');
    });

    test('model with plain @id Record generates unparameterized RecordIdInput', () => {
      const m = model('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'name', type: 'string', isRequired: true }),
      ]);

      const result = generateWhereInterface(m);

      expect(result).toContain('id?: RecordIdInput |');
      expect(result).not.toContain('RecordIdInput<');
    });

    test('model with typed FK Record field generates correct where type', () => {
      const m = model('Comment', 'comment', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'authorId', type: 'record', isRequired: true, recordIdTypes: ['string'] }),
      ]);

      const result = generateWhereInterface(m);

      // id should be plain
      expect(result).toMatch(/id\?: RecordIdInput \|/);
      // authorId should be typed
      expect(result).toContain('authorId?: RecordIdInput<string>');
    });
  });

  describe('generateFieldWhereType - empty recordIdTypes', () => {
    test('empty recordIdTypes array falls back to plain RecordIdInput', () => {
      const result = generateFieldWhereType(field({ type: 'record', recordIdTypes: [] }));

      expect(result).toContain('RecordIdInput |');
      expect(result).not.toContain('RecordIdInput<');
    });
  });
});
