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
  TupleMetadata,
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
    test('should generate DEFINE FIELD for each element with index notation', () => {
      const info = ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const stmts = generateTupleFieldDefines('location', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(
        stmts.some((s) => s.includes('DEFINE FIELD') && s.includes('location[0]') && s.includes('TYPE float')),
      ).toBe(true);
      expect(
        stmts.some((s) => s.includes('DEFINE FIELD') && s.includes('location[1]') && s.includes('TYPE float')),
      ).toBe(true);
    });

    test('should generate optional element with option<type>', () => {
      const info = ti('MaybePoint', [
        elem({ index: 0, type: 'float' }),
        elem({ index: 1, type: 'float', isOptional: true }),
      ]);

      const stmts = generateTupleFieldDefines('point', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('point[0]') && s.includes('TYPE float'))).toBe(true);
      expect(stmts.some((s) => s.includes('point[1]') && s.includes('option<float>'))).toBe(true);
    });

    test('should generate nested tuple sub-element defines', () => {
      const inner = ti('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
      const info = ti('Outer', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'tuple', tupleInfo: inner }),
      ]);

      const stmts = generateTupleFieldDefines('data', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('data[0]') && s.includes('TYPE string'))).toBe(true);
      expect(stmts.some((s) => s.includes('data[1]') && s.includes('[int, int]'))).toBe(true);
      expect(stmts.some((s) => s.includes('data[1][0]') && s.includes('TYPE int'))).toBe(true);
      expect(stmts.some((s) => s.includes('data[1][1]') && s.includes('TYPE int'))).toBe(true);
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

      expect(stmts.some((s) => s.includes('place[0]') && s.includes('TYPE string'))).toBe(true);
      expect(stmts.some((s) => s.includes('place[1]') && s.includes('TYPE object'))).toBe(true);
      expect(stmts.some((s) => s.includes('place[1].street') && s.includes('TYPE string'))).toBe(true);
      expect(stmts.some((s) => s.includes('place[1].city') && s.includes('TYPE string'))).toBe(true);
    });

    test('should handle array path prefix (field.* notation)', () => {
      const info = ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

      const stmts = generateTupleFieldDefines('history.*', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('history.*[0]'))).toBe(true);
      expect(stmts.some((s) => s.includes('history.*[1]'))).toBe(true);
    });

    test('should generate single-element tuple', () => {
      const info = ti('Single', [elem({ index: 0, type: 'string' })]);

      const stmts = generateTupleFieldDefines('tag', 'user', info, emptyTupleRegistry, emptyObjRegistry);

      expect(stmts.some((s) => s.includes('tag[0]') && s.includes('TYPE string'))).toBe(true);
    });
  });

  describe('generateModelDefineStatements with tuples', () => {
    test('should include tuple field type and sub-field defines', () => {
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
      expect(stmts.some((s) => s.includes('location[0]'))).toBe(true);
      expect(stmts.some((s) => s.includes('location[1]'))).toBe(true);
    });

    test('should include array tuple field with correct type', () => {
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
      expect(stmts.some((s) => s.includes('history.*[0]'))).toBe(true);
      expect(stmts.some((s) => s.includes('history.*[1]'))).toBe(true);
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
