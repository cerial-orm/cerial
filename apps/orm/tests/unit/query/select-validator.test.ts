/**
 * Unit Tests: validateSelect, validateOrderBy, validatePagination
 */

import { describe, expect, test } from 'bun:test';
import { validateOrderBy, validatePagination, validateSelect } from '../../../src/query/validators';
import { post } from './select-validation-helpers';

describe('validateSelect', () => {
  test('accepts undefined and known keys', () => {
    expect(validateSelect(undefined, post)).toEqual([]);
    expect(validateSelect({ title: true, address: true, author: true }, post)).toEqual([]);
  });

  test('accepts a @now field', () => {
    expect(validateSelect({ accessedAt: true }, post)).toEqual([]);
  });

  test('rejects an unknown key with the model name', () => {
    const errors = validateSelect({ titel: true }, post);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("Unknown field 'titel' on model Post — check the field name against the schema");
  });

  test('rejects an unknown key set to false', () => {
    expect(validateSelect({ titel: false }, post)).toHaveLength(1);
  });

  test('reports every unknown key', () => {
    expect(validateSelect({ foo: true, title: true, bar: true }, post).map((e) => e.path)).toEqual(['foo', 'bar']);
  });

  test('rejects a composite unique key name', () => {
    expect(validateSelect({ titleAuthor: true }, post)).toHaveLength(1);
  });

  test('accepts and rejects object sub-keys', () => {
    expect(validateSelect({ address: { city: true } }, post)).toEqual([]);
    const errors = validateSelect({ address: { cty: true } }, post);
    expect(errors[0]!.path).toBe('address.cty');
    expect(errors[0]!.message).toContain("'address.cty'");
  });

  test('validates nested object sub-keys', () => {
    expect(validateSelect({ address: { geo: { lat: true } } }, post)).toEqual([]);
    expect(validateSelect({ address: { geo: { lt: true } } }, post)[0]!.path).toBe('address.geo.lt');
  });

  test('@flexible object accepts undeclared sub-keys, declared ones still validated', () => {
    expect(validateSelect({ loose: { extra: true, city: true } }, post)).toEqual([]);
    expect(validateSelect({ loose: { geo: { nope: true } } }, post)[0]!.path).toBe('loose.geo.nope');
  });

  test('tuple keys by index and name', () => {
    expect(validateSelect({ spot: { 1: { lat: true } } }, post)).toEqual([]);
    expect(validateSelect({ spot: { label: true } }, post)).toEqual([]);
    expect(validateSelect({ spot: { 5: true } }, post)[0]!.path).toBe('spot.5');
    expect(validateSelect({ spot: { nope: true } }, post)[0]!.path).toBe('spot.nope');
  });

  test('validates object sub-keys inside tuple elements', () => {
    expect(validateSelect({ spot: { 1: { lng: true } } }, post)).toEqual([]);
    expect(validateSelect({ spot: { 1: { nope: true } } }, post)[0]!.path).toBe('spot.1.nope');
  });
});

describe('validateOrderBy', () => {
  test('accepts undefined, known keys and either case of direction', () => {
    expect(validateOrderBy(undefined, post)).toEqual([]);
    expect(validateOrderBy({ title: 'asc', id: 'DESC' }, post)).toEqual([]);
  });

  test('accepts a @now field', () => {
    expect(validateOrderBy({ accessedAt: 'desc' }, post)).toEqual([]);
  });

  test('ignores an undefined direction', () => {
    expect(validateOrderBy({ title: undefined }, post)).toEqual([]);
  });

  test('rejects an unknown key', () => {
    const errors = validateOrderBy({ titel: 'asc' }, post);
    expect(errors[0]!.message).toBe("Unknown field 'titel' on model Post — check the field name against the schema");
  });

  test('rejects a relation field, as a direction and as a nested path', () => {
    const direct = validateOrderBy({ author: 'asc' }, post);
    expect(direct[0]!.message).toBe(
      "Cannot order by relation field 'author' on model Post — relations are not orderable",
    );
    expect(validateOrderBy({ author: { name: 'asc' } }, post)[0]!.message).toContain('relation field');
  });

  test('rejects invalid directions', () => {
    for (const bad of ['up', '', 'asc; DROP', 1, null, true]) {
      const errors = validateOrderBy({ title: bad } as never, post);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain("must be 'asc' or 'desc'");
    }
  });

  test('object field recursion still works, including nested', () => {
    expect(validateOrderBy({ address: { city: 'asc' } }, post)).toEqual([]);
    expect(validateOrderBy({ address: { geo: { lat: 'desc' } } }, post)).toEqual([]);
  });

  test('rejects unknown and bad-direction keys inside objects', () => {
    expect(validateOrderBy({ address: { cty: 'asc' } }, post)[0]!.path).toBe('address.cty');
    expect(validateOrderBy({ address: { geo: { lat: 'x' } } }, post)[0]!.path).toBe('address.geo.lat');
  });

  test('@flexible object accepts undeclared sub-keys', () => {
    expect(validateOrderBy({ loose: { extra: 'asc', city: 'desc' } }, post)).toEqual([]);
  });

  test('rejects a nested path under a non-object field', () => {
    expect(validateOrderBy({ title: { x: 'asc' } } as never, post)).toHaveLength(1);
  });

  test('rejects a composite unique key name', () => {
    expect(validateOrderBy({ titleAuthor: 'asc' }, post)).toHaveLength(1);
  });
});

describe('validatePagination', () => {
  test('accepts undefined, 0 and positive integers', () => {
    expect(validatePagination(undefined, undefined)).toEqual([]);
    expect(validatePagination(0, 0)).toEqual([]);
    expect(validatePagination(10, 5)).toEqual([]);
  });

  test.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, '5', null, 1e21])('rejects limit %p', (bad) => {
    const errors = validatePagination(bad, undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toStartWith('limit must be a non-negative integer');
  });

  test.each([1.5, -1, Number.NaN, '5', null])('rejects offset %p', (bad) => {
    const errors = validatePagination(undefined, bad);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toStartWith('offset must be a non-negative integer');
  });

  test('reports both', () => {
    expect(validatePagination(-1, -2)).toHaveLength(2);
  });
});
