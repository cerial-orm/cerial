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

    // SurrealDB 4.0 refuses `DEFINE FIELD t[N]` under any tuple literal, so no element gets a statement
    // and the parent type literal alone carries the element types.
    test('emits only the parent for a mixed tuple with decorated elements', () => {
      const { model, tupleRegistry } = buildTupleModel('stamp', true, 'Stamped', [
        { index: 0, type: 'string', isOptional: false },
        { index: 1, type: 'date', isOptional: false, timestampDecorator: 'createdAt' },
        { index: 2, type: 'int', isOptional: false },
        { index: 3, type: 'int', isOptional: false, defaultAlwaysValue: 7 },
      ]);

      expect(generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry)).toEqual([
        'DEFINE TABLE OVERWRITE test SCHEMAFULL;',
        'DEFINE FIELD OVERWRITE stamp ON TABLE test TYPE option<[string, datetime, int, int]>;',
      ]);
    });

    test.each([
      ['@default', { index: 0, type: 'string', isOptional: false, defaultValue: 'hello' }],
      ['@createdAt', { index: 0, type: 'date', isOptional: false, timestampDecorator: 'createdAt' }],
      ['@updatedAt', { index: 0, type: 'date', isOptional: false, timestampDecorator: 'updatedAt' }],
      ['@defaultAlways', { index: 0, type: 'string', isOptional: false, defaultAlwaysValue: 'reset' }],
      ['@nullable', { index: 0, type: 'float', isOptional: false, isNullable: true }],
      ['no decorator', { index: 0, type: 'float', isOptional: true }],
    ] as [string, import('../../src/types').TupleElementMetadata][])(
      'emits no [N] statement for %s',
      (_label, element) => {
        const { model, tupleRegistry } = buildTupleModel('data', false, 'One', [
          element,
          { index: 1, type: 'int', isOptional: false },
        ]);

        const statements = generateModelDefineStatements(model, undefined, undefined, undefined, tupleRegistry);

        expect(statements).toHaveLength(2);
        expect(statements.some((s) => s.includes('data['))).toBe(false);
      },
    );

    test('renders an object element inline, with no [N] or [N].sub-field statements', () => {
      const objectInfo = {
        objectName: 'Inner',
        fields: [
          { name: 'value', type: 'string' as const, isId: false, isUnique: false, isIndexed: false, isRequired: true },
          {
            name: 'at',
            type: 'date' as const,
            isId: false,
            isUnique: false,
            isIndexed: false,
            isRequired: true,
            timestampDecorator: 'createdAt' as const,
          },
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

      expect(generateModelDefineStatements(model, undefined, undefined, objectRegistry, tupleRegistry)).toEqual([
        'DEFINE TABLE OVERWRITE test SCHEMAFULL;',
        'DEFINE FIELD OVERWRITE data ON TABLE test TYPE [string, { value: string, at: datetime }];',
      ]);
    });
  });
});
