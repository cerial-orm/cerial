/**
 * Unit Tests: Readonly Data Validator
 *
 * Tests runtime validation that @readonly fields are rejected in update data.
 */

import { describe, expect, test } from 'bun:test';
import { validateUpdateData } from '../../../src/query/validators/data-validator';
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

describe('Readonly Data Validator', () => {
  const testModel = model('User', [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string' }),
    field({ name: 'code', type: 'string', isReadonly: true }),
    field({ name: 'score', type: 'int', isRequired: false, isReadonly: true }),
    field({ name: 'email', type: 'email' }),
  ]);

  test('should reject update data containing a readonly field', () => {
    const result = validateUpdateData({ code: 'new-code', name: 'Alice' }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot update readonly field 'code'");
  });

  test('should reject update data containing an optional readonly field', () => {
    const result = validateUpdateData({ score: 99 }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot update readonly field 'score'");
  });

  test('should reject update data with null for readonly field', () => {
    const result = validateUpdateData({ score: null }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Cannot update readonly field 'score'");
  });

  test('should reject multiple readonly fields in update data', () => {
    const result = validateUpdateData({ code: 'x', score: 1 }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.message.includes("'code'"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("'score'"))).toBe(true);
  });

  test('should allow update data with only non-readonly fields', () => {
    const result = validateUpdateData({ name: 'Bob', email: 'bob@example.com' }, testModel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should allow empty update data', () => {
    const result = validateUpdateData({}, testModel);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should skip undefined values for readonly fields', () => {
    const result = validateUpdateData({ code: undefined, name: 'Bob' }, testModel);
    expect(result.valid).toBe(true);
  });

  test('should still validate types on non-readonly fields', () => {
    const result = validateUpdateData({ name: 123 as any }, testModel);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('must be of type string');
  });
});
