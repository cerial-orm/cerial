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
import { CerialUnknownFieldError, CerialValidationError } from '../../../src/errors';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import * as unchecked from '../../../src/query/filters/condition-builder';
import * as uncheckedTransform from '../../../src/query/filters/transformer';
import { author, post, registry } from '../query/relation-order-by-helpers';

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

// Bodies that pass validation but compile to no conditions: composed into a DELETE they would match every row.
const evaporating: Record<string, { body: string; model: typeof post; withRegistry: boolean }> = {
  emptyAnd: { body: '{"AND":[]}', model: post, withRegistry: true },
  andOfEmpty: { body: '{"AND":[{}]}', model: post, withRegistry: true },
  orOfEmpty: { body: '{"OR":[{}]}', model: post, withRegistry: true },
  emptyObjectField: { body: '{"address":{}}', model: post, withRegistry: true },
  emptyReverseRelation: { body: '{"posts":{}}', model: author, withRegistry: true },
  undefinedValue: { body: '{"title":null}', model: post, withRegistry: true },
  emptyObjectFieldNoRegistry: { body: '{"address":{}}', model: post, withRegistry: false },
};

describe.each(Object.entries(entries))(
  'exported where helpers (%s entry) refuse a filter with no conditions',
  (_n, api) => {
    for (const [label, { body, model, withRegistry }] of Object.entries(evaporating)) {
      const reg = withRegistry ? registry : undefined;
      const where = () => {
        const parsed = JSON.parse(body);
        // JSON cannot carry undefined; a key set to undefined is the usual way a filter evaporates
        if (label === 'undefinedValue') return { title: undefined };

        return parsed;
      };

      test(`transformWhere: ${label}`, () => {
        expect(() => api.transformWhere(where(), model, reg)).toThrow(CerialValidationError);
      });
      test(`transformWhereClause: ${label}`, () => {
        expect(() => api.transformWhereClause(where(), model, reg)).toThrow(CerialValidationError);
      });
      test(`buildConditions: ${label}`, () => {
        expect(() => api.buildConditions(createCompileContext(), where(), model, reg)).toThrow(CerialValidationError);
      });
    }

    test('an empty where and an undefined where still give empty text', () => {
      expect(api.transformWhere({}, post, registry)).toEqual({ text: '', vars: {} });
      expect(api.transformWhereClause({}, post, registry)).toEqual({ text: '', vars: {} });
      expect(api.transformWhereClause(undefined, post, registry)).toEqual({ text: '', vars: {} });
      expect(api.buildConditions(createCompileContext(), {}, post, registry).text).toBe('');
    });
  },
);

// Without a registry the target model is unknown, so a relation key would compile against the virtual
// relation field, which is always NONE. Every key that names a relation is refused, at any depth.
const relationBodies: Record<string, { body: string; model: typeof post }> = {
  isNone: { body: '{"posts":{"isNone":true}}', model: author },
  isNoneWithField: { body: '{"name":"a","posts":{"isNone":true}}', model: author },
  notSome: { body: '{"NOT":{"posts":{"some":{"title":"x"}}}}', model: author },
  notSomeMisspelt: { body: '{"NOT":{"posts":{"some":{"ttle":"x"}}}}', model: author },
  notSomeEmpty: { body: '{"NOT":{"posts":{"some":{}}}}', model: author },
  notNoneEmpty: { body: '{"NOT":{"posts":{"none":{}}}}', model: author },
  notDirectField: { body: '{"NOT":{"posts":{"title":"x"}}}', model: author },
  notIsEmpty: { body: '{"NOT":{"posts":{"isEmpty":true}}}', model: author },
  orSome: { body: '{"OR":[{"posts":{"some":{"title":"x"}}}]}', model: author },
  andNested: { body: '{"AND":[{"OR":[{"NOT":{"posts":{"some":{"title":"x"}}}}]}]}', model: author },
  forward: { body: '{"author":{"name":"bob"}}', model: post },
  forwardNot: { body: '{"NOT":{"author":{"name":"bob"}}}', model: post },
  forwardIsNone: { body: '{"author":{"isNone":true}}', model: post },
};

describe.each(Object.entries(entries))(
  'exported where helpers (%s entry) refuse a relation filter without a registry',
  (_n, api) => {
    for (const [label, { body, model }] of Object.entries(relationBodies)) {
      test(`transformWhere: ${label}`, () => {
        expect(() => api.transformWhere(JSON.parse(body), model)).toThrow(CerialValidationError);
      });
      test(`transformWhereClause: ${label}`, () => {
        expect(() => api.transformWhereClause(JSON.parse(body), model)).toThrow(CerialValidationError);
      });
      test(`buildConditions: ${label}`, () => {
        expect(() => api.buildConditions(createCompileContext(), JSON.parse(body), model)).toThrow(
          CerialValidationError,
        );
      });
    }

    test('the message says a model registry is required', () => {
      expect(() => api.transformWhereClause({ posts: { isNone: true } } as never, author)).toThrow(
        /model registry is required/,
      );
    });

    test('positive: the same relation filters with a registry compile to a relation subquery', () => {
      const out = api.transformWhereClause({ NOT: { posts: { some: { title: 'x' } } } } as never, author, registry);

      expect(out.text).toContain('SELECT VALUE');
      expect(out.text).not.toContain('posts =');
      expect(Object.values(out.vars)).toEqual(['x']);
    });

    test('positive: wheres with no relation key still compile without a registry', () => {
      expect(api.transformWhereClause({ name: 'a', OR: [{ NOT: { name: 'b' } }] } as never, author).text).toMatch(
        /^WHERE /,
      );
      expect(api.transformWhere({ address: { city: 'Oslo' } } as never, post).text).toMatch(/^address\.city = /);
      expect(api.buildConditions(createCompileContext(), { title: 'x' }, post).text).toMatch(/title = /);
      expect(api.transformWhereClause({}, author)).toEqual({ text: '', vars: {} });
    });
  },
);
