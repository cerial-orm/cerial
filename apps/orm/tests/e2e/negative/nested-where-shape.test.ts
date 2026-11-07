/**
 * E2E Tests: operator names and logical bodies are refused at every depth of a where
 *
 * An unknown operator beside a real or lost one under an object sub-field, a @flexible key, a tuple element, a
 * quantifier body or a relation body used to be dropped by the compiler, and an AND, OR or NOT of the wrong shape
 * or a body that is not an object was skipped, so a write ran on a wider (or inverted) filter. Each is refused on
 * every method, in a transaction too, and the rows survive. Valid shapes at each depth keep running.
 *
 * Schemas: flexible (FlexUser), tuples (TupleBasic), one-to-many required (Author, PostRequired)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// What a JavaScript or JSON caller can send; the generated types reject it
const hostile = (value: unknown): never => value as never;

type Case = [label: string, where: unknown];

const FLEX_REFUSED: Case[] = [
  [
    'unknown operator on a declared sub-field',
    { name: { neq: 'zz' }, strictAddress: { city: { eq: 'LA', bogus: 1 } } },
  ],
  [
    'lost operator beside an unknown one on a declared sub-field',
    { name: { neq: 'zz' }, strictAddress: { city: { eq: undefined, bogus: 1 } } },
  ],
  ['unknown operator on a flexible undeclared key', { name: { neq: 'zz' }, address: { extra: { eq: 1, bogus: 1 } } }],
  [
    'lost operator beside an unknown one on a flexible key',
    { name: { neq: 'zz' }, address: { extra: { eq: undefined, bogus: 1 } } },
  ],
  [
    'unknown operator on a nested flexible object',
    { name: { neq: 'zz' }, profile: { metadata: { extra: { eq: undefined, bogus: 1 } } } },
  ],
  ['unknown operator in a quantifier body', { name: { neq: 'zz' }, tags: { some: { city: { eq: 'x', bogus: 1 } } } }],
  ['unknown operator under NOT', { NOT: { strictAddress: { city: { eq: undefined, bogus: 1 } } } }],
  ['AND as an object inside an object field', { name: { neq: 'zz' }, NOT: { address: { AND: { city: 'zz' } } } }],
  ['OR as an object inside an object field', { name: { neq: 'zz' }, NOT: { address: { OR: { city: 'zz' } } } }],
  ['NOT as an array inside an object field', { name: { neq: 'zz' }, address: { city: 'NYC', NOT: [{ city: 'NYC' }] } }],
  ['AND as an object in a quantifier body', { NOT: { tags: { some: { AND: { city: 'zz' } } } } }],
  ['quantifier body that is a string', { name: { neq: 'zz' }, tags: { some: 'x' } }],
  ['quantifier body that is an array', { name: { neq: 'zz' }, tags: { none: [] } }],
];

const TUPLE_REFUSED: Case[] = [
  ['unknown operator on a tuple element by name', { name: { neq: 'zz' }, location: { lat: { eq: 1, bogus: 1 } } }],
  [
    'lost operator beside an unknown one on a tuple element',
    { name: { neq: 'zz' }, location: { 0: { eq: undefined, bogus: 1 } } },
  ],
  [
    'unknown operator in a tuple array quantifier',
    { name: { neq: 'zz' }, history: { some: { lat: { gt: 0, bogus: 1 } } } },
  ],
  ['unknown operator under NOT', { NOT: { location: { lat: { eq: undefined, bogus: 1 } } } }],
  ['tuple array quantifier body that is a number', { name: { neq: 'zz' }, history: { every: 5 } }],
];

const REL_REFUSED: Case[] = [
  [
    'unknown operator in a forward relation body',
    { title: { neq: 'zz' }, author: { name: { eq: undefined, bogus: 1 } } },
  ],
  [
    'unknown operator beside a real condition in a relation body',
    { title: { neq: 'zz' }, author: { name: 'Ada', email: { eq: 'x', bogus: 1 } } },
  ],
  ['NOT with a number as a relation body', { NOT: { author: 5 } }],
  ['NOT with an empty array as a relation body', { title: { neq: 'zz' }, NOT: { author: [] } }],
  ['a relation body that is a string', { title: { neq: 'zz' }, author: 'x' }],
  ['AND as an object inside a relation body', { title: { neq: 'zz' }, author: { AND: { name: 'zz' } } }],
  ['NOT as an array inside a relation body', { title: { neq: 'zz' }, author: { name: 'Ada', NOT: [{ name: 'Ada' }] } }],
];

const AUTHOR_REFUSED: Case[] = [
  ['AND as an object in a reverse quantifier body', { posts: { some: { AND: { title: 'zz' } } } }],
  ['OR as an object in a reverse quantifier body', { posts: { some: { OR: { title: 'zz' } } } }],
  ['NOT as an array in a reverse quantifier body', { posts: { some: { title: 'A1', NOT: [{ title: 'A1' }] } } }],
  ['quantifier body that is a number', { posts: { some: 5 } }],
  ['quantifier body that is an array', { posts: { none: [] } }],
  ['unknown operator in a reverse quantifier body', { posts: { some: { title: { eq: undefined, bogus: 1 } } } }],
  ['unknown operator under NOT some', { NOT: { posts: { some: { title: { eq: 'A1', bogus: 1 } } } } }],
];

interface Group {
  label: string;
  tables: readonly string[];
  cases: Case[];
  count: () => PromiseLike<number>;
  deleteMany: (where: unknown) => PromiseLike<unknown>;
  updateMany: (where: unknown) => PromiseLike<unknown>;
  findMany: (where: unknown) => PromiseLike<unknown>;
  inTxArray: (where: unknown) => PromiseLike<unknown>;
  inTxCallback: (where: unknown) => PromiseLike<unknown>;
  seed: () => Promise<void>;
  expected: number;
  accepted: Case[];
}

describe('nested where shapes are refused at every depth', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.flexible, ...tables.tuples, ...tables.oneToManyRequired]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  const groups = (): Group[] => [
    {
      label: 'FlexUser',
      tables: tables.flexible,
      cases: FLEX_REFUSED,
      expected: 3,
      count: () => client.db.FlexUser.count(),
      deleteMany: (where) => client.db.FlexUser.deleteMany({ where: hostile(where) }),
      updateMany: (where) => client.db.FlexUser.updateMany({ where: hostile(where), data: { name: 'changed' } }),
      findMany: (where) => client.db.FlexUser.findMany({ where: hostile(where) }),
      inTxArray: (where) => client.$transaction([client.db.FlexUser.deleteMany({ where: hostile(where) })]),
      inTxCallback: (where) => client.$transaction(async (tx) => tx.FlexUser.deleteMany({ where: hostile(where) })),
      seed: async () => {
        for (const name of ['t1', 't2', 't3']) {
          await client.db.FlexUser.create({
            data: {
              name,
              address: { street: '1 Main', city: 'NYC' },
              tags: [{ street: 's', city: 'x' }],
              profile: { bio: 'hi', metadata: { label: 'x' } },
              strictAddress: { street: '2 Main', city: 'LA' },
            },
          });
        }
      },
      accepted: [],
    },
    {
      label: 'TupleBasic',
      tables: tables.tuples,
      cases: TUPLE_REFUSED,
      expected: 2,
      count: () => client.db.TupleBasic.count(),
      deleteMany: (where) => client.db.TupleBasic.deleteMany({ where: hostile(where) }),
      updateMany: (where) => client.db.TupleBasic.updateMany({ where: hostile(where), data: { name: 'changed' } }),
      findMany: (where) => client.db.TupleBasic.findMany({ where: hostile(where) }),
      inTxArray: (where) => client.$transaction([client.db.TupleBasic.deleteMany({ where: hostile(where) })]),
      inTxCallback: (where) => client.$transaction(async (tx) => tx.TupleBasic.deleteMany({ where: hostile(where) })),
      seed: async () => {
        await client.db.TupleBasic.create({ data: { name: 'a', location: [1, 2], history: [[1, 2]] } });
        await client.db.TupleBasic.create({ data: { name: 'b', location: [3, 4], history: [[3, 4]] } });
      },
      accepted: [],
    },
    {
      label: 'PostRequired',
      tables: tables.oneToManyRequired,
      cases: REL_REFUSED,
      expected: 3,
      count: () => client.db.PostRequired.count(),
      deleteMany: (where) => client.db.PostRequired.deleteMany({ where: hostile(where) }),
      updateMany: (where) => client.db.PostRequired.updateMany({ where: hostile(where), data: { title: 'changed' } }),
      findMany: (where) => client.db.PostRequired.findMany({ where: hostile(where) }),
      inTxArray: (where) => client.$transaction([client.db.PostRequired.deleteMany({ where: hostile(where) })]),
      inTxCallback: (where) => client.$transaction(async (tx) => tx.PostRequired.deleteMany({ where: hostile(where) })),
      seed: seedAuthors,
      accepted: [],
    },
    {
      label: 'Author',
      tables: tables.oneToManyRequired,
      cases: AUTHOR_REFUSED,
      expected: 2,
      count: () => client.db.Author.count(),
      deleteMany: (where) => client.db.Author.deleteMany({ where: hostile(where) }),
      updateMany: (where) => client.db.Author.updateMany({ where: hostile(where), data: { name: 'changed' } }),
      findMany: (where) => client.db.Author.findMany({ where: hostile(where) }),
      inTxArray: (where) => client.$transaction([client.db.Author.deleteMany({ where: hostile(where) })]),
      inTxCallback: (where) => client.$transaction(async (tx) => tx.Author.deleteMany({ where: hostile(where) })),
      seed: seedAuthors,
      accepted: [],
    },
  ];

  async function seedAuthors(): Promise<void> {
    const ada = await client.db.Author.create({ data: { name: 'Ada', email: 'ada@x.co' } });
    const bob = await client.db.Author.create({ data: { name: 'Bob', email: 'bob@x.co' } });
    await client.db.PostRequired.create({ data: { title: 'A1', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'A2', authorId: ada.id } });
    await client.db.PostRequired.create({ data: { title: 'B1', authorId: bob.id } });
  }

  for (const label of ['FlexUser', 'TupleBasic', 'PostRequired', 'Author']) {
    describe(label, () => {
      const group = () => groups().find((g) => g.label === label)!;
      const cases = groups().find((g) => g.label === label)!.cases;

      beforeEach(async () => {
        const g = group();
        await truncateTables(client, [...g.tables]);
        await g.seed();
      });

      const refuses = async (run: () => Promise<unknown>) => {
        let error: unknown;
        try {
          await run();
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(String(error)).toMatch(/Invalid where|must be|Unknown operator|Unknown field/);
        expect(await group().count()).toBe(group().expected);
      };

      test.each(cases)('deleteMany refuses %s', async (_l, where) => {
        await refuses(async () => group().deleteMany(where));
      });

      test.each(cases)('updateMany refuses %s', async (_l, where) => {
        await refuses(async () => group().updateMany(where));
      });

      test.each(cases)('findMany refuses %s', async (_l, where) => {
        await refuses(async () => group().findMany(where));
      });

      test.each(cases)('$transaction array refuses %s', async (_l, where) => {
        await refuses(async () => group().inTxArray(where));
      });

      test.each(cases)('$transaction callback refuses %s', async (_l, where) => {
        await refuses(async () => group().inTxCallback(where));
      });
    });
  }

  describe('valid shapes at each depth keep running', () => {
    beforeEach(async () => {
      await truncateTables(client, [...tables.flexible, ...tables.oneToManyRequired]);
      await groups()[0]!.seed();
      await seedAuthors();
    });

    test('known operators under declared sub-fields, flexible keys, quantifiers and relations match', async () => {
      expect(
        await client.db.FlexUser.count({
          strictAddress: { city: { startsWith: 'L', contains: 'A' } },
          address: { extra: { neq: 'x' }, city: 'NYC' },
          tags: { some: { city: { eq: 'x' } } },
        }),
      ).toBe(3);
      expect(await client.db.PostRequired.count({ author: { name: { startsWith: 'A' } } })).toBe(2);
      expect(await client.db.Author.count({ posts: { some: { title: { eq: 'B1' } } } })).toBe(1);
    });

    test('a value object on a flexible undeclared key stays a value comparison', async () => {
      expect(await client.db.FlexUser.count(hostile({ address: { extra: { foo: 1 } } }))).toBe(0);
      expect(await client.db.FlexUser.count(hostile({ address: { extra: {} } }))).toBe(0);
    });

    test('AND and OR arrays and a NOT object work inside relation, object and quantifier bodies', async () => {
      expect(
        await client.db.PostRequired.count({
          author: { OR: [{ name: 'Ada' }, { name: 'Bob' }], AND: [{ email: { contains: '@' } }], NOT: { name: 'Bob' } },
        }),
      ).toBe(2);
      expect(
        await client.db.FlexUser.count({
          address: { OR: [{ city: 'NYC' }], NOT: { city: 'LA' } },
          tags: { some: { AND: [{ city: 'x' }], NOT: { city: 'y' } } },
        }),
      ).toBe(3);
      expect(await client.db.Author.count({ posts: { some: { OR: [{ title: 'A1' }], NOT: { title: 'B1' } } } })).toBe(
        1,
      );
    });

    test('a top-level AND array beside a relation body still works', async () => {
      expect(await client.db.PostRequired.count({ AND: [{ title: 'A1' }, { author: { name: 'Ada' } }] })).toBe(1);
    });

    test('a valid filter deletes only its rows in a transaction', async () => {
      await client.$transaction([client.db.PostRequired.deleteMany({ where: { author: { name: { eq: 'Bob' } } } })]);

      expect(await client.db.PostRequired.count()).toBe(2);
    });
  });
});
