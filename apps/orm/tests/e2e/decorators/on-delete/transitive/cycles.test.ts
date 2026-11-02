/**
 * E2E Tests: transitive @onDelete over cycles and the depth limit
 *
 * DdTree cascades to itself and DdPing and DdPong cascade to each other. A cycle in the data must end, a
 * subtree is removed row by row to any depth within the limit, and a tree deeper than the limit is refused
 * with every row still in place.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError } from 'cerial';
import type { CerialClient } from '../../../test-helper';
import { connectClient, DEPTH_LIMIT, refusalOf, resetTables, seedTreeChain } from './helpers';

describe('E2E transitive @onDelete: cycles and the depth limit', () => {
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

  describe('Cascade self-reference', () => {
    test('a branching tree of depth three is removed from its root and a sibling tree stays', async () => {
      const root = await client.db.DdTree.create({ data: { name: 'r' } });
      const a = await client.db.DdTree.create({ data: { name: 'a', parent: { connect: root.id } } });
      await client.db.DdTree.create({ data: { name: 'b', parent: { connect: root.id } } });
      const a1 = await client.db.DdTree.create({ data: { name: 'a1', parent: { connect: a.id } } });
      await client.db.DdTree.create({ data: { name: 'a11', parent: { connect: a1.id } } });
      const other = await client.db.DdTree.create({ data: { name: 'other' } });
      await client.db.DdTree.create({ data: { name: 'other1', parent: { connect: other.id } } });

      expect(await client.db.DdTree.deleteMany({ where: { id: root.id } })).toBe(1);

      const left = await client.db.DdTree.findMany({ orderBy: { name: 'asc' } });
      expect(left.map((r) => r.name)).toEqual(['other', 'other1']);
    });

    test('deleting a middle node removes its subtree and keeps its ancestors', async () => {
      const ids = await seedTreeChain(client, 4);

      await client.db.DdTree.deleteUnique({ where: { id: ids[2]! } });

      const left = await client.db.DdTree.findMany({ orderBy: { name: 'asc' } });
      expect(left.map((r) => r.name)).toEqual(['n0', 'n1']);
    });

    test('deleting a leaf removes only the leaf', async () => {
      const ids = await seedTreeChain(client, 3);

      await client.db.DdTree.deleteMany({ where: { id: ids[3]! } });

      expect(await client.db.DdTree.count()).toBe(3);
    });

    test('a tree exactly at the limit is removed entirely', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT);

      await client.db.DdTree.deleteMany({ where: { id: ids[0]! } });

      expect(await client.db.DdTree.count()).toBe(0);
    });

    test('a tree one level past the limit is refused with a database error naming the limit', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);

      const refusal = await refusalOf(() => client.db.DdTree.deleteMany({ where: { id: ids[0]! } }));

      expect(refusal).toBeInstanceOf(CerialDatabaseError);
      expect((refusal as CerialDatabaseError).code).toBe('C6001');
      expect(await client.db.DdTree.count()).toBe(DEPTH_LIMIT + 2);
    });

    test('deleteUnique past the limit is refused and every row stays', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);

      const refusal = await refusalOf(() => client.db.DdTree.deleteUnique({ where: { id: ids[0]! } }));

      expect(refusal).toBeInstanceOf(CerialDatabaseError);
      expect(await client.db.DdTree.count()).toBe(DEPTH_LIMIT + 2);
    });

    test('deleting a node below the deep part succeeds because the limit counts from the deleted row', async () => {
      const ids = await seedTreeChain(client, DEPTH_LIMIT + 1);

      await client.db.DdTree.deleteMany({ where: { id: ids[1]! } });

      expect(await client.db.DdTree.count()).toBe(1);
    });

    test('a two-row data cycle terminates and removes both rows and what hangs below', async () => {
      const x = await client.db.DdTree.create({ data: { name: 'x' } });
      const y = await client.db.DdTree.create({ data: { name: 'y', parent: { connect: x.id } } });
      await client.db.DdTree.updateUnique({ where: { id: x.id }, data: { parent: { connect: y.id } } });
      await client.db.DdTree.create({ data: { name: 'z', parent: { connect: y.id } } });
      await client.db.DdTree.create({ data: { name: 'keep' } });

      await client.db.DdTree.deleteMany({ where: { id: x.id } });

      const left = await client.db.DdTree.findMany();
      expect(left.map((r) => r.name)).toEqual(['keep']);
    });

    test('a row that is its own parent is removed once and the delete ends', async () => {
      const self = await client.db.DdTree.create({ data: { name: 'self' } });
      await client.db.DdTree.updateUnique({ where: { id: self.id }, data: { parent: { connect: self.id } } });

      await client.db.DdTree.deleteMany({ where: { id: self.id } });

      expect(await client.db.DdTree.count()).toBe(0);
    });
  });

  describe('mutual Cascade cycle', () => {
    test('deleting a Ping removes the Pongs below it and the Pings below those', async () => {
      const p1 = await client.db.DdPing.create({ data: { name: 'p1' } });
      const q1 = await client.db.DdPong.create({ data: { name: 'q1', ping: { connect: p1.id } } });
      const p2 = await client.db.DdPing.create({ data: { name: 'p2', pong: { connect: q1.id } } });
      await client.db.DdPong.create({ data: { name: 'q2', ping: { connect: p2.id } } });
      await client.db.DdPing.create({ data: { name: 'keep' } });
      await client.db.DdPong.create({ data: { name: 'keep' } });

      await client.db.DdPing.deleteMany({ where: { id: p1.id } });

      expect(await client.db.DdPing.count()).toBe(1);
      expect(await client.db.DdPong.count()).toBe(1);
    });

    test('a data cycle between a Ping and a Pong terminates and removes both', async () => {
      const p = await client.db.DdPing.create({ data: { name: 'p' } });
      const q = await client.db.DdPong.create({ data: { name: 'q', ping: { connect: p.id } } });
      await client.db.DdPing.updateUnique({ where: { id: p.id }, data: { pong: { connect: q.id } } });

      expect(await client.db.DdPing.deleteUnique({ where: { id: p.id } })).toBe(true);

      expect(await client.db.DdPing.count()).toBe(0);
      expect(await client.db.DdPong.count()).toBe(0);
    });

    test('deleting a Pong cascades the other way', async () => {
      const p = await client.db.DdPing.create({ data: { name: 'p' } });
      const q = await client.db.DdPong.create({ data: { name: 'q' } });
      await client.db.DdPing.updateUnique({ where: { id: p.id }, data: { pong: { connect: q.id } } });

      await client.db.DdPong.deleteMany({ where: { id: q.id } });

      expect(await client.db.DdPing.count()).toBe(0);
      expect(await client.db.DdPong.count()).toBe(0);
    });
  });
});
