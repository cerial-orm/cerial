/**
 * Comparison operators tests
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile';
import {
  handleEq,
  handleGt,
  handleGte,
  handleLt,
  handleLte,
  handleNeq,
} from '../../../src/query/filters/comparison-operators';
import type { FieldMetadata } from '../../../src/types';

const stringField: FieldMetadata = {
  name: 'name',
  type: 'string',
  isId: false,
  isUnique: false,
  isRequired: true,
};

const intField: FieldMetadata = {
  name: 'age',
  type: 'int',
  isId: false,
  isUnique: false,
  isRequired: true,
};

// Note: @id and @unique are separate decorators
// isId: true - marks the SurrealDB record id field
// isUnique: true - marks a field that must be unique (separate from id)

describe('comparison operators', () => {
  test('handleEq generates equality condition', () => {
    const ctx = createCompileContext();
    const result = handleEq(ctx, 'name', 'John', stringField);

    expect(result.text).toContain('name =');
    expect(result.text).toContain('$');
    expect(Object.values(result.vars)[0]).toBe('John');
  });

  test('handleNeq generates not-equal condition', () => {
    const ctx = createCompileContext();
    const result = handleNeq(ctx, 'name', 'John', stringField);

    expect(result.text).toContain('name !=');
    expect(Object.values(result.vars)[0]).toBe('John');
  });

  test('handleGt generates greater-than condition', () => {
    const ctx = createCompileContext();
    const result = handleGt(ctx, 'age', 18, intField);

    expect(result.text).toContain('age >');
    expect(Object.values(result.vars)[0]).toBe(18);
  });

  test('handleGte generates greater-than-or-equal condition', () => {
    const ctx = createCompileContext();
    const result = handleGte(ctx, 'age', 18, intField);

    expect(result.text).toContain('age >=');
    expect(Object.values(result.vars)[0]).toBe(18);
  });

  test('handleLt generates less-than condition', () => {
    const ctx = createCompileContext();
    const result = handleLt(ctx, 'age', 65, intField);

    expect(result.text).toContain('age <');
    expect(Object.values(result.vars)[0]).toBe(65);
  });

  test('handleLte generates less-than-or-equal condition', () => {
    const ctx = createCompileContext();
    const result = handleLte(ctx, 'age', 65, intField);

    expect(result.text).toContain('age <=');
    expect(Object.values(result.vars)[0]).toBe(65);
  });
});
