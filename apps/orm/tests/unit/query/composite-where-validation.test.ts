/**
 * Unit Tests: validateWhere and the builder guard on composite @@unique key values
 *
 * Place carries @@unique(nameCity, [name, address.city]), a plain field plus a dotted object sub-path.
 */

import { describe, expect, test } from 'bun:test';
import { expandCompositeKey } from '../../../src/query/builders/select-builder';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { place } from './where-validation-helpers';

const messages = (where: WhereClause): string[] => validateWhere(where, place).errors.map((e) => e.message);
const head = "Invalid composite key 'nameCity' on model Place — it must name every field of";
const directive = '@@unique(nameCity, [name, address.city])';

describe('validateWhere — composite key values', () => {
  test('accepts a value naming every directive field, dotted paths nested', () => {
    expect(messages({ nameCity: { name: 'Hub', address: { city: 'NYC' } } })).toEqual([]);
  });

  test('accepts null as a plain value', () => {
    expect(messages({ nameCity: { name: 'Hub', address: { city: null } } })).toEqual([]);
  });

  test('rejects an empty value, naming the directive and what it requires', () => {
    expect(messages({ nameCity: {} })).toEqual([
      `${head} ${directive} as a plain value; missing 'name', 'address.city'`,
    ]);
  });

  test('rejects a partial value', () => {
    expect(messages({ nameCity: { name: 'Hub' } })).toEqual([
      `${head} ${directive} as a plain value; missing 'address.city'`,
    ]);
    expect(messages({ nameCity: { address: { city: 'NYC' } } })).toEqual([
      `${head} ${directive} as a plain value; missing 'name'`,
    ]);
  });

  test('treats an undefined part as missing', () => {
    expect(messages({ nameCity: { name: 'Hub', address: { city: undefined } } })).toEqual([
      `${head} ${directive} as a plain value; missing 'address.city'`,
    ]);
    expect(messages({ nameCity: { name: undefined, address: { city: 'NYC' } } })).toHaveLength(1);
  });

  test('rejects an operator object where a plain value is required', () => {
    expect(messages({ nameCity: { name: { contains: 'H' }, address: { city: 'NYC' } } })).toEqual([
      `${head} ${directive} as a plain value; missing 'name'; 'name' must be a plain value, not a filter or nested object`,
    ]);
  });

  test('rejects a key the directive does not name', () => {
    expect(messages({ nameCity: { name: 'Hub', address: { city: 'NYC', zip: '1' } } })).toEqual([
      `${head} ${directive} as a plain value; 'address.zip' is not part of the directive`,
    ]);
    expect(messages({ nameCity: { name: 'Hub', extra: 1, address: { city: 'NYC' } } })).toHaveLength(1);
  });

  test('rejects a flat dotted key and a non-object value for a nested path', () => {
    expect(messages({ nameCity: { name: 'Hub', 'address.city': 'NYC' } })).toHaveLength(1);
    expect(messages({ nameCity: { name: 'Hub', address: 'NYC' } })).toHaveLength(1);
  });

  test('rejects a non-object value', () => {
    for (const value of [null, 'NYC', 5, [], [{ name: 'Hub' }]])
      expect(messages({ nameCity: value as never })).toHaveLength(1);
  });

  test('reports the where path', () => {
    expect(validateWhere({ nameCity: {} }, place).errors[0]!.path).toBe('where.nameCity');
  });

  test('checks the composite inside AND, OR and NOT', () => {
    expect(messages({ AND: [{ nameCity: {} }] })).toHaveLength(1);
    expect(messages({ OR: [{ nameCity: {} }] })).toHaveLength(1);
    expect(messages({ NOT: { nameCity: {} } })).toHaveLength(1);
  });

  test('still validates sibling keys next to a valid composite', () => {
    expect(messages({ nameCity: { name: 'Hub', address: { city: 'NYC' } }, nope: 1 })).toEqual([
      "Unknown field 'nope' on model Place — check the field name against the schema",
    ]);
  });
});

describe('expandCompositeKey — builder guard', () => {
  test('expands a complete value to flat and dotted keys', () => {
    expect(expandCompositeKey({ nameCity: { name: 'Hub', address: { city: 'NYC' } } }, place)).toEqual({
      name: 'Hub',
      'address.city': 'NYC',
    });
  });

  test('throws on a missing part instead of dropping it from the filter', () => {
    expect(() => expandCompositeKey({ nameCity: {} }, place)).toThrow(
      "Composite key 'nameCity' is missing a value for 'name'",
    );
    expect(() => expandCompositeKey({ nameCity: { name: 'Hub' } }, place)).toThrow(
      "Composite key 'nameCity' is missing a value for 'address.city'",
    );
  });
});
