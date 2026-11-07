/**
 * Unit Tests: a write refuses the empty shapes a read gives a meaning
 *
 * `owner: {}` (and the bodies equivalent to it) and an empty operator object select rows by a rule a write
 * should not guess, so every destructive entry and the exported where helpers throw a named
 * CerialValidationError. The same shapes still compile on reads, quantifier `{}` and `isEmpty` stay allowed on
 * writes, and the explicit forms pass.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import {
  compileCount,
  compileDeleteMany,
  compileDeleteUnique,
  compileExists,
  compileFindMany,
  compileUpdateMany,
  compileUpdateUnique,
} from '../../../src/query/builder';
import { buildDeleteQueryChecked, buildUpdateManyQueryChecked } from '../../../src/query/builders/checked';
import { transformDestructiveWhere } from '../../../src/query/filters';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import {
  buildConditionsChecked,
  transformWhereChecked,
  transformWhereClauseChecked,
} from '../../../src/query/filters/checked-where';
import type { ModelMetadata, ModelRegistry, WhereClause } from '../../../src/types';
import { bodyRegistry } from './relation-body-helpers';
import { place, placeRegistry } from './where-validation-helpers';

const MESSAGE = /ambiguous on a write/;

const shapes: Array<[string, WhereClause]> = [
  ['owner: {}', { owner: {} }],
  ['owner: { AND: [] }', { owner: { AND: [] } }],
  ['owner: { name: undefined }', { owner: { name: undefined } }],
  ['owner: { name: {} }', { owner: { name: {} } }],
  ['owner: { AND: [{}] }', { owner: { AND: [{}] } }],
  ['name: {}', { name: {} }],
  ['name: { eq: undefined }', { name: { eq: undefined } }],
  ['beside a real condition', { name: 'a', owner: {} }],
  ['under NOT', { NOT: { owner: {} } }],
  ['under OR', { OR: [{ name: 'a' }, { owner: {} }] }],
  ['inside a reverse body', { owner: { places: { some: { owner: {} } } } }],
  ['at depth 2 in a to-one body', { owner: { places: { some: { name: {} } } } }],
];

const writes: Array<[string, (where: WhereClause) => unknown]> = [
  ['updateMany', (where) => compileUpdateMany(place, { where, data: { name: 'x' } }, placeRegistry)],
  ['deleteMany', (where) => compileDeleteMany(place, { where }, placeRegistry)],
  [
    'updateUnique',
    (where) => compileUpdateUnique(place, { where: { id: 'p1', ...where }, data: { name: 'x' } }, placeRegistry),
  ],
  ['deleteUnique', (where) => compileDeleteUnique(place, { where: { id: 'p1', ...where } }, placeRegistry)],
  ['upsert (destructive where)', (where) => transformDestructiveWhere(where, place, 'upsert', placeRegistry)],
  [
    'buildUpdateManyQueryChecked',
    (where) => buildUpdateManyQueryChecked(place, where, { name: 'x' }, undefined, undefined, placeRegistry),
  ],
  ['buildDeleteQueryChecked', (where) => buildDeleteQueryChecked(place, where, placeRegistry)],
  ['transformWhereChecked', (where) => transformWhereChecked(where, place, placeRegistry)],
  ['transformWhereClauseChecked', (where) => transformWhereClauseChecked(where, place, placeRegistry)],
  ['buildConditionsChecked', (where) => buildConditionsChecked(createCompileContext(), where, place, placeRegistry)],
];

describe('every destructive entry and exported helper refuses an ambiguous empty shape', () => {
  for (const [entry, run] of writes) {
    test.each(shapes)(`${entry}: %s`, (_label, where) => {
      expect(() => run(where)).toThrow(CerialValidationError);
      expect(() => run(where)).toThrow(MESSAGE);
    });
  }

  test('the message names the explicit forms', () => {
    expect(() => compileDeleteMany(place, { where: { owner: {} } }, placeRegistry)).toThrow(/owner: null/);
    expect(() => compileDeleteMany(place, { where: { owner: {} } }, placeRegistry)).toThrow(/NOT: \{ owner: null \}/);
  });
});

describe('reads keep the meaning of the same shapes', () => {
  test.each(shapes)('findMany, count and exists accept %s', (_label, where) => {
    expect(() => compileFindMany(place, { where }, placeRegistry)).not.toThrow();
    expect(() => compileCount(place, where, placeRegistry)).not.toThrow();
    expect(() => compileExists(place, where, placeRegistry)).not.toThrow();
  });

  test('owner: {} reads as "has an owner"', () => {
    expect(compileFindMany(place, { where: { owner: {} } }, placeRegistry).query.text).toContain(
      'WHERE (ownerId.id != NONE)',
    );
  });
});

describe('the explicit forms and quantifier bodies stay allowed on writes', () => {
  const allowed: Array<[string, WhereClause]> = [
    ['owner: null', { owner: null }],
    ['NOT: { owner: null }', { NOT: { owner: null } }],
    ['a real operator', { name: { eq: 'a' } }],
    ['a real owner condition', { owner: { name: 'a' } }],
    ['places: { some: {} }', { name: { neq: 'zz' }, owner: { places: { some: {} } } }],
    ['places: { none: {} }', { owner: { places: { none: {} } } }],
    ['places: { every: {} }', { owner: { places: { every: {} } } }],
    ['places: { isEmpty: true }', { owner: { places: { isEmpty: true } } }],
  ];

  for (const [entry, run] of writes) {
    test.each(allowed)(`${entry}: %s`, (_label, where) => {
      expect(() => run(where)).not.toThrow();
    });
  }
});

describe('a different failure is not masked', () => {
  test('an unknown key in a relation body still raises its own error', () => {
    expect(() => compileDeleteMany(place, { where: { owner: { nope: 1 } as WhereClause } }, placeRegistry)).toThrow(
      /nope/,
    );
  });
});

type Entry = [string, (where: WhereClause) => unknown];

/** Every destructive entry and exported helper, bound to one model */
function entriesFor(
  model: ModelMetadata,
  registry: ModelRegistry,
  data: Record<string, unknown> = { name: 'x' },
): Entry[] {
  return [
    ['updateMany', (where) => compileUpdateMany(model, { where, data }, registry)],
    ['deleteMany', (where) => compileDeleteMany(model, { where }, registry)],
    ['updateUnique', (where) => compileUpdateUnique(model, { where: { id: 'p1', ...where }, data }, registry)],
    ['deleteUnique', (where) => compileDeleteUnique(model, { where: { id: 'p1', ...where } }, registry)],
    ['upsert (destructive where)', (where) => transformDestructiveWhere(where, model, 'upsert', registry)],
    [
      'buildUpdateManyQueryChecked',
      (where) => buildUpdateManyQueryChecked(model, where, data, undefined, undefined, registry),
    ],
    ['buildDeleteQueryChecked', (where) => buildDeleteQueryChecked(model, where, registry)],
    ['transformWhereChecked', (where) => transformWhereChecked(where, model, registry)],
    ['transformWhereClauseChecked', (where) => transformWhereClauseChecked(where, model, registry)],
    ['buildConditionsChecked', (where) => buildConditionsChecked(createCompileContext(), where, model, registry)],
  ];
}

function suite(
  title: string,
  model: ModelMetadata,
  registry: ModelRegistry,
  refused: Array<[string, WhereClause]>,
  allowed: Array<[string, WhereClause]>,
  message: RegExp,
  data: Record<string, unknown> = { name: 'x' },
): void {
  describe(title, () => {
    for (const [entry, run] of entriesFor(model, registry, data)) {
      test.each(refused)(`${entry} refuses %s`, (_label, where) => {
        expect(() => run(where)).toThrow(CerialValidationError);
        expect(() => run(where)).toThrow(message);
      });
      test.each(allowed)(`${entry} allows %s`, (_label, where) => {
        expect(() => run(where)).not.toThrow();
      });
    }

    test.each(refused)('reads keep compiling %s', (_label, where) => {
      expect(() => compileFindMany(model, { where }, registry)).not.toThrow();
      expect(() => compileCount(model, where, registry)).not.toThrow();
    });
  });
}

const user = bodyRegistry.User!;
const post = bodyRegistry.Post!;
const tag = bodyRegistry.Tag!;
const sibling = { name: { neq: 'zz' } };

suite(
  'reverse relation bodies without a quantifier or condition',
  user,
  bodyRegistry,
  [
    ['posts: {}', { posts: {} }],
    ['posts: {} beside a sibling', { ...sibling, posts: {} }],
    ['posts: { some: undefined } beside a sibling', { ...sibling, posts: { some: undefined } }],
    ['posts: { every: undefined } beside a sibling', { ...sibling, posts: { every: undefined } }],
    ['posts: { none: undefined } beside a sibling', { ...sibling, posts: { none: undefined } }],
    ['posts: { some: undefined, none: undefined }', { ...sibling, posts: { some: undefined, none: undefined } }],
    ['posts: { title: undefined } beside a sibling', { ...sibling, posts: { title: undefined } }],
    ['posts: { title: {} } beside a sibling', { ...sibling, posts: { title: {} } }],
    ['under OR', { OR: [{ name: 'a' }, { posts: {} }] }],
    ['under NOT', { ...sibling, NOT: { posts: {} } }],
    ['inside a quantifier body', { posts: { some: { comments: {}, title: 'a' } } }],
    ['inside a quantifier body beside a sibling', { ...sibling, posts: { some: { comments: { some: undefined } } } }],
  ],
  [
    ['posts: { some: {} }', { ...sibling, posts: { some: {} } }],
    ['posts: { none: {} }', { ...sibling, posts: { none: {} } }],
    ['posts: { every: {} }', { ...sibling, posts: { every: {} } }],
    ['posts: { isEmpty: true }', { ...sibling, posts: { isEmpty: true } }],
    ['posts: { some: {}, none: undefined }', { posts: { some: {}, none: undefined } }],
    ['a body with a condition', { posts: { title: 'a' } }],
  ],
  /ambiguous on a write[\s\S]*(some: \{\}|none: \{\}|isEmpty)/,
);

suite(
  'array-FK relation bodies without a quantifier or condition',
  post,
  bodyRegistry,
  [
    ['tags: {} beside a sibling', { title: { neq: 'zz' }, tags: {} }],
    ['tags: { some: undefined } beside a sibling', { title: { neq: 'zz' }, tags: { some: undefined } }],
    ['tags: { every: undefined } beside a sibling', { title: { neq: 'zz' }, tags: { every: undefined } }],
    ['tags: { none: undefined } beside a sibling', { title: { neq: 'zz' }, tags: { none: undefined } }],
    ['tags: {} alone', { tags: {} }],
    ['comments: {} beside tags: { some: {} }', { tags: { some: {} }, comments: {} }],
  ],
  [
    ['tags: { some: {} }', { title: { neq: 'zz' }, tags: { some: {} } }],
    ['tags: { none: {} }', { title: { neq: 'zz' }, tags: { none: {} } }],
    ['tags: { every: {} }', { title: { neq: 'zz' }, tags: { every: {} } }],
  ],
  /ambiguous on a write/,
  { title: 'x' },
);

suite(
  'the other side of the array-FK',
  tag,
  bodyRegistry,
  [
    ['posts: {} beside a sibling', { label: { neq: 'zz' }, posts: {} }],
    ['posts: { some: undefined } beside a sibling', { label: { neq: 'zz' }, posts: { some: undefined } }],
  ],
  [['posts: { none: {} }', { label: { neq: 'zz' }, posts: { none: {} } }]],
  /ambiguous on a write/,
  { label: 'x' },
);

suite(
  'object and tuple fields',
  place,
  placeRegistry,
  [
    ['address: {}', { address: {} }],
    ['address: {} beside a sibling', { ...sibling, address: {} }],
    ['address: { city: {} }', { ...sibling, address: { city: {} } }],
    ['address: { city: undefined }', { ...sibling, address: { city: undefined } }],
    ['address: { city: { eq: undefined } }', { ...sibling, address: { city: { eq: undefined } } }],
    ['address: { AND: [] }', { ...sibling, address: { AND: [] } }],
    ['address: { NOT: {} }', { ...sibling, address: { NOT: {} } }],
    ['address: { geo: {} }', { ...sibling, address: { geo: {} } }],
    ['address: { geo: { lat: {} } }', { ...sibling, address: { geo: { lat: {} } } }],
    ['address: { city: {}, geo: { lat: 1 } }', { address: { city: {}, geo: { lat: 1 } } }],
    ['address: { OR: [{ city: {} }] }', { address: { OR: [{ city: {} }] } }],
    ['optional-style flexible object open: {}', { ...sibling, open: {} }],
    ['open: { city: {} }', { ...sibling, open: { city: {} } }],
    ['stops: {}', { ...sibling, stops: {} }],
    ['stops: { some: undefined }', { ...sibling, stops: { some: undefined } }],
    ['stops: { some: { city: {} } }', { ...sibling, stops: { some: { city: {} } } }],
    ['stops: { every: { geo: {} } }', { ...sibling, stops: { every: { geo: {} } } }],
    ['spot: {}', { ...sibling, spot: {} }],
    ['spot: { label: {} }', { ...sibling, spot: { label: {} } }],
    ['spot: { 0: {} }', { ...sibling, spot: { 0: {} } }],
    ['pairs: {}', { ...sibling, pairs: {} }],
    ['pairs: { some: { first: {} } }', { ...sibling, pairs: { some: { first: {} } } }],
    ['under NOT', { ...sibling, NOT: { address: {} } }],
    ['under OR', { OR: [{ name: 'a' }, { address: {} }] }],
    ['inside an owner body', { owner: { places: { some: { address: {} } } } }],
  ] as Array<[string, WhereClause]>,
  [
    ['address: { city: "a" }', { address: { city: 'a' } }],
    ['address: { city: { eq: "a" } }', { address: { city: { eq: 'a' } } }],
    ['address: { geo: { lat: 1 } }', { address: { geo: { lat: 1 } } }],
    ['stops: { some: {} }', { ...sibling, stops: { some: {} } }],
    ['stops: { none: {} }', { ...sibling, stops: { none: {} } }],
    ['stops: { every: {} }', { ...sibling, stops: { every: {} } }],
    ['stops: { some: { city: "a" } }', { stops: { some: { city: 'a' } } }],
    ['pairs: { none: {} }', { pairs: { none: {} } }],
    ['spot: { label: "a" }', { spot: { label: 'a' } }],
    ['spot: { 0: "a" }', { spot: { 0: 'a' } }],
    ['a flexible sub-key compared with {}', { open: { extra: {} } } as WhereClause],
    ['a flexible sub-key compared with a value', { open: { extra: 'x' } } as WhereClause],
  ],
  /ambiguous on a write/,
);

describe('the object messages name the explicit forms', () => {
  test('an empty object field', () => {
    expect(() => compileDeleteMany(place, { where: { address: {} } }, placeRegistry)).toThrow(
      /condition on one of address's sub-fields/,
    );
  });

  test('an empty reverse body', () => {
    expect(() => compileDeleteMany(user, { where: { posts: {} } }, bodyRegistry)).toThrow(
      /some: \{\}.*none: \{\}.*isEmpty/s,
    );
  });
});

describe('NOT: {}', () => {
  // Beside a real condition the constant false flips to true under an outer NOT, so every position refuses it
  test.each(entriesFor(place, placeRegistry))('%s refuses a top-level NOT: {}', (_entry, run) => {
    expect(() => run({ ...sibling, NOT: {} })).toThrow(/ambiguous on a write/);
  });

  // Inside a relation body it is the empty-equivalent shape and is refused
  test.each(entriesFor(place, placeRegistry))('%s refuses NOT: {} inside a to-one body', (_entry, run) => {
    expect(() => run({ owner: { NOT: {} } })).toThrow(/ambiguous on a write/);
    expect(() => run({ ...sibling, NOT: { owner: { NOT: {} } } })).toThrow(/ambiguous on a write/);
  });

  test('findMany accepts both', () => {
    expect(() => compileFindMany(place, { where: { NOT: {} } }, placeRegistry)).not.toThrow();
    expect(() => compileFindMany(place, { where: { owner: { NOT: {} } } }, placeRegistry)).not.toThrow();
  });
});

const emptyNots: Array<[string, WhereClause]> = [
  ['NOT: {}', { NOT: {} }],
  ['NOT: { name: undefined }', { NOT: { name: undefined } }],
  ['NOT: { AND: [] }', { NOT: { AND: [] } }],
  ['NOT: { AND: [{}] }', { NOT: { AND: [{}] } }],
  ['NOT: { NOT: {} }', { NOT: { NOT: {} } }],
  ['NOT: { name: {} }', { NOT: { name: {} } }],
  ['NOT: { OR: [{}] }', { NOT: { OR: [{}] } }],
  ['NOT: { NOT: { name: undefined }, name: undefined }', { NOT: { NOT: { name: undefined }, name: undefined } }],
];

suite(
  'a NOT with an empty-equivalent body, at every position',
  user,
  bodyRegistry,
  [
    ...emptyNots.map(([l, w]): [string, WhereClause] => [`${l} beside a condition`, { ...sibling, ...w }]),
    ['under an outer NOT', { ...sibling, NOT: { name: 'ann', NOT: {} } }],
    ['in an AND branch', { AND: [{ name: 'a' }, { NOT: {} }] }],
    ['in an OR branch', { OR: [{ name: 'a' }, { NOT: { name: undefined } }] }],
    ['in a NOT inside an OR branch', { OR: [{ name: 'a' }, { NOT: { NOT: {} } }] }],
    ['in a reverse quantifier body', { posts: { some: { title: 'a', NOT: {} } } }],
    ['in an every body', { posts: { every: { title: 'a', NOT: { title: undefined } } } }],
    ['in a nested quantifier body', { posts: { some: { comments: { some: { NOT: {} } } } } }],
    ['in an array-FK body', { name: 'a', posts: { some: { tags: { some: { label: 'a', NOT: {} } } } } }],
  ],
  [
    ['NOT: { name: "x" }', { ...sibling, NOT: { name: 'x' } }],
    ['NOT: { OR: [] } (the constant, not an absent condition)', { ...sibling, NOT: { OR: [] } }],
    ['NOT: { posts: { some: {} } }', { ...sibling, NOT: { posts: { some: {} } } }],
    ['NOT: { posts: { none: {} } }', { ...sibling, NOT: { posts: { none: {} } } }],
    ['NOT: { posts: { isEmpty: true } }', { ...sibling, NOT: { posts: { isEmpty: true } } }],
    ['NOT: { NOT: { name: "x" } }', { ...sibling, NOT: { NOT: { name: 'x' } } }],
    ['a quantifier body with a real NOT', { posts: { some: { NOT: { title: 'a' } } } }],
  ],
  /ambiguous on a write/,
);

suite(
  'a NOT with an empty-equivalent body inside a to-one relation body',
  post,
  bodyRegistry,
  [
    ['author: { name: "a", NOT: {} }', { author: { name: 'a', NOT: {} } }],
    ['author: { name: "a", NOT: { name: undefined } }', { author: { name: 'a', NOT: { name: undefined } } }],
    ['author: { NOT: { NOT: {} }, name: "a" }', { author: { NOT: { NOT: {} }, name: 'a' } }],
    ['author: { NOT: { name: {} }, name: "a" }', { author: { NOT: { name: {} }, name: 'a' } }],
    ['under an outer NOT', { title: 'x', NOT: { author: { name: 'a', NOT: {} } } }],
  ],
  [
    ['author: { name: "a", NOT: { name: "b" } }', { author: { name: 'a', NOT: { name: 'b' } } }],
    ['author: { NOT: { OR: [] } }', { author: { name: 'a', NOT: { OR: [] } } }],
  ],
  /ambiguous on a write/,
  { title: 'x' },
);

suite(
  'a NOT with an empty-equivalent body inside object and tuple field bodies',
  place,
  placeRegistry,
  [
    ['address: { city: "a", NOT: {} }', { address: { city: 'a', NOT: {} } }],
    ['address: { city: "a", NOT: { city: undefined } }', { address: { city: 'a', NOT: { city: undefined } } }],
    ['address: { city: "a", NOT: { NOT: {} } }', { address: { city: 'a', NOT: { NOT: {} } } }],
    ['address: { city: "a", NOT: { city: {} } }', { address: { city: 'a', NOT: { city: {} } } }],
    ['address: { geo: { lat: 1, NOT: {} } }', { address: { geo: { lat: 1, NOT: {} } } }],
    ['address: { OR: [{ city: "a", NOT: {} }] }', { address: { OR: [{ city: 'a', NOT: {} }] } }],
    ['stops: { some: { city: "a", NOT: {} } }', { stops: { some: { city: 'a', NOT: {} } } }],
    ['under an outer NOT', { ...sibling, NOT: { address: { city: 'a', NOT: {} } } }],
  ] as Array<[string, WhereClause]>,
  [
    ['address: { city: "a", NOT: { city: "b" } }', { address: { city: 'a', NOT: { city: 'b' } } }],
    ['address: { city: "a", NOT: { OR: [] } }', { address: { city: 'a', NOT: { OR: [] } } }],
    ['stops: { some: { NOT: { city: "b" } } }', { stops: { some: { NOT: { city: 'b' } } } }],
  ],
  /ambiguous on a write/,
);

describe('the NOT message names the explicit alternatives', () => {
  test('drop the NOT or write a condition', () => {
    expect(() => compileDeleteMany(place, { where: { ...sibling, NOT: {} } }, placeRegistry)).toThrow(
      /where\.NOT.*Drop the NOT, or write a real condition/s,
    );
  });
});
