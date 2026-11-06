/**
 * Unit tests: the `build*Query` functions exported from the package root refuse what the client refuses.
 *
 * They used to splice select keys, orderBy directions, paging, compute keys and data keys unvalidated, so a
 * caller building a query from request data could run a second statement. Each payload below fired
 * against the old exports; a valid call must give the text the inner builder gives.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCreateQuery,
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildFindOneQuery,
  buildSelectQuery,
  buildUpdateManyQuery,
  getOperatorHandler,
  handleBetween,
  handleContains,
  handleEndsWith,
  handleEq,
  handleGt,
  handleGte,
  handleIn,
  handleIsDefined,
  handleIsNotDefined,
  handleIsNotNull,
  handleIsNull,
  handleLt,
  handleLte,
  handleNeq,
  handleNotIn,
  handleStartsWith,
  sql,
} from '../../../src';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildCreateQueryUnchecked,
  buildFindManyQueryUnchecked,
  buildFindOneQueryUnchecked,
  buildUpdateManyQueryUnchecked,
} from '../../../src/query/builders';
import { post, registry } from '../query/relation-order-by-helpers';

// The validators answer with a validation error or its unknown-field subclass; both are Errors that name the input
const refused = (run: () => unknown) => expect(run).toThrow(/^Invalid |must be/);

describe('exported builders refuse hostile input', () => {
  test('limit', () => refused(() => buildFindManyQuery(post, { limit: '1; DELETE doc' as never }, registry)));
  test('offset', () => refused(() => buildFindManyQuery(post, { offset: '0; DELETE doc' as never }, registry)));
  test('findOne offset', () => refused(() => buildFindOneQuery(post, { offset: '0; DELETE doc' as never }, registry)));
  test('select key', () =>
    refused(() => buildSelectQuery(post, { select: { 'id FROM doc; DELETE doc; SELECT id': true } }, false, registry)));
  test('select key with an object value', () =>
    refused(() =>
      buildSelectQuery(
        post,
        { select: { 'id FROM doc; DELETE doc; SELECT id': { label: true } } } as never,
        false,
        registry,
      ),
    ));
  test('compute key', () =>
    refused(() =>
      buildSelectQuery(
        post,
        { compute: { 'c` FROM doc; DELETE doc; SELECT 1 AS `d': sql`1` } } as never,
        false,
        registry,
      ),
    ));
  test('orderBy direction', () =>
    refused(() => buildFindManyQuery(post, { orderBy: { title: 'asc; REMOVE TABLE T' } as never }, registry)));
  test('orderBy key', () =>
    refused(() => buildFindManyQuery(post, { orderBy: { 'title; DELETE post': 'asc' } as never }, registry)));
  test('where key', () =>
    refused(() => buildFindManyQuery(post, { where: { 'title = 1 OR true; DELETE post': 'x' } as never }, registry)));
  test('updateMany data key', () =>
    refused(() =>
      buildUpdateManyQuery(post, { title: 'pub' }, { 'title = title, secret': true }, undefined, undefined, registry),
    ));
  test('updateMany unset key', () =>
    refused(() =>
      buildUpdateManyQuery(post, { title: 'pub' }, {}, undefined, { 'title = title, secret': true }, registry),
    ));
  test('updateMany select key', () =>
    refused(() =>
      buildUpdateManyQuery(
        post,
        { title: 'pub' },
        { title: 'x' },
        { 'id FROM post; DELETE post': true },
        undefined,
        registry,
      ),
    ));
  test('create data key', () =>
    refused(() => buildCreateQuery(post, { title: 'n', 'secret = true, title': 'x' }, undefined, undefined, registry)));
  test('delete where key', () => {
    refused(() => buildDeleteQuery(post, { 'title = 1 OR true': 'x' } as never, registry));
    refused(() => buildDeleteQueryWithReturn(post, { 'title = 1 OR true': 'x' } as never, registry));
  });
});

describe('exported builders keep their output for valid calls', () => {
  const create = { title: 't', address: { city: 'Oslo' }, authorId: 'author:1' };

  test('findMany text is fixed', () => {
    const options = { where: { title: 'a' }, orderBy: { title: 'desc' as const }, limit: 5, offset: 2 };

    expect(buildFindManyQuery(post, options, registry)).toEqual(buildFindManyQueryUnchecked(post, options, registry));
    expect(buildFindManyQuery(post, options, registry).text).toBe(
      'SELECT * FROM post WHERE title = $title_eq_0 ORDER BY title DESC LIMIT 5 START 2',
    );
  });

  test('findOne text is fixed, and still ignores a limit', () => {
    const options = { where: { title: 'a' }, limit: 9 };

    expect(buildFindOneQuery(post, options, registry)).toEqual(buildFindOneQueryUnchecked(post, options, registry));
    expect(buildFindOneQuery(post, options, registry).text).toBe(
      'SELECT * FROM ONLY post WHERE title = $title_eq_0 LIMIT 1',
    );
  });

  test('select with a select list matches the inner builder', () => {
    const options = { select: { title: true, address: true } };

    expect(buildSelectQuery(post, options, false, registry)).toEqual(
      buildFindManyQueryUnchecked(post, options, registry),
    );
  });

  test('updateMany matches the inner builder', () => {
    const args = [post, { title: 'a' }, { title: 'b' }, undefined, undefined, registry] as const;

    expect(buildUpdateManyQuery(...args)).toEqual(buildUpdateManyQueryUnchecked(...args));
    expect(buildUpdateManyQuery(...args).text).toBe(
      'BEGIN TRANSACTION;\nLET $bulk_ids_n_0 = (SELECT VALUE id FROM post WHERE title = $title_eq_0);\nUPDATE $bulk_ids_n_0 SET title = $title_set_0 RETURN *;\nCOMMIT TRANSACTION;',
    );
  });

  test('create matches the inner builder', () => {
    expect(buildCreateQuery(post, create, undefined, undefined, registry)).toEqual(
      buildCreateQueryUnchecked(post, create, undefined, undefined, registry),
    );
  });
});

describe('exported operator handlers refuse a hostile field', () => {
  const meta = post.fields.find((f) => f.name === 'title')!;
  const ctx = () => createCompileContext();
  const HOSTILE = ['title = title; DELETE doc; --', 'a b', '`title`', 'title.', '.title', '1title', '', 'a.b; x'];
  const withField = [
    ['eq', handleEq, 'x'],
    ['neq', handleNeq, 'x'],
    ['gt', handleGt, 1],
    ['gte', handleGte, 1],
    ['lt', handleLt, 1],
    ['lte', handleLte, 1],
    ['in', handleIn, ['x']],
    ['notIn', handleNotIn, ['x']],
    ['between', handleBetween, [1, 2]],
    ['contains', handleContains, 'x'],
    ['startsWith', handleStartsWith, 'x'],
    ['endsWith', handleEndsWith, 'x'],
  ] as const;
  const fieldOnly = [handleIsNull, handleIsNotNull, handleIsDefined, handleIsNotDefined];

  for (const field of HOSTILE) {
    test(`refuses ${JSON.stringify(field)}`, () => {
      for (const [, handler, value] of withField)
        expect(() => (handler as (...a: unknown[]) => unknown)(ctx(), field, value, meta)).toThrow(/Invalid field/);
      for (const handler of fieldOnly) expect(() => handler(field)).toThrow(/Invalid field/);
      expect(() => getOperatorHandler('eq')!(ctx(), field, 'x', meta)).toThrow(/Invalid field/);
    });
  }

  test('a null value is refused too, the payload that deleted every row', () => {
    expect(() => handleEq(ctx(), 'title = title; DELETE doc; --', null, meta)).toThrow(/Invalid field/);
  });

  test('plain and dotted fields build the same text as before', () => {
    expect(handleEq(ctx(), 'title', 'x', meta).text).toBe('title = $title_eq_0');
    expect(handleEq(ctx(), 'address.city', null, meta).text).toBe('address.city = NULL');
    expect(handleIsNull('title').text).toBe('title = NULL');
    expect(handleIsNotDefined('address.city').text).toBe('address.city = NONE');
    expect(getOperatorHandler('gt')!(ctx(), 'title', 1, meta).text).toBe('title > $title_gt_0');
  });
});

describe('findOne parity', () => {
  test('refuses an offset, as compileFindOne does', () => {
    expect(() => buildFindOneQuery(post, { offset: 1 }, registry)).toThrow(/does not accept offset/);
  });
});
