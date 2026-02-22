import { describe, expect, test } from 'bun:test';
import { findNodeAtPosition, findTypeDefinition, getWordRangeAtPosition } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, loadFixture, parseFixture } from './helpers';

describe('Definition Logic', () => {
  describe('findTypeDefinition within single file', () => {
    test('finds model definition by name', () => {
      const ast = parseFixture('simple-model.cerial');
      const result = findTypeDefinition(ast, 'User');

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('model');
      expect(result!.range.start.line).toBeGreaterThan(0);
    });

    test('finds object definition by name', () => {
      const ast = parseFixture('complex-types.cerial');
      const result = findTypeDefinition(ast, 'Address');

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('object');
    });

    test('finds tuple definition by name', () => {
      const ast = parseFixture('complex-types.cerial');
      const result = findTypeDefinition(ast, 'Point3D');

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('tuple');
    });

    test('finds enum definition by name', () => {
      const ast = parseFixture('complex-types.cerial');
      const result = findTypeDefinition(ast, 'Status');

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('enum');
    });

    test('finds literal definition by name', () => {
      const ast = parseFixture('complex-types.cerial');
      const result = findTypeDefinition(ast, 'Severity');

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('literal');
    });

    test('primitive type returns null (no definition)', () => {
      const ast = parseFixture('simple-model.cerial');

      expect(findTypeDefinition(ast, 'String')).toBeNull();
      expect(findTypeDefinition(ast, 'Int')).toBeNull();
      expect(findTypeDefinition(ast, 'Bool')).toBeNull();
    });

    test('non-existent type returns null', () => {
      const ast = parseFixture('simple-model.cerial');

      expect(findTypeDefinition(ast, 'NonExistent')).toBeNull();
    });
  });

  describe('cross-file definition via indexer', () => {
    test('type defined in file A found from file B context', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Address { street String }',
        'models.cerial': 'model User { id Record @id\n  addr Address }',
      });

      // Search for Address in all ASTs in the group
      const allASTs = indexer.getAllASTsInGroup('test-group');
      let found = false;

      for (const [filePath, ast] of allASTs) {
        const result = findTypeDefinition(ast, 'Address');
        if (result) {
          found = true;
          expect(filePath).toContain('types.cerial');
          expect(result.kind).toBe('object');
        }
      }

      expect(found).toBe(true);
    });

    test('model defined in file A found from file B context', () => {
      const indexer = createIndexerWithContent({
        'multi-file-a.cerial': loadFixture('multi-file-a.cerial'),
        'multi-file-b.cerial': loadFixture('multi-file-b.cerial'),
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let found = false;

      for (const [filePath, ast] of allASTs) {
        const result = findTypeDefinition(ast, 'Employee');
        if (result) {
          found = true;
          expect(filePath).toContain('multi-file-a.cerial');
        }
      }

      expect(found).toBe(true);
    });
  });

  describe('definition at declaration site', () => {
    test('model name on header line is at declaration', () => {
      const ast = parseFixture('simple-model.cerial');
      // "model User {" — User is on the start line of the model range
      const userDef = findTypeDefinition(ast, 'User');

      expect(userDef).not.toBeNull();

      const source = loadFixture('simple-model.cerial');
      const offset = source.indexOf('User');
      const wordRange = getWordRangeAtPosition(source, offset);

      expect(wordRange).not.toBeNull();
      expect(wordRange!.word).toBe('User');
    });
  });

  describe('field type reference context', () => {
    test('field node reveals objectName for go-to-definition', () => {
      const ast = parseFixture('complex-types.cerial');
      // "  address Address" in Profile model
      // Profile starts around line 43
      const profileModel = ast.models.find((m) => m.name === 'Profile');

      expect(profileModel).toBeDefined();

      const addrField = profileModel!.fields.find((f) => f.name === 'address');

      expect(addrField).toBeDefined();
      expect(addrField!.objectName).toBe('Address');
    });

    test('relation field @model value provides target model name', () => {
      const ast = parseFixture('relations.cerial');
      const book = ast.models.find((m) => m.name === 'Book');

      expect(book).toBeDefined();

      const authorField = book!.fields.find((f) => f.name === 'author');

      expect(authorField).toBeDefined();

      const modelDec = authorField!.decorators.find((d) => d.type === 'model');

      expect(modelDec).toBeDefined();
      expect(modelDec!.value).toBe('Author');
    });

    test('@field decorator value provides target field name', () => {
      const ast = parseFixture('relations.cerial');
      const book = ast.models.find((m) => m.name === 'Book');
      const authorField = book!.fields.find((f) => f.name === 'author');
      const fieldDec = authorField!.decorators.find((d) => d.type === 'field');

      expect(fieldDec).toBeDefined();
      expect(fieldDec!.value).toBe('authorId');
    });
  });

  describe('extends reference', () => {
    test('extends reference on model provides parent name', () => {
      const ast = parseFixture('inheritance.cerial');
      const customer = ast.models.find((m) => m.name === 'Customer');

      expect(customer).toBeDefined();
      expect(customer!.extends).toBe('BaseUser');
    });

    test('extends reference on object provides parent name', () => {
      const ast = parseFixture('inheritance.cerial');
      const fullAddr = ast.objects.find((o) => o.name === 'FullAddress');

      expect(fullAddr).toBeDefined();
      expect(fullAddr!.extends).toBe('BaseAddress');
    });
  });
});
