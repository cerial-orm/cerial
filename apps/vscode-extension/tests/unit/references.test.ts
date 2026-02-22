import { describe, expect, test } from 'bun:test';
import { findTypeDefinition } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, loadFixture, testPath } from './helpers';

describe('References Logic', () => {
  describe('type references across files', () => {
    test('model name used as @model() target is a reference', () => {
      const indexer = createIndexerWithContent({
        'multi-file-a.cerial': loadFixture('multi-file-a.cerial'),
        'multi-file-b.cerial': loadFixture('multi-file-b.cerial'),
      });

      // Employee is defined in file A and referenced in file B via @model(Employee)
      const allASTs = indexer.getAllASTsInGroup('test-group');
      let definitionFile: string | null = null;
      let referenceFound = false;

      for (const [filePath, ast] of allASTs) {
        // Check definitions
        if (findTypeDefinition(ast, 'Employee')) {
          definitionFile = filePath;
        }

        // Check references (fields with @model(Employee))
        for (const model of ast.models) {
          for (const field of model.fields) {
            for (const dec of field.decorators) {
              if (dec.type === 'model' && dec.value === 'Employee') {
                referenceFound = true;
              }
            }
          }
        }
      }

      expect(definitionFile).not.toBeNull();
      expect(definitionFile!).toContain('multi-file-a');
      expect(referenceFound).toBe(true);
    });

    test('object type used as field type is a reference', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Address {\n  street String\n  city String\n}',
        'models.cerial': 'model User {\n  id Record @id\n  addr Address\n  billing Address?\n}',
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let refCount = 0;

      for (const [, ast] of allASTs) {
        for (const model of ast.models) {
          for (const field of model.fields) {
            if (field.objectName === 'Address') {
              refCount++;
            }
          }
        }
      }

      // addr and billing both reference Address
      expect(refCount).toBe(2);
    });

    test('type with no references has only declaration', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Unused { x String }',
        'models.cerial': 'model User { id Record @id }',
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let definitionCount = 0;
      let referenceCount = 0;

      for (const [, ast] of allASTs) {
        if (findTypeDefinition(ast, 'Unused')) {
          definitionCount++;
        }
        for (const model of ast.models) {
          for (const field of model.fields) {
            if (field.objectName === 'Unused') {
              referenceCount++;
            }
          }
        }
      }

      expect(definitionCount).toBe(1);
      expect(referenceCount).toBe(0);
    });
  });

  describe('extends references', () => {
    test('extends parent name is a reference', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base { id Record @id }',
        'child.cerial': 'model Child extends Base { name String }',
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let extendsRef = false;

      for (const [, ast] of allASTs) {
        for (const model of ast.models) {
          if (model.extends === 'Base') {
            extendsRef = true;
          }
        }
      }

      expect(extendsRef).toBe(true);
    });
  });

  describe('field name references via @field()', () => {
    test('@field(authorId) references the authorId field', () => {
      const indexer = createIndexerWithContent({
        'models.cerial': loadFixture('relations.cerial'),
      });

      const ast = indexer.getAST(testPath('models.cerial'))!;
      const book = ast.models.find((m) => m.name === 'Book')!;

      // authorId is defined as a Record field
      const authorIdField = book.fields.find((f) => f.name === 'authorId');

      expect(authorIdField).toBeDefined();

      // author Relation @field(authorId) references it
      const authorField = book.fields.find((f) => f.name === 'author');
      const fieldDec = authorField!.decorators.find((d) => d.type === 'field');

      expect(fieldDec).toBeDefined();
      expect(fieldDec!.value).toBe('authorId');
    });
  });

  describe('Record() type parameter references', () => {
    test('Record(Type) parameter is a type reference', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'tuple MyTuple { String, Int }',
        'models.cerial': 'model Foo {\n  id Record(MyTuple) @id\n}',
      });

      const ast = indexer.getAST(testPath('models.cerial'))!;
      const idField = ast.models[0]!.fields.find((f) => f.name === 'id');

      expect(idField).toBeDefined();
      expect(idField!.recordIdTypes).toContain('MyTuple');
    });
  });
});
