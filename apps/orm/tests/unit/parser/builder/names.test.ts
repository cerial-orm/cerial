import { describe, expect, test } from 'bun:test';
import { enumeration } from '../../../../src/parser/builder/enum';
import { e, tuple } from '../../../../src/parser/builder/tuple';
import { f } from '../../../../src/parser/builder/field';
import { literal, variant } from '../../../../src/parser/builder/literal';
import { model } from '../../../../src/parser/builder/model';
import { object } from '../../../../src/parser/builder/object';
import { relation } from '../../../../src/parser/builder/relation';

const BAD = ['a b', '1a', '', 'a-b', 'a.b', "a'"];
const REFUSED = /must be an identifier/;

describe('declaration and field names', () => {
  const kinds: [string, (name: string) => unknown][] = [
    ['model', (n) => model(n, {})],
    ['object', (n) => object(n, {})],
    ['tuple', (n) => tuple(n, [e.int()])],
    ['enum', (n) => enumeration(n, ['A'])],
    ['literal', (n) => literal(n, [variant.string('a')])],
    ['model field', (n) => model('M', { [n]: f.string() })],
    ['object field', (n) => object('O', { [n]: f.string() })],
    ['tuple element key', (n) => tuple('T', { [n]: e.int() })],
    ['tuple element .named', (n) => tuple('T', [e.int().named(n)])],
    ['relation .field', (n) => model('M', { owner: relation('Other').field(n) })],
  ];

  for (const [kind, declare] of kinds) {
    test(`${kind}: a legal name passes`, () => {
      for (const ok of ['Name', '_x', 'a1_B']) expect(() => declare(ok)).not.toThrow();
    });

    test(`${kind}: a space, leading digit, empty string or punctuation refuses, naming the kind and value`, () => {
      for (const bad of BAD) {
        expect(() => declare(bad)).toThrow(REFUSED);
        expect(() => declare(bad)).toThrow(JSON.stringify(bad));
      }
    });
  }

  test('the refusal names the kind', () => {
    expect(() => model('a b', {})).toThrow('Invalid model name "a b"');
    expect(() => object('1x', {})).toThrow('Invalid object name "1x"');
  });

  test('a non-string name refuses', () => {
    expect(() => model(3 as never, {})).toThrow(REFUSED);
  });
});
