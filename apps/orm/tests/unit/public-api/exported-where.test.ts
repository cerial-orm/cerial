/**
 * Unit tests: `transformWhere`, `transformWhereClause` and `buildConditions` exported from the package refuse
 * what the client refuses.
 *
 * They used to skip a key that names no field, so `{ nmae: 'x' }` compiled to empty text and an app composing
 * `DELETE FROM t ${text}` deleted every row. A valid where must give the text and vars it always gave.
 */

import { describe, expect, test } from 'bun:test';
import { buildConditions, sql, transformWhere, transformWhereClause } from '../../../src';
import * as queryEntry from '../../../src/query';
import { CerialUnknownFieldError } from '../../../src/errors';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import * as unchecked from '../../../src/query/filters/condition-builder';
import * as uncheckedTransform from '../../../src/query/filters/transformer';
import { post, registry } from '../query/relation-order-by-helpers';

const hostile: Record<string, string> = {
  typo: '{"nmae":"t1"}',
  proto: '{"__proto__":{"name":"t1"}}',
  space: '{"title ":"t1"}',
  constructor: '{"constructor":"t1"}',
  raw: '{"$raw":"true"}',
  nestedAnd: '{"AND":[{"nmae":"t1"}]}',
  nestedOr: '{"OR":[{"x":1}]}',
  nestedNot: '{"NOT":{"x":1}}',
  unknownOperator: '{"title":{"eqq":"t1"}}',
  relationSubKey: '{"author":{"nmae":"t1"}}',
  strictObjectSubKey: '{"address":{"cty":"Oslo"}}',
};

const entries = {
  root: { transformWhere, transformWhereClause, buildConditions },
  query: {
    transformWhere: queryEntry.transformWhere,
    transformWhereClause: queryEntry.transformWhereClause,
    buildConditions: queryEntry.buildConditions,
  },
};

describe.each(Object.entries(entries))('exported where helpers (%s entry) refuse hostile keys', (_name, api) => {
  for (const [label, body] of Object.entries(hostile)) {
    const where = () => JSON.parse(body);

    test(`transformWhere: ${label}`, () => {
      expect(() => api.transformWhere(where(), post, registry)).toThrow();
    });
    test(`transformWhereClause: ${label}`, () => {
      expect(() => api.transformWhereClause(where(), post, registry)).toThrow();
    });
    test(`buildConditions: ${label}`, () => {
      expect(() => api.buildConditions(createCompileContext(), where(), post, registry)).toThrow();
    });
  }

  test('an unknown key throws the named unknown-field error', () => {
    expect(() => api.transformWhereClause({ nmae: 't1' } as never, post, registry)).toThrow(CerialUnknownFieldError);
  });
});

describe('exported where helpers keep their output for a valid where', () => {
  const wheres = {
    field: { title: 't1' },
    operators: { title: { contains: 'x' }, id: { in: ['post:1', 'post:2'] } },
    logical: { OR: [{ title: 'a' }, { NOT: { title: 'b' } }], AND: [{ title: { startsWith: 'c' } }] },
    nested: { address: { city: 'Oslo' } },
    relation: { author: { name: 'bob' } },
    raw: { $raw: sql`title = ${'x'}` },
    empty: {},
  };

  for (const [label, where] of Object.entries(wheres)) {
    test(label, () => {
      expect(transformWhere(where as never, post, registry)).toEqual(
        uncheckedTransform.transformWhere(where as never, post, registry),
      );
      expect(transformWhereClause(where as never, post, registry)).toEqual(
        uncheckedTransform.transformWhereClause(where as never, post, registry),
      );
      expect(buildConditions(createCompileContext(), where as never, post, registry)).toEqual(
        unchecked.buildConditions(createCompileContext(), where as never, post, registry),
      );
    });
  }

  test('real output for a plain field', () => {
    const out = transformWhereClause({ title: 't1' }, post, registry);

    expect(out.text).toMatch(/^WHERE title = \$\w+$/);
    expect(Object.values(out.vars)).toEqual(['t1']);
  });

  test('real output for a raw fragment', () => {
    const out = transformWhere({ $raw: sql`title = ${'x'}` } as never, post, registry);

    expect(out.text).toContain('title = ');
    expect(Object.values(out.vars)).toEqual(['x']);
  });

  test('undefined where gives empty text', () => {
    expect(transformWhereClause(undefined, post, registry)).toEqual({ text: '', vars: {} });
  });
});
