/**
 * Unit tests for unset validator functions
 *
 * Tests validateUnset and validateDataUnsetOverlap for runtime validation
 * of unset parameters in update/upsert operations.
 */

import { describe, expect, test } from 'bun:test';
import { validateUnset, validateDataUnsetOverlap } from '../../../src/query/validators/data-validator';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

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

function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

// ============================================================================
// validateUnset
// ============================================================================

describe('validateUnset', () => {
  const testModel = model('User', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string' }),
    field({ name: 'bio', type: 'string', isRequired: false }),
    field({ name: 'age', type: 'int', isRequired: false }),
    field({ name: 'code', type: 'string', isReadonly: true }),
    field({ name: 'email', type: 'email', isRequired: false }),
    field({ name: 'postId', type: 'record', isRequired: false }),
    field({ name: 'posts', type: 'relation', isRequired: false }),
    field({ name: 'stamp', type: 'date', timestampDecorator: 'now' as const }),
  ]);

  test('valid unset of optional field', () => {
    const result = validateUnset({ bio: true }, testModel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('valid unset of multiple optional fields', () => {
    const result = validateUnset({ bio: true, age: true, email: true }, testModel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects unset of required field', () => {
    const result = validateUnset({ name: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot unset required field 'name'");
  });

  test('rejects unset of id field', () => {
    const result = validateUnset({ id: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot unset id field 'id'");
  });

  test('rejects unset of readonly field', () => {
    const result = validateUnset({ code: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot unset readonly field 'code'");
  });

  test('rejects unset of relation field', () => {
    const result = validateUnset({ posts: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot unset relation field 'posts'");
  });

  test('rejects unset of @now computed field', () => {
    const result = validateUnset({ stamp: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot unset computed field 'stamp'");
  });

  test('rejects unknown field', () => {
    const result = validateUnset({ nonExistent: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Unknown field 'nonExistent'");
  });

  test('collects multiple errors', () => {
    const result = validateUnset({ id: true, code: true, posts: true, nonExistent: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  test('allows empty unset', () => {
    const result = validateUnset({}, testModel);
    expect(result.valid).toBe(true);
  });

  test('skips undefined values', () => {
    const result = validateUnset({ bio: undefined, age: true }, testModel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('allows object value for sub-field unset', () => {
    const modelWithObj = model('Profile', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'address', type: 'object', isRequired: false }),
    ]);
    const result = validateUnset({ address: { zip: true } }, modelWithObj);
    expect(result.valid).toBe(true);
  });

  test('rejects invalid unset value (not true or object)', () => {
    const result = validateUnset({ bio: 'invalid' as unknown as true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('expected true or sub-field object');
  });

  test('rejects numeric unset value', () => {
    const result = validateUnset({ bio: 42 as unknown as true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('expected true or sub-field object');
  });

  test('valid unset of optional record field', () => {
    const result = validateUnset({ postId: true }, testModel);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// validateDataUnsetOverlap
// ============================================================================

describe('validateDataUnsetOverlap', () => {
  const testModel = model('User', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string' }),
    field({ name: 'bio', type: 'string', isRequired: false }),
    field({ name: 'age', type: 'int', isRequired: false }),
    field({ name: 'address', type: 'object', isRequired: false }),
  ]);

  test('no overlap — fields in unset not in data', () => {
    const result = validateDataUnsetOverlap({ name: 'Alice' }, { bio: true }, testModel);
    expect(result.valid).toBe(true);
  });

  test('no overlap — empty data', () => {
    const result = validateDataUnsetOverlap({}, { bio: true }, testModel);
    expect(result.valid).toBe(true);
  });

  test('no overlap — empty unset', () => {
    const result = validateDataUnsetOverlap({ name: 'Alice' }, {}, testModel);
    expect(result.valid).toBe(true);
  });

  test('leaf conflict — same field in data and unset', () => {
    const result = validateDataUnsetOverlap({ bio: 'hello' }, { bio: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Field 'bio' appears in both data and unset");
  });

  test('multiple leaf conflicts', () => {
    const result = validateDataUnsetOverlap({ bio: 'hello', age: 30 }, { bio: true, age: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  test('no conflict when data value is undefined', () => {
    const result = validateDataUnsetOverlap({ bio: undefined }, { bio: true }, testModel);
    expect(result.valid).toBe(true);
  });

  test('no conflict when unset value is undefined', () => {
    const result = validateDataUnsetOverlap({ bio: 'hello' }, { bio: undefined }, testModel);
    expect(result.valid).toBe(true);
  });

  test('deep overlap — sub-field conflict', () => {
    const result = validateDataUnsetOverlap({ address: { zip: '10001' } }, { address: { zip: true } }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Field 'address.zip' appears in both data and unset");
  });

  test('no deep conflict — different sub-fields', () => {
    const result = validateDataUnsetOverlap({ address: { city: 'NYC' } }, { address: { zip: true } }, testModel);
    expect(result.valid).toBe(true);
  });

  test('no deep conflict — data has non-object at field', () => {
    // data has a string, unset has sub-field — not a conflict (types prevent this in practice)
    const result = validateDataUnsetOverlap({ address: 'just a string' }, { address: { zip: true } }, testModel);
    expect(result.valid).toBe(true);
  });

  test('no deep conflict — data has array at field', () => {
    const result = validateDataUnsetOverlap({ address: ['a', 'b'] }, { address: { zip: true } }, testModel);
    expect(result.valid).toBe(true);
  });

  test('deep nested conflict', () => {
    const result = validateDataUnsetOverlap(
      { address: { inner: { deep: 'value' } } },
      { address: { inner: { deep: true } } },
      testModel,
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('address.inner.deep');
  });

  test('no conflict for non-overlapping deep paths', () => {
    const result = validateDataUnsetOverlap(
      { address: { inner: { a: 'value' } } },
      { address: { inner: { b: true } } },
      testModel,
    );
    expect(result.valid).toBe(true);
  });

  test('conflict when data has true and unset has true for same field', () => {
    const result = validateDataUnsetOverlap({ bio: true as any }, { bio: true }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain("Field 'bio' appears in both data and unset");
  });

  test('conflict at 3 levels deep', () => {
    const result = validateDataUnsetOverlap(
      { address: { level1: { level2: { level3: 'val' } } } },
      { address: { level1: { level2: { level3: true } } } },
      testModel,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('address.level1.level2.level3');
  });

  test('mixed conflicts and non-conflicts in same unset', () => {
    const result = validateDataUnsetOverlap(
      { bio: 'hello', address: { city: 'NYC' } },
      { bio: true, age: true, address: { zip: true } },
      testModel,
    );
    // bio conflicts, age doesn't (not in data), address.zip doesn't conflict with address.city
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Field 'bio'");
  });
});

// ============================================================================
// validateUnset — additional edge cases
// ============================================================================

describe('validateUnset edge cases', () => {
  test('rejects unset of required array field', () => {
    const m = model('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'tags', type: 'string', isArray: true }),
    ]);
    const result = validateUnset({ tags: true }, m);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('required');
  });

  test('allows unset of optional array field', () => {
    const m = model('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'tags', type: 'string', isArray: true, isRequired: false }),
    ]);
    const result = validateUnset({ tags: true }, m);
    expect(result.valid).toBe(true);
  });

  test('allows unset of optional nullable field', () => {
    const m = model('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'bio', type: 'string', isRequired: false, isNullable: true }),
    ]);
    const result = validateUnset({ bio: true }, m);
    expect(result.valid).toBe(true);
  });

  test('rejects unset of required nullable field', () => {
    const m = model('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'deletedAt', type: 'date', isRequired: true, isNullable: true }),
    ]);
    const result = validateUnset({ deletedAt: true }, m);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('required');
  });
});
