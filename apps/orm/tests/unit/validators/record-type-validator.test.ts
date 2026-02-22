import { describe, expect, test } from 'bun:test';
import { validateRecordIdTypes } from '../../../src/cli/validators/record-type-validator';
import type { ASTField, ASTModel, ASTObject, ASTTuple, ASTTupleElement, SchemaAST } from '../../../src/types';

const defaultRange = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

function createASTField(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    isArray: false,
    decorators: [],
    range: defaultRange,
    ...overrides,
  };
}

function createASTModel(overrides: Partial<ASTModel> = {}): ASTModel {
  return {
    name: 'TestModel',
    fields: [],
    range: defaultRange,
    ...overrides,
  };
}

function createTupleElement(overrides: Partial<ASTTupleElement> = {}): ASTTupleElement {
  return { type: 'string', isOptional: false, ...overrides };
}

function createTuple(overrides: Partial<ASTTuple> = {}): ASTTuple {
  return { name: 'TestTuple', elements: [], range: defaultRange, ...overrides };
}

function createObject(overrides: Partial<ASTObject> = {}): ASTObject {
  return { name: 'TestObject', fields: [], range: defaultRange, ...overrides };
}

function createAST(overrides: Partial<SchemaAST> = {}): SchemaAST {
  return { source: '', objects: [], tuples: [], literals: [], enums: [], models: [], ...overrides };
}

describe('validateRecordIdTypes', () => {
  describe('valid cases (0 errors)', () => {
    test('plain Record (no type params) — no errors', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record' })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record @id (no type params) — no errors', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(int) standalone — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['int'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(string) standalone — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['string'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(number) standalone — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['number'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(uuid) standalone — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['uuid'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(int) @id — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['int'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(string, int) @id — valid union', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['string', 'int'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(MyTuple) where MyTuple exists — valid', () => {
      const ast = createAST({
        tuples: [createTuple({ name: 'MyTuple', elements: [createTupleElement({ type: 'int' })] })],
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['MyTuple'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(MyObject) where MyObject exists — valid', () => {
      const ast = createAST({
        objects: [createObject({ name: 'MyObject', fields: [createASTField({ name: 'x', type: 'int' })] })],
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['MyObject'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(int, MyTuple) mixed union — valid', () => {
      const ast = createAST({
        tuples: [createTuple({ name: 'MyTuple', elements: [createTupleElement({ type: 'string' })] })],
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['int', 'MyTuple'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('FK Record WITHOUT Record(Type) WITH Relation — valid', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record' }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  { type: 'field', value: 'authorId', range: defaultRange },
                  { type: 'model', value: 'User', range: defaultRange },
                ],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });
  });

  describe('invalid type parameter cases', () => {
    test('Record(float) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['float'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("Cannot use 'float'");
    });

    test('Record(bool) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['bool'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("Cannot use 'bool'");
    });

    test('Record(date) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['date'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(datetime) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['datetime'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(decimal) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['decimal'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(duration) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['duration'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(literal) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['literal'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(enum) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['enum'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(relation) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['relation'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(email) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['email'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(bytes) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['bytes'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(geometry) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['geometry'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(any) → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['any'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(1);
    });

    test('Record(string, float) → error on float only', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['string', 'float'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("Cannot use 'float'");
    });

    test('Record(NonExistentTuple) → error with typo suggestion', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['NonExistentTuple'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('not a defined tuple or object');
      expect(errors[0]!.message).toContain('Did you mean');
    });

    test('Record(nonexistent) lowercase → generic error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['nonexistent'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Cannot use');
      expect(errors[0]!.message).not.toContain('Did you mean');
    });
  });

  describe('FK + Relation cases', () => {
    test('FK Record(int) WITH paired Relation → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record', recordIdTypes: ['int'] }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  { type: 'field', value: 'authorId', range: defaultRange },
                  { type: 'model', value: 'User', range: defaultRange },
                ],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Record(Type) cannot be used on FK field');
      expect(errors[0]!.message).toContain('inferred from target');
    });

    test('FK Record(string) WITH paired Relation → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record', recordIdTypes: ['string'] }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  { type: 'field', value: 'authorId', range: defaultRange },
                  { type: 'model', value: 'User', range: defaultRange },
                ],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Record(Type) cannot be used on FK field');
    });

    test('FK Record(int, string) WITH paired Relation → error', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record', recordIdTypes: ['int', 'string'] }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  { type: 'field', value: 'authorId', range: defaultRange },
                  { type: 'model', value: 'User', range: defaultRange },
                ],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Record(Type) cannot be used on FK field');
    });

    test('FK Record(int) with Relation skips further type validation', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Post',
            fields: [
              createASTField({ name: 'authorId', type: 'record', recordIdTypes: ['int'] }),
              createASTField({
                name: 'author',
                type: 'relation',
                decorators: [
                  { type: 'field', value: 'authorId', range: defaultRange },
                  { type: 'model', value: 'User', range: defaultRange },
                ],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).not.toContain("Cannot use 'int'");
    });
  });

  describe('@id + decorated tuple/object WARNING cases', () => {
    test('Record(DecoratedTuple) @id where tuple has @default element → warning', () => {
      const ast = createAST({
        tuples: [
          createTuple({
            name: 'DecoratedTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'hello', range: defaultRange }],
              }),
              createTupleElement({ type: 'int' }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['DecoratedTuple'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Warning');
      expect(errors[0]!.message).toContain('DecoratedTuple');
      expect(errors[0]!.message).toContain('ignored when used as @id');
    });

    test('Record(DecoratedObject) @id where object has @createdAt field → warning', () => {
      const ast = createAST({
        objects: [
          createObject({
            name: 'DecoratedObject',
            fields: [
              createASTField({
                name: 'ts',
                type: 'date',
                decorators: [{ type: 'createdAt', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['DecoratedObject'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Warning');
      expect(errors[0]!.message).toContain('DecoratedObject');
    });

    test('Record(CleanTuple) @id where tuple has NO decorators → no warning', () => {
      const ast = createAST({
        tuples: [
          createTuple({
            name: 'CleanTuple',
            elements: [createTupleElement({ type: 'string' }), createTupleElement({ type: 'int' })],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['CleanTuple'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(CleanObject) @id where object has NO decorators → no warning', () => {
      const ast = createAST({
        objects: [
          createObject({
            name: 'CleanObject',
            fields: [createASTField({ name: 'x', type: 'int' }), createASTField({ name: 'y', type: 'string' })],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['CleanObject'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(TupleWithUpdatedAt) @id → warning for @updatedAt', () => {
      const ast = createAST({
        tuples: [
          createTuple({
            name: 'TupleWithUpdatedAt',
            elements: [
              createTupleElement({
                type: 'date',
                decorators: [{ type: 'updatedAt', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['TupleWithUpdatedAt'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Warning');
    });

    test('Record(ObjectWithDefaultAlways) @id → warning for @defaultAlways', () => {
      const ast = createAST({
        objects: [
          createObject({
            name: 'ObjectWithDefaultAlways',
            fields: [
              createASTField({
                name: 'val',
                type: 'string',
                decorators: [{ type: 'defaultAlways', value: 'x', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['ObjectWithDefaultAlways'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Warning');
    });

    test('Record(MyTuple) without @id — no warning even if tuple has decorators', () => {
      const ast = createAST({
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'default', value: 'x', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['MyTuple'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('Record(MyObject) without @id — no warning even if object has decorators', () => {
      const ast = createAST({
        objects: [
          createObject({
            name: 'MyObject',
            fields: [
              createASTField({
                name: 'ts',
                type: 'date',
                decorators: [{ type: 'createdAt', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['MyObject'] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('non-record fields are skipped', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [
              createASTField({ name: 'name', type: 'string' }),
              createASTField({ name: 'age', type: 'int' }),
              createASTField({ name: 'rel', type: 'relation' }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('multiple models with mixed valid/invalid produces correct errors', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'Model1',
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['int'] })],
          }),
          createASTModel({
            name: 'Model2',
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['float'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.model).toBe('Model2');
    });

    test('multiple invalid types in union produce multiple errors', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: ['float', 'bool', 'date'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors).toHaveLength(3);
    });

    test('error includes model name and field name', () => {
      const ast = createAST({
        models: [
          createASTModel({
            name: 'MyModel',
            fields: [createASTField({ name: 'myField', type: 'record', recordIdTypes: ['float'] })],
          }),
        ],
      });
      const errors = validateRecordIdTypes(ast);
      expect(errors[0]!.model).toBe('MyModel');
      expect(errors[0]!.field).toBe('myField');
      expect(errors[0]!.line).toBeDefined();
    });

    test('empty recordIdTypes array produces no errors', () => {
      const ast = createAST({
        models: [
          createASTModel({
            fields: [createASTField({ name: 'ref', type: 'record', recordIdTypes: [] })],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('object field with @unique decorator (not in ignored set) does not trigger warning', () => {
      const ast = createAST({
        objects: [
          createObject({
            name: 'MyObj',
            fields: [
              createASTField({
                name: 'code',
                type: 'string',
                decorators: [{ type: 'unique', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['MyObj'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });

    test('tuple element with @nullable decorator (not in ignored set) does not trigger warning', () => {
      const ast = createAST({
        tuples: [
          createTuple({
            name: 'MyTuple',
            elements: [
              createTupleElement({
                type: 'string',
                decorators: [{ type: 'nullable', range: defaultRange }],
              }),
            ],
          }),
        ],
        models: [
          createASTModel({
            fields: [
              createASTField({
                name: 'id',
                type: 'record',
                recordIdTypes: ['MyTuple'],
                decorators: [{ type: 'id', range: defaultRange }],
              }),
            ],
          }),
        ],
      });
      expect(validateRecordIdTypes(ast)).toHaveLength(0);
    });
  });
});
