/**
 * E2E Tests for `unset` on a nested-operation update of an optional tuple
 *
 * Lives with the tuple tests because it writes the tuple tables; the relation-group file that holds
 * the other nested-update unset cases must not share them. The nested call and a plain control run on
 * a fresh seed and must agree.
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

describe('E2E Tuples: nested update unset', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.tuples);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.tuples);
  });

  const seedPost = async () => {
    await client.db.TupleWithRelation.create({ data: { id: 'p1', name: 'p1', location: [1, 2] } });
    await client.db.TupleWithRelation.create({ data: { id: 'p2', name: 'p2', location: [3, 4] } });
    await client.db.TupleRelatedPost.create({
      data: { id: 'post1', title: 't', position: [5, 6], authorId: 'p1' },
    });
  };

  const post = async () => {
    const r = await client.db.TupleRelatedPost.findOne({ where: { id: 'post1' } });

    return { title: r?.title, position: r?.position };
  };

  test('unsetting the whole tuple clears it, as the plain call does', async () => {
    await seedPost();
    await client.db.TupleRelatedPost.updateUnique({
      where: { id: 'post1' },
      data: { author: { connect: 'p2' } },
      unset: { position: true },
    });
    const nested = await post();

    await truncateTables(client, tables.tuples);
    await seedPost();
    await client.db.TupleRelatedPost.updateUnique({ where: { id: 'post1' }, data: {}, unset: { position: true } });
    const plain = await post();

    expect(plain.position).toBeUndefined();
    expect(nested).toEqual(plain);
  });

  test('without unset the tuple is untouched', async () => {
    await seedPost();
    await client.db.TupleRelatedPost.updateUnique({ where: { id: 'post1' }, data: { author: { connect: 'p2' } } });

    expect((await post()).position).toEqual([5, 6]);
  });
});
