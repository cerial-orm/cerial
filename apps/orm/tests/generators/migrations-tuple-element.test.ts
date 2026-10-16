/**
 * Migration generator tests
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';

describe('Migration Generator', () => {
  describe('Tuple element sub-field constraints', () => {
    // Helper to build a model with a tuple field for migration testing.
    // Uses manually constructed ModelMetadata because astToRegistry() does NOT
    // populate tupleInfo/objectInfo — those require the full generation pipeline.
    function buildTupleModel(
      fieldName: string,
      fieldIsOptional: boolean,
      tupleName: string,
      elements: import('../../src/types').TupleElementMetadata[],
    ): {
      model: import('../../src/types').ModelMetadata;
      tupleRegistry: import('../../src/types').TupleRegistry;
    } {
      const tupleInfo = { tupleName, elements };
      const model: import('../../src/types').ModelMetadata = {
        name: 'Test',
        tableName: 'test',
        fields: [
          {
            name: 'id',
            type: 'record',
            isId: true,
            isUnique: false,
            isIndexed: false,
            isRequired: true,
          },
          {
            name: fieldName,
            type: 'tuple',
            isId: false,
            isUnique: false,
            isIndexed: false,
            isRequired: !fieldIsOptional,
            tupleInfo,
          },
        ],
      };
      const tupleRegistry: import('../../src/types').TupleRegistry = {
        [tupleName]: { name: tupleName, elements },
      };

      return { model, tupleRegistry };
    }

    // Pins the skip for the SurrealDB bug where an optional tuple initialises as `{}` instead of
    // NONE once `DEFINE FIELD t.f[N]` statements exist. Mirrors the corpus tuple `Stamped`.
    test('emits the parent and only the decorated [N] statements for a mixed tuple', () => {
      const { model, tupleRegistry } = buildTupleModel('stamp', true, 'Stamped', [
        { index: 0, type: 'string', isOptional: false },
        { index: 1, type: 'date', isOptional: false, timestampDecorator: 'createdAt' },
        { index: 2, type: 'int', isOptional: false },
        { index: 3, type: 'int', isOptional: false, defaultAlwaysValue: 7 },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);
      const stampStatements = statements.filter((s) => /\bstamp\b/.test(s));
      const subFieldIndexes = stampStatements
        .map((s) => /\bstamp\[(\d+)\]/.exec(s)?.[1])
        .filter((i): i is string => i !== undefined);

      expect(stampStatements.filter((s) => !s.includes('stamp[')).length).toBe(1);
      expect(stampStatements.find((s) => !s.includes('stamp['))).toContain(
        'stamp ON TABLE test TYPE option<[string, datetime, int, int]>',
      );
      expect(subFieldIndexes).toEqual(['1', '3']);
      expect(stampStatements.some((s) => s.includes('stamp[0]'))).toBe(false);
      expect(stampStatements.some((s) => s.includes('stamp[2]'))).toBe(false);
    });

    test('skips sub-field for required primitive element without decorators', () => {
      const { model, tupleRegistry } = buildTupleModel('pos', false, 'Coord', [
        { index: 0, type: 'float', isOptional: false },
        { index: 1, type: 'float', isOptional: false },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      expect(statements.some((s) => s.includes('pos[0]'))).toBe(false);
      expect(statements.some((s) => s.includes('pos[1]'))).toBe(false);
      expect(statements.some((s) => s.includes('DEFINE FIELD') && s.includes(' pos '))).toBe(true);
    });

    test('skips sub-field for optional primitive element without decorators', () => {
      const { model, tupleRegistry } = buildTupleModel('data', true, 'OptTuple', [
        { index: 0, type: 'string', isOptional: false },
        { index: 1, type: 'float', isOptional: true },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      expect(statements.some((s) => s.includes('data[0]'))).toBe(false);
      expect(statements.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('emits sub-field for element with @default decorator', () => {
      const { model, tupleRegistry } = buildTupleModel('data', false, 'WithDefault', [
        { index: 0, type: 'string', isOptional: false, defaultValue: 'hello' },
        { index: 1, type: 'float', isOptional: true },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      const defaultStmt = statements.find((s) => s.includes('data[0]'));
      expect(defaultStmt).toBeDefined();
      expect(defaultStmt).toContain("DEFAULT 'hello'");
      expect(statements.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('skips sub-field for @nullable-only element (parent type literal enforces it)', () => {
      const { model, tupleRegistry } = buildTupleModel('data', false, 'NullableTuple', [
        { index: 0, type: 'string', isOptional: false },
        { index: 1, type: 'float', isOptional: false, isNullable: true },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      expect(statements.some((s) => s.includes('data[0]'))).toBe(false);
      expect(statements.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('emits sub-field for element with @createdAt', () => {
      const { model, tupleRegistry } = buildTupleModel('data', false, 'TimedTuple', [
        { index: 0, type: 'date', isOptional: false, timestampDecorator: 'createdAt' },
        { index: 1, type: 'string', isOptional: true },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      const createdAtStmt = statements.find((s) => s.includes('data[0]'));
      expect(createdAtStmt).toBeDefined();
      expect(createdAtStmt).toContain('DEFAULT time::now()');
      expect(statements.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('emits sub-field for element with @defaultAlways', () => {
      const { model, tupleRegistry } = buildTupleModel('data', true, 'AlwaysTuple', [
        { index: 0, type: 'string', isOptional: false, defaultAlwaysValue: 'reset' },
        { index: 1, type: 'int', isOptional: true },
      ]);

      const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

      const alwaysStmt = statements.find((s) => s.includes('data[0]'));
      expect(alwaysStmt).toBeDefined();
      expect(alwaysStmt).toContain("DEFAULT ALWAYS 'reset'");
      expect(statements.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('emits sub-field for object elements (always needed)', () => {
      const objectInfo = {
        objectName: 'Inner',
        fields: [
          { name: 'value', type: 'string' as const, isId: false, isUnique: false, isIndexed: false, isRequired: true },
        ],
      };
      const tupleInfo = {
        tupleName: 'ObjTuple',
        elements: [
          { index: 0, type: 'string' as const, isOptional: false },
          { index: 1, type: 'object' as const, isOptional: false, objectInfo },
        ] as import('../../src/types').TupleElementMetadata[],
      };
      const model: import('../../src/types').ModelMetadata = {
        name: 'Test',
        tableName: 'test',
        fields: [
          { name: 'id', type: 'record', isId: true, isUnique: false, isIndexed: false, isRequired: true },
          { name: 'data', type: 'tuple', isId: false, isUnique: false, isIndexed: false, isRequired: true, tupleInfo },
        ],
      };
      const tupleRegistry: import('../../src/types').TupleRegistry = {
        ObjTuple: { name: 'ObjTuple', elements: tupleInfo.elements },
      };
      const objectRegistry: import('../../src/types').ObjectRegistry = {
        Inner: { name: 'Inner', fields: objectInfo.fields },
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry, tupleRegistry);

      expect(statements.some((s) => s.includes('data[0]'))).toBe(false);
      expect(statements.some((s) => s.includes('data[1]') && s.includes('TYPE object'))).toBe(true);
      expect(statements.some((s) => s.includes('data[1].value'))).toBe(true);
    });
  });
});
