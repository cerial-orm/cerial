import { describe, expect, test } from 'bun:test';
import { validateGroupBy } from '../../../../src/query/validators';
import { order, problems, registry } from './helpers';

describe('groupBy accepts', () => {
  test.each([
    ['a scalar', { status: true }],
    ['an enum', { kind: true }],
    ['a record FK', { customerId: true }],
    ['an array field', { tags: true }],
    ['an object sub-key', { address: { city: true } }],
    ['a nested object sub-key', { address: { geo: { lat: true } } }],
    ['a declared sub-key of a flexible object', { meta: { known: true } }],
    ['several keys', { status: true, paid: true, createdAt: true }],
  ])('%s as a key', (_name, by) => {
    expect(problems({ by })).toEqual([]);
  });

  test('by alone is valid', () => {
    expect(problems({ by: { status: true } })).toEqual([]);
  });
});

describe('groupBy refuses keys, naming the field', () => {
  test('a missing, empty or non-object by', () => {
    for (const args of [{}, { by: {} }, { by: null }, { by: 'status' }, { by: ['status'] }]) {
      expect(problems(args)).toEqual(['groupBy needs by: an object naming at least one field to group by']);
    }
  });

  test('args that are not an object', () => {
    for (const args of [undefined, null, 'status', 3, []]) {
      expect(problems(args)).toEqual(['groupBy needs an options object with a by key']);
    }
  });

  test('an unknown field is an unknownField problem with the field in its message', () => {
    const found = validateGroupBy({ by: { nope: true } }, order, registry);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'unknownField', path: 'nope' });
    expect(found[0]!.message).toContain("'nope'");
    expect(found[0]!.message).toContain('Order');
  });

  test('an unknown nested sub-key names its full path', () => {
    const found = validateGroupBy({ by: { address: { zip: true } } }, order, registry);
    expect(found[0]).toMatchObject({ kind: 'unknownField', path: 'address.zip' });
  });

  test('a relation is virtual', () => {
    expect(problems({ by: { customer: true } })).toEqual([
      "Cannot group by 'customer' on model Order — a relation is virtual and stored nowhere",
    ]);
  });

  test('a whole object field, with a hint naming its sub-keys', () => {
    const [message] = problems({ by: { address: true } });
    expect(message).toContain("Cannot group by 'address'");
    expect(message).toContain('{ address: { <subKey>: true } }');
  });

  test('a tuple, bytes, geometry and any field', () => {
    expect(problems({ by: { pos: true } })[0]).toContain("Cannot group by 'pos'");
    expect(problems({ by: { blob: true } })[0]).toContain("Cannot group by 'blob'");
    expect(problems({ by: { shape: true } })[0]).toContain("Cannot group by 'shape'");
    expect(problems({ by: { extra: true } })[0]).toContain("Cannot group by 'extra'");
  });

  test('a literal with object variants, and an array of objects', () => {
    expect(problems({ by: { mixed: true } })[0]).toContain("Cannot group by 'mixed'");
    expect(problems({ by: { lines: true } })[0]).toContain("Cannot group by 'lines'");
  });

  test('an undeclared sub-key of a flexible object', () => {
    expect(problems({ by: { meta: { 'a-b': true } } })).toEqual([
      "Cannot group by 'meta.a-b' on model Order — an undeclared sub-key of a flexible object is not a group key",
    ]);
  });

  test('sub-keys under a field that has none: scalar, array of objects, tuple, relation', () => {
    for (const key of ['status', 'lines', 'pos', 'customer', 'tags']) {
      expect(problems({ by: { [key]: { x: true } } })[0]).toContain(`Cannot group by '${key}'`);
    }
  });

  test('an empty nested object', () => {
    expect(problems({ by: { address: {} } })).toEqual([
      "groupBy key 'address' names no sub-key — set a sub-key to true",
    ]);
  });

  test('a value other than true or an object: false, 1, a string, null, an array', () => {
    for (const value of [false, 1, 'yes', null, ['city']]) {
      expect(problems({ by: { status: value } })[0]).toContain("groupBy key 'status' must be true or an object");
    }
  });

  test('every problem is reported, not just the first', () => {
    expect(problems({ by: { customer: true, nope: true, address: true } })).toHaveLength(3);
  });
});
