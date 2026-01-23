/**
 * String operators tests
 */

import { test, expect, describe } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile';
import { handleContains, handleStartsWith, handleEndsWith } from '../../../src/query/filters/string-operators';
import type { FieldMetadata } from '../../../src/types';

const stringField: FieldMetadata = {
  name: 'name',
  type: 'string',
  isId: false,
  isUnique: false,
  hasNowDefault: false,
  isRequired: true,
};

// Note: @id and @unique are separate decorators
// isId: true - marks the SurrealDB record id field
// isUnique: true - marks a field that must be unique (separate from id)

describe('string operators', () => {
  test('handleContains generates contains condition', () => {
    const ctx = createCompileContext();
    const result = handleContains(ctx, 'name', 'John', stringField);

    expect(result.text).toContain('~');
    expect(result.text).toContain('name');
    // Value should be a regex pattern
    expect(Object.values(result.vars)[0]).toContain('John');
  });

  test('handleStartsWith generates startsWith condition', () => {
    const ctx = createCompileContext();
    const result = handleStartsWith(ctx, 'name', 'John', stringField);

    expect(result.text).toContain('~');
    expect(result.text).toContain('name');
    // Value should be a regex pattern starting with ^
    const value = Object.values(result.vars)[0] as string;
    expect(value.startsWith('^')).toBe(true);
  });

  test('handleEndsWith generates endsWith condition', () => {
    const ctx = createCompileContext();
    const result = handleEndsWith(ctx, 'name', 'son', stringField);

    expect(result.text).toContain('~');
    expect(result.text).toContain('name');
    // Value should be a regex pattern ending with $
    const value = Object.values(result.vars)[0] as string;
    expect(value.endsWith('$')).toBe(true);
  });
});
