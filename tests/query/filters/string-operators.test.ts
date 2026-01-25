/**
 * String operators tests
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile';
import { handleContains, handleEndsWith, handleStartsWith } from '../../../src/query/filters/string-operators';
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

    expect(result.text).toContain('string::contains');
    expect(result.text).toContain('name');
    // Value should be the search string, not a regex pattern
    expect(Object.values(result.vars)[0]).toBe('John');
  });

  test('handleStartsWith generates startsWith condition', () => {
    const ctx = createCompileContext();
    const result = handleStartsWith(ctx, 'name', 'John', stringField);

    expect(result.text).toContain('string::starts_with');
    expect(result.text).toContain('name');
    // Value should be the search string, not a regex pattern
    const value = Object.values(result.vars)[0] as string;
    expect(value).toBe('John');
  });

  test('handleEndsWith generates endsWith condition', () => {
    const ctx = createCompileContext();
    const result = handleEndsWith(ctx, 'name', 'son', stringField);

    expect(result.text).toContain('string::ends_with');
    expect(result.text).toContain('name');
    // Value should be the search string, not a regex pattern
    const value = Object.values(result.vars)[0] as string;
    expect(value).toBe('son');
  });
});
