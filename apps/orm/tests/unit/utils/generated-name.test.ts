/**
 * Unit Tests: the generated-name rule. Each refusal has an accepting twin.
 */

import { describe, expect, test } from 'bun:test';
import { generatedNameProblem, isGeneratedName } from '../../../src/utils/generated-name';

const KINDS = ['model', 'object', 'tuple', 'literal', 'enum', 'field', 'tuple element', 'enum value', 'directive'];

describe('generated name rule', () => {
  test.each(KINDS)('%s: accepts plain identifiers', (kind) => {
    for (const name of ['x', '_y', 'lat2', 'Pair', 'a_b_C']) expect(isGeneratedName(name, kind)).toBe(true);
  });

  test.each(KINDS)('%s: refuses a name that is not an identifier', (kind) => {
    for (const name of ['7E', '1abc', '', 'a b', "x'+1+'", 'a-b', 'é', 'a.b'])
      expect(generatedNameProblem(name, kind)).toBeDefined();
  });

  test.each(KINDS)('%s: refuses constructor, __proto__ and prototype', (kind) => {
    for (const name of ['constructor', '__proto__', 'prototype']) expect(isGeneratedName(name, kind)).toBe(false);
  });

  test.each(KINDS)('%s: refuses every own property name of Object.prototype', (kind) => {
    const names = Object.getOwnPropertyNames(Object.prototype);

    expect(names).toContain('toString');
    for (const name of names) expect(isGeneratedName(name, kind), name).toBe(false);
  });

  test.each(KINDS)('%s: accepts names that only resemble prototype members', (kind) => {
    for (const name of ['toStringx', 'ToString', 'valueof', 'proto', 'ctor'])
      expect(isGeneratedName(name, kind)).toBe(true);
  });

  test.each(['model', 'object', 'tuple', 'literal', 'enum'])('%s: refuses an ES reserved word', (kind) => {
    for (const name of ['typeof', 'class', 'delete', 'yield']) expect(isGeneratedName(name, kind)).toBe(false);
  });

  test.each(['field', 'tuple element', 'enum value', 'directive'])(
    '%s: allows an ES reserved word as a key',
    (kind) => {
      for (const name of ['typeof', 'class', 'delete']) expect(isGeneratedName(name, kind)).toBe(true);
    },
  );

  test('refuses a value that is not a string', () => {
    for (const value of [undefined, null, 7, {}]) expect(isGeneratedName(value, 'field')).toBe(false);
  });
});
