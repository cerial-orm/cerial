/**
 * Unit Tests: orderBy, limit and offset inside include
 *
 * The include orderBy is validated against the target model before it reaches query text, and
 * what is emitted is quoted on top of that. These pin the full emitted subquery.
 */

import { describe, expect, test } from 'bun:test';
import { buildFindManyQuery, buildOrderBy } from '../../../src/query/builders';
import { author, country, post, registry } from './relation-order-by-helpers';

const A0 = '__cerial_ord_0';
const find = (model: typeof author, include: object): string =>
  buildFindManyQuery(model, { include } as never, registry).text;

describe('include orderBy: emitted subquery', () => {
  test('reverse relation, ascending', () => {
    expect(find(author, { posts: { orderBy: { title: 'asc' } } })).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id ORDER BY title ASC) AS posts FROM author',
    );
  });

  test('reverse relation, descending with limit and offset', () => {
    expect(find(author, { posts: { orderBy: { title: 'desc' }, limit: 2, offset: 1 } })).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id ORDER BY title DESC LIMIT 2 START 1) AS posts FROM author',
    );
  });

  test('limit 0 is emitted', () => {
    expect(find(author, { posts: { limit: 0 } })).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id LIMIT 0) AS posts FROM author',
    );
  });

  test('forward array relation uses INSIDE', () => {
    expect(find(post, { editors: { orderBy: { name: 'asc' } } })).toBe(
      'SELECT *, (SELECT * FROM author WHERE id INSIDE $parent.editorIds ORDER BY name ASC) AS editors FROM post',
    );
  });

  test('object sub-key orders on dot notation', () => {
    expect(find(author, { posts: { orderBy: { address: { city: 'desc' } } } })).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id ORDER BY address.city DESC) AS posts FROM author',
    );
  });

  test('relation key is projected to an alias, ordered on the alias and omitted again', () => {
    expect(find(author, { posts: { orderBy: { author: { name: 'asc' }, title: 'desc' }, limit: 3 } })).toBe(
      `SELECT *, (SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post WHERE authorId = $parent.id ORDER BY ${A0} ASC, title DESC LIMIT 3)) AS posts FROM author`,
    );
  });

  test('relation key on a forward to-one include keeps the [0] accessor outside', () => {
    expect(find(post, { author: { orderBy: { country: { name: 'asc' } } } })).toBe(
      `SELECT *, (SELECT * OMIT ${A0} FROM (SELECT *, countryId.name AS ${A0} FROM author WHERE id = $parent.authorId ORDER BY ${A0} ASC))[0] AS author FROM post`,
    );
  });

  test('a nested include keeps its select list and the alias joins it', () => {
    expect(find(author, { posts: { orderBy: { author: { name: 'asc' } }, include: { author: true } } })).toBe(
      `SELECT *, (SELECT * OMIT ${A0} FROM (SELECT *, authorId.* AS author, authorId.name AS ${A0} FROM post WHERE authorId = $parent.id ORDER BY ${A0} ASC)) AS posts FROM author`,
    );
  });

  test('an empty orderBy emits no clause', () => {
    expect(find(author, { posts: { orderBy: {}, limit: 1 } })).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id LIMIT 1) AS posts FROM author',
    );
  });
});

describe('include orderBy: rejected before any text is built', () => {
  const hostile = 'title) AS posts, (SELECT name, email FROM author ORDER BY name';

  test.each([
    [
      'hostile key',
      { orderBy: { [hostile]: 'asc' } },
      `Invalid orderBy in include 'posts': Unknown field '${hostile}' on model Post`,
    ],
    ['unknown key', { orderBy: { ttle: 'asc' } }, "Unknown field 'ttle' on model Post"],
    [
      'unknown key under a relation',
      { orderBy: { author: { nmae: 'asc' } } },
      "Unknown field 'author.nmae' on model Author",
    ],
    [
      'nested value on a scalar',
      { orderBy: { title: { x: 'asc' } } },
      "Cannot order by a nested path under 'title' on model Post",
    ],
    [
      'bare direction on a relation',
      { orderBy: { author: 'asc' } },
      "Cannot order by relation 'author' on model Post directly",
    ],
    ['invalid direction', { orderBy: { title: 'up' } }, "Order direction for 'title' must be 'asc' or 'desc'"],
    ['null direction', { orderBy: { title: null } }, 'Order direction'],
    ['limit injection', { limit: '1; REMOVE TABLE post' }, "Invalid limit/offset in include 'posts'"],
    ['negative offset', { offset: -1 }, "Invalid limit/offset in include 'posts'"],
  ])('%s', (_name, options, message) => {
    expect(() => find(author, { posts: options })).toThrow(message);
    expect(() => find(author, { posts: options })).not.toThrow(TypeError);
  });

  test('a hostile key is also refused inside a nested include', () => {
    expect(() => find(country, { authors: { include: { posts: { orderBy: { [hostile]: 'asc' } } } } })).toThrow(
      'Unknown field',
    );
  });

  test('a hostile key is refused on a forward to-one include', () => {
    expect(() => find(post, { author: { orderBy: { [hostile]: 'asc' } } })).toThrow('Unknown field');
  });
});

describe('include orderBy: emission is quoted even if validation were bypassed', () => {
  test('a key that is not a plain identifier is backtick-quoted, never bare', () => {
    expect(buildOrderBy({ 'title) AS posts, (SELECT 1': 'asc' } as never, post, registry)).toBe(
      'ORDER BY `title) AS posts, (SELECT 1` ASC',
    );
  });

  test('backticks and backslashes in a key are escaped', () => {
    expect(buildOrderBy({ 'a`b\\c': 'desc' } as never, post, registry)).toBe('ORDER BY `a\\`b\\\\c` DESC');
  });
});
