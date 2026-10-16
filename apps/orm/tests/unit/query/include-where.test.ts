/**
 * Unit Tests: where inside include
 *
 * The filter lands in the inner subquery beside the relation's join condition, before ORDER BY,
 * LIMIT and START, so paging follows filtering. Every value is bound under an `inc_` name taken
 * from one compile context per query. These pin the full emitted text and the bound variables.
 */

import { describe, expect, test } from 'bun:test';
import { buildFindManyQuery } from '../../../src/query/builders';
import { author, country, post, registry } from './relation-order-by-helpers';

const A0 = '__cerial_ord_0';

function build(model: typeof author, include: object, where?: object): { text: string; vars: Record<string, unknown> } {
  const { text, vars } = buildFindManyQuery(model, { include, where } as never, registry);

  return { text, vars };
}

describe('include where: join condition and filter share one WHERE', () => {
  test('reverse array relation', () => {
    expect(build(author, { posts: { where: { title: 'a' } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0)) AS posts FROM author',
      vars: { inc_title_eq_0: 'a' },
    });
  });

  test('forward to-one relation keeps the [0] accessor outside the subquery', () => {
    expect(build(post, { author: { where: { name: 'x' } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM author WHERE id = $parent.authorId AND (name = $inc_name_eq_0))[0] AS author FROM post',
      vars: { inc_name_eq_0: 'x' },
    });
  });

  test('forward array relation filters the INSIDE set', () => {
    expect(build(post, { editors: { where: { name: 'y' } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM author WHERE id INSIDE $parent.editorIds AND (name = $inc_name_eq_0)) AS editors FROM post',
      vars: { inc_name_eq_0: 'y' },
    });
  });

  test('reverse relation to a different model', () => {
    expect(build(country, { authors: { where: { name: 'n' } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM author WHERE countryId = $parent.id AND (name = $inc_name_eq_0)) AS authors FROM country',
      vars: { inc_name_eq_0: 'n' },
    });
  });

  test('the top-level where is untouched and binds in its own namespace', () => {
    expect(build(author, { posts: { where: { title: 'a' } } }, { name: 'top' })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0)) AS posts FROM author WHERE name = $name_eq_0',
      vars: { inc_title_eq_0: 'a', name_eq_0: 'top' },
    });
  });
});

describe('include where: combined with orderBy, limit and offset', () => {
  test('with orderBy', () => {
    expect(build(author, { posts: { where: { title: 'a' }, orderBy: { title: 'asc' } } }).text).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0) ORDER BY title ASC) AS posts FROM author',
    );
  });

  test('with limit', () => {
    expect(build(author, { posts: { where: { title: 'a' }, limit: 2 } }).text).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0) LIMIT 2) AS posts FROM author',
    );
  });

  test('with offset', () => {
    expect(build(author, { posts: { where: { title: 'a' }, offset: 3 } }).text).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0) START 3) AS posts FROM author',
    );
  });

  test('with orderBy, limit and offset together, the filter precedes all three', () => {
    expect(
      build(author, { posts: { where: { title: 'a' }, orderBy: { title: 'desc' }, limit: 2, offset: 1 } }),
    ).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0) ORDER BY title DESC LIMIT 2 START 1) AS posts FROM author',
      vars: { inc_title_eq_0: 'a' },
    });
  });

  test('to-one relation with all four keeps the [0] accessor', () => {
    expect(build(post, { author: { where: { name: 'x' }, orderBy: { name: 'asc' }, limit: 1, offset: 0 } }).text).toBe(
      'SELECT *, (SELECT * FROM author WHERE id = $parent.authorId AND (name = $inc_name_eq_0) ORDER BY name ASC LIMIT 1 START 0)[0] AS author FROM post',
    );
  });

  test('a relation orderBy key goes through the alias; the filter stays on the inner query', () => {
    expect(
      build(author, { posts: { where: { title: 'a' }, orderBy: { author: { name: 'asc' } }, limit: 2, offset: 1 } }),
    ).toEqual({
      text: `SELECT *, (SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0) ORDER BY ${A0} ASC LIMIT 2 START 1)) AS posts FROM author`,
      vars: { inc_title_eq_0: 'a' },
    });
  });
});

describe('include where: operators and keys', () => {
  test('AND of several conditions', () => {
    expect(build(author, { posts: { where: { AND: [{ title: 'a' }, { title: { not: 'b' } }] } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND ((title = $inc_title_eq_0 AND title != $inc_title_not_1))) AS posts FROM author',
      vars: { inc_title_eq_0: 'a', inc_title_not_1: 'b' },
    });
  });

  test('OR groups its branches inside the filter parentheses', () => {
    expect(
      build(author, { posts: { where: { OR: [{ title: { contains: 'b' } }, { title: { startsWith: 'c' } }] } } }),
    ).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND ((string::contains(title, $inc_title_contains_0) OR string::starts_with(title, $inc_title_startsWith_1)))) AS posts FROM author',
      vars: { inc_title_contains_0: 'b', inc_title_startsWith_1: 'c' },
    });
  });

  test('NOT negates the condition', () => {
    expect(build(author, { posts: { where: { NOT: { title: 'a' } } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (NOT (title = $inc_title_eq_0))) AS posts FROM author',
      vars: { inc_title_eq_0: 'a' },
    });
  });

  test('an object sub-key filters on dot notation', () => {
    expect(build(author, { posts: { where: { address: { city: 'Oslo' } } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (address.city = $inc_address_city_eq_0)) AS posts FROM author',
      vars: { inc_address_city_eq_0: 'Oslo' },
    });
  });

  test('a relation key filters through the linked record', () => {
    expect(build(author, { posts: { where: { author: { name: 'z' } } } })).toEqual({
      text: 'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (authorId.name = $inc_authorId_name_eq_0)) AS posts FROM author',
      vars: { inc_authorId_name_eq_0: 'z' },
    });
  });

  test('a relation key in where and in orderBy together', () => {
    expect(
      build(author, { posts: { where: { author: { name: 'z' } }, orderBy: { author: { name: 'asc' } } } }),
    ).toEqual({
      text: `SELECT *, (SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post WHERE authorId = $parent.id AND (authorId.name = $inc_authorId_name_eq_0) ORDER BY ${A0} ASC)) AS posts FROM author`,
      vars: { inc_authorId_name_eq_0: 'z' },
    });
  });
});

describe('include where: nested includes and siblings', () => {
  test('a where at each level of a nested include', () => {
    expect(
      build(country, { authors: { where: { name: 'a' }, include: { posts: { where: { title: 'b' } } } } }),
    ).toEqual({
      text: 'SELECT *, (SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0)) AS posts FROM author WHERE countryId = $parent.id AND (name = $inc_name_eq_1)) AS authors FROM country',
      vars: { inc_title_eq_0: 'b', inc_name_eq_1: 'a' },
    });
  });

  test('a nested where under an unfiltered parent', () => {
    expect(build(country, { authors: { include: { posts: { where: { title: 'b' } } } } })).toEqual({
      text: 'SELECT *, (SELECT *, (SELECT * FROM post WHERE authorId = $parent.id AND (title = $inc_title_eq_0)) AS posts FROM author WHERE countryId = $parent.id) AS authors FROM country',
      vars: { inc_title_eq_0: 'b' },
    });
  });

  test('a filtered parent over an unfiltered nested include', () => {
    expect(build(country, { authors: { where: { name: 'a' }, include: { posts: true } } })).toEqual({
      text: 'SELECT *, (SELECT *, (SELECT * FROM post WHERE authorId = $parent.id) AS posts FROM author WHERE countryId = $parent.id AND (name = $inc_name_eq_0)) AS authors FROM country',
      vars: { inc_name_eq_0: 'a' },
    });
  });

  test('two sibling relations filtering the same field name bind distinct variables with their own values', () => {
    const { text, vars } = build(post, { author: { where: { name: 'x' } }, editors: { where: { name: 'y' } } });

    expect(text).toBe(
      'SELECT *, (SELECT * FROM author WHERE id = $parent.authorId AND (name = $inc_name_eq_0))[0] AS author, (SELECT * FROM author WHERE id INSIDE $parent.editorIds AND (name = $inc_name_eq_1)) AS editors FROM post',
    );
    expect(vars).toEqual({ inc_name_eq_0: 'x', inc_name_eq_1: 'y' });
    expect(Object.keys(vars)).toHaveLength(2);
  });

  test('two siblings filtering the same field with the same value still bind separately', () => {
    const { vars } = build(post, { author: { where: { name: 'same' } }, editors: { where: { name: 'same' } } });

    expect(Object.keys(vars)).toHaveLength(2);
    expect(Object.values(vars)).toEqual(['same', 'same']);
  });
});

describe('include where: absent or empty filters leave the query unchanged', () => {
  const plain = build(author, { posts: true }).text;
  const plainOptions = build(author, { posts: { orderBy: { title: 'asc' }, limit: 2, offset: 1 } }).text;

  test('the baseline text is the un-filtered form', () => {
    expect(plain).toBe('SELECT *, (SELECT * FROM post WHERE authorId = $parent.id) AS posts FROM author');
  });

  test('where: {} produces exactly the un-filtered text and binds nothing', () => {
    const query = build(author, { posts: { where: {} } });

    expect(query.text).toBe('SELECT *, (SELECT * FROM post WHERE authorId = $parent.id) AS posts FROM author');
    expect(query.text).toBe(plain);
    expect(query.vars).toEqual({});
  });

  test('where: undefined produces exactly the un-filtered text and binds nothing', () => {
    const query = build(author, { posts: { where: undefined } });

    expect(query.text).toBe(plain);
    expect(query.vars).toEqual({});
  });

  test('an empty where beside orderBy, limit and offset matches the same options without it', () => {
    expect(build(author, { posts: { where: {}, orderBy: { title: 'asc' }, limit: 2, offset: 1 } }).text).toBe(
      plainOptions,
    );
    expect(plainOptions).toBe(
      'SELECT *, (SELECT * FROM post WHERE authorId = $parent.id ORDER BY title ASC LIMIT 2 START 1) AS posts FROM author',
    );
  });

  test('an empty where on a to-one relation matches the dot-notation form', () => {
    expect(build(post, { author: { where: {} } }).text).toBe(build(post, { author: true }).text);
  });

  test('an empty where does not shift the numbering of a sibling filter', () => {
    expect(build(post, { author: { where: {} }, editors: { where: { name: 'y' } } })).toEqual({
      text: 'SELECT *, authorId.* AS author, (SELECT * FROM author WHERE id INSIDE $parent.editorIds AND (name = $inc_name_eq_0)) AS editors FROM post',
      vars: { inc_name_eq_0: 'y' },
    });
  });
});
