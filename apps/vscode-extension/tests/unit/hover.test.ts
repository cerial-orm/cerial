import { describe, expect, test } from 'bun:test';
import { DECORATOR_DETAIL, DECORATOR_DOCS, FIELD_TYPE_DETAIL, FIELD_TYPE_DOCS } from '../../server/src/data/hover-docs';
import { DECORATOR_REGISTRY, type DecoratorName, FIELD_TYPE_REGISTRY } from '../../../orm/src/parser/registry';
import { findNodeAtPosition, getWordRangeAtPosition } from '../../server/src/utils/ast-location';
import { loadFixture, parseFixture } from './helpers';

describe('Hover Logic', () => {
  describe('FIELD_TYPE_DOCS completeness', () => {
    const registryTypes = [...FIELD_TYPE_REGISTRY.keys()];

    for (const typeName of registryTypes) {
      test(`resolves ${typeName} from the registry`, () => {
        const doc = FIELD_TYPE_DOCS[typeName];

        expect(doc).toBeDefined();
        expect(doc!.tsType).toBeTruthy();
        expect(doc!.surrealType).toBeTruthy();
        expect(doc!.description).toBe(FIELD_TYPE_REGISTRY.get(typeName)!.description);
      });
    }

    test('documents exactly the registry field types', () => {
      expect(Object.keys(FIELD_TYPE_DOCS).sort()).toEqual([...registryTypes].sort());
    });

    test('every FIELD_TYPE_DETAIL key is a registry field type', () => {
      for (const key of Object.keys(FIELD_TYPE_DETAIL)) expect(FIELD_TYPE_REGISTRY.has(key)).toBe(true);
    });
  });

  describe('DECORATOR_DOCS completeness', () => {
    for (const [name, entry] of DECORATOR_REGISTRY) {
      test(`resolves ${name} from the registry`, () => {
        const doc = DECORATOR_DOCS[name.slice(1)];

        expect(doc).toBeDefined();
        expect(doc!.signature.startsWith(name)).toBe(true);
        expect(doc!.description).toBe(entry.description);
      });
    }

    test('documents exactly the registry decorators', () => {
      const keys = [...DECORATOR_REGISTRY.keys()].map((name) => name.slice(1));

      expect(Object.keys(DECORATOR_DOCS).sort()).toEqual(keys.sort());
    });

    test('every DECORATOR_DETAIL key is a registry decorator', () => {
      for (const key of Object.keys(DECORATOR_DETAIL)) expect(DECORATOR_REGISTRY.has(key as DecoratorName)).toBe(true);
    });

    test('the geometry collection decorator is @geoCollection, not @collection', () => {
      expect(DECORATOR_REGISTRY.has('@geoCollection')).toBe(true);
      expect(DECORATOR_REGISTRY.has('@collection' as DecoratorName)).toBe(false);
    });
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
      for (const doc of Object.values(DECORATOR_DOCS)) {
        if (doc.example) {
          expect(doc.example.length).toBeGreaterThan(0);
        }
      }
    });

    test('decorator docs with constraints have non-empty constraints', () => {
      for (const doc of Object.values(DECORATOR_DOCS)) {
        if (doc.constraints) {
          expect(doc.constraints.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
