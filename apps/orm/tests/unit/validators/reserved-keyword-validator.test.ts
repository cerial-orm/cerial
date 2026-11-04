/**
 * Unit Tests: Reserved Keyword Validator
 *
 * Runs through validateAll, the checks `cerial generate` runs, so a refusal here is a refusal on the live path.
 */

import { describe, expect, test } from 'bun:test';
import { RESERVED_KEYWORDS, isReservedKeyword } from '../../../src/cli/validators';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

const reserved = (source: string) =>
  validateAll(parse(source).ast)
    .map((e) => e.message)
    .filter((m) => m.startsWith('Reserved keyword'));

describe('Reserved Keyword Validator', () => {
  test('the list holds the 78 pinned words', () => {
    expect(RESERVED_KEYWORDS.size).toBe(78);
  });

  test('accepts a schema using only allowed names', () => {
    const source = [
      'model Account {',
      '  id Record @id',
      '  title String',
      '  ordering Int',
      '  contentType String',
      '  address Place',
      '}',
      'object Place {',
      '  city String',
      '}',
      'tuple Pair {',
      '  Int,',
      '  Int',
      '}',
      'enum Role { A }',
    ].join('\n');

    expect(reserved(source)).toEqual([]);
  });

  test('refuses a reserved model name and names the keyword and declaration', () => {
    expect(reserved('model Select {\n  id Record @id\n}')).toEqual([
      "Reserved keyword: model name 'Select' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('refuses a reserved field name on a model', () => {
    expect(reserved('model User {\n  id Record @id\n  type String\n}')).toEqual([
      "Reserved keyword: field (on model User) name 'type' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('refuses a reserved object name', () => {
    expect(reserved('object Group {\n  label String\n}')).toEqual([
      "Reserved keyword: object name 'Group' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('refuses a reserved field name on an object', () => {
    expect(reserved('object Place {\n  order Int\n}')).toEqual([
      "Reserved keyword: field (on object Place) name 'order' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('refuses a reserved tuple name', () => {
    expect(reserved('tuple Table {\n  Int,\n  Int\n}')).toEqual([
      "Reserved keyword: tuple name 'Table' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('refuses a reserved enum name', () => {
    expect(reserved('enum Value { A }')).toEqual([
      "Reserved keyword: enum name 'Value' is a SurrealDB reserved word and cannot be used. Rename it.",
    ]);
  });

  test('matches case-insensitively', () => {
    expect(isReservedKeyword('SELECT')).toBe(true);
    expect(isReservedKeyword('Content')).toBe(true);
    expect(reserved('model Order {\n  id Record @id\n}')).toHaveLength(1);
  });

  test('accepts a name that merely contains a keyword', () => {
    for (const name of ['ordering', 'contentType', 'typeName', 'tablet', 'setting', 'notes', 'valueOf']) {
      expect(isReservedKeyword(name)).toBe(false);
    }
  });

  test('refuses the words the source set omits and the owner added', () => {
    for (const word of ['access', 'and', 'tb', 'sequence', 'upsert', 'content'])
      expect(isReservedKeyword(word)).toBe(true);
  });

  describe.each(['explain', 'overwrite'])('4.0 word %s', (word) => {
    const cap = word[0]!.toUpperCase() + word.slice(1);

    test('is in the list, in any case', () => {
      expect(isReservedKeyword(word)).toBe(true);
      expect(isReservedKeyword(word.toUpperCase())).toBe(true);
      expect(isReservedKeyword(cap)).toBe(true);
    });

    test.each([
      ['field', `model User {\n  id Record @id\n  ${word} String\n}`],
      ['model', `model ${cap} {\n  id Record @id\n}`],
      ['object', `object ${cap} {\n  label String\n}`],
      ['tuple', `tuple ${cap} {\n  Int,\n  Int\n}`],
      ['enum', `enum ${cap} { A }`],
    ])('refuses it as a %s name', (_kind, source) => {
      expect(reserved(source)).toHaveLength(1);
    });

    test('accepts a near-miss name', () => {
      const near = `${word}s`;
      expect(isReservedKeyword(near)).toBe(false);
      expect(reserved(`model User {\n  id Record @id\n  ${near} String\n  my${cap} String\n}`)).toEqual([]);
    });
  });
});
