/**
 * Unit Tests: Resolver Filter Functions
 *
 * Tests pick/omit filtering for all type kinds:
 * - applyFieldFilter (models/objects)
 * - applyElementFilter (tuples)
 * - applyValueFilter (enums)
 * - applyVariantFilter (literals)
 */

import { describe, expect, test } from 'bun:test';
import { applyElementFilter, applyFieldFilter, applyValueFilter, applyVariantFilter } from '../../../src/resolver';
import type { ASTField, ASTLiteralVariant, ASTTupleElement, ExtendsFilter } from '../../../src/types';

// ──────────────────────────────────────────────
// Helpers: create minimal AST nodes for testing
// ──────────────────────────────────────────────

const dummyRange = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

function makeField(name: string, opts?: Partial<ASTField>): ASTField {
  return {
    name,
    type: 'string',
    isOptional: false,
    decorators: [],
    range: dummyRange,
    ...opts,
  };
}

function makeElement(type: string, opts?: Partial<ASTTupleElement>): ASTTupleElement {
  return {
    type: type as ASTTupleElement['type'],
    isOptional: false,
    ...opts,
  };
}

const pick = (fields: string[]): ExtendsFilter => ({ mode: 'pick', fields });
const omit = (fields: string[]): ExtendsFilter => ({ mode: 'omit', fields });

// ──────────────────────────────────────────────
// A. applyFieldFilter
// ──────────────────────────────────────────────
describe('applyFieldFilter', () => {
  const fields = [
    makeField('id'),
    makeField('name'),
    makeField('email'),
    makeField('age', { isOptional: true }),
    makeField('secret', { isPrivate: true }),
  ];

  // --- Pick mode ---
  describe('pick mode', () => {
    test('should return only picked fields', () => {
      const result = applyFieldFilter(fields, pick(['id', 'name']), 'User');

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toEqual(['id', 'name']);
    });

    test('should preserve field properties', () => {
      const result = applyFieldFilter(fields, pick(['age']), 'User');

      expect(result[0]!.isOptional).toBe(true);
      expect(result[0]!.name).toBe('age');
    });

    test('should allow picking private fields', () => {
      const result = applyFieldFilter(fields, pick(['secret']), 'User');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('secret');
    });

    test('should pick all fields when all names listed', () => {
      const result = applyFieldFilter(fields, pick(['id', 'name', 'email', 'age', 'secret']), 'User');

      expect(result).toHaveLength(5);
    });

    test('should return empty array for empty pick list', () => {
      const result = applyFieldFilter(fields, pick([]), 'User');

      expect(result).toHaveLength(0);
    });

    test('should throw on nonexistent field in pick', () => {
      expect(() => applyFieldFilter(fields, pick(['id', 'nonexistent']), 'User')).toThrow(/nonexistent.*User/);
    });

    test('should preserve original order from parent', () => {
      const result = applyFieldFilter(fields, pick(['email', 'id']), 'User');

      expect(result.map((f) => f.name)).toEqual(['id', 'email']);
    });

    test('should not mutate original array', () => {
      const original = [...fields];
      applyFieldFilter(fields, pick(['id']), 'User');

      expect(fields).toEqual(original);
    });
  });

  // --- Omit mode ---
  describe('omit mode', () => {
    test('should return all fields except omitted', () => {
      const result = applyFieldFilter(fields, omit(['email', 'age']), 'User');

      expect(result).toHaveLength(3);
      expect(result.map((f) => f.name)).toEqual(['id', 'name', 'secret']);
    });

    test('should allow omitting private fields', () => {
      const result = applyFieldFilter(fields, omit(['secret']), 'User');

      expect(result).toHaveLength(4);
      expect(result.map((f) => f.name)).not.toContain('secret');
    });

    test('should return all fields for empty omit list', () => {
      const result = applyFieldFilter(fields, omit([]), 'User');

      expect(result).toHaveLength(5);
    });

    test('should return empty array when all fields omitted', () => {
      const result = applyFieldFilter(fields, omit(['id', 'name', 'email', 'age', 'secret']), 'User');

      expect(result).toHaveLength(0);
    });

    test('should throw on nonexistent field in omit', () => {
      expect(() => applyFieldFilter(fields, omit(['missing']), 'User')).toThrow(/missing.*User/);
    });

    test('should not mutate original array', () => {
      const original = [...fields];
      applyFieldFilter(fields, omit(['id']), 'User');

      expect(fields).toEqual(original);
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    test('should handle empty parent fields array with pick', () => {
      const result = applyFieldFilter([], pick([]), 'Empty');

      expect(result).toHaveLength(0);
    });

    test('should handle empty parent fields array with omit', () => {
      const result = applyFieldFilter([], omit([]), 'Empty');

      expect(result).toHaveLength(0);
    });

    test('should throw when picking from empty parent', () => {
      expect(() => applyFieldFilter([], pick(['id']), 'Empty')).toThrow(/id.*Empty/);
    });
  });
});

// ──────────────────────────────────────────────
// B. applyElementFilter
// ──────────────────────────────────────────────
describe('applyElementFilter', () => {
  const namedElements: ASTTupleElement[] = [
    makeElement('float', { name: 'x' }),
    makeElement('float', { name: 'y' }),
    makeElement('float', { name: 'z' }),
  ];

  const unnamedElements: ASTTupleElement[] = [makeElement('string'), makeElement('int'), makeElement('bool')];

  const mixedElements: ASTTupleElement[] = [
    makeElement('string', { name: 'label' }),
    makeElement('int'),
    makeElement('float', { name: 'value' }),
  ];

  // --- Named elements ---
  describe('named elements - pick', () => {
    test('should pick by name', () => {
      const result = applyElementFilter(namedElements, pick(['x', 'z']), 'Coord');

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('x');
      expect(result[1]!.name).toBe('z');
    });

    test('should preserve original order', () => {
      const result = applyElementFilter(namedElements, pick(['z', 'x']), 'Coord');

      expect(result[0]!.name).toBe('x');
      expect(result[1]!.name).toBe('z');
    });

    test('should throw on nonexistent name', () => {
      expect(() => applyElementFilter(namedElements, pick(['w']), 'Coord')).toThrow(/w.*Coord/);
    });
  });

  describe('named elements - omit', () => {
    test('should omit by name', () => {
      const result = applyElementFilter(namedElements, omit(['y']), 'Coord');

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.name)).toEqual(['x', 'z']);
    });
  });

  // --- Unnamed elements (index-based) ---
  describe('unnamed elements - pick by index', () => {
    test('should pick by string index', () => {
      const result = applyElementFilter(unnamedElements, pick(['0', '2']), 'MyTuple');

      expect(result).toHaveLength(2);
      expect(result[0]!.type).toBe('string');
      expect(result[1]!.type).toBe('bool');
    });

    test('should throw on out-of-bounds index', () => {
      expect(() => applyElementFilter(unnamedElements, pick(['5']), 'MyTuple')).toThrow(/5.*MyTuple/);
    });

    test('should throw on negative index', () => {
      expect(() => applyElementFilter(unnamedElements, pick(['-1']), 'MyTuple')).toThrow(/-1.*MyTuple/);
    });
  });

  describe('unnamed elements - omit by index', () => {
    test('should omit by string index', () => {
      const result = applyElementFilter(unnamedElements, omit(['1']), 'MyTuple');

      expect(result).toHaveLength(2);
      expect(result[0]!.type).toBe('string');
      expect(result[1]!.type).toBe('bool');
    });
  });

  // --- Mixed elements (some named, some indexed) ---
  describe('mixed elements', () => {
    test('should pick by name and index', () => {
      const result = applyElementFilter(mixedElements, pick(['label', '1']), 'Mixed');

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('label');
      expect(result[1]!.type).toBe('int');
    });

    test('should omit by name and index', () => {
      const result = applyElementFilter(mixedElements, omit(['label', '1']), 'Mixed');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('value');
    });

    test('should throw on nonexistent name in mixed', () => {
      expect(() => applyElementFilter(mixedElements, pick(['nonexistent']), 'Mixed')).toThrow(/nonexistent.*Mixed/);
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    test('should handle empty element list', () => {
      expect(applyElementFilter([], pick([]), 'Empty')).toHaveLength(0);
      expect(applyElementFilter([], omit([]), 'Empty')).toHaveLength(0);
    });

    test('should handle private elements', () => {
      const elements = [makeElement('string', { name: 'pub' }), makeElement('int', { name: 'priv', isPrivate: true })];
      const result = applyElementFilter(elements, omit(['priv']), 'T');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('pub');
    });

    test('should not mutate original array', () => {
      const original = [...namedElements];
      applyElementFilter(namedElements, pick(['x']), 'Coord');

      expect(namedElements).toEqual(original);
    });
  });
});

// ──────────────────────────────────────────────
// C. applyValueFilter
// ──────────────────────────────────────────────
describe('applyValueFilter', () => {
  const values = ['Admin', 'Editor', 'Viewer', 'Guest'];

  describe('pick mode', () => {
    test('should pick specified values', () => {
      const result = applyValueFilter(values, pick(['Admin', 'Viewer']), 'Role');

      expect(result).toEqual(['Admin', 'Viewer']);
    });

    test('should preserve original order', () => {
      const result = applyValueFilter(values, pick(['Viewer', 'Admin']), 'Role');

      expect(result).toEqual(['Admin', 'Viewer']);
    });

    test('should return empty for empty pick list', () => {
      expect(applyValueFilter(values, pick([]), 'Role')).toEqual([]);
    });

    test('should throw on nonexistent value', () => {
      expect(() => applyValueFilter(values, pick(['SuperAdmin']), 'Role')).toThrow(/SuperAdmin.*Role/);
    });
  });

  describe('omit mode', () => {
    test('should omit specified values', () => {
      const result = applyValueFilter(values, omit(['Guest']), 'Role');

      expect(result).toEqual(['Admin', 'Editor', 'Viewer']);
    });

    test('should return all for empty omit list', () => {
      expect(applyValueFilter(values, omit([]), 'Role')).toEqual(values);
    });

    test('should return empty when all omitted', () => {
      const result = applyValueFilter(values, omit(['Admin', 'Editor', 'Viewer', 'Guest']), 'Role');

      expect(result).toEqual([]);
    });

    test('should throw on nonexistent value', () => {
      expect(() => applyValueFilter(values, omit(['Missing']), 'Role')).toThrow(/Missing.*Role/);
    });
  });

  describe('edge cases', () => {
    test('should handle empty values array', () => {
      expect(applyValueFilter([], pick([]), 'Empty')).toEqual([]);
      expect(applyValueFilter([], omit([]), 'Empty')).toEqual([]);
    });

    test('should throw when picking from empty values', () => {
      expect(() => applyValueFilter([], pick(['X']), 'Empty')).toThrow(/X.*Empty/);
    });

    test('should not mutate original array', () => {
      const original = [...values];
      applyValueFilter(values, omit(['Admin']), 'Role');

      expect(values).toEqual(original);
    });
  });
});

// ──────────────────────────────────────────────
// D. applyVariantFilter
// ──────────────────────────────────────────────
describe('applyVariantFilter', () => {
  const variants: ASTLiteralVariant[] = [
    { kind: 'string', value: 'active' },
    { kind: 'string', value: 'inactive' },
    { kind: 'int', value: 42 },
    { kind: 'float', value: 3.14 },
    { kind: 'bool', value: true },
    { kind: 'broadType', typeName: 'Int' },
    { kind: 'objectRef', objectName: 'Address' },
    { kind: 'tupleRef', tupleName: 'Coord' },
    { kind: 'literalRef', literalName: 'Status' },
  ];

  describe('pick mode', () => {
    test('should pick string variants by quoted value', () => {
      const result = applyVariantFilter(variants, pick(["'active'"]), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'string', value: 'active' });
    });

    test('should pick int variants by numeric string', () => {
      const result = applyVariantFilter(variants, pick(['42']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'int', value: 42 });
    });

    test('should pick float variants by numeric string', () => {
      const result = applyVariantFilter(variants, pick(['3.14']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'float', value: 3.14 });
    });

    test('should pick bool variants', () => {
      const result = applyVariantFilter(variants, pick(['true']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'bool', value: true });
    });

    test('should pick broad type variants', () => {
      const result = applyVariantFilter(variants, pick(['Int']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'broadType', typeName: 'Int' });
    });

    test('should pick object ref variants', () => {
      const result = applyVariantFilter(variants, pick(['Address']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'objectRef', objectName: 'Address' });
    });

    test('should pick tuple ref variants', () => {
      const result = applyVariantFilter(variants, pick(['Coord']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'tupleRef', tupleName: 'Coord' });
    });

    test('should pick literal ref variants', () => {
      const result = applyVariantFilter(variants, pick(['Status']), 'MyLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'literalRef', literalName: 'Status' });
    });

    test('should pick multiple variants of different kinds', () => {
      const result = applyVariantFilter(variants, pick(["'active'", 'Int', 'Address']), 'MyLit');

      expect(result).toHaveLength(3);
    });

    test('should preserve original order', () => {
      const result = applyVariantFilter(variants, pick(['Address', "'active'"]), 'MyLit');

      expect(result[0]).toEqual({ kind: 'string', value: 'active' });
      expect(result[1]).toEqual({ kind: 'objectRef', objectName: 'Address' });
    });

    test('should return empty for empty pick list', () => {
      expect(applyVariantFilter(variants, pick([]), 'MyLit')).toHaveLength(0);
    });

    test('should throw on nonexistent variant', () => {
      expect(() => applyVariantFilter(variants, pick(["'missing'"]), 'MyLit')).toThrow(/'missing'.*MyLit/);
    });

    test('should throw on unquoted string that matches no variant', () => {
      expect(() => applyVariantFilter(variants, pick(['unknown']), 'MyLit')).toThrow(/unknown.*MyLit/);
    });
  });

  describe('omit mode', () => {
    test('should omit string variants by quoted value', () => {
      const result = applyVariantFilter(variants, omit(["'active'", "'inactive'"]), 'MyLit');

      expect(result).toHaveLength(7);
      expect(result.every((v) => v.kind !== 'string' || (v as { value: string }).value !== 'active')).toBe(true);
    });

    test('should omit broad type variants', () => {
      const result = applyVariantFilter(variants, omit(['Int']), 'MyLit');

      expect(result).toHaveLength(8);
      expect(result.every((v) => v.kind !== 'broadType')).toBe(true);
    });

    test('should omit ref variants', () => {
      const result = applyVariantFilter(variants, omit(['Address', 'Coord', 'Status']), 'MyLit');

      expect(result).toHaveLength(6);
    });

    test('should return all for empty omit list', () => {
      expect(applyVariantFilter(variants, omit([]), 'MyLit')).toHaveLength(9);
    });

    test('should throw on nonexistent variant in omit', () => {
      expect(() => applyVariantFilter(variants, omit(["'nope'"]), 'MyLit')).toThrow(/'nope'.*MyLit/);
    });
  });

  describe('edge cases', () => {
    test('should handle empty variants array', () => {
      expect(applyVariantFilter([], pick([]), 'Empty')).toHaveLength(0);
      expect(applyVariantFilter([], omit([]), 'Empty')).toHaveLength(0);
    });

    test('should throw when picking from empty variants', () => {
      expect(() => applyVariantFilter([], pick(["'x'"]), 'Empty')).toThrow(/'x'.*Empty/);
    });

    test('should pick false boolean variant', () => {
      const boolVariants: ASTLiteralVariant[] = [
        { kind: 'bool', value: true },
        { kind: 'bool', value: false },
      ];
      const result = applyVariantFilter(boolVariants, pick(['false']), 'BoolLit');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'bool', value: false });
    });

    test('should pick negative int variant', () => {
      const negVariants: ASTLiteralVariant[] = [
        { kind: 'int', value: -1 },
        { kind: 'int', value: 0 },
        { kind: 'int', value: 1 },
      ];
      const result = applyVariantFilter(negVariants, pick(['-1', '0']), 'NegLit');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ kind: 'int', value: -1 });
      expect(result[1]).toEqual({ kind: 'int', value: 0 });
    });

    test('should not mutate original array', () => {
      const original = [...variants];
      applyVariantFilter(variants, omit(["'active'"]), 'MyLit');

      expect(variants).toEqual(original);
    });
  });
});
