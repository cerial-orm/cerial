/**
 * Unit Tests: Tuple Migration Generator
 *
 * Tests DEFINE TABLE/FIELD generation for tuple-typed fields,
 * including sub-element definitions, nested tuples, objects in tuples.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateModelDefineStatements,
  generateTupleFieldDefines,
} from '../../../src/generators/migrations/define-generator';
import { generateTupleSurrealTypeLiteral, generateTypeClause } from '../../../src/generators/migrations/type-mapper';
import type {
  FieldMetadata,
  ModelMetadata,
  ObjectRegistry,
  TupleElementMetadata,
  TupleFieldMetadata,
  TupleRegistry,
} from '../../../src/types';

// Helper to create a minimal FieldMetadata
function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

function ti(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

function mdl(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

const emptyTupleRegistry: TupleRegistry = {};
const emptyObjRegistry: ObjectRegistry = {};

describe('Tuple Migration Generator', () => {
  describe('generateTupleSurrealTypeLiteral', () => {
    test('should generate [float, float] for two floats', () => {
      const info = ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[float, float]');
    });

    test('should generate [string, int, bool] for mixed types', () => {
      const info = ti('Entry', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'int' }),
        elem({ index: 2, type: 'bool' }),
      ]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[string, int, bool]');
    });

    test('should generate optional elements', () => {
      const info = ti('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[float, option<float>]');
    });

    test('should generate nested tuple literal', () => {
      const inner = ti('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
      const info = ti('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: inner }),
      ]);
      const registry: TupleRegistry = { Inner: { name: 'Inner', elements: inner.elements } };
      const result = generateTupleSurrealTypeLiteral(info, registry);
      expect(result).toBe('[string, [int, int]]');
    });

    test('should generate single-element literal', () => {
      const info = ti('Single', [elem({ index: 0, type: 'string' })]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[string]');
    });

    test('should generate [datetime] for date element', () => {
      const info = ti('Timed', [elem({ index: 0, type: 'date' })]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[datetime]');
    });

    test('should generate object element as object', () => {
      const info = ti('WithObj', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[string, object]');
    });

    test('should generate optional object element', () => {
      const info = ti('MaybeObj', [
        elem({ index: 0, type: 'object', objectInfo: { objectName: 'Address', fields: [] }, isOptional: true }),
      ]);
      const result = generateTupleSurrealTypeLiteral(info);
      expect(result).toBe('[option<object>]');
    });

    test('should generate optional nested tuple', () => {
      const inner = ti('Inner', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);
      const info = ti('MaybeNested', [elem({ index: 0, type: 'tuple', isOptional: true, tupleInfo: inner })]);
      const registry: TupleRegistry = { Inner: { name: 'Inner', elements: inner.elements } };
      const result = generateTupleSurrealTypeLiteral(info, registry);
      expect(result).toBe('[option<[float, float]>]');
    });
  });

  describe('generateTypeClause for tuple fields', () => {
    test('should generate TYPE [float, float] for required tuple field', () => {
      const f = field({
        name: 'location',
        type: 'tuple',
        isRequired: true,
        tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
      });
      const result = generateTypeClause('tuple', true, f);
      expect(result).toContain('TYPE [float, float]');
    });

    test('should generate TYPE option<[float, float]> for optional tuple field', () => {
      const f = field({
        name: 'backup',
        type: 'tuple',
        isRequired: false,
        tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
      });
      const result = generateTypeClause('tuple', false, f);
      expect(result).toContain('option<[float, float]>');
    });

    test('should generate TYPE array<[float, float]> for array tuple field', () => {
      const f = field({
        name: 'history',
        type: 'tuple',
        isRequired: true,
        isArray: true,
        tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
      });
      const result = generateTypeClause('tuple', true, f);
      expect(result).toContain('array<[float, float]>');
    });

    test('should generate TYPE [string, int, bool] for mixed tuple', () => {
      const f = field({
        name: 'entry',
        type: 'tuple',
        isRequired: true,
        tupleInfo: ti('Entry', [
          elem({ index: 0, type: 'string' }),
          elem({ index: 1, type: 'int' }),
          elem({ index: 2, type: 'bool' }),
        ]),
      });
      const result = generateTypeClause('tuple', true, f);
      expect(result).toBe('TYPE [string, int, bool]');
    });
  });

  describe('generateTupleFieldDefines', () => {
    // NOTE: After SurrealDB bug mitigation, primitive elements WITHOUT decorators
    // are skipped (parent tuple type literal already enforces types including | null).
    // Sub-field DEFINE statements are only emitted for:
    //   - Elements with decorators (@default, @defaultAlways, @createdAt, @updatedAt)
    //   - Object elements (need sub-field structure)
    //   - Nested tuple elements (need sub-field structure)

    test('should skip sub-field defines for primitive elements without decorators', () => {
      const info = ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const stmts = generateTupleFieldDefines('location', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Primitive elements without decorators should NOT produce sub-field defines
      expect(stmts.some((s) => s.includes('location[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('location[1]'))).toBe(false);
    });

    test('should skip sub-field defines for optional primitive elements without decorators', () => {
      const info = ti('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const stmts = generateTupleFieldDefines('point', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Both elements lack decorators/@nullable — skipped
      expect(stmts.some((s) => s.includes('point[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('point[1]'))).toBe(false);
    });

    test('should emit sub-field for element with @default decorator', () => {
      const info = ti('WithDefault', [
        elem({ index: 0, type: 'string', defaultValue: 'hello' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const stmts = generateTupleFieldDefines('data', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Element with @default gets sub-field
      expect(stmts.some((s) => s.includes('data[0]') && s.includes("DEFAULT 'hello'"))).toBe(true);
      // Plain optional element without decorator is skipped
      expect(stmts.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('should skip sub-field for @nullable-only element (parent type literal enforces it)', () => {
      const info = ti('NullableTuple', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'float', isNullable: true }),
      ]);

      const stmts = generateTupleFieldDefines('data', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('data[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('data[1]'))).toBe(false);
    });

    test('should emit sub-field for @nullable element with @default decorator', () => {
      const info = ti('NullableWithDefault', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'float', isNullable: true, defaultValue: 0.0 }),
      ]);

      const stmts = generateTupleFieldDefines('data', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('data[0]'))).toBe(false);
      const nullableStmt = stmts.find((s) => s.includes('data[1]'));
      expect(nullableStmt).toBeDefined();
      expect(nullableStmt).toContain('| null');
      expect(nullableStmt).toContain('DEFAULT 0');
    });

    test('should generate nested tuple sub-element defines', () => {
      const inner = ti('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
      const info = ti('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: inner }),
      ]);

      const stmts = generateTupleFieldDefines('data', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Primitive element without decorator is skipped
      expect(stmts.some((s) => s.includes('data[0]'))).toBe(false);
      // Nested tuple element gets sub-field define
      expect(stmts.some((s) => s.includes('data[1]') && s.includes('[int, int]'))).toBe(true);
      // Nested tuple's primitive elements without decorators are also skipped
      expect(stmts.some((s) => s.includes('data[1][0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('data[1][1]'))).toBe(false);
    });

    test('should generate object-typed element with DEFINE FIELD for object sub-fields', () => {
      const addrFields = [
        field({ name: 'street', type: 'string', isRequired: true }),
        field({ name: 'city', type: 'string', isRequired: true }),
      ];
      const info = ti('Located', [
        elem({ index: 0, type: 'string' }),
        elem({
          index: 1,
          type: 'object',
          objectInfo: {
            objectName: 'Address',
            fields: addrFields,
          },
        }),
      ]);

      const objRegistry: ObjectRegistry = {
        Address: { name: 'Address', fields: addrFields },
      };

      const stmts = generateTupleFieldDefines('place', 'user', info, emptyTupleRegistry, objRegistry);

      // Primitive element without decorator is skipped
      expect(stmts.some((s) => s.includes('place[0]'))).toBe(false);
      // Object element always gets sub-field defines
      expect(stmts.some((s) => s.includes('place[1]') && s.includes('TYPE object'))).toBe(true);
      expect(stmts.some((s) => s.includes('place[1].street') && s.includes('TYPE string'))).toBe(true);
      expect(stmts.some((s) => s.includes('place[1].city') && s.includes('TYPE string'))).toBe(true);
    });

    test('should skip sub-field defines for array path primitive elements without decorators', () => {
      const info = ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const stmts = generateTupleFieldDefines('history.*', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Primitive elements without decorators are skipped even with array path
      expect(stmts.some((s) => s.includes('history.*[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('history.*[1]'))).toBe(false);
    });

    test('should skip sub-field define for single primitive element without decorator', () => {
      const info = ti('Single', [elem({ index: 0, type: 'string' })]);

      const stmts = generateTupleFieldDefines('tag', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      // Single primitive element without decorator is skipped
      expect(stmts.some((s) => s.includes('tag[0]'))).toBe(false);
    });
  });

  describe('generateModelDefineStatements with tuples', () => {
    test('should include tuple field type but skip primitive sub-field defines without decorators', () => {
      const m = mdl('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'location',
          type: 'tuple',
          isRequired: true,
          tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry);

      expect(stmts.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      expect(stmts.some((s) => s.includes('location') && s.includes('[float, float]'))).toBe(true);
      // Primitive elements without decorators are skipped
      expect(stmts.some((s) => s.includes('location[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('location[1]'))).toBe(false);
    });

    test('should include array tuple field type but skip primitive sub-field defines without decorators', () => {
      const m = mdl('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'history',
          type: 'tuple',
          isRequired: true,
          isArray: true,
          tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry);

      expect(stmts.some((s) => s.includes('history') && s.includes('array<[float, float]>'))).toBe(true);
      // Primitive elements without decorators are skipped
      expect(stmts.some((s) => s.includes('history.*[0]'))).toBe(false);
      expect(stmts.some((s) => s.includes('history.*[1]'))).toBe(false);
    });

    test('should include optional tuple field with correct type', () => {
      const m = mdl('User', 'user', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({
          name: 'backup',
          type: 'tuple',
          isRequired: false,
          tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
        }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry);

      expect(stmts.some((s) => s.includes('backup') && s.includes('option<[float, float]>'))).toBe(true);
    });
  });
});
