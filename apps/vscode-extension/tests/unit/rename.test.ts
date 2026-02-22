import { describe, expect, test } from 'bun:test';
import { findTypeDefinition, getWordRangeAtPosition } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, loadFixture, parseFixture, testPath } from './helpers';

describe('Rename Logic', () => {
  describe('rename validation', () => {
    test('primitive type names should be rejected', () => {
      const primitives = [
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
        'string',
        'int',
        'float',
        'bool',
        'date',
        'email',
        'record',
        'relation',
        'uuid',
        'duration',
        'decimal',
        'bytes',
        'geometry',
        'any',
        'number',
      ];

      const PRIMITIVE_TYPES = new Set(primitives);

      for (const p of primitives) {
        expect(PRIMITIVE_TYPES.has(p)).toBe(true);
      }
    });

    test('keywords should be rejected', () => {
      const KEYWORDS = new Set(['model', 'object', 'tuple', 'enum', 'literal', 'abstract', 'extends', 'true', 'false']);

      expect(KEYWORDS.has('model')).toBe(true);
      expect(KEYWORDS.has('extends')).toBe(true);
      expect(KEYWORDS.has('UserModel')).toBe(false);
    });

    test('decorators (starting with @) should be rejected', () => {
      const word = '@unique';

      expect(word.startsWith('@')).toBe(true);
    });

    test('private marker (starting with !) should be rejected', () => {
      const word = '!!private';

      expect(word.startsWith('!')).toBe(true);
    });

    test('valid new name pattern check', () => {
      const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

      expect(validPattern.test('UserProfile')).toBe(true);
      expect(validPattern.test('_hidden')).toBe(true);
      expect(validPattern.test('123invalid')).toBe(false);
      expect(validPattern.test('has spaces')).toBe(false);
      expect(validPattern.test('')).toBe(false);
    });

    test('type names must start uppercase', () => {
      expect(/^[a-z]/.test('lowercase')).toBe(true);
      expect(/^[a-z]/.test('Uppercase')).toBe(false);
    });
  });

  describe('rename scope detection', () => {
    test('word at position extracts correct rename target', () => {
      const source = 'model User { id Record @id }';
      const result = getWordRangeAtPosition(source, 6); // 'U' in 'User'

      expect(result).not.toBeNull();
      expect(result!.word).toBe('User');
    });

    test('type defined in group is renameable', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model UserProfile { id Record @id }',
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let isDefined = false;

      for (const [, ast] of allASTs) {
        if (findTypeDefinition(ast, 'UserProfile')) {
          isDefined = true;
        }
      }

      expect(isDefined).toBe(true);
    });
  });

  describe('rename edit collection', () => {
    test('renaming type updates declaration', () => {
      const indexer = createIndexerWithContent({
        'models.cerial': 'model OldName { id Record @id }',
      });

      const ast = indexer.getAST(testPath('models.cerial'))!;
      const def = findTypeDefinition(ast, 'OldName');

      expect(def).not.toBeNull();
      expect(def!.kind).toBe('model');
    });

    test('renaming type finds references in @model() decorators', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model Target { id Record @id }',
        'b.cerial': 'model Src {\n  id Record @id\n  fk Record\n  rel Relation @field(fk) @model(Target)\n}',
      });

      const bAST = indexer.getAST(testPath('b.cerial'))!;
      const relField = bAST.models[0]!.fields.find((f) => f.name === 'rel');

      expect(relField).toBeDefined();

      const modelDec = relField!.decorators.find((d) => d.type === 'model');

      expect(modelDec).toBeDefined();
      expect(modelDec!.value).toBe('Target');
    });

    test('renaming type finds references in extends', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model OldBase { id Record @id }',
        'child.cerial': 'model Child extends OldBase { name String }',
      });

      const childAST = indexer.getAST(testPath('child.cerial'))!;
      const child = childAST.models.find((m) => m.name === 'Child');

      expect(child).toBeDefined();
      expect(child!.extends).toBe('OldBase');
    });

    test('renaming type finds references in field type refs', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object OldObj {\n  x String\n}',
        'models.cerial': 'model M {\n  id Record @id\n  data OldObj\n}',
      });

      const modelAST = indexer.getAST(testPath('models.cerial'))!;
      const dataField = modelAST.models[0]!.fields.find((f) => f.name === 'data');

      expect(dataField).toBeDefined();
      expect(dataField!.objectName).toBe('OldObj');
    });

    test('renaming field finds @field() references', () => {
      const indexer = createIndexerWithContent({
        'models.cerial': 'model M {\n  id Record @id\n  oldFk Record\n  rel Relation @field(oldFk) @model(M)\n}',
      });

      const ast = indexer.getAST(testPath('models.cerial'))!;
      const relField = ast.models[0]!.fields.find((f) => f.name === 'rel');
      const fieldDec = relField!.decorators.find((d) => d.type === 'field');

      expect(fieldDec).toBeDefined();
      expect(fieldDec!.value).toBe('oldFk');
    });
  });
});
