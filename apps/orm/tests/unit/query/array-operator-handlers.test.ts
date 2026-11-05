/**
 * Unit Tests: array field operator handlers
 *
 * isEmpty compiles to the method form because SurrealDB 4.0 refuses array::len() on a set.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { handleHas, handleHasAll, handleHasAny, handleIsEmpty } from '../../../src/query/filters/array-operators';
import type { FieldMetadata } from '../../../src/types';

const field: FieldMetadata = {
  name: 'tags',
  type: 'string',
  isId: false,
  isUnique: false,
  isRequired: true,
  isArray: true,
};

describe('array operator handlers', () => {
  test('isEmpty: true uses the method form, no variables', () => {
    const result = handleIsEmpty(createCompileContext(), 'tags', true, field);
    expect(result).toEqual({ text: 'tags.len() = 0', vars: {} });
  });

  test('isEmpty: false uses the method form, no variables', () => {
    const result = handleIsEmpty(createCompileContext(), 'tags', false, field);
    expect(result).toEqual({ text: 'tags.len() > 0', vars: {} });
  });

  test('isEmpty never emits array::len', () => {
    for (const flag of [true, false]) {
      expect(handleIsEmpty(createCompileContext(), 'o.tags', flag, field).text).not.toContain('array::len');
    }
  });

  test('isEmpty keeps nested paths intact', () => {
    expect(handleIsEmpty(createCompileContext(), 'o.tags', true, field).text).toBe('o.tags.len() = 0');
  });

  test('has, hasAll and hasAny keep the CONTAINS forms and bind their value', () => {
    const has = handleHas(createCompileContext(), 'tags', 'a', field);
    expect(has.text).toMatch(/^tags CONTAINS \$\w+$/);
    expect(Object.values(has.vars)).toEqual(['a']);

    const all = handleHasAll(createCompileContext(), 'tags', ['a', 'b'], field);
    expect(all.text).toMatch(/^tags CONTAINSALL \$\w+$/);
    expect(Object.values(all.vars)).toEqual([['a', 'b']]);

    const any = handleHasAny(createCompileContext(), 'tags', ['a'], field);
    expect(any.text).toMatch(/^tags CONTAINSANY \$\w+$/);
    expect(Object.values(any.vars)).toEqual([['a']]);
  });
});
