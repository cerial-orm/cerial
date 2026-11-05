/**
 * E2E Tests: bound-parameter names never collide across where contexts
 *
 * The main where and an include where used to draw names from separate counters, so a field named
 * `inc_title` bound `$inc_title_eq_0` in both, and the include value replaced the main one: an
 * updateMany scoped to `inc_title: 'priv'` rewrote the row holding 'pub'.
 *
 * Schema: placeholder-names (PnOwner/PnItem)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Placeholder name collision', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.placeholderNames);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.placeholderNames);
    const pub = await client.db.PnOwner.create({ data: { title: 'a', inc_title: 'pub' } });
    await client.db.PnOwner.create({ data: { title: 'b', inc_title: 'priv' } });
    await client.db.PnItem.create({ data: { title: 'x', ownerId: pub.id } });
  });

  test('positive: findMany with a distinct include where keeps each value', async () => {
    const rows = await client.db.PnOwner.findMany({
      where: { inc_title: 'priv' },
      include: { items: { where: { title: 'x' } } },
    });

    expect(rows.map((r) => r.inc_title)).toEqual(['priv']);
  });

  test('negative: findMany main where is not replaced by the include where', async () => {
    const rows = await client.db.PnOwner.findMany({
      where: { inc_title: 'priv' },
      include: { items: { where: { title: 'pub' } } },
    });

    expect(rows.map((r) => r.inc_title)).toEqual(['priv']);
  });

  test('negative: updateMany only changes the row its where names', async () => {
    await client.db.PnOwner.updateMany({
      where: { inc_title: 'priv' },
      data: { title: 'changed' },
      include: { items: { where: { title: 'pub' } } },
    });
    const rows = await client.db.PnOwner.findMany({ orderBy: { inc_title: 'asc' } });

    expect(rows.map((r) => [r.inc_title, r.title])).toEqual([
      ['priv', 'changed'],
      ['pub', 'a'],
    ]);
  });
});

describe('Nested-write variable names', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.placeholderNames);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.placeholderNames);
  });

  test('positive: an array create on tags alone creates its record', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });
    await client.db.PnOwner.updateMany({ where: { id: owner.id }, data: { tags: { create: [{ label: 'ARRAY0' }] } } });

    expect((await client.db.PnTag.findMany()).map((t) => t.label)).toEqual(['ARRAY0']);
  });

  test('negative: tags (array create) and tags0 (single create) keep both records and no orphan', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });
    await client.db.PnOwner.updateMany({
      where: { id: owner.id },
      data: { tags: { create: [{ label: 'ARRAY0' }] }, tags0: { create: { label: 'SINGLE' } } },
    });

    const labels = (await client.db.PnTag.findMany()).map((t) => t.label).sort();
    expect(labels).toEqual(['ARRAY0', 'SINGLE']);
    const stored = await client.db.PnOwner.findOne({ where: { id: owner.id } });
    expect(stored?.tagIds.length).toBe(1);
    expect(stored?.tag0Id).toBeDefined();
  });

  test('negative: posts_set reverse create keeps its body beside a rev_create_posts SET', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });
    await client.db.PnOwner.updateMany({
      where: { id: owner.id },
      data: { rev_create_posts: 'SETVAL', posts_set: { create: [{ body: 'REVBODY' }] } },
    });

    expect((await client.db.PnPost.findMany()).map((p) => p.body)).toEqual(['REVBODY']);
    const stored = await client.db.PnOwner.findOne({ where: { id: owner.id } });
    expect(stored?.rev_create_posts).toBe('SETVAL');
  });
});
