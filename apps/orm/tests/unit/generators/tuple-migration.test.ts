/**
 * Unit Tests: Tuple Migration Generator
 *
 * Tests DEFINE TABLE/FIELD generation for tuple-typed fields,
 * including nested tuples and object elements, which are inline literal types because
 * SurrealDB 4.0 refuses every `DEFINE FIELD t[N]` under a tuple literal.
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../../src/generators/migrations/define-generator';
import {
  fieldTypeNeedsFlexible,
  generateTupleSurrealTypeLiteral,
  generateTypeClause,
} from '../../../src/generators/migrations/type-mapper';
import type { FieldMetadata, ObjectRegistry, TupleElementMetadata, TupleRegistry } from '../../../src/types';
import { elem, field, mdl, ti } from './helpers';

const objectOf = (objectName: string, fields: FieldMetadata[]): { objectName: string; fields: FieldMetadata[] } => ({
  objectName,
  fields,
});
const address = objectOf('Address', [
  field({ name: 'street', type: 'string' }),
  field({ name: 'zip', type: 'int', isRequired: false }),
  field({ name: 'tag', type: 'string', isNullable: true }),
]);
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

    test('should render an object element with no resolved fields as a bare object', () => {
      const info = ti('WithObj', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: { objectName: 'Address', fields: [] } }),
      ]);
      expect(generateTupleSurrealTypeLiteral(info)).toBe('[string, object]');
    });

    test('should render an object element as an inline literal object', () => {
      const info = ti('Located', [
        elem({ index: 0, type: 'string' }),
        elem({ index: 1, type: 'object', objectInfo: address }),
      ]);
      expect(generateTupleSurrealTypeLiteral(info)).toBe(
        '[string, { street: string, zip: option<int>, tag: string | null }]',
      );
    });

    test('should render an optional object element as option of a literal', () => {
      const info = ti('MaybeObj', [elem({ index: 0, type: 'object', objectInfo: address, isOptional: true })]);
      expect(generateTupleSurrealTypeLiteral(info)).toBe(
        '[option<{ street: string, zip: option<int>, tag: string | null }>]',
      );
    });

    test('should render objects and tuples nested in an object element as literals', () => {
      const pair = ti('Pair', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int' })]);
      const geo = objectOf('Geo', [
        field({ name: 'lat', type: 'float' }),
        field({ name: 'pair', type: 'tuple', tupleInfo: pair }),
        field({ name: 'pairs', type: 'tuple', isArray: true, tupleInfo: pair }),
        field({ name: 'inner', type: 'object', isRequired: false, objectInfo: address }),
        field({ name: 'inners', type: 'object', isArray: true, objectInfo: address }),
      ]);
      const info = ti('Deep', [elem({ index: 0, type: 'object', objectInfo: geo })]);
      expect(generateTupleSurrealTypeLiteral(info)).toBe(
        '[{ lat: float, pair: [int, int], pairs: array<[int, int]>, inner: option<{ street: string, zip: option<int>, tag: string | null }>, inners: array<{ street: string, zip: option<int>, tag: string | null }> }]',
      );
    });

    test('should leave a sub-field default out of the type, as a required key', () => {
      const stamped = objectOf('Stamped', [
        field({ name: 'at', type: 'date', timestampDecorator: 'createdAt' }),
        field({ name: 'n', type: 'int', defaultValue: 3 }),
        field({ name: 'id2', type: 'uuid', uuidDecorator: 'uuid7' }),
        field({ name: 'live', type: 'date', timestampDecorator: 'now' }),
      ]);
      const info = ti('S', [elem({ index: 0, type: 'object', objectInfo: stamped })]);
      expect(generateTupleSurrealTypeLiteral(info)).toBe('[{ at: datetime, n: int, id2: uuid }]');
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

  describe('flexible object members', () => {
    const flexibleGeo = objectOf('Geo', [
      field({ name: 'lat', type: 'float' }),
      field({ name: 'meta', type: 'object', isFlexible: true, objectInfo: address }),
    ]);
    const tupleField = (elements: TupleElementMetadata[], overrides: Partial<FieldMetadata> = {}): FieldMetadata =>
      field({ name: 'data', type: 'tuple', tupleInfo: ti('T', elements), ...overrides });

    test('a @flexible object inside an element is a bare object and the field is FLEXIBLE', () => {
      const f = tupleField([elem({ index: 0, type: 'object', objectInfo: flexibleGeo })]);
      expect(generateTypeClause('tuple', true, f)).toBe('TYPE [{ lat: float, meta: object }]');
      expect(fieldTypeNeedsFlexible(f)).toBe(true);
    });

    test('a self-referencing object inside an element is a bare object and the field is FLEXIBLE', () => {
      const node = objectOf('Node', []);
      node.fields.push(
        field({ name: 'label', type: 'string' }),
        field({ name: 'next', type: 'object', isRequired: false, objectInfo: { objectName: 'Node', fields: [] } }),
      );
      const f = tupleField([elem({ index: 0, type: 'object', objectInfo: node })]);
      expect(generateTypeClause('tuple', true, f)).toBe('TYPE [{ label: string, next: option<object> }]');
      expect(fieldTypeNeedsFlexible(f)).toBe(true);
    });

    test('a strict object, a primitive tuple and a plain field never get FLEXIBLE', () => {
      expect(fieldTypeNeedsFlexible(tupleField([elem({ index: 0, type: 'object', objectInfo: address })]))).toBe(false);
      expect(fieldTypeNeedsFlexible(tupleField([elem({ index: 0, type: 'int' })]))).toBe(false);
      expect(fieldTypeNeedsFlexible(field({ name: 'x', type: 'string' }))).toBe(false);
    });

    test('FLEXIBLE is emitted on the DEFINE FIELD for a required, optional and array tuple field', () => {
      const els = [elem({ index: 0, type: 'string' }), elem({ index: 1, type: 'object', objectInfo: flexibleGeo })];
      const m = mdl('T', 't', [
        field({ name: 'id', type: 'record', isId: true }),
        tupleField(els, { name: 'a' }),
        tupleField(els, { name: 'b', isRequired: false }),
        tupleField(els, { name: 'c', isArray: true }),
        tupleField([elem({ index: 0, type: 'object', objectInfo: address })], { name: 'strict' }),
      ]);

      expect(generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry)).toEqual([
        'DEFINE TABLE OVERWRITE t SCHEMAFULL;',
        'DEFINE FIELD OVERWRITE a ON TABLE t TYPE [string, { lat: float, meta: object }] FLEXIBLE;',
        'DEFINE FIELD OVERWRITE b ON TABLE t TYPE option<[string, { lat: float, meta: object }]> FLEXIBLE;',
        'DEFINE FIELD OVERWRITE c ON TABLE t TYPE array<[string, { lat: float, meta: object }]> FLEXIBLE;',
        'DEFINE FIELD OVERWRITE strict ON TABLE t TYPE [{ street: string, zip: option<int>, tag: string | null }];',
      ]);
    });
  });

  describe('element sub-field statements', () => {
    // 4.0 refuses `DEFINE FIELD t[N]` under a tuple literal (and `t[N].x` under it), so no element
    // gets a statement of its own, whatever it carries.
    test('emits only the parent for decorated, nullable, nested and object elements', () => {
      const inner = ti('Inner', [elem({ index: 0, type: 'int' }), elem({ index: 1, type: 'int', defaultValue: 1 })]);
      const m = mdl('T', 't', [
        field({ name: 'id', type: 'record', isId: true }),
        field({
          name: 'data',
          type: 'tuple',
          tupleInfo: ti('Mixed', [
            elem({ index: 0, type: 'string', defaultValue: 'hello' }),
            elem({ index: 1, type: 'float', isNullable: true, defaultValue: 0 }),
            elem({ index: 2, type: 'date', timestampDecorator: 'createdAt' }),
            elem({ index: 3, type: 'date', timestampDecorator: 'updatedAt', isOptional: true }),
            elem({ index: 4, type: 'int', defaultAlwaysValue: 7 }),
            elem({ index: 5, type: 'tuple', tupleInfo: inner }),
            elem({ index: 6, type: 'object', objectInfo: address }),
          ]),
        }),
        field({
          name: 'history',
          type: 'tuple',
          isArray: true,
          tupleInfo: ti('Coordinate', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]),
        }),
      ]);

      const registry: TupleRegistry = { Inner: { name: 'Inner', elements: inner.elements } };

      expect(generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, registry)).toEqual([
        'DEFINE TABLE OVERWRITE t SCHEMAFULL;',
        'DEFINE FIELD OVERWRITE data ON TABLE t TYPE [string, float | null, datetime, option<datetime>, int, [int, int], { street: string, zip: option<int>, tag: string | null }];',
        'DEFINE FIELD OVERWRITE history ON TABLE t TYPE array<[float, float]>;',
      ]);
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
