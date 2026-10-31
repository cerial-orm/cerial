/**
 * Unit Tests: structure of a where
 *
 * A double negation of an empty or constant-false condition is always true, so a destructive where made of it
 * must refuse like `AND: []` does. Logical items must be objects. Nesting past the depth cap refuses with a
 * validation error instead of overflowing the stack.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import { buildConditions, transformDestructiveWhere, transformWhere } from '../../../src/query/filters';
import { createCompileContext } from '../../../src/query';
import { MAX_WHERE_DEPTH, validateWhere } from '../../../src/query/validators/where-validator';
import type { WhereClause } from '../../../src/types';
import { author, registry } from './relation-order-by-helpers';

const where = (value: unknown): WhereClause => value as WhereClause;

const alwaysTrue: Array<[string, unknown]> = [
  ['NOT NOT {}', { NOT: { NOT: {} } }],
  ['NOT OR []', { NOT: { OR: [] } }],
  ['NOT NOT OR []', { NOT: { NOT: { NOT: { OR: [] } } } }],
  ['NOT AND [OR [], OR []]', { NOT: { AND: [{ OR: [] }, { OR: [] }] } }],
  ['NOT with a false sibling', { NOT: { name: 'a', OR: [] } }],
  ['NOT OR [OR [], OR []]', { NOT: { OR: [{ OR: [] }, { OR: [] }] } }],
];

describe('a where that reduces to always true', () => {
  test.each(alwaysTrue)('%s refuses on a destructive path', (_label, w) => {
    expect(() => transformDestructiveWhere(where(w), author, 'deleteMany', registry)).toThrow(CerialValidationError);
  });

  test.each(alwaysTrue)('%s compiles to no condition on a read', (_label, w) => {
    expect(transformWhere(where(w), author, registry).text).toBe('');
  });

  test('the already-refused shapes still refuse', () => {
    for (const w of [{ AND: [] }, { OR: [{}] }])
      expect(() => transformDestructiveWhere(where(w), author, 'deleteMany', registry)).toThrow(CerialValidationError);
  });

  test('a real condition under a double negation keeps filtering', () => {
    const compiled = transformDestructiveWhere(where({ NOT: { NOT: { name: 'a' } } }), author, 'deleteMany', registry);

    expect(compiled.text).toMatch(/^WHERE NOT \(NOT \(name = \$\w+\)\)$/);
  });

  test('constant false still matches nothing', () => {
    expect(transformWhere(where({ OR: [] }), author, registry).text).toBe('false');
    expect(transformWhere(where({ NOT: {} }), author, registry).text).toBe('false');
    expect(transformWhere(where({ name: 'a', OR: [] }), author, registry).text).toBe('false');
    expect(
      buildConditions(createCompileContext(), where({ AND: [{ OR: [] }, { name: 'a' }] }), author, registry).text,
    ).toBe('false');
  });

  test('an OR keeps its live branches when one is constant false', () => {
    const text = transformWhere(where({ OR: [{ OR: [] }, { name: 'a' }] }), author, registry).text;

    expect(text).not.toContain('false');
    expect(text).toContain('name');
  });
});

describe('logical items must be objects', () => {
  const items: Array<[string, unknown]> = [
    ['null', null],
    ['a number', 1],
    ['a string', 'DELETE user'],
    ['an array', []],
    ['a boolean', true],
  ];

  describe.each(['AND', 'OR'])('%s', (key) => {
    test.each(items)('refuses %s', (_label, item) => {
      const result = validateWhere(where({ [key]: [{ name: 'a' }, item] }), author, registry);

      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.path)).toEqual([`where.${key}[1]`]);
    });
  });

  test.each(items)('NOT refuses %s', (_label, item) => {
    const result = validateWhere(where({ NOT: item }), author, registry);

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.path)).toEqual(['where.NOT']);
  });

  test('objects still pass', () => {
    expect(validateWhere(where({ AND: [{ name: 'a' }], OR: [{}], NOT: { name: 'b' } }), author, registry).valid).toBe(
      true,
    );
  });
});

describe('where depth cap', () => {
  const nest = (key: 'AND' | 'OR' | 'NOT', levels: number): unknown => {
    let w: unknown = { name: 'a' };
    for (let i = 0; i < levels; i++) w = key === 'NOT' ? { NOT: w } : { [key]: [w] };

    return w;
  };

  test.each(['AND', 'OR', 'NOT'] as const)('%s nesting at 100 levels passes', (key) => {
    expect(validateWhere(where(nest(key, 100)), author, registry).valid).toBe(true);
  });

  test.each(['AND', 'OR', 'NOT'] as const)('%s nesting at 12000 levels refuses, naming the depth', (key) => {
    const run = () => validateWhere(where(nest(key, 12000)), author, registry);

    expect(run).toThrow(CerialValidationError);
    expect(run).toThrow(`deeper than ${MAX_WHERE_DEPTH}`);
  });

  test('the walk is not fooled by object fields', () => {
    let w: Record<string, unknown> = { city: 'x' };
    for (let i = 0; i < 12000; i++) w = { NOT: w };

    expect(() => validateWhere(where(w), author, registry)).toThrow(CerialValidationError);
  });

  test('just over the cap refuses and exactly at it passes', () => {
    const levels = (n: number): unknown => {
      let w: unknown = { name: 'a' };
      for (let i = 1; i < n; i++) w = { NOT: w };

      return w;
    };

    expect(validateWhere(where(levels(MAX_WHERE_DEPTH)), author, registry).valid).toBe(true);
    expect(() => validateWhere(where(levels(MAX_WHERE_DEPTH + 1)), author, registry)).toThrow(CerialValidationError);
  });
});
