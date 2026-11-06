/**
 * E2E Tests: an empty filter body means what it says
 *
 * `some: {}` is "the array or relation is not empty", `none: {}` is "it is empty", `every: {}` holds for
 * every element of an array (and, on a reverse relation, means "has a related row"), and an operator object with no operator (`{ name: {} }`) constrains nothing. The same goes for the
 * bodies that hold no condition (`{}`, `AND: []`, `OR: [{}]`, `NOT: { NOT: {} }`, `NOT: { OR: [] }`, undefined
 * values). These used to be dropped, so a sibling key or a NOT widened the filter and `deleteMany` and
 * `updateMany` touched rows the written filter excludes. Every payload runs through findMany, count, updateMany
 * and deleteMany and asserts the exact rows, and that the other rows are intact.
 *
 * Schemas: objects (ObjectTestOrder), tuples (TupleBasic), one-to-many required (Author, PostRequired)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// Hostile shapes are what a JavaScript caller can send; the generated types reject some of them
const hostile = (value: unknown): never => value as never;

interface Case {
  readonly label: string;
  readonly where: unknown;
  readonly expected: readonly string[] /** The shape is ambiguous on a write: updateMany and deleteMany refuse it and leave every row alone */;
  readonly refusedOnWrite?: boolean;
}

const bodies: Record<string, Record<string, unknown>> = {
  'empty object': {},
  'empty AND': { AND: [] },
  'OR of an empty object': { OR: [{}] },
  'NOT of NOT of empty': { NOT: { NOT: {} } },
  'NOT of an empty OR': { NOT: { OR: [] } },
  'AND of an empty object': { AND: [{}] },
};

/** Cases built for one relation or array field: [keyed body] -> rows, with and without a sibling key */
function quantifierCases(
  wrap: (inner: Record<string, unknown>) => unknown,
  withSibling: (where: unknown) => unknown,
  all: readonly string[],
  nonEmpty: readonly string[],
  empty: readonly string[],
  // Array every is vacuously true for an empty array; reverse every needs a related row
  everyRows: readonly string[],
  extra: readonly Case[],
): Case[] {
  const cases: Case[] = [];

  for (const [label, body] of Object.entries(bodies)) {
    const base: Case[] = [
      { label: `some ${label}`, where: wrap({ some: body }), expected: nonEmpty },
      { label: `none ${label}`, where: wrap({ none: body }), expected: empty },
      { label: `NOT some ${label}`, where: { NOT: wrap({ some: body }) }, expected: empty },
      { label: `NOT none ${label}`, where: { NOT: wrap({ none: body }) }, expected: nonEmpty },
      {
        label: `NOT every ${label}`,
        where: { NOT: wrap({ every: body }) },
        expected: all.filter((r) => !everyRows.includes(r)),
      },
      { label: `every ${label}`, where: wrap({ every: body }), expected: everyRows },
    ];
    for (const c of base) cases.push(c, { ...c, label: `${c.label} with a sibling key`, where: withSibling(c.where) });
  }

  return [...cases, ...extra];
}

/** Run one case through the four entry points on a model */
interface Rows {
  readonly find: (where: unknown) => Promise<string[]>;
  readonly count: (where: unknown) => PromiseLike<number>;
  readonly update: (where: unknown) => Promise<void>;
  readonly remove: (where: unknown) => Promise<void>;
  /** ids of the rows an updateMany marked */
  readonly marked: () => Promise<string[]>;
  readonly survivors: () => Promise<string[]>;
  readonly everything: readonly string[];
}

function runCases(title: string, getRows: () => Rows, cases: readonly Case[]): void {
  describe.each(cases)(`${title}: $label`, ({ where, expected, refusedOnWrite }) => {
    test('findMany and count match exactly the rows the filter means', async () => {
      const rows = getRows();

      expect((await rows.find(where)).sort()).toEqual([...expected].sort());
      expect(await rows.count(where)).toBe(expected.length);
    });

    // A filter that is true for every row on its own compiles to no WHERE, which the destructive paths refuse;
    // the sibling variants and every filter that selects by meaning go through.
    test('updateMany changes exactly those rows and no others', async () => {
      const rows = getRows();
      if (refusedOnWrite) {
        await expect(rows.update(where)).rejects.toThrow(/ambiguous on a write/);
        expect(await rows.marked()).toEqual([]);

        return;
      }
      try {
        await rows.update(where);
      } catch (error) {
        expect((error as Error).message).toContain('resolved to no conditions');
        expect(expected.length).toBe(rows.everything.length);
        expect(await rows.marked()).toEqual([]);

        return;
      }

      expect((await rows.marked()).sort()).toEqual([...expected].sort());
    });

    test('deleteMany removes exactly those rows and keeps the others', async () => {
      const rows = getRows();
      if (refusedOnWrite) {
        await expect(rows.remove(where)).rejects.toThrow(/ambiguous on a write/);
        expect((await rows.survivors()).sort()).toEqual([...rows.everything].sort());

        return;
      }
      try {
        await rows.remove(where);
      } catch (error) {
        expect((error as Error).message).toContain('resolved to no conditions');
        expect(expected.length).toBe(rows.everything.length);
        expect((await rows.survivors()).sort()).toEqual([...rows.everything].sort());

        return;
      }

      expect((await rows.survivors()).sort()).toEqual(rows.everything.filter((r) => !expected.includes(r)).sort());
    });
  });
}

describe('Empty filter bodies', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.objects, ...tables.tuples, ...tables.oneToManyRequired]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.objects, ...tables.tuples, ...tables.oneToManyRequired]);
  });

  // ---- array of objects ------------------------------------------------------------------------------------
  describe('array of objects', () => {
    // o1 has no items, o2 one pencil, o3 a pencil and a pen
    const address = (street: string) => ({ street, city: 'Oslo', state: 'NO' });
    const item = (productName: string) => ({ productName, quantity: 1, price: 1, tags: [] });
    const streets = ['o1', 'o2', 'o3'];

    beforeEach(async () => {
      const seed: Array<[string, string[]]> = [
        ['o1', []],
        ['o2', ['pencil']],
        ['o3', ['pencil', 'pen']],
      ];
      for (const [street, names] of seed) {
        await client.db.ObjectTestOrder.create({
          data: { billingAddress: address(street), items: names.map(item) },
        });
      }
    });

    const rows: Rows = {
      find: async (where) =>
        (await client.db.ObjectTestOrder.findMany({ where: hostile(where) })).map((r) => r.billingAddress.street),
      count: (where) => client.db.ObjectTestOrder.count(hostile(where)),
      update: async (where) => {
        await client.db.ObjectTestOrder.updateMany({
          where: hostile(where),
          data: { billingAddress: { state: 'XX' } },
        });
      },
      remove: async (where) => {
        await client.db.ObjectTestOrder.deleteMany({ where: hostile(where) });
      },
      marked: async () =>
        (await client.db.ObjectTestOrder.findMany({ where: { billingAddress: { state: 'XX' } } })).map(
          (r) => r.billingAddress.street,
        ),
      survivors: async () => (await client.db.ObjectTestOrder.findMany()).map((r) => r.billingAddress.street),
      everything: streets,
    };

    const items = (inner: Record<string, unknown>) => ({ items: inner });
    const sibling = (where: unknown) => ({ billingAddress: { city: { neq: 'zz' } }, ...(where as object) });

    runCases(
      'items',
      () => rows,
      quantifierCases(items, sibling, streets, ['o2', 'o3'], ['o1'], streets, [
        {
          label: 'some {} with every pencil',
          where: items({ some: {}, every: { productName: 'pencil' } }),
          expected: ['o2'],
        },
        {
          label: 'none {} with every pencil',
          where: items({ none: {}, every: { productName: 'pencil' } }),
          expected: ['o1'],
        },
        {
          label: 'some {} with none pen',
          where: items({ some: {}, none: { productName: 'pen' } }),
          expected: ['o2'],
        },
        {
          label: 'some with an undefined field',
          where: items({ some: { productName: undefined } }),
          expected: ['o2', 'o3'],
        },
        {
          label: 'none with an undefined field',
          where: items({ none: { productName: undefined } }),
          expected: ['o1'],
        },
        {
          label: 'some with an empty operator object',
          where: items({ some: { productName: {} } }),
          expected: ['o2', 'o3'],
        },
        {
          label: 'none with an empty operator object',
          where: items({ none: { productName: {} } }),
          expected: ['o1'],
        },
        // positive: non-empty bodies keep their meaning
        { label: 'some pen', where: items({ some: { productName: 'pen' } }), expected: ['o3'] },
        { label: 'none pen', where: items({ none: { productName: 'pen' } }), expected: ['o1', 'o2'] },
        { label: 'every pencil', where: items({ every: { productName: 'pencil' } }), expected: ['o1', 'o2'] },
        { label: 'NOT some pen', where: { NOT: items({ some: { productName: 'pen' } }) }, expected: ['o1', 'o2'] },
        { label: 'some false body', where: items({ some: { OR: [] } }), expected: [] },
        { label: 'none false body', where: items({ none: { OR: [] } }), expected: streets },
      ]),
    );
  });

  // ---- array of tuples -------------------------------------------------------------------------------------
  describe('array of tuples', () => {
    // t1 has one point, t2 none, t3 two
    const names = ['t1', 't2', 't3'];

    beforeEach(async () => {
      const seed: Array<[string, Array<[number, number]>]> = [
        ['t1', [[1, 1]]],
        ['t2', []],
        [
          't3',
          [
            [1, 1],
            [2, 2],
          ],
        ],
      ];
      for (const [name, history] of seed) {
        await client.db.TupleBasic.create({ data: { name, location: [0, 0], history } });
      }
    });

    const rows: Rows = {
      find: async (where) => (await client.db.TupleBasic.findMany({ where: hostile(where) })).map((r) => r.name),
      count: (where) => client.db.TupleBasic.count(hostile(where)),
      update: async (where) => {
        await client.db.TupleBasic.updateMany({ where: hostile(where), data: { backup: [9, 9] } });
      },
      remove: async (where) => {
        await client.db.TupleBasic.deleteMany({ where: hostile(where) });
      },
      marked: async () => (await client.db.TupleBasic.findMany({ where: { backup: { 0: 9 } } })).map((r) => r.name),
      survivors: async () => (await client.db.TupleBasic.findMany()).map((r) => r.name),
      everything: names,
    };

    const history = (inner: Record<string, unknown>) => ({ history: inner });
    const sibling = (where: unknown) => ({ name: { neq: 'zz' }, ...(where as object) });

    // The where validator allows only element keys inside a tuple body, so the logical-operator bodies are
    // limited to what it accepts
    const tupleBodies: Record<string, Record<string, unknown>> = {
      'empty object': {},
      'undefined field': { 0: undefined },
    };
    const cases: Case[] = [];
    for (const [label, body] of Object.entries(tupleBodies)) {
      const base: Case[] = [
        { label: `some ${label}`, where: history({ some: body }), expected: ['t1', 't3'] },
        { label: `none ${label}`, where: history({ none: body }), expected: ['t2'] },
        { label: `NOT some ${label}`, where: { NOT: history({ some: body }) }, expected: ['t2'] },
        { label: `NOT none ${label}`, where: { NOT: history({ none: body }) }, expected: ['t1', 't3'] },
        { label: `NOT every ${label}`, where: { NOT: history({ every: body }) }, expected: [] },
        { label: `every ${label}`, where: history({ every: body }), expected: names },
        {
          label: `some ${label} with every first 1`,
          where: history({ some: body, every: { 0: 1 } }),
          expected: ['t1'],
        },
        {
          label: `none ${label} with every first 1`,
          where: history({ none: body, every: { 0: 1 } }),
          expected: ['t2'],
        },
      ];
      for (const c of base) cases.push(c, { ...c, label: `${c.label} with a sibling key`, where: sibling(c.where) });
    }
    cases.push(
      { label: 'some first 2', where: history({ some: { 0: 2 } }), expected: ['t3'] },
      { label: 'none first 2', where: history({ none: { 0: 2 } }), expected: ['t1', 't2'] },
      { label: 'every first 1', where: history({ every: { 0: 1 } }), expected: ['t1', 't2'] },
    );

    runCases('history', () => rows, cases);
  });

  // ---- reverse relation ------------------------------------------------------------------------------------
  describe('reverse relation', () => {
    // a1 has no posts, a2 one (x), a3 two (x, y)
    const authors = ['a1', 'a2', 'a3'];

    beforeEach(async () => {
      const seed: Array<[string, string[]]> = [
        ['a1', []],
        ['a2', ['x']],
        ['a3', ['x', 'y']],
      ];
      for (const [name, titles] of seed) {
        const author = await client.db.Author.create({ data: { name, email: `${name}@example.com` } });
        for (const title of titles) {
          await client.db.PostRequired.create({ data: { title, body: 'b', author: { connect: author.id } } });
        }
      }
    });

    const rows: Rows = {
      find: async (where) => (await client.db.Author.findMany({ where: hostile(where) })).map((r) => r.name),
      count: (where) => client.db.Author.count(hostile(where)),
      update: async (where) => {
        await client.db.Author.updateMany({ where: hostile(where), data: { name: 'marked' } });
      },
      remove: async (where) => {
        await client.db.Author.deleteMany({ where: hostile(where) });
      },
      // updateMany gives every match the same name, so a marked author is one whose own name is gone
      marked: async () => {
        const left = (await client.db.Author.findMany()).map((r) => r.name);

        return authors.filter((a) => !left.includes(a));
      },
      survivors: async () => (await client.db.Author.findMany()).map((r) => r.name),
      everything: authors,
    };

    const posts = (inner: Record<string, unknown>) => ({ posts: inner });
    const sibling = (where: unknown) => ({ name: { neq: 'zz' }, ...(where as object) });

    const relationCases = quantifierCases(
      posts,
      sibling,
      authors,
      ['a2', 'a3'],
      ['a1'],
      ['a2', 'a3'],
      [
        { label: 'some {} with isEmpty', where: posts({ some: {}, isEmpty: true }), expected: [] },
        { label: 'some {} with none x', where: posts({ some: {}, none: { title: 'x' } }), expected: [] },
        { label: 'none {} with some x', where: posts({ none: {}, some: { title: 'x' } }), expected: [] },
        { label: 'every {} with isEmpty', where: posts({ every: {}, isEmpty: true }), expected: [] },
        { label: 'every {} with isEmpty false', where: posts({ every: {}, isEmpty: false }), expected: ['a2', 'a3'] },
        {
          label: 'some with an undefined field',
          where: posts({ some: { title: undefined }, isEmpty: true }),
          expected: [],
        },
        {
          label: 'some with an empty operator object',
          where: posts({ some: { title: {} } }),
          expected: ['a2', 'a3'],
          refusedOnWrite: true,
        },
        // positive
        { label: 'some y', where: posts({ some: { title: 'y' } }), expected: ['a3'] },
        { label: 'none y', where: posts({ none: { title: 'y' } }), expected: ['a1', 'a2'] },
        { label: 'every x', where: posts({ every: { title: 'x' } }), expected: ['a2'] },
        { label: 'isEmpty', where: posts({ isEmpty: true }), expected: ['a1'] },
      ],
    );

    runCases('posts', () => rows, relationCases);
  });

  // ---- empty operator objects ------------------------------------------------------------------------------
  describe('empty operator objects', () => {
    const names = ['t1', 't2', 't3'];

    beforeEach(async () => {
      for (const name of names) {
        await client.db.TupleBasic.create({ data: { name, location: [0, 0], history: [] } });
      }
    });

    const rows: Rows = {
      find: async (where) => (await client.db.TupleBasic.findMany({ where: hostile(where) })).map((r) => r.name),
      count: (where) => client.db.TupleBasic.count(hostile(where)),
      update: async (where) => {
        await client.db.TupleBasic.updateMany({ where: hostile(where), data: { backup: [9, 9] } });
      },
      remove: async (where) => {
        await client.db.TupleBasic.deleteMany({ where: hostile(where) });
      },
      marked: async () => (await client.db.TupleBasic.findMany({ where: { backup: { 0: 9 } } })).map((r) => r.name),
      survivors: async () => (await client.db.TupleBasic.findMany()).map((r) => r.name),
      everything: names,
    };

    const sibling = { location: { 0: 0 } };

    runCases('name', () => rows, [
      { label: 'NOT name {}', where: { NOT: { name: {} } }, expected: [], refusedOnWrite: true },
      {
        label: 'NOT name {} with a sibling key',
        where: { ...sibling, NOT: { name: {} } },
        expected: [],
        refusedOnWrite: true,
      },
      {
        label: 'NOT OR (name t1, name {})',
        where: { NOT: { OR: [{ name: 't1' }, { name: {} }] } },
        expected: [],
        refusedOnWrite: true,
      },
      {
        label: 'NOT OR (name t1, name {}) with a sibling key',
        where: { ...sibling, NOT: { OR: [{ name: 't1' }, { name: {} }] } },
        expected: [],
        refusedOnWrite: true,
      },
      { label: 'name {} with a sibling key', where: { ...sibling, name: {} }, expected: names, refusedOnWrite: true },
      {
        label: 'name {} beside name t1',
        where: { AND: [{ name: {} }, { name: 't1' }] },
        expected: ['t1'],
        refusedOnWrite: true,
      },
      {
        label: 'NOT AND (name {}, name t1)',
        where: { NOT: { AND: [{ name: {} }, { name: 't1' }] } },
        expected: ['t2', 't3'],
        refusedOnWrite: true,
      },
      {
        label: 'name with only undefined operators',
        where: { ...sibling, name: { eq: undefined } },
        expected: names,
        refusedOnWrite: true,
      },
      // positive
      { label: 'name eq t1', where: { name: { eq: 't1' } }, expected: ['t1'] },
      { label: 'NOT name eq t1', where: { NOT: { name: { eq: 't1' } } }, expected: ['t2', 't3'] },
      {
        label: 'NOT OR (name t1, name t2)',
        where: { NOT: { OR: [{ name: 't1' }, { name: 't2' }] } },
        expected: ['t3'],
      },
    ]);
  });
});
