import { describe, expect, test } from 'bun:test';
import { DECORATOR_DOCS, FIELD_TYPE_DOCS } from '../../server/src/data/hover-docs';
import { findNodeAtPosition, getWordRangeAtPosition } from '../../server/src/utils/ast-location';
import { loadFixture, parseFixture } from './helpers';

describe('Hover Logic', () => {
  describe('FIELD_TYPE_DOCS completeness', () => {
    const expectedTypes = [
      'String',
      'Int',
      'Float',
      'Bool',
      'Date',
      'Email',
      'Record',
      'Relation',
      'Uuid',
      'Duration',
      'Decimal',
      'Bytes',
      'Geometry',
      'Any',
      'Number',
    ];

    for (const typeName of expectedTypes) {
      test(`has documentation for ${typeName}`, () => {
        const doc = FIELD_TYPE_DOCS[typeName];

        expect(doc).toBeDefined();
        expect(doc!.tsType).toBeTruthy();
        expect(doc!.surrealType).toBeTruthy();
        expect(doc!.description).toBeTruthy();
      });
    }

    test('does not have extra undocumented types', () => {
      const docKeys = Object.keys(FIELD_TYPE_DOCS);

      for (const key of docKeys) {
        expect(expectedTypes).toContain(key);
      }
    });
  });

  describe('DECORATOR_DOCS completeness', () => {
    const expectedDecorators = [
      'id',
      'unique',
      'default',
      'defaultAlways',
      'nullable',
      'readonly',
      'flexible',
      'set',
      'distinct',
      'sort',
      'createdAt',
      'updatedAt',
      'now',
      'field',
      'model',
      'onDelete',
      'key',
      'index',
      'uuid',
      'uuid4',
      'uuid7',
      'point',
      'line',
      'polygon',
      'multipoint',
      'multiline',
      'multipolygon',
      'geoCollection',
    ];

    for (const dec of expectedDecorators) {
      test(`has documentation for @${dec}`, () => {
        const doc = DECORATOR_DOCS[dec];

        expect(doc).toBeDefined();
        expect(doc!.signature).toBeTruthy();
        expect(doc!.description).toBeTruthy();
      });
    }
  });

  describe('hover context via AST', () => {
    test('field type word resolves to FIELD_TYPE_DOCS entry', () => {
      // When hovering over "String" in a field declaration
      const doc = FIELD_TYPE_DOCS.String;

      expect(doc).toBeDefined();
      expect(doc!.tsType).toBe('string');
      expect(doc!.surrealType).toBe('string');
    });

    test('decorator word resolves to DECORATOR_DOCS entry', () => {
      // Strip @ prefix as the provider does
      const key = '@unique'.startsWith('@') ? '@unique'.slice(1) : '@unique';
      const doc = DECORATOR_DOCS[key];

      expect(doc).toBeDefined();
      expect(doc!.signature).toBe('@unique');
    });

    test('node info for field provides type data', () => {
      const ast = parseFixture('simple-model.cerial');
      // "  email Email @unique" on line 5
      const node = findNodeAtPosition(ast, { line: 5, column: 2, offset: 0 });

      expect(node).not.toBeNull();
      expect(node!.kind).toBe('field');
      expect(node!.name).toBe('email');
    });

    test('node info for decorator provides decorator name', () => {
      const ast = parseFixture('simple-model.cerial');
      // @unique on line 5
      const node = findNodeAtPosition(ast, { line: 5, column: 16, offset: 0 });

      expect(node).not.toBeNull();
      expect(node!.kind).toBe('decorator');
      expect(node!.name).toBe('unique');
    });

    test('word extraction from source for hover', () => {
      const source = loadFixture('simple-model.cerial');
      const lines = source.split('\n');
      // Line 3 (0-indexed: 2) = "model User {"
      const lineText = lines[2]!;
      // Find "User" in the line
      const userIdx = lineText.indexOf('User');
      const offset = source.indexOf(lineText) + userIdx;
      const result = getWordRangeAtPosition(source, offset);

      expect(result).not.toBeNull();
      expect(result!.word).toBe('User');
    });
  });

  describe('whitespace hover returns null', () => {
    test('getWordRangeAtPosition on space returns null', () => {
      const source = 'model User {';
      // Space between 'model' and 'User'
      const result = getWordRangeAtPosition(source, 5);

      expect(result).toBeNull();
    });

    test('getWordRangeAtPosition on empty line returns null', () => {
      const source = 'model User {\n\n  id Record @id\n}';
      // The empty line (offset would be after first \n)
      const emptyLineOffset = source.indexOf('\n\n') + 1;
      const result = getWordRangeAtPosition(source, emptyLineOffset);

      expect(result).toBeNull();
    });
  });

  describe('decorator doc fields', () => {
    test('decorator docs with examples have non-empty example', () => {
      for (const [key, doc] of Object.entries(DECORATOR_DOCS)) {
        if (doc.example) {
          expect(doc.example.length).toBeGreaterThan(0);
        }
      }
    });

    test('decorator docs with constraints have non-empty constraints', () => {
      for (const [key, doc] of Object.entries(DECORATOR_DOCS)) {
        if (doc.constraints) {
          expect(doc.constraints.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
