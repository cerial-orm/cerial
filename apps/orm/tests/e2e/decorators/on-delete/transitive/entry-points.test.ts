/**
 * E2E Tests: transitive @onDelete through every delete entry point
 *
 * deleteMany, deleteUnique by id and by a unique field, and each deleteUnique return option must all walk
 * the chain: Cascade descends to the grandchildren, Restrict at depth two refuses, and a deleteUnique that
 * matches nothing changes nothing at any level.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CerialClient } from '../../../test-helper';
import { connectClient, type Depth, levelCounts, refusalOf, resetTables, seedChain } from './helpers';

describe('E2E transitive @onDelete: entry points', () => {
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

  describe.each([2, 3] as Depth[])('Cascade at depth %d', (depth) => {
    const gone = Array(depth + 1).fill(0);

    test('deleteMany returns the root count and removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteMany({ where: { id: chain.rootId } })).toBe(1);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('deleteMany by a non-id filter removes every matching chain', async () => {
      await seedChain(client, depth, 'Cascade');
      await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteMany({ where: { name: 'root' } })).toBe(2);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('deleteUnique by id removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteUnique({ where: { id: chain.rootId } })).toBe(true);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('deleteUnique by a unique field removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteUnique({ where: { code: chain.rootCode } })).toBe(true);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('return: true reports that the row existed and removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteUnique({ where: { id: chain.rootId }, return: true })).toBe(true);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test("return: 'before' gives the deleted root and removes every level", async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      const before = await client.db.DdRoot.deleteUnique({ where: { code: chain.rootCode }, return: 'before' });

      expect(before?.code).toBe(chain.rootCode);
      expect(before?.id.equals(chain.rootId)).toBe(true);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('deleteUnique with no match returns false, deletes nothing at any level', async () => {
      await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteUnique({ where: { code: 'no-such-root' }, return: true })).toBe(false);
      expect(await client.db.DdRoot.deleteUnique({ where: { code: 'no-such-root' }, return: 'before' })).toBeNull();
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(Array(depth + 1).fill(1));
    });

    test('deleteMany with no match returns 0 and deletes nothing at any level', async () => {
      await seedChain(client, depth, 'Cascade');

      expect(await client.db.DdRoot.deleteMany({ where: { code: 'no-such-root' } })).toBe(0);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(Array(depth + 1).fill(1));
    });
  });

  describe.each([2, 3] as Depth[])('Restrict at depth %d', (depth) => {
    const intact = Array(depth + 1).fill(1);

    test('deleteMany is refused and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');

      expect(await refusalOf(() => client.db.DdRoot.deleteMany({ where: { id: chain.rootId } }))).toBeDefined();
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test('deleteUnique by id is refused and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');

      expect(await refusalOf(() => client.db.DdRoot.deleteUnique({ where: { id: chain.rootId } }))).toBeDefined();
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test('deleteUnique by a unique field is refused and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');

      expect(await refusalOf(() => client.db.DdRoot.deleteUnique({ where: { code: chain.rootCode } }))).toBeDefined();
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test.each([true, 'before'] as const)(
      'deleteUnique with return: %p is refused and every level stays',
      async (ret) => {
        const chain = await seedChain(client, depth, 'Restrict');

        expect(
          await refusalOf(() => client.db.DdRoot.deleteUnique({ where: { id: chain.rootId }, return: ret })),
        ).toBeDefined();
        expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
      },
    );

    test('one restricted chain blocks deleteMany over two roots, so the unrestricted root stays too', async () => {
      await seedChain(client, depth, 'Restrict');
      await seedChain(client, depth, 'Cascade');

      expect(await refusalOf(() => client.db.DdRoot.deleteMany({ where: { name: 'root' } }))).toBeDefined();
      expect(await client.db.DdRoot.count()).toBe(2);
      expect(await client.db.DdOne.count()).toBe(2);
    });
  });
});
