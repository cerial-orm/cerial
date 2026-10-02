/**
 * Unit Tests: relation fields in orderBy
 *
 * SurrealDB does not sort on `link.field`, so the builder projects the linked value to an
 * alias on an inner query and the outer query OMITs it. These pin the full emitted text.
 */

import { describe, expect, test } from 'bun:test';
import { buildFindManyQuery, buildFindOneQuery, buildOrderBy } from '../../../src/query/builders';
import { validateOrderBy } from '../../../src/query/validators';
import { author, country, post, registry } from './relation-order-by-helpers';

const A0 = '__cerial_ord_0';
const A1 = '__cerial_ord_1';

describe('buildFindManyQuery with a relation orderBy', () => {
  test('simple ascending', () => {
    expect(buildFindManyQuery(post, { orderBy: { author: { name: 'asc' } } } as never, registry)).toEqual({
      text: `SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post ORDER BY ${A0} ASC)`,
      vars: {},
    });
  });

  test('descending', () => {
    expect(buildFindManyQuery(post, { orderBy: { author: { name: 'desc' } } } as never, registry).text).toBe(
      `SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post ORDER BY ${A0} DESC)`,
    );
  });

  test('select, where, limit and offset all stay on the inner query so paging follows sorting', () => {
    const query = buildFindManyQuery(
      post,
      {
        select: { title: true },
        where: { title: 'T' },
        orderBy: { author: { name: 'asc' } },
        limit: 2,
        offset: 4,
      } as never,
      registry,
    );

    expect(query.text).toBe(
      `SELECT * OMIT ${A0} FROM (SELECT title, authorId.name AS ${A0} FROM post WHERE title = $title_eq_0 ORDER BY ${A0} ASC LIMIT 2 START 4)`,
    );
    expect(query.vars).toEqual({ title_eq_0: 'T' });
  });

  test('findOne keeps FROM ONLY on the outer query and LIMIT 1 on the inner', () => {
    expect(buildFindOneQuery(post, { orderBy: { author: { name: 'desc' } } } as never, registry).text).toBe(
      `SELECT * OMIT ${A0} FROM ONLY (SELECT *, authorId.name AS ${A0} FROM post ORDER BY ${A0} DESC LIMIT 1)`,
    );
  });

  test('own, object and relation keys keep their declared order', () => {
    const query = buildFindManyQuery(
      post,
      { orderBy: { title: 'desc', author: { name: 'asc' }, address: { city: 'asc' }, id: 'asc' } } as never,
      registry,
    );

    expect(query.text).toBe(
      `SELECT * OMIT ${A0} FROM (SELECT *, authorId.name AS ${A0} FROM post ORDER BY title DESC, ${A0} ASC, address.city ASC, id ASC)`,
    );
  });

  test('several relation keys get one alias each, all omitted', () => {
    const query = buildFindManyQuery(post, { orderBy: { author: { name: 'asc', id: 'desc' } } } as never, registry);

    expect(query.text).toBe(
      `SELECT * OMIT ${A0}, ${A1} FROM (SELECT *, authorId.name AS ${A0}, authorId.id AS ${A1} FROM post ORDER BY ${A0} ASC, ${A1} DESC)`,
    );
  });

  test('chains through a second link', () => {
    const query = buildFindManyQuery(post, { orderBy: { author: { country: { name: 'desc' } } } } as never, registry);

    expect(query.text).toBe(
      `SELECT * OMIT ${A0} FROM (SELECT *, authorId.countryId.name AS ${A0} FROM post ORDER BY ${A0} DESC)`,
    );
  });

  test('reaches an object sub-field on the target', () => {
    const query = buildFindManyQuery(post, { orderBy: { author: { address: { city: 'asc' } } } } as never, registry);

    expect(query.text).toBe(
      `SELECT * OMIT ${A0} FROM (SELECT *, authorId.address.city AS ${A0} FROM post ORDER BY ${A0} ASC)`,
    );
  });

  test('an empty relation orderBy emits no wrapper', () => {
    expect(buildFindManyQuery(post, { orderBy: { author: {} } } as never, registry).text).toBe('SELECT * FROM post');
  });

  test('without a relation key the query is unchanged', () => {
    expect(buildFindManyQuery(post, { orderBy: { title: 'asc' }, limit: 3 }, registry).text).toBe(
      'SELECT * FROM post ORDER BY title ASC LIMIT 3',
    );
  });

  test('buildOrderBy throws rather than emitting a bare link path when it cannot resolve the relation', () => {
    expect(() => buildOrderBy({ author: { name: 'asc' } } as never, post)).toThrow(/Cannot order by relation 'author'/);
  });
});

describe('validateOrderBy with relations', () => {
  test('accepts a forward to-one relation, a chain and an optional relation', () => {
    expect(validateOrderBy({ author: { name: 'asc' } }, post, registry)).toEqual([]);
    expect(validateOrderBy({ author: { country: { name: 'desc' } } }, post, registry)).toEqual([]);
    expect(validateOrderBy({ author: { address: { city: 'asc' } } }, post, registry)).toEqual([]);
  });

  test('ignores an undefined relation value', () => {
    expect(validateOrderBy({ author: undefined }, post, registry)).toEqual([]);
  });

  test('rejects an unknown field under a relation, naming the path and the target model', () => {
    const errors = validateOrderBy({ author: { nmae: 'asc' } }, post, registry);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('author.nmae');
    expect(errors[0]!.message).toBe(
      "Unknown field 'author.nmae' on model Author — check the field name against the schema",
    );
  });

  test('rejects an unknown field two links deep', () => {
    const errors = validateOrderBy({ author: { country: { nmae: 'asc' } } }, post, registry);

    expect(errors[0]!.message).toContain("'author.country.nmae' on model Country");
  });

  test('rejects an invalid direction under a relation', () => {
    const errors = validateOrderBy({ author: { name: 'up' } } as never, post, registry);

    expect(errors[0]!.message).toContain("Order direction for 'author.name' must be 'asc' or 'desc'");
  });

  test('rejects a relation given a direction instead of a field', () => {
    const errors = validateOrderBy({ author: 'asc' } as never, post, registry);

    expect(errors[0]!.message).toContain("Cannot order by relation 'author' on model Post directly");
    expect(errors[0]!.message).toContain('Author');
  });

  test('rejects a reverse relation', () => {
    const errors = validateOrderBy({ posts: { title: 'asc' } } as never, author, registry);

    expect(errors[0]!.message).toBe(
      "Cannot order by reverse relation 'posts' on model Author — it has no foreign key on this side, so there is nothing to sort by",
    );
  });

  test('rejects a reverse relation reached through a link', () => {
    const errors = validateOrderBy({ author: { posts: { title: 'asc' } } } as never, post, registry);

    expect(errors[0]!.message).toContain("reverse relation 'author.posts' on model Author");
  });

  test('rejects a to-many relation', () => {
    const errors = validateOrderBy({ editors: { name: 'asc' } } as never, post, registry);

    expect(errors[0]!.message).toContain("to-many relation 'editors' on model Post");
  });

  test('rejects a relation when the target model is not in the registry', () => {
    const errors = validateOrderBy({ author: { name: 'asc' } }, post, {});

    expect(errors[0]!.message).toContain('target model Author is not in the registry');
  });

  test('rejects a relation when no registry is given', () => {
    expect(validateOrderBy({ author: { name: 'asc' } }, post)).toHaveLength(1);
  });

  test('a model with only reverse relations rejects them too', () => {
    expect(validateOrderBy({ authors: { name: 'asc' } } as never, country, registry)).toHaveLength(1);
  });
});
