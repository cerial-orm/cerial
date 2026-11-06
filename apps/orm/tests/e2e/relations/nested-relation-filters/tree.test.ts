/**
 * E2E Tests: a relation key inside a relation filter body, on a self-referencing tree
 *
 * CategoryTree has the forward `parent` and the reverse array `children`, so one model covers
 * forward -> forward, forward -> reverse, reverse -> forward and reverse -> reverse at depth 2 and 3.
 *
 *   R
 *   |- A
 *   |  |- A1
 *   |  |  `- A1a
 *   |  `- A2
 *   `- B
 *      `- B1
 *   Z (no parent, no children)
 *
 * Each filter used to compile its inner relation key to a comparison on the virtual relation field, which is
 * never true, so a NOT around it matched every row and deleteMany removed the whole table.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CategoryTreeWhere,
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const TABLES = tables.selfRefTree;
const IDS = ['R', 'A', 'B', 'A1', 'A2', 'B1', 'A1a', 'Z'] as const;
const PARENT: Record<string, string | undefined> = { A: 'R', B: 'R', A1: 'A', A2: 'A', B1: 'B', A1a: 'A1' };
const without = (...ids: string[]): string[] => IDS.filter((id) => !ids.includes(id));

describe('E2E nested relation filters: tree', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    for (const id of IDS) {
      const parentId = PARENT[id];
      await client.db.CategoryTree.create({ data: { id, name: id, ...(parentId ? { parentId } : {}) } });
    }
  });

  const rows = (): Rows<CategoryTreeWhere> => ({
    find: async (where) => (await client.db.CategoryTree.findMany({ where })).map((r) => r.name),
    count: (where) => client.db.CategoryTree.count(where),
    update: async (where) => {
      await client.db.CategoryTree.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.CategoryTree.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.CategoryTree.deleteMany({ where });
    },
    survivors: async () => (await client.db.CategoryTree.findMany()).map((r) => r.name),
    everything: IDS,
  });

  const reverseReverse: Case<CategoryTreeWhere>[] = [
    {
      label: 'children.some.children.some.name: the grandparent of A1a',
      where: { children: { some: { children: { some: { name: 'A1a' } } } } },
      expected: ['A'],
    },
    {
      label: 'children.some.children.some.{}: has a grandchild',
      where: { children: { some: { children: { some: {} } } } },
      expected: ['R', 'A'],
    },
    {
      label: 'children.every.children.some.{}: every child has children',
      where: { children: { every: { children: { some: {} } } } },
      expected: ['R'],
    },
    {
      label: 'children.none.children.some.{}: no child has children',
      where: { children: { none: { children: { some: {} } } } },
      expected: ['B', 'A1', 'A2', 'B1', 'A1a', 'Z'],
    },
    {
      label: 'NOT children.some.children.some.name',
      where: { NOT: { children: { some: { children: { some: { name: 'A1a' } } } } } },
      expected: without('A'),
    },
    {
      label: 'children.some.children.some.children.some.name: depth 3',
      where: { children: { some: { children: { some: { children: { some: { name: 'A1a' } } } } } } },
      expected: ['R'],
    },
    {
      label: 'children.some.children.isEmpty: has a leaf child',
      where: { children: { some: { children: { isEmpty: true } } } },
      expected: ['A', 'B', 'A1'],
    },
    {
      label: 'shorthand: children.children.some.name',
      where: { children: { children: { some: { name: 'A1a' } } } },
      expected: ['A'],
    },
  ];

  const forwardForward: Case<CategoryTreeWhere>[] = [
    {
      label: 'parent.parent.name: grandchildren of R',
      where: { parent: { parent: { name: 'R' } } },
      expected: ['A1', 'A2', 'B1'],
    },
    {
      label: 'NOT parent.parent.name',
      where: { NOT: { parent: { parent: { name: 'R' } } } },
      expected: without('A1', 'A2', 'B1'),
    },
    {
      label: 'parent.parent.parent.name: depth 3',
      where: { parent: { parent: { parent: { name: 'R' } } } },
      expected: ['A1a'],
    },
    {
      label: 'parent.parent null: parent exists but has no parent',
      where: { parent: { parent: null } },
      expected: ['A', 'B'],
    },
  ];

  const forwardReverse: Case<CategoryTreeWhere>[] = [
    {
      label: 'parent.children.some.name: siblings and self of A2',
      where: { parent: { children: { some: { name: 'A2' } } } },
      expected: ['A1', 'A2'],
    },
    {
      label: 'parent.children.none.name: parent has no child named A2',
      where: { parent: { children: { none: { name: 'A2' } } } },
      expected: ['A', 'B', 'B1', 'A1a'],
    },
    {
      label: 'parent.children.every.children.isEmpty: every sibling is a leaf',
      where: { parent: { children: { every: { children: { isEmpty: true } } } } },
      expected: ['B1', 'A1a'],
    },
    {
      label: 'NOT parent.children.some.name',
      where: { NOT: { parent: { children: { some: { name: 'A2' } } } } },
      expected: without('A1', 'A2'),
    },
    {
      label: 'parent.children.some.{}: the parent has a child',
      where: { parent: { children: { some: {} } } },
      expected: without('R', 'Z'),
    },
    {
      label: 'parent.children.none.{}: a child whose parent has no children is impossible',
      where: { parent: { children: { none: {} } } },
      expected: [],
    },
    {
      label: 'parent.children.isEmpty false: shorthand for a parent with children',
      where: { parent: { children: { isEmpty: false } } },
      expected: without('R', 'Z'),
    },
    {
      label: 'parent.parent.children.some.name: depth 3 forward, forward, reverse',
      where: { parent: { parent: { children: { some: { name: 'B' } } } } },
      expected: ['A1', 'A2', 'B1'],
    },
  ];

  const reverseForward: Case<CategoryTreeWhere>[] = [
    {
      label: 'children.some.parent.name: the parent of a child is the row',
      where: { children: { some: { parent: { name: 'A' } } } },
      expected: ['A'],
    },
    {
      label: 'children.every.parent.children.some.name',
      where: { children: { every: { parent: { children: { some: { name: 'A2' } } } } } },
      expected: ['A'],
    },
    {
      label: 'children.none.parent.name',
      where: { children: { none: { parent: { name: 'A' } } } },
      expected: without('A'),
    },
    {
      label: 'NOT children.some.parent.name',
      where: { NOT: { children: { some: { parent: { name: 'A' } } } } },
      expected: without('A'),
    },
  ];

  const logical: Case<CategoryTreeWhere>[] = [
    {
      label: 'OR of a reverse -> reverse and a forward -> forward',
      where: { OR: [{ children: { some: { children: { some: {} } } } }, { parent: { parent: { name: 'R' } } }] },
      expected: ['R', 'A', 'A1', 'A2', 'B1'],
    },
    {
      label: 'AND of a forward -> reverse and a reverse -> forward',
      where: {
        AND: [{ parent: { children: { some: { name: 'A2' } } } }, { children: { some: { parent: { name: 'A1' } } } }],
      },
      expected: ['A1'],
    },
    {
      label: 'NOT of an OR over two nested relation keys',
      where: {
        NOT: { OR: [{ children: { some: { children: { some: {} } } } }, { parent: { parent: { name: 'R' } } }] },
      },
      expected: without('R', 'A', 'A1', 'A2', 'B1'),
    },
    {
      label: 'OR inside a forward body mixes a relation key and a field',
      where: { parent: { OR: [{ parent: { name: 'A' } }, { name: 'B' }] } },
      expected: ['B1', 'A1a'],
    },
    {
      label: 'NOT inside a reverse body around a relation key',
      where: { children: { some: { NOT: { children: { some: {} } } } } },
      expected: ['A', 'B', 'A1'],
    },
  ];

  runCases('reverse -> reverse', rows, reverseReverse);
  runCases('forward -> forward', rows, forwardForward);
  runCases('forward -> reverse', rows, forwardReverse);
  runCases('reverse -> forward', rows, reverseForward);
  runCases('logical operators', rows, logical);

  describe('include where', () => {
    test('a forward -> reverse filter on the included children', async () => {
      const tree = await client.db.CategoryTree.findMany({
        where: { name: { in: ['R', 'A'] } },
        include: { children: { where: { parent: { children: { some: { name: 'A2' } } } } } },
      });
      const byName = Object.fromEntries(tree.map((t) => [t.name, t.children.map((c) => c.name).sort()]));

      expect(byName).toEqual({ R: [], A: ['A1', 'A2'] });
    });

    test('a reverse -> reverse filter on the included children', async () => {
      const tree = await client.db.CategoryTree.findMany({
        where: { name: { in: ['R', 'A', 'B'] } },
        include: { children: { where: { children: { some: { children: { some: {} } } } } } },
      });
      const byName = Object.fromEntries(tree.map((t) => [t.name, t.children.map((c) => c.name).sort()]));

      expect(byName).toEqual({ R: ['A'], A: [], B: [] });
    });

    test('a NOT over a nested relation key on the included children', async () => {
      const tree = await client.db.CategoryTree.findMany({
        where: { name: { in: ['R', 'A'] } },
        include: { children: { where: { NOT: { parent: { children: { some: { name: 'A2' } } } } } } },
      });
      const byName = Object.fromEntries(tree.map((t) => [t.name, t.children.map((c) => c.name).sort()]));

      expect(byName).toEqual({ R: ['A', 'B'], A: [] });
    });
  });

  test('a nested relation key under NOT does not take the whole table with deleteMany', async () => {
    await client.db.CategoryTree.deleteMany({ where: { NOT: { children: { some: { children: { some: {} } } } } } });

    expect((await client.db.CategoryTree.findMany()).map((r) => r.name).sort()).toEqual(['A', 'R']);
  });

  test('an unknown key at the inner level is refused on every entry point', async () => {
    const bad = (where: unknown): never => where as never;

    for (const where of [
      { children: { some: { children: { some: { nmae: 'x' } } } } },
      { parent: { parent: { nmae: 'x' } } },
      { parent: { children: { some: { nmae: 'x' } } } },
      { children: { some: { parent: { children: { any: {} } } } } },
    ]) {
      await expect((async () => await client.db.CategoryTree.findMany({ where: bad(where) }))()).rejects.toThrow();
      await expect((async () => await client.db.CategoryTree.deleteMany({ where: bad(where) }))()).rejects.toThrow();
    }
    expect(await client.db.CategoryTree.count()).toBe(IDS.length);
  });
});
