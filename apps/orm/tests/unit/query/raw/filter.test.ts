/**
 * Unit Tests: the `$raw` where key
 *
 * An own `$raw` key that holds anything but a fragment built by the `sql` tag refuses, `undefined`
 * included: the condition builder skips an undefined value, so a conditional fragment that came out
 * undefined would otherwise drop out of a destructive filter and widen it to every row. The refusal
 * holds at the top level, under AND, OR and NOT, in include `where`, and inside a relation filter.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../../src/errors';
import { sql } from '../../../../src/query';
import { buildDeleteQuery } from '../../../../src/query/builders/delete-builder';
import { buildCountQuery, buildFindManyQuery } from '../../../../src/query/builders/select-builder';
import { buildUpdateManyQuery } from '../../../../src/query/builders/update-builder';
import { transformDestructiveWhere } from '../../../../src/query/filters';
import { buildConditions } from '../../../../src/query/filters/condition-builder';
import { createCompileContext } from '../../../../src/query';
import { validateWhere } from '../../../../src/query/validators';
import type { WhereClause } from '../../../../src/types';
import { author, post, registry } from '../relation-order-by-helpers';

const where = (value: unknown): WhereClause => value as WhereClause;
const paths = (w: unknown, model = author) => validateWhere(where(w), model, registry).errors.map((e) => e.path);

// A key holding `undefined` is what a conditional fragment produces when its condition is false
const undefinedShapes: Array<[string, unknown, string]> = [
  ['top level', { name: 'a', $raw: undefined }, 'where.$raw'],
  ['inside OR', { OR: [{ name: 'a' }, { $raw: undefined }] }, 'where.OR[1].$raw'],
  ['inside AND', { AND: [{ $raw: undefined }] }, 'where.AND[0].$raw'],
  ['inside NOT', { NOT: { $raw: undefined } }, 'where.NOT.$raw'],
  ['three levels down', { OR: [{ AND: [{ NOT: { $raw: undefined } }] }] }, 'where.OR[0].AND[0].NOT.$raw'],
];

const forged: Array<[string, unknown]> = [
  ['a string', 'true'],
  ['null', null],
  ['an array', ['true']],
  ['an empty object', {}],
  ['a plain object shaped like a fragment', { strings: ['true'], values: [] }],
  ['a spread fragment', { ...sql`true` }],
  ['a prototype-inheriting object', Object.create(sql`true`)],
  ['a JSON round trip', JSON.parse(JSON.stringify(sql`true`))],
];

describe('$raw holding undefined refuses (destructive path first)', () => {
  test.each(undefinedShapes)('validator: %s', (_label, w, path) => {
    expect(paths(w)).toEqual([path]);
  });

  test.each(undefinedShapes)('builder: %s', (_label, w) => {
    expect(() => buildConditions(createCompileContext(), where(w), author, registry)).toThrow(CerialValidationError);
  });

  test('the validator message names the key and the tag to use', () => {
    const [issue] = validateWhere(where({ $raw: undefined }), author, registry).errors;

    expect(issue?.message).toContain('$raw');
    expect(issue?.message).toContain('sql');
  });

  test('a deleteMany filter whose $raw is undefined never compiles to a bare isActive filter', () => {
    const w = where({ name: 'a', $raw: undefined });

    expect(() => transformDestructiveWhere(w, author, 'deleteMany')).toThrow(CerialValidationError);
    expect(() => buildDeleteQuery(author, w, registry)).toThrow(CerialValidationError);
    expect(() => buildUpdateManyQuery(author, w, { name: 'x' }, undefined, undefined, registry)).toThrow(
      CerialValidationError,
    );
  });

  test('reads refuse too', () => {
    expect(() => buildFindManyQuery(author, { where: where({ $raw: undefined }) }, registry)).toThrow(
      CerialValidationError,
    );
    expect(() => buildCountQuery(author, where({ $raw: undefined }), registry)).toThrow(CerialValidationError);
  });

  test('include where refuses at the top level, under OR, and in a nested include', () => {
    const include = (w: unknown) => () =>
      buildFindManyQuery(post, { include: { author: { where: where(w) } } } as never, registry);

    expect(include({ $raw: undefined })).toThrow(CerialValidationError);
    expect(include({ OR: [{ name: 'a' }, { $raw: undefined }] })).toThrow(CerialValidationError);
    expect(() =>
      buildFindManyQuery(
        post,
        { include: { author: { include: { posts: { where: where({ $raw: undefined }) } } } } } as never,
        registry,
      ),
    ).toThrow(CerialValidationError);
  });
});

describe('an unbranded $raw refuses at any depth', () => {
  test.each(forged)('validator and builder: %s', (_label, value) => {
    expect(paths({ $raw: value })).toEqual(['where.$raw']);
    expect(paths({ OR: [{ name: 'a' }, { NOT: { $raw: value } }] })).toEqual(['where.OR[1].NOT.$raw']);
    expect(() => buildConditions(createCompileContext(), where({ $raw: value }), author, registry)).toThrow(
      CerialValidationError,
    );
    expect(() =>
      buildConditions(createCompileContext(), where({ AND: [{ OR: [{ $raw: value }] }] }), author, registry),
    ).toThrow(CerialValidationError);
  });
});

describe('a branded $raw compiles', () => {
  test('alone, wrapped in parens so it cannot bleed into a sibling', () => {
    const w = where({ name: 'a', $raw: sql`score > ${5} OR vip = true` });
    const out = buildConditions(createCompileContext(), w, author, registry);

    expect(out.text).toBe('name = $name_eq_0 AND (score > $raw_param_1 OR vip = true)');
    expect(out.vars).toEqual({ name_eq_0: 'a', raw_param_1: 5 });
    expect(paths(w)).toEqual([]);
  });

  test('beside a field inside OR keeps the grouping', () => {
    const out = buildConditions(
      createCompileContext(),
      where({ OR: [{ name: 'a' }, { $raw: sql`x = ${1}` }] }),
      author,
      registry,
    );

    expect(out.text).toBe('(name = $name_eq_0 OR (x = $raw_param_1))');
  });

  test('inside NOT and AND at depth', () => {
    const out = buildConditions(
      createCompileContext(),
      where({ AND: [{ NOT: { $raw: sql`x = ${1}` } }] }),
      author,
      registry,
    );

    expect(out.text).toContain('(x = $raw_param_0)');
    expect(out.vars).toEqual({ raw_param_0: 1 });
  });

  test('a deleteMany with a fragment keeps both conditions', () => {
    const q = buildDeleteQuery(author, where({ name: 'a', $raw: sql`score > ${5}` }), registry);

    expect(q.text).toContain('name = $');
    expect(q.text).toContain('(score > $raw_param_1)');
    expect(q.vars.raw_param_1).toBe(5);
  });

  test('include where binds under inc_ names and reaches the query vars', () => {
    const q = buildFindManyQuery(
      post,
      { include: { author: { where: where({ OR: [{ name: 'x' }, { $raw: sql`n = ${2}` }] }) } } } as never,
      registry,
    );

    expect(q.text).toContain('(n = $');
    expect(Object.values(q.vars)).toContain(2);
    expect(Object.keys(q.vars).every((k) => !k.startsWith('raw_param') || k.includes('_param_'))).toBe(true);
  });
});

describe('$raw in a relation filter refuses', () => {
  const relationShapes: Array<[string, unknown]> = [
    ['forward to-one', { author: { $raw: sql`true` } }],
    ['forward to-one, undefined', { author: { $raw: undefined } }],
    ['forward to-one, under OR', { author: { OR: [{ $raw: sql`true` }] } }],
    ['reverse some', { posts: { some: { $raw: sql`true` } } }],
    ['reverse every, undefined', { posts: { every: { $raw: undefined } } }],
    ['reverse none, under NOT', { posts: { none: { NOT: { $raw: sql`true` } } } }],
    ['reverse shorthand', { posts: { $raw: sql`true` } }],
  ];

  test.each(relationShapes)('validator: %s', (_label, w) => {
    const model = 'author' in (w as object) ? post : author;

    expect(validateWhere(where(w), model, registry).valid).toBe(false);
  });

  test('the builder refuses a $raw it reaches inside a relation body', () => {
    const run =
      (w: unknown, model = author) =>
      () =>
        buildConditions(createCompileContext(), where(w), model, registry);

    expect(run({ posts: { some: { $raw: sql`true` } } })).toThrow(CerialValidationError);
    expect(run({ posts: { every: { $raw: undefined } } })).toThrow(CerialValidationError);
    expect(run({ author: { $raw: sql`true` } }, post)).toThrow(CerialValidationError);
  });
});
