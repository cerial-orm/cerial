/**
 * Unit Tests: operator lookup is limited to own properties of the registry
 *
 * The registry is a plain object, so a name inherited from Object.prototype must not resolve as an
 * operator. Each such name takes the same path that every other unknown operator takes.
 */

import { describe, expect, test } from 'bun:test';
import { buildFindManyQuery } from '../../../src/query/builders';
import { getOperatorHandler, getRegisteredOperators, isRegisteredOperator } from '../../../src/query/filters/registry';
import { validateWhere } from '../../../src/query/validators/where-validator';
import { post, registry } from './relation-order-by-helpers';

const PROTOTYPE_NAMES = ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'];

const find = (where: unknown): { text: string; vars: Record<string, unknown> } =>
  buildFindManyQuery(post, { where } as never, registry) as { text: string; vars: Record<string, unknown> };

describe('registry lookups ignore the prototype chain', () => {
  for (const name of PROTOTYPE_NAMES) {
    test(`${name} is not a registered operator`, () => {
      expect(isRegisteredOperator(name)).toBe(false);
      expect(getOperatorHandler(name)).toBeUndefined();
      expect(getRegisteredOperators()).not.toContain(name);
    });
  }

  test('an unrecognised ordinary name is treated the same way', () => {
    expect(isRegisteredOperator('nonsense')).toBe(false);
    expect(getOperatorHandler('nonsense')).toBeUndefined();
  });

  test('every registered operator still resolves', () => {
    const operators = getRegisteredOperators();
    expect(operators.length).toBeGreaterThan(0);
    for (const operator of operators) {
      expect(isRegisteredOperator(operator)).toBe(true);
      expect(typeof getOperatorHandler(operator)).toBe('function');
    }
  });
});

describe('prototype-chain names as operators in a top-level where', () => {
  for (const name of [...PROTOTYPE_NAMES, 'nonsense']) {
    test(`${name} is reported by the validator like any unknown operator`, () => {
      const result = validateWhere({ title: { [name]: 1 } } as never, post, registry);
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.message)).toContain(`Unknown operator: ${name}`);
    });

    test(`${name} no longer drops the filter in the builder`, () => {
      const compiled = find({ title: { [name]: 1 } });
      expect(compiled.text).toBe(find({ title: { nonsense: 1 } }).text);
      expect(compiled.text).toContain('WHERE');
      expect(Object.values(compiled.vars)).toContainEqual({ [name]: 1 });
    });
  }
});

describe('unchanged behaviour', () => {
  test('a prototype name as a field name is an unknown field, as before', () => {
    for (const name of PROTOTYPE_NAMES) {
      const result = validateWhere({ [name]: 1 } as never, post, registry);
      expect(result.valid).toBe(false);
    }
  });

  test('a normal operator filter compiles to the same text', () => {
    const compiled = find({ title: { eq: 'a', contains: 'b' } });
    expect(compiled.text).toContain('title');
    expect(Object.values(compiled.vars)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(compiled.text).not.toMatch(/\$[a-z_0-9]*toString/);
  });

  test('an object value with an operator-like key is bound whole as an equality operand', () => {
    const compiled = find({ address: { city: { $ne: 'x' } } });
    expect(Object.values(compiled.vars)).toContainEqual({ $ne: 'x' });
  });
});
