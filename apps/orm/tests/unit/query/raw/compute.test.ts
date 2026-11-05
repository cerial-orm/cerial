/**
 * Unit Tests: the `compute` option
 *
 * Refusals first: a key that is not a plain identifier, one that names a field or starts with Cerial's alias
 * prefix, an unbranded value, an empty record, and `compute` on a write or inside an include. Then the shape:
 * quoted aliases, bindings under the include prefix, sorting through the alias, both findUnique paths.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../../src/errors';
import { sql } from '../../../../src/query';
import {
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
} from '../../../../src/query/builder';
import { post, registry } from '../relation-order-by-helpers';
import { post as uniquePost, registry as uniqueRegistry } from '../select-validation-helpers';

const findMany = (options: object, model = post) => compileFindMany(model, options as never, registry).query;

describe('compute refusals', () => {
  const refused: Array<[string, unknown]> = [
    ['an unbranded value', JSON.parse('{"s":"1"}')],
    ['a plain string', { s: 'true' }],
    ['an empty record', {}],
    ['an array', [sql`1`]],
    ['a key with a statement', { 'a; DELETE victim': sql`1` }],
    ['a key with a backtick', { 'a`b': sql`1` }],
    ['a key starting with a digit', { '1a': sql`1` }],
    ['a dashed key', { 'a-b': sql`1` }],
    ['an empty key', { '': sql`1` }],
    ['a key naming a field', { title: sql`1` }],
    ['a key naming the id', { id: sql`1` }],
    ['a key naming a relation', { author: sql`1` }],
    ['a key with the internal prefix', { __cerial_ord_0: sql`1` }],
  ];

  test.each(refused)('findMany refuses %s', (_label, compute) => {
    expect(() => findMany({ compute })).toThrow(CerialValidationError);
  });

  test('the message names the key and the model', () => {
    expect(() => findMany({ compute: { title: sql`1` } })).toThrow(/compute key 'title'.*Post/);
  });

  test('a compute value of undefined is not a fragment', () => {
    expect(() => findMany({ compute: { s: undefined } })).toThrow(CerialValidationError);
  });

  test.each([
    ['findOne', () => compileFindOne(post, { compute: {} } as never, registry)],
    ['findUnique', () => compileFindUnique(post, { where: { id: 'a' }, compute: {} } as never, registry)],
  ])('%s refuses an empty compute', (_name, run) => {
    expect(run).toThrow(CerialValidationError);
  });

  const writes: Array<[string, () => unknown]> = [
    ['create', () => compileCreate(post, { data: {}, compute: { s: sql`1` } } as never, registry)],
    [
      'updateMany',
      () => compileUpdateMany(post, { where: { id: 'a' }, data: {}, compute: { s: sql`1` } } as never, registry),
    ],
    [
      'updateUnique',
      () => compileUpdateUnique(post, { where: { id: 'a' }, data: {}, compute: { s: sql`1` } } as never, registry),
    ],
    ['deleteMany', () => compileDeleteMany(post, { where: { id: 'a' }, compute: { s: sql`1` } } as never, registry)],
    [
      'deleteUnique',
      () => compileDeleteUnique(post, { where: { id: 'a' }, compute: { s: sql`1` } } as never, registry),
    ],
    [
      'upsert',
      () =>
        compileUpsert(post, { where: { id: 'a' }, create: {}, update: {}, compute: { s: sql`1` } } as never, registry),
    ],
  ];

  test.each(writes)('%s refuses compute', (name, run) => {
    expect(run).toThrow(CerialValidationError);
    expect(run).toThrow(new RegExp(`${name} does not accept compute`));
  });

  test('a write with compute undefined is not refused for it', () => {
    expect(() => compileDeleteMany(post, { where: { id: 'a' }, compute: undefined } as never, registry)).not.toThrow();
  });

  test('an include refuses compute, with and without other options', () => {
    expect(() => findMany({ include: { author: { compute: { s: sql`1` } } } })).toThrow(/'compute' is not an option/);
    expect(() => findMany({ include: { author: { compute: { s: sql`1` }, limit: 1 } } })).toThrow(
      CerialValidationError,
    );
    expect(() => findMany({ include: { author: { include: { posts: { compute: { s: sql`1` } } } } } })).toThrow(
      CerialValidationError,
    );
  });

  test('orderBy refuses a sub-object, a bad direction and an unknown key on a compute key', () => {
    const compute = { score: sql`1` };

    expect(() => findMany({ compute, orderBy: { score: { x: 'asc' } } })).toThrow(CerialValidationError);
    expect(() => findMany({ compute, orderBy: { score: 'up' } })).toThrow(CerialValidationError);
    expect(() => findMany({ compute, orderBy: { other: 'asc' } })).toThrow(/Unknown field 'other'/);
  });

  test('orderBy on a compute key without compute is an unknown key', () => {
    expect(() => findMany({ orderBy: { score: 'asc' } })).toThrow(/Unknown field 'score'/);
  });

  test('a compute key is not orderable inside an include or under a relation', () => {
    const compute = { score: sql`1` };

    expect(() => findMany({ compute, orderBy: { author: { score: 'asc' } } })).toThrow(/Unknown field 'author.score'/);
    expect(() =>
      findMany({ compute, include: { author: { include: { posts: { orderBy: { score: 'asc' } } } } } }),
    ).toThrow(/Unknown field 'score'/);
  });
});

describe('compute compilation', () => {
  test('always backtick-quotes the alias, keywords included', () => {
    const { text } = findMany({ compute: { true: sql`1`, score: sql`2` } });

    expect(text).toContain('1 AS `true`');
    expect(text).toContain('2 AS `score`');
  });

  test('adds to * when there is no select', () => {
    expect(findMany({ compute: { score: sql`1 + 1` } }).text).toStartWith('SELECT *, 1 + 1 AS `score` FROM post');
  });

  test('adds to a select list', () => {
    expect(findMany({ select: { title: true }, compute: { score: sql`1` } }).text).toStartWith(
      'SELECT title, 1 AS `score` FROM post',
    );
  });

  test('sits beside an include', () => {
    const { text } = findMany({ compute: { score: sql`1` }, include: { author: true } });

    expect(text).toStartWith('SELECT *, 1 AS `score`, authorId.* AS author FROM post');
  });

  test('binds values under the include prefix, nested fragments included', () => {
    const { text, vars } = findMany({ compute: { score: sql`vector::x(${[1, 2]}, ${sql`${3}`})` } });

    expect(text).toContain('vector::x($raw_param_inc_0, $raw_param_inc_1) AS `score`');
    expect(vars).toEqual({ raw_param_inc_0: [1, 2], raw_param_inc_1: 3 });
  });

  test('counters do not collide with an include where or a $raw filter', () => {
    const { text, vars } = findMany({
      where: { $raw: sql`a = ${1}` },
      compute: { score: sql`${2}` },
      include: { author: { where: { $raw: sql`b = ${3}` } } },
    });

    expect(Object.keys(vars).sort()).toEqual(['raw_param_0', 'raw_param_inc_0', 'raw_param_inc_1']);
    expect(vars.raw_param_0).toBe(1);
    expect(vars.raw_param_inc_0).toBe(2);
    expect(text).toContain('$raw_param_inc_0 AS `score`');
  });

  test('findOne and findMany both carry it, findOne with its own limit', () => {
    const one = compileFindOne(post, { compute: { score: sql`1` } } as never, registry).query.text;

    expect(one).toContain('1 AS `score`');
    expect(one).toContain('FROM ONLY post');
    expect(one).toContain('LIMIT 1');
  });

  test('findUnique by id keeps compute and its bindings', () => {
    const { query } = compileFindUnique(
      post,
      { where: { id: 'abc' }, compute: { score: sql`${5}` } } as never,
      registry,
    );

    expect(query.text).toContain('$raw_param_inc_0 AS `score`');
    expect(query.text).toContain('FROM ONLY');
    expect(query.vars.raw_param_inc_0).toBe(5);
  });

  test('findUnique by a composite unique key keeps compute and its bindings', () => {
    const { query } = compileFindUnique(
      uniquePost,
      { where: { titleAuthor: { title: 'x', authorId: 'a' } }, compute: { score: sql`${5}` } } as never,
      uniqueRegistry,
    );

    expect(query.text).toContain('$raw_param_inc_0 AS `score`');
    expect(query.text).toContain('FROM ONLY post');
    expect(query.vars.raw_param_inc_0).toBe(5);
  });
});

describe('sorting on a compute key', () => {
  test('orders by the quoted alias in either direction, never by the expression', () => {
    const asc = findMany({ compute: { score: sql`math::abs(${1})` }, orderBy: { score: 'asc' } }).text;
    const desc = findMany({ compute: { score: sql`1` }, orderBy: { score: 'DESC' } }).text;

    expect(asc).toContain('ORDER BY `score` ASC');
    expect(asc).not.toContain('ORDER BY math');
    expect(desc).toContain('ORDER BY `score` DESC');
  });

  test('mixes with a field key, order preserved', () => {
    expect(findMany({ compute: { score: sql`1` }, orderBy: { title: 'asc', score: 'desc' } }).text).toContain(
      'ORDER BY title ASC, `score` DESC',
    );
  });

  test('a relation sort keeps compute keys and pages after sorting', () => {
    const { text } = findMany({
      compute: { score: sql`1` },
      orderBy: { score: 'desc', author: { name: 'asc' } },
      limit: 5,
      offset: 2,
    });

    expect(text).toStartWith(
      'SELECT * OMIT __cerial_ord_0 FROM (SELECT *, 1 AS `score`, authorId.name AS __cerial_ord_0',
    );
    expect(text).toContain('ORDER BY `score` DESC, __cerial_ord_0 ASC LIMIT 5 START 2)');
  });
});
