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

describe('Deep nested writes', () => {
  let client: CerialClient;
  const refused = "'posts_set[0].owner' holds a relation value";
  const deep = { posts_set: { create: [{ body: 'B', owner: { create: { title: 'DEEP', inc_title: 'd' } } }] } };

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

  const counts = async () => [(await client.db.PnOwner.findMany()).length, (await client.db.PnPost.findMany()).length];

  test('positive: one level of nested create and connect still works', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });
    await client.db.PnOwner.updateUnique({
      where: { id: owner.id },
      data: { posts_set: { create: [{ body: 'B' }] }, tags: { create: [{ label: 'L' }] } },
    });
    const tag = (await client.db.PnTag.findMany())[0]!;
    await client.db.PnOwner.create({ data: { title: 'p', inc_title: 'j', tags: { connect: [tag.id] } } });

    expect(await counts()).toEqual([2, 1]);
  });

  test('negative: updateUnique refuses the deep create and writes nothing', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });

    await expect(
      (async () => {
        // @ts-expect-error — deep nested writes are not in the input type, testing the runtime guard
        await client.db.PnOwner.updateUnique({ where: { id: owner.id }, data: deep });
      })(),
    ).rejects.toThrow(refused);
    expect(await counts()).toEqual([1, 0]);
  });

  test('negative: updateMany refuses it', async () => {
    await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });

    await expect(
      (async () => {
        // @ts-expect-error — testing the runtime guard
        await client.db.PnOwner.updateMany({ where: { title: 'o' }, data: deep });
      })(),
    ).rejects.toThrow(refused);
    expect(await counts()).toEqual([1, 0]);
  });

  test('negative: create refuses it', async () => {
    await expect(
      (async () => {
        await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i', ...deep } });
      })(),
    ).rejects.toThrow(refused);
    expect(await counts()).toEqual([0, 0]);
  });

  test.each([
    ['a plain record id', 'pn_owner:other'],
    ['{ update }', { update: { title: 'x' } }],
    ['{ connectOrCreate }', { connectOrCreate: {} }],
    ['{ upsert }', { upsert: {} }],
    ['{}', {}],
  ])('negative: a nested create refuses %s on a relation and writes nothing', async (_label, value) => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });

    await expect(
      (async () => {
        await client.db.PnOwner.updateUnique({
          where: { id: owner.id },
          // @ts-expect-error — relations are not in the nested create type, testing the runtime guard
          data: { posts_set: { create: [{ body: 'B', owner: value }] } },
        });
      })(),
    ).rejects.toThrow("'posts_set[0].owner' holds a relation value");
    expect(await counts()).toEqual([1, 0]);
  });

  test('negative: a plain object on a top-level relation is refused, not dropped', async () => {
    await expect(
      (async () => {
        // @ts-expect-error — a relation takes only nested operations, testing the runtime guard
        await client.db.PnPost.create({ data: { body: 'B', owner: { title: 'x', inc_title: 'i' } } });
      })(),
    ).rejects.toThrow("Relation 'owner' on model PnPost takes a nested operation");
    expect(await counts()).toEqual([0, 0]);
  });

  test('negative: { update } on an array relation is refused before the database', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });

    await expect(
      (async () => {
        // @ts-expect-error — update is not a nested operation, testing the runtime guard
        await client.db.PnOwner.updateUnique({ where: { id: owner.id }, data: { posts_set: { update: {} } } });
      })(),
    ).rejects.toThrow("Relation 'posts_set' on model PnOwner takes a nested operation with only these keys");
  });

  test('negative: upsert refuses it in the create half and in the update half', async () => {
    const owner = await client.db.PnOwner.create({ data: { title: 'o', inc_title: 'i' } });
    const run = (where: { id: unknown }) =>
      (async () => {
        const args = { where, create: { title: 'c', inc_title: 'c', ...deep }, update: { title: 'u', ...deep } };
        // @ts-expect-error — testing the runtime guard; one line, as TypeScript 7 reports per property, 5 on the call
        await client.db.PnOwner.upsert(args);
      })();

    await expect(run({ id: owner.id })).rejects.toThrow(refused);
    await expect(run({ id: 'pn_owner:missing' })).rejects.toThrow(refused);
    expect(await counts()).toEqual([1, 0]);
  });
});
