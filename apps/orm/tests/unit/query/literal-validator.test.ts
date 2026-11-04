/**
 * Unit Tests: Literal / enum value validation
 *
 * A literal or enum field value must match one of the declared variants.
 */

import { describe, expect, test } from 'bun:test';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';
import type { FieldMetadata, ModelMetadata, ResolvedLiteralVariant } from '../../../src/types';

function literalField(
  name: string,
  variants: ResolvedLiteralVariant[],
  overrides: Partial<FieldMetadata> = {},
  isEnum = false,
): FieldMetadata {
  return {
    name,
    type: 'literal',
    isId: false,
    isUnique: false,
    isRequired: true,
    literalInfo: { literalName: `${name}Literal`, variants, isEnum },
    ...overrides,
  };
}

const box = {
  objectName: 'Box',
  fields: [{ name: 'a', type: 'int' as const, isId: false, isUnique: false, isRequired: false }],
};
const pair = {
  tupleName: 'Pair',
  elements: [
    { name: 'a', index: 0, type: 'int' as const, isOptional: false },
    { index: 1, type: 'int' as const, isOptional: true },
  ],
};

const str = (value: string): ResolvedLiteralVariant => ({ kind: 'string', value });

const testModel: ModelMetadata = {
  name: 'Item',
  tableName: 'item',
  fields: [
    { name: 'id', type: 'record', isId: true, isUnique: false, isRequired: false },
    literalField('status', [str('active'), str('archived')], {}, true),
    literalField('statuses', [str('active'), str('archived')], { isArray: true }, true),
    literalField('optStatus', [str('active')], { isRequired: false, isNullable: true }, true),
    literalField('rank', [
      { kind: 'int', value: 1 },
      { kind: 'int', value: 2 },
    ]),
    literalField('ratio', [{ kind: 'float', value: 1.5 }]),
    literalField('flag', [{ kind: 'bool', value: true }]),
    literalField('broad', [
      { kind: 'broadType', typeName: 'String' },
      { kind: 'broadType', typeName: 'Int' },
    ]),
    literalField('mixed', [str('low'), { kind: 'int', value: 2 }, { kind: 'broadType', typeName: 'Bool' }]),
    literalField('shape', [
      { kind: 'objectRef', objectName: 'Box', objectInfo: box },
      { kind: 'tupleRef', tupleName: 'Pair', tupleInfo: pair },
    ]),
    literalField('objOnly', [{ kind: 'objectRef', objectName: 'Box', objectInfo: box }]),
    literalField('tupOnly', [{ kind: 'tupleRef', tupleName: 'Pair', tupleInfo: pair }]),
  ],
};

const base = {
  status: 'active',
  statuses: ['active'],
  rank: 1,
  ratio: 1.5,
  flag: true,
  broad: 'x',
  mixed: 'low',
  shape: {},
  objOnly: {},
  tupOnly: [1, 2],
};

function createErrors(overrides: Record<string, unknown>): string[] {
  return validateCreateData({ ...base, ...overrides }, testModel).errors.map((e) => e.message);
}

describe('Literal value validation', () => {
  test('accepts a fully valid payload', () => {
    expect(validateCreateData(base, testModel).valid).toBe(true);
  });

  test('accepts each permitted enum value', () => {
    expect(createErrors({ status: 'archived' })).toEqual([]);
  });

  test('rejects an unpermitted enum value and lists the permitted values', () => {
    expect(createErrors({ status: 'actve' })).toEqual([
      "status must be one of: 'active', 'archived' (received 'actve')",
    ]);
  });

  test('is case sensitive', () => {
    expect(createErrors({ status: 'Active' })).toEqual([
      "status must be one of: 'active', 'archived' (received 'Active')",
    ]);
  });

  test('rejects an empty string', () => {
    expect(createErrors({ status: '' })).toHaveLength(1);
  });

  test('rejects a number for a string-only literal', () => {
    expect(createErrors({ status: 42 })).toEqual(["status must be one of: 'active', 'archived' (received 42)"]);
  });

  test('rejects a boolean for a string-only literal', () => {
    expect(createErrors({ status: true })).toHaveLength(1);
  });

  test('update path rejects an unpermitted value', () => {
    const result = validateUpdateData({ status: 'gone' }, testModel);
    expect(result.errors.map((e) => e.message)).toEqual([
      "status must be one of: 'active', 'archived' (received 'gone')",
    ]);
  });

  test('update path accepts a permitted value', () => {
    expect(validateUpdateData({ status: 'archived' }, testModel).valid).toBe(true);
  });

  test('numeric int variant accepts a matching value and rejects others', () => {
    expect(createErrors({ rank: 2 })).toEqual([]);
    expect(createErrors({ rank: 3 })).toEqual(['rank must be one of: 1, 2 (received 3)']);
  });

  test('numeric variant matches an equal float value (1.0 is 1)', () => {
    expect(createErrors({ rank: 1.0 })).toEqual([]);
  });

  test('int variant rejects a non-integral float', () => {
    expect(createErrors({ rank: 1.5 })).toHaveLength(1);
  });

  test('float variant accepts its value and rejects another', () => {
    expect(createErrors({ ratio: 1.5 })).toEqual([]);
    expect(createErrors({ ratio: 2.5 })).toHaveLength(1);
  });

  test('numeric string is not a numeric literal', () => {
    expect(createErrors({ rank: '1' })).toHaveLength(1);
  });

  test('bool variant accepts true and rejects false and strings', () => {
    expect(createErrors({ flag: true })).toEqual([]);
    expect(createErrors({ flag: false })).toEqual(['flag must be one of: true (received false)']);
    expect(createErrors({ flag: 'true' })).toHaveLength(1);
  });

  test('broadType variants accept any value of that type', () => {
    expect(createErrors({ broad: 'anything' })).toEqual([]);
    expect(createErrors({ broad: 7 })).toEqual([]);
  });

  test('broadType variants reject another type and name the broad types', () => {
    expect(createErrors({ broad: true })).toEqual(['broad must be one of: String, Int (received true)']);
    expect(createErrors({ broad: 1.5 })).toHaveLength(1);
  });

  test('mixed literal accepts exact and broad matches', () => {
    expect(createErrors({ mixed: 'low' })).toEqual([]);
    expect(createErrors({ mixed: 2 })).toEqual([]);
    expect(createErrors({ mixed: false })).toEqual([]);
  });

  test('mixed literal rejects values matching neither', () => {
    expect(createErrors({ mixed: 'high' })).toEqual(["mixed must be one of: 'low', 2, Bool (received 'high')"]);
    expect(createErrors({ mixed: 3 })).toHaveLength(1);
  });

  test('objectRef variant accepts an object, tupleRef accepts an array', () => {
    expect(createErrors({ shape: { a: 1 } })).toEqual([]);
    expect(createErrors({ shape: [1, 2] })).toEqual([]);
    expect(createErrors({ objOnly: { a: 1 } })).toEqual([]);
    expect(createErrors({ tupOnly: [1] })).toEqual([]);
  });

  test('tupleRef variant accepts the object form of a tuple', () => {
    expect(createErrors({ tupOnly: { a: 1 } })).toEqual([]);
    expect(createErrors({ tupOnly: { z: 1 } })).toHaveLength(1);
  });

  test('ref variants reject the wrong container and primitives', () => {
    expect(createErrors({ objOnly: [1] })).toHaveLength(1);
    expect(createErrors({ tupOnly: 'x' })).toHaveLength(1);
    expect(createErrors({ tupOnly: 5 })).toHaveLength(1);
    expect(createErrors({ objOnly: null })).toEqual(['objOnly is required']);
    expect(createErrors({ shape: 'x' })).toEqual(["shape must be one of: Box, Pair (received 'x')"]);
  });

  test('array literal accepts valid elements', () => {
    expect(createErrors({ statuses: ['active', 'archived'] })).toEqual([]);
    expect(createErrors({ statuses: [] })).toEqual([]);
  });

  test('array literal names the index of the bad element', () => {
    expect(createErrors({ statuses: ['active', 'archived', 'nope'] })).toEqual([
      "statuses[2] must be one of: 'active', 'archived' (received 'nope')",
    ]);
  });

  test('array literal reports the first bad element', () => {
    expect(createErrors({ statuses: ['bad', 'worse'] })).toEqual([
      "statuses[0] must be one of: 'active', 'archived' (received 'bad')",
    ]);
  });

  test('array literal update path names the index', () => {
    const result = validateUpdateData({ statuses: ['active', 'bad'] }, testModel);
    expect(result.errors[0]!.message).toContain('statuses[1] must be one of');
  });

  test('null on a nullable optional literal is still accepted', () => {
    expect(createErrors({ optStatus: null })).toEqual([]);
  });

  test('absent optional literal is still accepted', () => {
    expect(createErrors({ optStatus: undefined })).toEqual([]);
  });

  test('optional literal with a value is checked', () => {
    expect(createErrors({ optStatus: 'archived' })).toEqual([
      "optStatus must be one of: 'active' (received 'archived')",
    ]);
  });

  test('null on a required non-nullable literal keeps its existing message', () => {
    expect(createErrors({ status: null })).toEqual(['status is required']);
  });

  test('error carries the field name', () => {
    const result = validateCreateData({ ...base, status: 'x' }, testModel);
    expect(result.errors[0]!.field).toBe('status');
  });
});
