/**
 * Unit Tests: Generated-name validator
 *
 * Every kind of name a schema carries, from `.cerial` text and from the TypeScript builders.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { enumeration } from '../../../src/parser/builder/enum';
import { e, tuple } from '../../../src/parser/builder/tuple';
import { validateGeneratedNames } from '../../../src/cli/validators';

function messages(schema: string): string[] {
  return validateGeneratedNames(parse(schema).ast).map((err) => err.message);
}

const MODEL = 'model Host {\n  id Record @id\n}\n';

describe('Generated-name validator', () => {
  test('refuses a tuple element name that closes a string', () => {
    const errors = messages(`${MODEL}tuple Pair {\n  x'+console.log(1)+' Float,\n  y Float\n}\n`);

    expect(errors.some((m) => m.startsWith('Invalid tuple element name'))).toBe(true);
  });

  test('accepts plain and positional tuple elements', () => {
    expect(messages(`${MODEL}tuple Pair {\n  x Float,\n  _y Float,\n  lat2 Float\n}\n`)).toEqual([]);
    expect(messages(`${MODEL}tuple Pair {\n  Float,\n  Float\n}\n`)).toEqual([]);
  });

  test('refuses every Object.prototype member as a tuple element name', () => {
    expect(messages(`${MODEL}tuple Pair {\n  constructor Float,\n  y Float\n}\n`)).toHaveLength(1);
    expect(messages(`${MODEL}tuple Pair {\n  toString Float,\n  valueOf Float\n}\n`)).toHaveLength(2);
  });

  test('refuses a field named toString, valueOf or hasOwnProperty on a model and an object', () => {
    for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      expect(messages(`model Host {\n  id Record @id\n  ${name} String\n}\n`), name).toEqual([
        `Invalid field name "${name}" in model Host: '${name}' is reserved`,
      ]);
      expect(messages(`${MODEL}object Box {\n  ${name} String\n}\n`), name).toHaveLength(1);
    }
  });

  test('refuses toString as a declaration name and as an enum value', () => {
    expect(messages('enum toString { A }')).toHaveLength(1);
    expect(messages('enum Role { A, valueOf }')).toHaveLength(1);
  });

  test.each([
    ['enum', 'enum 7E { A }', 'Invalid enum name "7E"'],
    ['literal', "literal 8L { 'a' }", 'Invalid literal name "8L"'],
    ['tuple', 'tuple 9T {\n  Float,\n  Float\n}', 'Invalid tuple name "9T"'],
  ])('refuses a digit-led %s name', (_kind, source, message) => {
    expect(messages(`${MODEL}${source}\n`).join('\n')).toContain(message);
  });

  test('refuses a digit-led composite directive name', () => {
    const errors = messages('model Host {\n  id Record @id\n  a String\n  b String\n  @@unique(1abc, [a, b])\n}\n');

    expect(errors.join('\n')).toContain('Invalid directive name "1abc" in model Host');
  });

  test('refuses an enum value __proto__ and names the enum', () => {
    expect(messages('enum Role { ADMIN, __proto__ }')).toContain(
      'Invalid enum value name "__proto__" in enum Role: \'__proto__\' is reserved',
    );
  });

  test('refuses a reserved word as a declaration name but not as a key', () => {
    expect(messages('enum typeof { A }')).toHaveLength(1);
    expect(messages(`${MODEL}tuple Pair {\n  typeof Float,\n  class Float\n}\n`)).toEqual([]);
    expect(messages('enum Role { delete, class }')).toEqual([]);
  });

  test('refuses a field named constructor on a model and an object', () => {
    expect(messages('model Host {\n  id Record @id\n  constructor String\n}\n')).toHaveLength(1);
    expect(messages(`${MODEL}object Box {\n  __proto__ String\n}\n`)).toHaveLength(1);
  });

  test('every error carries its origin', () => {
    const [error] = validateGeneratedNames(parse('enum 7E { A }').ast);

    expect(error?.origin?.kind).toBe('dsl');
  });

  describe('TypeScript sources', () => {
    test('a tuple element named from the builder is refused at load', () => {
      expect(() => tuple('Pair', { constructor: e.float(), y: e.float() })).toThrow('Invalid tuple element name');
      expect(() => tuple('Pair', { x: e.float(), y: e.float() })).not.toThrow();
    });

    test('an enum value is refused at load', () => {
      expect(() => enumeration('Role', ['ADMIN', '__proto__'])).toThrow("'__proto__' is reserved");
      expect(() => enumeration('Role', ['ADMIN', 'toString'])).toThrow("'toString' is reserved");
      expect(() => enumeration('Role', ['ADMIN', '7x'])).toThrow('Values must be valid identifiers');
    });

    test('a built declaration name that is a reserved word is refused', () => {
      expect(() => enumeration('typeof', ['A'])).toThrow('Invalid enum name');
    });
  });
});

describe('Generated-name validator: literal values and abstract models', () => {
  test.each([...Object.getOwnPropertyNames(Object.prototype), 'prototype'])(
    'refuses the literal string value %s',
    (value) => {
      const errors = messages(`${MODEL}literal L { '${value}', 'a' }\n`);

      expect(errors).toEqual([`Invalid literal value "${value}" in literal L: '${value}' is reserved`]);
    },
  );

  test('accepts other literal values, including ones that are not identifiers', () => {
    expect(messages(`${MODEL}literal L { 'toStringx', 'a b', 'x-1', 3 }\n`)).toEqual([]);
  });

  test('walks abstract models', () => {
    expect(messages('abstract model 1Base {\n  id Record @id\n}\n')).toHaveLength(1);
    expect(messages('abstract model Base {\n  constructor String\n}\n')).toHaveLength(1);
  });

  test('a .cerial tuple element error points at the tuple line, not line 0', () => {
    const [error] = validateGeneratedNames(parse(`${MODEL}tuple Pair {\n  constructor Float,\n  y Float\n}\n`).ast);

    expect(error?.line).toBeGreaterThan(0);
  });
});
