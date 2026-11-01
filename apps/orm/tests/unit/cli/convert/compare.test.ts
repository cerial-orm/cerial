import { describe, expect, test } from 'bun:test';
import { compareExact, compareStructure, differences, withoutPosition } from '../../../../src/cli/convert';
import { parse } from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';

const ast = (source: string): SchemaAST => parse(source).ast;
const model = (name: string, body = ''): string => `model ${name} {\n  id Record @id\n${body}}`;
const source = (names: string[]): string => names.map((name) => model(name)).join('\n');

const alternating = (kinds: Array<'index' | 'unique'>): string => {
  const seen = { index: 0, unique: 0 };
  const body = kinds.map((kind) => `  @@${kind}(${kind}${seen[kind]++}, [a])`).join('\n');

  return `model M {\n  id Record @id\n  a Int\n${body}\n}`;
};

describe('the comparison itself', () => {
  test('toEqual cannot see an own key set to undefined, and differences can', () => {
    const withKey: Record<string, unknown> = { a: undefined };

    expect(withKey).toEqual({});
    expect(differences({ a: undefined }, {})).toEqual(['$.a: only in the first']);
    expect(differences({}, { a: undefined })).toEqual(['$.a: only in the second']);
  });

  test('an extra isArray: false fails, and an equal value passes', () => {
    expect(differences({ isArray: false, name: 'x' }, { name: 'x' })).toEqual(['$.isArray: only in the first']);
    expect(differences({ name: 'x', list: [1, { k: 2 }] }, { name: 'x', list: [1, { k: 2 }] })).toEqual([]);
  });

  test('arrays inside a declaration are positional, and values and lengths are compared', () => {
    expect(differences([1, 2], [2, 1])).toHaveLength(2);
    expect(differences([1], [1, 2])).toEqual(['$: length 1 against 2']);
    expect(differences({ a: 1 }, { a: '1' })).toHaveLength(1);
    expect(differences({ a: [] }, { a: {} })).toEqual(['$.a: array against non-array']);
  });

  test('only range and origin are dropped, at every depth', () => {
    const value = { range: 1, origin: 2, rangeless: 3, list: [{ range: 4, kept: undefined }] };

    expect(withoutPosition(value)).toStrictEqual({ rangeless: 3, list: [{ kept: undefined }] });
  });

  test('top-level arrays are compared by position, so a different order fails', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['A', 'B'])))).toEqual([]);
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['B', 'A'])))).not.toEqual([]);
  });

  test('a different set of names fails, as does a different count', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['A', 'C'])))).not.toEqual([]);
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['A'])))).not.toEqual([]);
  });

  test('fields inside a declaration are positional', () => {
    const one = ast('model A {\n  id Record @id\n  x Int\n  y Int\n}');
    const other = ast('model A {\n  id Record @id\n  y Int\n  x Int\n}');

    expect(compareExact(one, other)).not.toEqual([]);
  });

  test('source never decides the result', () => {
    const one = ast(source(['A']));

    expect(compareExact(one, { ...one, source: '' })).toEqual([]);
  });
});

describe('compareStructure', () => {
  test('identical ASTs give no differences, and position is ignored', () => {
    expect(compareStructure(ast(model('A')), ast(`\n\n${model('A')}`))).toEqual([]);
  });

  test('decorators compare as sets', () => {
    const one = ast(model('A', '  x String @unique @index\n'));
    const other = ast(model('A', '  x String @index @unique\n'));

    expect(compareStructure(one, other)).toEqual([]);
    expect(compareExact(one, other)).not.toEqual([]);
  });

  test('a different decorator, field order or declaration order fails', () => {
    expect(
      compareStructure(ast(model('A', '  x String @unique\n')), ast(model('A', '  x String @index\n'))),
    ).not.toEqual([]);
    expect(compareStructure(ast(model('A', '  x Int\n  y Int\n')), ast(model('A', '  y Int\n  x Int\n')))).not.toEqual(
      [],
    );
    expect(compareStructure(ast(source(['A', 'B'])), ast(source(['B', 'A'])))).not.toEqual([]);
  });
});

describe('tolerate.directiveKindOrder', () => {
  const grouped = ast(alternating(['index', 'index', 'unique']));
  const interleaved = ast(alternating(['index', 'unique', 'index']));
  test('is off by default: a different kind order fails', () => {
    expect(compareExact(grouped, interleaved)).not.toEqual([]);
    expect(compareStructure(grouped, interleaved)).not.toEqual([]);
  });

  test('passes the one difference it names, in both comparisons', () => {
    const on = { tolerate: { directiveKindOrder: true } };

    expect(compareExact(grouped, interleaved, on)).toEqual([]);
    expect(compareStructure(grouped, interleaved, on)).toEqual([]);
  });

  test('named models only: another model still fails', () => {
    expect(compareExact(grouped, interleaved, { tolerate: { directiveKindOrder: ['M'] } })).toEqual([]);
    expect(compareExact(grouped, interleaved, { tolerate: { directiveKindOrder: ['Other'] } })).not.toEqual([]);
    expect(compareExact(grouped, interleaved, { tolerate: { directiveKindOrder: [] } })).not.toEqual([]);
  });

  test('the order within a kind is not tolerated', () => {
    const one = ast(alternating(['index', 'index']));
    const other: SchemaAST = {
      ...one,
      models: one.models.map((m) => ({ ...m, directives: [...(m.directives ?? [])].reverse() })),
    };

    expect(compareExact(one, other, { tolerate: { directiveKindOrder: true } })).not.toEqual([]);
  });

  test('a directive with changed fields still fails', () => {
    const changed = ast(alternating(['index', 'unique', 'index']).replace('index0, [a]', 'index0, [id]'));
    const on = { tolerate: { directiveKindOrder: true } };

    expect(compareExact(grouped, changed, on)).not.toEqual([]);
    expect(compareStructure(grouped, changed, on)).not.toEqual([]);
  });

  test('a missing directive still fails', () => {
    const fewer = ast(alternating(['index', 'unique']));

    expect(compareExact(grouped, fewer, { tolerate: { directiveKindOrder: true } })).not.toEqual([]);
  });

  test('a key set to undefined still fails', () => {
    const other: SchemaAST = {
      ...interleaved,
      models: interleaved.models.map((m) => ({ ...m, abstract: undefined })),
    };

    expect(compareExact(interleaved, other, { tolerate: { directiveKindOrder: true } })).toEqual([
      'models.M.abstract: only in the second',
    ]);
  });
});

describe('tolerate.declarationOrder', () => {
  const on = { tolerate: { declarationOrder: true } };

  test('is off by default: a different order fails', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['B', 'A'])))).not.toEqual([]);
  });

  test('passes the one difference it names, in both comparisons', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['B', 'A'])), on)).toEqual([]);
    expect(compareStructure(ast(source(['A', 'B', 'C'])), ast(source(['C', 'A', 'B'])), on)).toEqual([]);
  });

  test('identical ASTs give no differences with the tolerance on', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['A', 'B'])), on)).toEqual([]);
  });

  test('named declarations only: those may move, the rest keep their order', () => {
    const one = ast(source(['A', 'B', 'C']));
    const hoisted = ast(source(['C', 'A', 'B']));

    expect(compareExact(one, hoisted, { tolerate: { declarationOrder: ['C'] } })).toEqual([]);
    expect(compareExact(one, hoisted, { tolerate: { declarationOrder: ['A'] } })).not.toEqual([]);
    expect(compareExact(one, ast(source(['C', 'B', 'A'])), { tolerate: { declarationOrder: ['C'] } })).not.toEqual([]);
  });

  test('a missing declaration still fails', () => {
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['B'])), on)).not.toEqual([]);
    expect(compareExact(ast(source(['A', 'B'])), ast(source(['B', 'C'])), on)).not.toEqual([]);
    expect(compareStructure(ast(source(['A', 'B'])), ast(source(['B'])), on)).not.toEqual([]);
  });

  test('a moved declaration with changed content still fails', () => {
    const other = ast(`${model('B', '  x Int\n')}\n${model('A')}`);

    expect(compareExact(ast(source(['A', 'B'])), other, on)).not.toEqual([]);
  });

  test('a key set to undefined still fails', () => {
    const one = ast(source(['A', 'B']));
    const other = ast(source(['B', 'A']));
    other.models[0] = { ...other.models[0]!, abstract: undefined };

    expect(compareExact(one, other, on)).toEqual(['models.B.abstract: only in the second']);
  });
});
