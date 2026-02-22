import { describe, expect, it } from 'bun:test';
import { convertField } from '../../../src/generators/metadata/field-converter';
import { generateRegistryCode } from '../../../src/generators/metadata/registry-generator';
import type { ASTField, ModelMetadata } from '../../../src/types';

describe('Metadata recordIdTypes', () => {
  describe('convertField', () => {
    it('should pass through recordIdTypes from ASTField to FieldMetadata', () => {
      const astField: ASTField = {
        name: 'userId',
        type: 'record',
        isOptional: false,
        decorators: [],
        range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        recordIdTypes: ['int'],
      };

      const metadata = convertField(astField);

      expect(metadata.recordIdTypes).toEqual(['int']);
    });

    it('should pass through multiple recordIdTypes', () => {
      const astField: ASTField = {
        name: 'entityId',
        type: 'record',
        isOptional: false,
        decorators: [],
        range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        recordIdTypes: ['string', 'int'],
      };

      const metadata = convertField(astField);

      expect(metadata.recordIdTypes).toEqual(['string', 'int']);
    });

    it('should not set recordIdTypes when absent on ASTField', () => {
      const astField: ASTField = {
        name: 'id',
        type: 'record',
        isOptional: false,
        decorators: [],
        range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
      };

      const metadata = convertField(astField);

      expect(metadata.recordIdTypes).toBeUndefined();
    });

    it('should not set recordIdTypes when empty array on ASTField', () => {
      const astField: ASTField = {
        name: 'id',
        type: 'record',
        isOptional: false,
        decorators: [],
        range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        recordIdTypes: [],
      };

      const metadata = convertField(astField);

      expect(metadata.recordIdTypes).toBeUndefined();
    });
  });

  describe('generateRegistryCode', () => {
    it('should include recordIdTypes in generated code when present', () => {
      const model: ModelMetadata = {
        name: 'User',
        tableName: 'user',
        fields: [
          {
            name: 'id',
            type: 'record',
            isId: true,
            isUnique: true,
            isRequired: true,
          },
          {
            name: 'userId',
            type: 'record',
            isId: false,
            isUnique: false,
            isRequired: true,
            recordIdTypes: ['int'],
          },
        ],
      };

      const code = generateRegistryCode([model]);

      expect(code).toContain("recordIdTypes: ['int']");
    });

    it('should include multiple recordIdTypes in generated code', () => {
      const model: ModelMetadata = {
        name: 'Entity',
        tableName: 'entity',
        fields: [
          {
            name: 'id',
            type: 'record',
            isId: true,
            isUnique: true,
            isRequired: true,
          },
          {
            name: 'entityId',
            type: 'record',
            isId: false,
            isUnique: false,
            isRequired: true,
            recordIdTypes: ['string', 'int'],
          },
        ],
      };

      const code = generateRegistryCode([model]);

      expect(code).toContain("recordIdTypes: ['string', 'int']");
    });

    it('should not include recordIdTypes in generated code when absent', () => {
      const model: ModelMetadata = {
        name: 'Post',
        tableName: 'post',
        fields: [
          {
            name: 'id',
            type: 'record',
            isId: true,
            isUnique: true,
            isRequired: true,
          },
          {
            name: 'authorId',
            type: 'record',
            isId: false,
            isUnique: false,
            isRequired: true,
          },
        ],
      };

      const code = generateRegistryCode([model]);

      expect(code).not.toContain('recordIdTypes');
    });
  });
});
