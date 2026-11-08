/**
 * E2E Tests: updating a self-referencing object writes every nested sub-key
 *
 * Schema: complex-types/objects.cerial
 * Model: ObjectTestOrder { billingAddress Address, items OrderItem[], metadata TreeNode? }
 *        TreeNode { payload Int, children TreeNode[] }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

interface Tree {
  payload: number;
  children: Tree[];
}
const n = (payload: number, children: Tree[] = []): Tree => ({ payload, children });
const billingAddress = { street: '1 Main', city: 'Oslo', state: 'OS' };
const trees = {
  'one child': n(1, [n(2)]),
  siblings: n(1, [n(2), n(3)]),
  'depth 5': n(1, [n(2, [n(3, [n(4, [n(5)])])])]),
  'siblings at depth': n(1, [n(2, [n(4), n(5)]), n(3)]),
} as const;
const entries = Object.entries(trees);

describe('E2E Objects: self-referencing update', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.objects);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.objects);
  });

  const seed = (metadata: Tree) => client.db.ObjectTestOrder.create({ data: { billingAddress, items: [], metadata } });
  const metadataOf = async (row: { id: unknown }) =>
    (await client.db.ObjectTestOrder.findOne({ where: { id: row.id as never } }))?.metadata;

  for (const [name, tree] of entries) {
    describe(name, () => {
      test('updateUnique replaces a tree that had no children', async () => {
        const row = await seed(n(9));
        await client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: tree } });

        expect(await metadataOf(row)).toEqual(tree);
      });

      test('updateUnique replaces existing children', async () => {
        const row = await seed(n(9, [n(8, [n(7)]), n(6)]));
        await client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: tree } });

        expect(await metadataOf(row)).toEqual(tree);
      });

      test('updateMany replaces the tree', async () => {
        const row = await seed(n(9, [n(8)]));
        await client.db.ObjectTestOrder.updateMany({ where: { id: row.id }, data: { metadata: tree } });

        expect(await metadataOf(row)).toEqual(tree);
      });

      test('upsert update half replaces the tree', async () => {
        const row = await seed(n(9, [n(8)]));
        await client.db.ObjectTestOrder.upsert({
          where: { id: row.id },
          create: { billingAddress, items: [] },
          update: { metadata: tree },
        });

        expect(await metadataOf(row)).toEqual(tree);
      });
    });
  }

  describe('children sub-key alone', () => {
    test('children alone replaces the list and leaves payload', async () => {
      const row = await seed(n(1, [n(2)]));
      await client.db.ObjectTestOrder.updateUnique({
        where: { id: row.id },
        data: { metadata: { children: [n(7), n(8)] } },
      });

      expect(await metadataOf(row)).toEqual(n(1, [n(7), n(8)]));
    });

    test('an empty children array clears them', async () => {
      const row = await seed(n(1, [n(2)]));
      await client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: { children: [] } } });

      expect(await metadataOf(row)).toEqual(n(1));
    });
  });

  describe('undeclared deep keys are still refused', () => {
    const bad = n(1, [n(2, [{ ...n(3), extra: 1 } as Tree])]);
    const refused = (run: () => unknown) =>
      expect(
        (async () => {
          await run();
        })(),
      ).rejects.toThrow('metadata.children[0].children[0].extra');

    test('updateUnique refuses and leaves the row untouched', async () => {
      const row = await seed(n(9));
      await refused(() => client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: bad } }));

      expect(await metadataOf(row)).toEqual(n(9));
    });

    test('updateMany refuses', async () => {
      const row = await seed(n(9));
      await refused(() => client.db.ObjectTestOrder.updateMany({ where: { id: row.id }, data: { metadata: bad } }));

      expect(await metadataOf(row)).toEqual(n(9));
    });
  });
});
