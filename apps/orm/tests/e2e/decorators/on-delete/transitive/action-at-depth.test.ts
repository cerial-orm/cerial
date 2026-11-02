/**
 * E2E Tests: transitive @onDelete, one action per depth
 *
 * Schema: on-delete-deep.cerial
 * DdRoot <- DdOne (Cascade) <- DdTwo (Cascade), with a leaf model of each action hung off DdOne (depth two) and
 * off DdTwo (depth three). Deleting the root must treat the leaf's action as it is treated at depth one:
 * Cascade descends, Restrict blocks the whole delete, SetNull and SetNone clear the key and stop, NoAction is ignored.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError } from 'cerial';
import type { CerialClient } from '../../../test-helper';
import { ACTIONS, connectClient, type Depth, leafOf, levelCounts, refusalOf, resetTables, seedChain } from './helpers';

describe('E2E transitive @onDelete: each action at depth two and three', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = await connectClient();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await resetTables(client);
  });

  describe.each([2, 3] as Depth[])('depth %d', (depth) => {
    const levels = depth + 1;
    const all = (n: number): number[] => Array(levels).fill(n);

    test('Cascade removes every level, and an unrelated chain stays', async () => {
      const chain = await seedChain(client, depth, 'Cascade');
      const other = await seedChain(client, depth, 'Cascade');

      const deleted = await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

      expect(deleted).toBe(1);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(all(1));
      expect((await leafOf(client, depth, 'Cascade').state(chain.leafId)).exists).toBe(false);
      expect((await leafOf(client, depth, 'Cascade').state(other.leafId)).exists).toBe(true);
    });

    test('Restrict blocks the delete at the root and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');

      const refusal = await refusalOf(() => client.db.DdRoot.deleteMany({ where: { id: chain.rootId } }));

      expect(refusal).toBeDefined();
      expect(refusal).toBeInstanceOf(CerialDatabaseError);
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(all(1));
      const state = await leafOf(client, depth, 'Restrict').state(chain.leafId);
      expect(state.fk?.equals(depth === 2 ? chain.oneId : chain.twoId!)).toBe(true);
    });

    test('Restrict with no referencing leaf does not block, and the chain is removed', async () => {
      const chain = await seedChain(client, depth, 'Restrict');
      await client.db.DdAtTwoRestrict.deleteMany({ where: {} });
      await client.db.DdAtThreeRestrict.deleteMany({ where: {} });

      const deleted = await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

      expect(deleted).toBe(1);
      expect(await client.db.DdRoot.count()).toBe(0);
      expect(await client.db.DdOne.count()).toBe(0);
      expect(await client.db.DdTwo.count()).toBe(0);
    });

    test('SetNull removes the levels above and keeps the leaf with a null key', async () => {
      const chain = await seedChain(client, depth, 'SetNull');

      await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

      expect(await levelCounts(client, depth, 'SetNull')).toEqual([...Array(levels - 1).fill(0), 1]);
      expect(await leafOf(client, depth, 'SetNull').state(chain.leafId)).toEqual({ exists: true, fk: null });
    });

    test('SetNone removes the levels above and keeps the leaf with its key absent', async () => {
      const chain = await seedChain(client, depth, 'SetNone');

      await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

      expect(await levelCounts(client, depth, 'SetNone')).toEqual([...Array(levels - 1).fill(0), 1]);
      expect(await leafOf(client, depth, 'SetNone').state(chain.leafId)).toEqual({ exists: true, fk: undefined });
    });

    test('NoAction removes the levels above and leaves the leaf pointing at the deleted row', async () => {
      const chain = await seedChain(client, depth, 'NoAction');

      await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

      expect(await levelCounts(client, depth, 'NoAction')).toEqual([...Array(levels - 1).fill(0), 1]);
      const state = await leafOf(client, depth, 'NoAction').state(chain.leafId);
      expect(state.exists).toBe(true);
      expect(state.fk?.equals(depth === 2 ? chain.oneId : chain.twoId!)).toBe(true);
    });

    test.each(ACTIONS.filter((a) => a !== 'Restrict'))(
      'a %s leaf of a sibling chain is untouched by deleting another root',
      async (action) => {
        const chain = await seedChain(client, depth, action);
        const sibling = await seedChain(client, depth, action);

        await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } });

        expect(
          (await leafOf(client, depth, action).state(sibling.leafId)).fk?.equals(
            depth === 2 ? sibling.oneId : sibling.twoId!,
          ),
        ).toBe(true);
        expect(await client.db.DdRoot.count()).toBe(1);
      },
    );
  });
});
