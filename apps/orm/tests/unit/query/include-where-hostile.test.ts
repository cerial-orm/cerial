/**
 * Unit Tests: no hostile key or value in an include `where` reaches query text
 *
 * Every payload either throws a CerialValidationError or CerialUnknownFieldError, or is compiled
 * with the payload absent from the emitted text and present in the bound variables.
 */

import { describe, expect, test } from 'bun:test';
import { CerialUnknownFieldError, CerialValidationError } from '../../../src/errors';
import { buildFindManyQuery } from '../../../src/query/builders';
import { RESERVED_KEYWORDS } from '../../../src/cli/validators';
import { author, country, post, registry } from './relation-order-by-helpers';

const PAYLOADS = [
  "a' OR '1'='1",
  'a" OR "1"="1',
  'a`b',
  '`title`',
  'a; DROP TABLE post; --',
  'a-- comment',
  'a/* comment */b',
  'a) OR (1=1',
  'a) OR true; --',
  'title.id',
  '../title',
  'tіtle', // Cyrillic 'і' (U+0456), not the Latin 'i'
  'title​', // zero-width space
];

type Compiled = { text: string; vars: Record<string, unknown> };

const compile = (model: typeof author, include: object): Compiled =>
  buildFindManyQuery(model, { include } as never, registry) as Compiled;

const posts = (where: unknown): Compiled => compile(author, { posts: { where } });

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
};

const expectUnknownField = (fn: () => unknown): void => {
  expect(thrownBy(fn)).toBeInstanceOf(CerialUnknownFieldError);
};

const expectValidationError = (fn: () => unknown): void => {
  expect(thrownBy(fn)).toBeInstanceOf(CerialValidationError);
};

/** The payload is bound and never written into the text; the text keeps no quoting or comment syntax. */
const expectBoundOnly = (compiled: Compiled, payload: string): void => {
  expect(compiled.text).not.toContain(payload);
  expect(compiled.text).not.toMatch(/['"`;]|\/\*|--/);
  expect(JSON.stringify(compiled.vars)).toContain(JSON.stringify(payload));
  for (const placeholder of compiled.text.match(/\$[^\s,)]*/g) ?? [])
    expect(placeholder).toMatch(/^\$(parent|[A-Za-z0-9_]+_inc_[0-9]+)(\.[A-Za-z]+)?$/);
};

describe.each(PAYLOADS)('payload %j', (payload) => {
  describe('as a key', () => {
    test('top-level field key throws', () => {
      expectUnknownField(() => posts({ [payload]: 'x' }));
    });

    test('object sub-key throws', () => {
      expectUnknownField(() => posts({ address: { [payload]: 'x' } }));
    });

    test('relation sub-key throws', () => {
      expectUnknownField(() => posts({ author: { [payload]: 'x' } }));
    });

    test('key inside NOT, AND and OR throws', () => {
      expectUnknownField(() => posts({ NOT: { [payload]: 'x' } }));
      expectUnknownField(() => posts({ AND: [{ [payload]: 'x' }] }));
      expectUnknownField(() => posts({ OR: [{ title: 'ok' }, { [payload]: 'x' }] }));
    });

    test('operator name throws', () => {
      expectValidationError(() => posts({ title: { [payload]: 'x' } }));
    });

    test('key in the innermost where of nested includes throws', () => {
      expectUnknownField(() => compile(country, { authors: { include: { posts: { where: { [payload]: 'x' } } } } }));
      expectUnknownField(() =>
        compile(country, { authors: { include: { posts: { include: { author: { where: { [payload]: 'x' } } } } } } }),
      );
    });
  });

  describe('as a value', () => {
    test('equality value is bound', () => {
      expectBoundOnly(posts({ title: payload }), payload);
    });

    test.each(['not', 'contains', 'startsWith', 'endsWith', 'gt', 'lt'])('%s operand is bound', (operator) => {
      expectBoundOnly(posts({ title: { [operator]: payload } }), payload);
    });

    test('in and notIn members are bound', () => {
      expectBoundOnly(posts({ title: { in: [payload, 'ok'] } }), payload);
      expectBoundOnly(posts({ title: { notIn: [payload] } }), payload);
    });

    test('object sub-key value is bound', () => {
      expectBoundOnly(posts({ address: { city: payload } }), payload);
    });

    test('relation sub-key value is bound', () => {
      expectBoundOnly(posts({ author: { name: payload } }), payload);
    });

    test('value inside NOT, AND and OR is bound', () => {
      expectBoundOnly(posts({ NOT: { title: payload } }), payload);
      expectBoundOnly(posts({ AND: [{ title: payload }, { title: 'ok' }] }), payload);
      expectBoundOnly(posts({ OR: [{ title: payload }, { title: 'ok' }] }), payload);
    });

    test('value in the innermost where of nested includes is bound with its own variable', () => {
      const compiled = compile(country, {
        authors: { where: { name: 'outer' }, include: { posts: { where: { title: payload } } } },
      });
      expectBoundOnly(compiled, payload);
      expect(compiled.vars).toMatchObject({ name_eq_inc_1: 'outer' });
      expect(Object.keys(compiled.vars)).toHaveLength(2);
    });
  });
});

describe('a key that is not a field of the included model', () => {
  test('a field that exists on no model throws', () => {
    expectUnknownField(() => posts({ nope: 'x' }));
  });

  test('a field of the parent model throws', () => {
    expectUnknownField(() => posts({ name: 'x' }));
    expectUnknownField(() => compile(author, { posts: { where: { countryId: 'x' } } }));
  });

  test('a field of another model reached through no relation throws', () => {
    expectUnknownField(() => compile(country, { authors: { where: { title: 'x' } } }));
    expectUnknownField(() => compile(author, { country: { where: { title: 'x' } } }));
  });

  test('a field of the related model written beside the relation throws', () => {
    expectUnknownField(() => posts({ authorId: 'author:1', name: 'x' }));
  });

  test('the sub-key of another model object throws', () => {
    expectUnknownField(() => posts({ author: { address: { nope: 'x' } } }));
  });

  test('the error names the included model', () => {
    expect(String(thrownBy(() => posts({ name: 'x' })))).toContain('Unknown field');
    expect(String(thrownBy(() => posts({ name: 'x' })))).toContain('model Post');
  });
});

describe('malformed keys', () => {
  test.each([
    ['empty string', ''],
    ['leading space', ' title'],
    ['trailing space', 'title '],
    ['only a space', ' '],
    ['wrong case', 'Title'],
    ['array index', 'title[0]'],
  ])('%s throws', (_name, key) => {
    expectUnknownField(() => posts({ [key]: 'x' }));
  });

  test('a reserved SurrealDB keyword that is not a field throws', () => {
    const modelFields = new Set(post.fields.map((f) => f.name.toLowerCase()));
    const keywords = [...RESERVED_KEYWORDS].filter((k) => !modelFields.has(k));
    expect(keywords.length).toBeGreaterThan(40);
    for (const keyword of keywords) {
      expectUnknownField(() => posts({ [keyword]: 'x' }));
      // AND, OR and NOT are the logical operators, not unknown fields, once upper-cased
      if (!['and', 'or', 'not'].includes(keyword)) expectUnknownField(() => posts({ [keyword.toUpperCase()]: 'x' }));
    }
  });

  test('a reserved keyword as a value is bound', () => {
    for (const keyword of ['select', 'DELETE', 'return', 'NONE']) expectBoundOnly(posts({ title: keyword }), keyword);
  });

  test('prototype-chain names as field keys throw', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__', 'isPrototypeOf']) {
      expectUnknownField(() => posts({ [key]: 'x' }));
      expectUnknownField(() => posts({ address: { [key]: 'x' } }));
    }
  });

  test('__proto__ as an own key from JSON throws', () => {
    expectUnknownField(() => posts(JSON.parse('{"__proto__": {"title": "x"}}')));
  });

  test('a non-object where throws instead of compiling', () => {
    expect(() => posts('title')).toThrow('where must be an object');
    expect(() => posts(['title'])).toThrow('where must be an object');
  });
});

describe('an object pretending to be an operator', () => {
  test.each(['$ne', '$gt', '$or', '$where', 'eq) OR (1=1', 'eq; DROP', 'foo', 'EQ', 'Not', ' eq'])(
    'operator %j throws',
    (operator) => {
      expectValidationError(() => posts({ title: { [operator]: 'x' } }));
    },
  );

  test('a real operator beside an unknown one throws', () => {
    expectValidationError(() => posts({ title: { eq: 'x', $ne: 'y' } }));
    expectValidationError(() => posts({ title: { eq: 'x', 'eq) OR (1=1': 'y' } }));
  });

  test('an unknown operator on an object sub-key throws', () => {
    for (const operator of ['$ne', 'eq) OR (1=1', 'eq; DROP']) {
      expectValidationError(() => posts({ address: { city: { [operator]: 'x' } } }));
    }
  });

  test('an unknown operator on a relation sub-key throws', () => {
    expectValidationError(() => posts({ author: { name: { $ne: 'x' } } }));
  });

  test('an unknown operator in nested includes throws', () => {
    expectValidationError(() =>
      compile(country, { authors: { include: { posts: { where: { title: { $ne: 'x' } } } } } }),
    );
  });

  test('a non-boolean OR and a non-array AND throw', () => {
    expectValidationError(() => posts({ OR: 'x' }));
    expectValidationError(() => posts({ OR: { title: 'x' } }));
  });
});

describe('an operator operand', () => {
  // A hostile string is a valid operand for a string field: it is bound, never interpolated.
  test('a string list for in is bound, not written into the text', () => {
    const compiled = posts({ title: { in: ["x' OR '1'='1"] } });
    expect(compiled.text).toContain('title IN $title_in_inc_0');
    expectBoundOnly(compiled, "x' OR '1'='1");
  });

  test('a hostile string for gt is bound as a variable', () => {
    const compiled = posts({ title: { gt: "a'; DROP" } });
    expect(compiled.text).not.toContain('DROP');
    expect(compiled.vars).toEqual({ title_gt_inc_0: "a'; DROP" });
  });

  test('a hostile string for contains is bound as a variable', () => {
    const compiled = posts({ title: { contains: "x'`" } });
    expect(compiled.text).not.toMatch(/['"`;]/);
    expect(compiled.vars).toEqual({ title_contains_inc_0: "x'`" });
  });

  test('a string where in takes an array, and an object or array where a string is, are refused', () => {
    expectValidationError(() => posts({ title: { in: "x' OR '1'='1" } }));
    expectValidationError(() => posts({ title: { gt: { "a'; DROP": 1 } } }));
    expectValidationError(() => posts({ title: { contains: ["x'", '`'] } }));
  });
});

/*
 * Operator names are looked up on the handler registry, a plain object, so a name inherited from
 * Object.prototype once resolved instead of being reported as unknown: `toString` and `constructor`
 * dropped the filter and returned every row, and `hasOwnProperty` raised a TypeError. The lookup is
 * limited to own keys, so a prototype name is now reported as an unknown operator like any other.
 */
describe('prototype-chain names as operators', () => {
  test('toString and constructor throw instead of dropping the filter', () => {
    for (const operator of ['toString', 'constructor']) {
      expectValidationError(() => posts({ title: { [operator]: 1 } }));
    }
  });

  test('hasOwnProperty, valueOf and __proto__ throw a validation error, not a TypeError', () => {
    for (const operator of ['hasOwnProperty', 'valueOf', '__proto__']) {
      expectValidationError(() => posts({ title: { [operator]: 1 } }));
    }
  });
});
