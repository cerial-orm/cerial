/**
 * E2E Tests: transitive @onDelete inside $transaction
 *
 * Array mode compiles the query, callback and manual modes run it on the transaction connection. Inside an
 * SDK transaction a THROW does not stop the script, so a refusal that the caller catches before committing
 * must still leave every row in place.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CerialClient } from '../../../test-helper';
import {
  connectClient,
  DEPTH_LIMIT,
  type Depth,
  levelCounts,
  refusalOf,
  resetTables,
  seedChain,
  seedTreeChain,
} from './helpers';

describe('E2E transitive @onDelete: transactions', () => {
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

    test('array mode removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      const [result] = await client.$transaction([client.db.DdRoot.deleteUnique({ where: { id: chain.rootId } })]);

      expect(result).toBe(true);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('array mode with deleteMany returns the root count and removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      const [count] = await client.$transaction([client.db.DdRoot.deleteMany({ where: { id: chain.rootId } })]);

      expect(count).toBe(1);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('callback mode removes every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      await client.$transaction(async (tx) => {
        await tx.DdRoot.deleteMany({ where: { id: chain.rootId } });
      });

      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('manual mode removes every level on commit and none on cancel', async () => {
      const cancelled = await seedChain(client, depth, 'Cascade');
      const txn = await client.$transaction();
      await txn.DdRoot.deleteMany({ where: { id: cancelled.rootId } });
      await txn.cancel();
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(Array(depth + 1).fill(1));

      const committed = await client.$transaction();
      await committed.DdRoot.deleteMany({ where: { id: cancelled.rootId } });
      await committed.commit();
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(gone);
    });

    test('a failure in a later callback step restores every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');

      const refusal = await refusalOf(() =>
        client.$transaction(async (tx) => {
          await tx.DdRoot.deleteMany({ where: { id: chain.rootId } });
          throw new Error('later step failed');
        }),
      );

      expect(refusal?.message).toBe('later step failed');
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(Array(depth + 1).fill(1));
    });

    test('a failing later array item restores every level', async () => {
      const chain = await seedChain(client, depth, 'Cascade');
      const restricted = await seedChain(client, depth, 'Restrict');

      const refusal = await refusalOf(() =>
        client.$transaction([
          client.db.DdRoot.deleteUnique({ where: { id: chain.rootId } }),
          client.db.DdRoot.deleteUnique({ where: { id: restricted.rootId } }),
        ]),
      );

      expect(refusal).toBeDefined();
      expect(await client.db.DdRoot.count()).toBe(2);
      expect(await client.db.DdOne.count()).toBe(2);
      expect(await client.db.DdAtTwoCascade.count()).toBe(depth === 2 ? 1 : 0);
      expect(await client.db.DdAtThreeCascade.count()).toBe(depth === 3 ? 1 : 0);
      expect(await levelCounts(client, depth, 'Restrict')).toEqual([...Array(depth).fill(2), 1]);
    });

    test('a manual cancel after a cascade restores every level of a second chain too', async () => {
      const first = await seedChain(client, depth, 'Cascade');
      const second = await seedChain(client, depth, 'Cascade');
      const txn = await client.$transaction();

      await txn.DdRoot.deleteMany({ where: { id: first.rootId } });
      await txn.DdRoot.deleteUnique({ where: { id: second.rootId } });
      await txn.cancel();

      expect(await client.db.DdRoot.count()).toBe(2);
      expect(await levelCounts(client, depth, 'Cascade')).toEqual(Array(depth + 1).fill(2));
    });
  });

  describe.each([2, 3] as Depth[])('a Restrict refusal at depth %d', (depth) => {
    const intact = Array(depth + 1).fill(1);

    test('array mode rejects and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');

      const refusal = await refusalOf(() =>
        client.$transaction([client.db.DdRoot.deleteMany({ where: { id: chain.rootId } })]),
      );

      expect(refusal).toBeDefined();
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test('callback mode catches the refusal, commits, and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');
      let caught: Error | undefined;

      await client.$transaction(async (tx) => {
        caught = await refusalOf(() => tx.DdRoot.deleteMany({ where: { id: chain.rootId } }));
      });

      expect(caught?.message).toContain('@onDelete(Restrict)');
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test('manual mode catches the refusal, commits, and every level stays', async () => {
      const chain = await seedChain(client, depth, 'Restrict');
      const txn = await client.$transaction();

      const caught = await refusalOf(() => txn.DdRoot.deleteUnique({ where: { id: chain.rootId } }));
      await txn.commit();

      expect(caught?.message).toContain('@onDelete(Restrict)');
      expect(await levelCounts(client, depth, 'Restrict')).toEqual(intact);
    });

    test('callback mode with the restricting leaf gone deletes everything', async () => {
      const chain = await seedChain(client, depth, 'Restrict');
      await client.db.DdAtTwoRestrict.deleteMany({ where: {} });
      await client.db.DdAtThreeRestrict.deleteMany({ where: {} });

      await client.$transaction(async (tx) => {
        await tx.DdRoot.deleteMany({ where: { id: chain.rootId } });
      });

      expect(await client.db.DdRoot.count()).toBe(0);
      expect(await client.db.DdOne.count()).toBe(0);
      expect(await client.db.DdTwo.count()).toBe(0);
    });
  });

  describe('a depth-limit refusal', () => {
    test('callback mode catches the refusal, commits, and every level stays', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);
      let caught: Error | undefined;

      await client.$transaction(async (tx) => {
        caught = await refusalOf(() => tx.DdTree.deleteMany({ where: { id: ids[0]! } }));
      });

      expect(caught?.message).toContain(`cascade deeper than ${DEPTH_LIMIT} levels`);
      expect(await client.db.DdTree.count()).toBe(DEPTH_LIMIT + 2);
    });

    test('manual mode catches the refusal, commits, and every level stays', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);
      const txn = await client.$transaction();

      const caught = await refusalOf(() => txn.DdTree.deleteUnique({ where: { id: ids[0]! } }));
      await txn.commit();

      expect(caught?.message).toContain(`cascade deeper than ${DEPTH_LIMIT} levels`);
      expect(await client.db.DdTree.count()).toBe(DEPTH_LIMIT + 2);
    });

    test('array mode rejects and every level stays', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);

      const refusal = await refusalOf(() =>
        client.$transaction([client.db.DdTree.deleteMany({ where: { id: ids[0]! } })]),
      );

      expect(refusal).toBeDefined();
      expect(await client.db.DdTree.count()).toBe(DEPTH_LIMIT + 2);
    });

    test('a tree exactly at the limit deletes in callback mode', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT);

      await client.$transaction(async (tx) => {
        await tx.DdTree.deleteMany({ where: { id: ids[0]! } });
      });

      expect(await client.db.DdTree.count()).toBe(0);
    });
  });
});
