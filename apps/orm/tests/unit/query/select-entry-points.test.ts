/**
 * Unit Tests: every entry point that takes select/orderBy/limit/offset rejects bad values
 */

import { describe, expect, test } from 'bun:test';
import {
  compileCreate,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
} from '../../../src/query/builder';
import { post, registry } from './select-validation-helpers';

const unknownSelect = "Invalid select: Unknown field 'typo' on model Post";
const postData = {
  title: 'T',
  authorId: 'author:1',
  address: { city: 'c', geo: { lat: 1, lng: 2 } },
  loose: { city: 'c', geo: { lat: 1, lng: 2 } },
  spot: ['l', { lat: 1, lng: 2 }],
};
const typo = { typo: true } as never;

describe('select typo rejected', () => {
  test('compileFindOne', () => {
    expect(() => compileFindOne(post, { select: typo }, registry)).toThrow(unknownSelect);
  });

  test('compileFindUnique', () => {
    expect(() => compileFindUnique(post, { where: { id: 'post:1' }, select: typo }, registry)).toThrow(unknownSelect);
  });

  test('compileFindMany', () => {
    expect(() => compileFindMany(post, { select: typo }, registry)).toThrow(unknownSelect);
  });

  test('compileCreate', () => {
    expect(() => compileCreate(post, { data: postData, select: typo }, registry)).toThrow(unknownSelect);
  });

  test('compileUpdateMany', () => {
    expect(() =>
      compileUpdateMany(post, { where: { title: 'T' }, data: { title: 'U' }, select: typo }, registry),
    ).toThrow(unknownSelect);
  });

  test('compileUpdateUnique', () => {
    expect(() =>
      compileUpdateUnique(post, { where: { id: 'post:1' }, data: { title: 'U' }, select: typo }, registry),
    ).toThrow(unknownSelect);
  });

  test('compileUpsert', () => {
    expect(() =>
      compileUpsert(
        post,
        { where: { id: 'post:1' }, create: postData, update: { title: 'U' }, select: typo },
        registry,
      ),
    ).toThrow(unknownSelect);
  });

  test('object sub-key typo through compileFindMany', () => {
    expect(() => compileFindMany(post, { select: { address: { cty: true } } as never }, registry)).toThrow(
      "Invalid select: Unknown field 'address.cty' on model Post",
    );
  });
});

describe('valid select still compiles', () => {
  test('@now field', () => {
    expect(compileFindMany(post, { select: { accessedAt: true } }, registry).query.text).toContain('accessedAt');
  });

  test('flexible sub-key', () => {
    expect(() => compileFindMany(post, { select: { loose: { extra: true } } as never }, registry)).not.toThrow();
  });
});

describe('orderBy rejected', () => {
  test('unknown key on compileFindMany', () => {
    expect(() => compileFindMany(post, { orderBy: { titel: 'asc' } as never }, registry)).toThrow(
      "Invalid orderBy: Unknown field 'titel' on model Post",
    );
  });

  test('unknown key on compileFindOne', () => {
    expect(() => compileFindOne(post, { orderBy: { titel: 'asc' } as never }, registry)).toThrow('Invalid orderBy');
  });

  test('unknown field under a relation', () => {
    expect(() => compileFindMany(post, { orderBy: { author: { nmae: 'asc' } } as never }, registry)).toThrow(
      "Invalid orderBy: Unknown field 'author.nmae' on model Author",
    );
  });

  test('relation field is accepted by compileFindMany and compileFindOne', () => {
    const orderBy = { author: { name: 'asc' } } as never;

    expect(compileFindMany(post, { orderBy }, registry).query.text).toContain('AS __cerial_ord_0');
    expect(compileFindOne(post, { orderBy }, registry).query.text).toContain('FROM ONLY (SELECT');
  });

  test('invalid direction', () => {
    expect(() => compileFindMany(post, { orderBy: { title: 'sideways' } as never }, registry)).toThrow(
      "Invalid orderBy: Order direction for 'title' must be 'asc' or 'desc'",
    );
  });

  test('valid nested object orderBy compiles', () => {
    const { query } = compileFindMany(post, { orderBy: { address: { geo: { lat: 'DESC' } } } as never }, registry);
    expect(query.text).toContain('ORDER BY address.geo.lat DESC');
  });
});

describe('limit/offset rejected', () => {
  test.each([1.5, -1, Number.NaN, '5'])('limit %p', (bad) => {
    expect(() => compileFindMany(post, { limit: bad as never }, registry)).toThrow(
      'Invalid limit/offset: limit must be a non-negative integer',
    );
  });

  test.each([1.5, -1, Number.NaN, '5'])('offset %p', (bad) => {
    expect(() => compileFindMany(post, { offset: bad as never }, registry)).toThrow(
      'Invalid limit/offset: offset must be a non-negative integer',
    );
  });

  test('0 limit and offset compile', () => {
    const { query } = compileFindMany(post, { limit: 0, offset: 0 }, registry);
    expect(query.text).toContain('LIMIT 0');
    expect(query.text).toContain('START 0');
  });
});
