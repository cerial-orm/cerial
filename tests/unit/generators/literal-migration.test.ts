/**
 * Unit Tests: Literal Migration Generator
 *
 * Tests DEFINE FIELD generation for literal-typed fields,
 * including inline object and tuple variant type generation.
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../../src/generators/migrations/define-generator';
import {
  generateLiteralSurrealType,
  generateObjectSurrealTypeLiteral,
  generateTypeClause,
} from '../../../src/generators/migrations/type-mapper';
import type {
  FieldMetadata,
  LiteralFieldMetadata,
  ModelMetadata,
  ObjectFieldMetadata,
  ObjectRegistry,
  ResolvedLiteralVariant,
  TupleFieldMetadata,
  TupleElementMetadata,
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

function objInfo(objectName: string, fields: FieldMetadata[]): ObjectFieldMetadata {
  return { objectName, fields };
}

function litInfo(literalName: string, variants: ResolvedLiteralVariant[]): LiteralFieldMetadata {
  return { literalName, variants };
}

const emptyTupleRegistry: TupleRegistry = {};
const emptyObjRegistry: ObjectRegistry = {};

describe('Literal Migration Generator', () => {
  describe('generateObjectSurrealTypeLiteral', () => {
    test('should generate inline object with all required primitive fields', () => {
      const info = objInfo('Point', [
        field({ name: 'label', type: 'string', isRequired: true }),
        field({ name: 'val', type: 'int', isRequired: true }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ label: string, val: int }');
    });

    test('should generate inline object with optional field', () => {
      const info = objInfo('Opt', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'desc', type: 'string', isRequired: false }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ name: string, desc: option<string> }');
    });

    test('should generate inline object with nullable field', () => {
      const info = objInfo('Nullable', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'count', type: 'int', isRequired: true, isNullable: true }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ name: string, count: int | null }');
    });

    test('should generate inline object with optional+nullable field', () => {
      const info = objInfo('OptNull', [field({ name: 'tag', type: 'string', isRequired: false, isNullable: true })]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ tag: option<string | null> }');
    });

    test('should generate inline object with all primitive types', () => {
      const info = objInfo('AllTypes', [
        field({ name: 's', type: 'string', isRequired: true }),
        field({ name: 'i', type: 'int', isRequired: true }),
        field({ name: 'f', type: 'float', isRequired: true }),
        field({ name: 'b', type: 'bool', isRequired: true }),
        field({ name: 'd', type: 'date', isRequired: true }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ s: string, i: int, f: float, b: bool, d: datetime }');
    });

    test('should generate inline object with literal-typed sub-field', () => {
      const statusLitInfo = litInfo('Status', [
        { kind: 'string', value: 'active' },
        { kind: 'string', value: 'inactive' },
      ]);
      const info = objInfo('WithLiteral', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'status', type: 'literal', isRequired: true, literalInfo: statusLitInfo }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe("{ name: string, status: 'active' | 'inactive' }");
    });

    test('should generate inline object with optional literal sub-field', () => {
      const statusLitInfo = litInfo('Status', [
        { kind: 'string', value: 'active' },
        { kind: 'string', value: 'inactive' },
      ]);
      const info = objInfo('OptLiteral', [
        field({ name: 'status', type: 'literal', isRequired: false, literalInfo: statusLitInfo }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe("{ status: option<'active' | 'inactive'> }");
    });

    test('should generate inline object with array field', () => {
      const info = objInfo('WithArray', [
        field({ name: 'name', type: 'string', isRequired: true }),
        field({ name: 'tags', type: 'string', isRequired: true, isArray: true }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ name: string, tags: array<string> }');
    });

    test('should generate inline object with array literal sub-field', () => {
      const statusLitInfo = litInfo('Status', [
        { kind: 'string', value: 'active' },
        { kind: 'string', value: 'inactive' },
      ]);
      const info = objInfo('WithLitArr', [
        field({ name: 'statuses', type: 'literal', isRequired: true, isArray: true, literalInfo: statusLitInfo }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe("{ statuses: array<'active' | 'inactive'> }");
    });

    test('should generate inline object with mixed field modifiers', () => {
      const info = objInfo('Mixed', [
        field({ name: 'label', type: 'string', isRequired: true }),
        field({ name: 'count', type: 'int', isRequired: false }),
        field({ name: 'tag', type: 'string', isRequired: false, isNullable: true }),
      ]);
      const result = generateObjectSurrealTypeLiteral(info);
      expect(result).toBe('{ label: string, count: option<int>, tag: option<string | null> }');
    });
  });

  describe('generateLiteralSurrealType with object variants', () => {
    test('should generate string | inline object union', () => {
      const info = litInfo('WithObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [
            field({ name: 'label', type: 'string', isRequired: true }),
            field({ name: 'val', type: 'int', isRequired: true }),
          ]),
        },
      ]);
      const result = generateLiteralSurrealType(info);
      expect(result).toBe("'empty' | { label: string, val: int }");
    });

    test('should generate union with both tuple and inline object', () => {
      const tupleInfo = ti('Coord', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);
      const info = litInfo('WithBoth', [
        { kind: 'string', value: 'none' },
        { kind: 'string', value: 'empty' },
        { kind: 'tupleRef', tupleName: 'Coord', tupleInfo },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [
            field({ name: 'label', type: 'string', isRequired: true }),
            field({ name: 'val', type: 'int', isRequired: true }),
          ]),
        },
      ]);
      const result = generateLiteralSurrealType(info);
      expect(result).toBe("'none' | 'empty' | [float, float] | { label: string, val: int }");
    });

    test('should generate union with object having optional/nullable fields', () => {
      const info = litInfo('WithOptObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'PointOpt',
          objectInfo: objInfo('PointOpt', [
            field({ name: 'label', type: 'string', isRequired: true }),
            field({ name: 'count', type: 'int', isRequired: false }),
            field({ name: 'tag', type: 'string', isRequired: false, isNullable: true }),
          ]),
        },
      ]);
      const result = generateLiteralSurrealType(info);
      expect(result).toBe("'empty' | { label: string, count: option<int>, tag: option<string | null> }");
    });

    test('should generate union with number and object variants', () => {
      const info = litInfo('NumOrObj', [
        { kind: 'int', value: 0 },
        {
          kind: 'objectRef',
          objectName: 'Data',
          objectInfo: objInfo('Data', [field({ name: 'msg', type: 'string', isRequired: true })]),
        },
      ]);
      const result = generateLiteralSurrealType(info);
      expect(result).toBe('0 | { msg: string }');
    });

    test('should generate union with broad type and object variant', () => {
      const info = litInfo('BroadOrObj', [
        { kind: 'broadType', typeName: 'String' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [
            field({ name: 'x', type: 'float', isRequired: true }),
            field({ name: 'y', type: 'float', isRequired: true }),
          ]),
        },
      ]);
      const result = generateLiteralSurrealType(info);
      expect(result).toBe('string | { x: float, y: float }');
    });
  });

  describe('generateTypeClause for literal fields with object variants', () => {
    test('should generate TYPE for required literal with object variant', () => {
      const litField = litInfo('WithObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [field({ name: 'x', type: 'float', isRequired: true })]),
        },
      ]);
      const f = field({ name: 'payload', type: 'literal', isRequired: true, literalInfo: litField });
      const result = generateTypeClause('literal', true, f);
      expect(result).toBe("TYPE 'empty' | { x: float }");
    });

    test('should generate TYPE option<> for optional literal with object variant', () => {
      const litField = litInfo('WithObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [field({ name: 'x', type: 'float', isRequired: true })]),
        },
      ]);
      const f = field({ name: 'payload', type: 'literal', isRequired: false, literalInfo: litField });
      const result = generateTypeClause('literal', false, f);
      expect(result).toBe("TYPE option<'empty' | { x: float }>");
    });

    test('should generate TYPE array<> for array literal with object variant', () => {
      const litField = litInfo('WithObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [field({ name: 'x', type: 'float', isRequired: true })]),
        },
      ]);
      const f = field({ name: 'payloads', type: 'literal', isRequired: true, isArray: true, literalInfo: litField });
      const result = generateTypeClause('literal', true, f);
      expect(result).toBe("TYPE array<'empty' | { x: float }>");
    });
  });

  describe('generateModelDefineStatements with literal fields', () => {
    test('should generate DEFINE FIELD with inline object type for literal', () => {
      const litField = litInfo('WithObj', [
        { kind: 'string', value: 'empty' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [
            field({ name: 'label', type: 'string', isRequired: true }),
            field({ name: 'val', type: 'int', isRequired: true }),
          ]),
        },
      ]);
      const m = mdl('Test', 'test', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'payload', type: 'literal', isRequired: true, literalInfo: litField }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry);

      expect(stmts.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      const payloadStmt = stmts.find((s) => s.includes('payload'));
      expect(payloadStmt).toBeDefined();
      expect(payloadStmt).toContain("'empty' | { label: string, val: int }");
      // No sub-field DEFINE statements for literal object variants
      expect(stmts.some((s) => s.includes('payload.label'))).toBe(false);
      expect(stmts.some((s) => s.includes('payload.val'))).toBe(false);
    });

    test('should not emit sub-field DEFINE for literal fields', () => {
      const litField = litInfo('WithObj', [
        { kind: 'string', value: 'none' },
        {
          kind: 'objectRef',
          objectName: 'Point',
          objectInfo: objInfo('Point', [
            field({ name: 'x', type: 'float', isRequired: true }),
            field({ name: 'y', type: 'float', isRequired: true }),
          ]),
        },
      ]);
      const m = mdl('Test', 'test', [
        field({ name: 'id', type: 'record', isId: true, isRequired: true }),
        field({ name: 'data', type: 'literal', isRequired: true, literalInfo: litField }),
        field({ name: 'optData', type: 'literal', isRequired: false, literalInfo: litField }),
      ]);

      const stmts = generateModelDefineStatements(m, undefined, undefined, emptyObjRegistry, emptyTupleRegistry);

      // Only table + 2 field definitions (data, optData) — @id field is skipped
      // No sub-field defines like data.x, data.y, optData.x, optData.y
      expect(stmts.filter((s) => s.includes('DEFINE FIELD')).length).toBe(2);
    });
  });
});
