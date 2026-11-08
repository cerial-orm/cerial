/**
 * E2E Tests: a self-referencing object refuses an undeclared key at every depth — negative cases
 *
 * The database types a self-referencing object FLEXIBLE, so it stores an undeclared key below the
 * first level; only the client refuses it. Each refusal must leave the stored row untouched.
 *
 * Schema: complex-types/objects.cerial
 * Model: ObjectTestOrder { billingAddress Address, items OrderItem[], metadata TreeNode? }
 *        TreeNode { payload Int, children TreeNode[] }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

const billingAddress = { street: '1 Main', city: 'Oslo', state: 'OS' };
interface Tree {
  payload: number;
  children: Tree[];
}
const node = (kids: Tree[] = [], extra: Record<string, unknown> = {}): Tree =>
  ({ payload: 1, children: kids, ...extra }) as Tree;
const goodTree = node([node([node([node()])])]);
// Same shape with one undeclared key, at depth 1, 2, 3 and 4
const badTrees = [
  ['depth 1', node([], { extra: 1 }), 'metadata.extra'],
  ['depth 2', node([node([], { extra: 1 })]), 'metadata.children[0].extra'],
  ['depth 3', node([node([node([], { extra: 1 })])]), 'metadata.children[0].children[0].extra'],
  ['depth 4', node([node([node([node([], { extra: 1 })])])]), 'metadata.children[0].children[0].children[0].extra'],
] as const;

describe('Self-referencing object keys — negative cases', () => {
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

  const seed = () => client.db.ObjectTestOrder.create({ data: { billingAddress, items: [], metadata: goodTree } });
  const stored = async (id: unknown) =>
    (await client.db.ObjectTestOrder.findOne({ where: { id: id as never } }))?.metadata;

  describe.each(badTrees)('undeclared key at %s', (_label, tree, path) => {
    test('create refuses it and writes nothing', async () => {
      await rejects(
        () => client.db.ObjectTestOrder.create({ data: { billingAddress, items: [], metadata: tree as never } }),
        path,
      );
      expect(await client.db.ObjectTestOrder.count()).toBe(0);
    });

    test('updateUnique refuses it and leaves the row untouched', async () => {
      const row = await seed();

      await rejects(
        () => client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: tree as never } }),
        path,
      );
      expect(await stored(row.id)).toEqual(goodTree);
    });

    test('updateMany refuses it and leaves the row untouched', async () => {
      const row = await seed();

      await rejects(
        () => client.db.ObjectTestOrder.updateMany({ where: { id: row.id }, data: { metadata: tree as never } }),
        path,
      );
      expect(await stored(row.id)).toEqual(goodTree);
    });

    test('upsert refuses it in the update half and leaves the row untouched', async () => {
      const row = await seed();

      await rejects(
        () =>
          client.db.ObjectTestOrder.upsert({
            where: { id: row.id },
            create: { billingAddress, items: [], metadata: goodTree },
            update: { metadata: tree as never },
          }),
        path,
      );
      expect(await stored(row.id)).toEqual(goodTree);
    });

    test('upsert refuses it in the create half and writes nothing', async () => {
      await rejects(
        () =>
          client.db.ObjectTestOrder.upsert({
            where: { id: 'object_test_order:absent' as never },
            create: { billingAddress, items: [], metadata: tree as never },
            update: { metadata: goodTree },
          }),
        path,
      );
      expect(await client.db.ObjectTestOrder.count()).toBe(0);
    });
  });

  test('a { push } element with a deep undeclared key is refused and the row is untouched', async () => {
    const row = await seed();

    await rejects(
      () =>
        client.db.ObjectTestOrder.updateUnique({
          where: { id: row.id },
          data: { metadata: { children: { push: node([node([], { extra: 1 })]) } } as never },
        }),
      'children',
    );
    expect(await stored(row.id)).toEqual(goodTree);
  });

  describe('valid deep data', () => {
    const deeper = { ...node([node([node([node()])])]), payload: 2 };

    test('create stores it', async () => {
      const row = await client.db.ObjectTestOrder.create({
        data: { billingAddress, items: [], metadata: deeper },
      });

      expect(await stored(row.id)).toEqual(deeper);
    });

    test('updateUnique, updateMany and upsert store it', async () => {
      const row = await seed();

      await client.db.ObjectTestOrder.updateUnique({ where: { id: row.id }, data: { metadata: deeper } });
      expect(await stored(row.id)).toEqual(deeper);

      await client.db.ObjectTestOrder.updateMany({ where: { id: row.id }, data: { metadata: goodTree } });
      expect(await stored(row.id)).toEqual(goodTree);

      await client.db.ObjectTestOrder.upsert({
        where: { id: row.id },
        create: { billingAddress, items: [], metadata: goodTree },
        update: { metadata: deeper },
      });
      expect(await stored(row.id)).toEqual(deeper);
    });
  });
});
