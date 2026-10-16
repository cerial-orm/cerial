/**
 * E2E Tests: a refused call leaves an unrelated table untouched, and the legitimate forms still work
 *
 * Each refusal is paired with a marker row in a table the call never names. The marker must still be
 * there afterwards and the target table must hold nothing new. The positive cases cover the other half:
 * ids carrying a backslash or a bracket round-trip through every id-taking method, a sub-key under a
 * @flexible object still sorts, and a valid reverse-relation create still writes.
 *
 * Schema: core isolated (BasicsUser, BasicsPost, BasicsTag), flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ALL_TABLES = [...tables.basics, ...tables.flexible];

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

const userData = (email: string) => ({ email, name: 'N', isActive: true });

const flexUser = (name: string, rank: number) => ({
  name,
  address: { street: 's', city: 'c', rank },
  strictAddress: { street: 's', city: 'c' },
  profile: { bio: 'b', metadata: { label: 'l' } },
  tags: [],
});

describe('Refused calls leave other tables untouched', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);
    await client.db.BasicsTag.create({ data: { name: 'marker' } });
  });

  const markerSurvives = async () => {
    const rows = await client.db.BasicsTag.findMany({});

    expect(rows.map((r) => r.name)).toEqual(['marker']);
  };

  describe('nested reverse create with a key the target model does not declare', () => {
    test.each(['not_a_field', "it's", 'semi;colon', 'ключ'])('create refuses %j by name', async (key) => {
      await rejects(
        () =>
          client.db.BasicsUser.create({
            data: { ...userData('a@b.co'), posts: { create: { title: 't', [key]: 1 } } },
          }),
        `Unknown field '${key}' on model BasicsPost`,
      );

      await markerSurvives();
      expect(await client.db.BasicsUser.count()).toBe(0);
      expect(await client.db.BasicsPost.count()).toBe(0);
    });

    test('an array of items is checked item by item', async () => {
      await rejects(
        () =>
          client.db.BasicsUser.create({
            // @ts-expect-error — undeclared key in the second item, testing the runtime guard
            data: { ...userData('a@b.co'), posts: { create: [{ title: 'ok' }, { title: 't', not_a_field: 1 }] } },
          }),
        "Unknown field 'not_a_field' on model BasicsPost",
      );

      await markerSurvives();
      expect(await client.db.BasicsPost.count()).toBe(0);
    });

    test('the create half of an upsert refuses it too', async () => {
      await rejects(
        () =>
          client.db.BasicsUser.upsert({
            where: { email: 'a@b.co' },
            // @ts-expect-error — undeclared key in the nested item, testing the runtime guard
            create: { ...userData('a@b.co'), posts: { create: { title: 't', not_a_field: 1 } } },
            update: { name: 'u' },
          }),
        "Unknown field 'not_a_field' on model BasicsPost",
      );

      await markerSurvives();
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test('a valid reverse create still writes the child with the parent id', async () => {
      const user = await client.db.BasicsUser.create({
        data: { ...userData('ok@b.co'), posts: { create: { title: 'first', body: 'b' } } },
      });
      const posts = await client.db.BasicsPost.findMany({});

      expect(posts.map((p) => p.title)).toEqual(['first']);
      expect(posts[0]!.authorId.equals(user!.id)).toBe(true);
    });

    test('an array of valid items writes each', async () => {
      await client.db.BasicsUser.create({
        data: { ...userData('ok@b.co'), posts: { create: [{ title: 'one' }, { title: 'two' }] } },
      });

      const posts = await client.db.BasicsPost.findMany({ orderBy: { title: 'asc' } });

      expect(posts.map((p) => p.title)).toEqual(['one', 'two']);
    });
  });

  describe('orderBy direction under a @flexible object', () => {
    test.each(['sideways', 'asc desc', 'asc;', ''])('refuses direction %j', async (direction) => {
      await client.db.FlexUser.create({ data: flexUser('f', 1) });

      await rejects(
        // @ts-expect-error — direction is not asc or desc, testing the runtime guard
        () => client.db.FlexUser.findMany({ orderBy: { address: { rank: direction } } }),
        "Order direction for 'address.rank' must be 'asc' or 'desc'",
      );

      await markerSurvives();
      expect(await client.db.FlexUser.count()).toBe(1);
    });

    test.each(['asc', 'desc'] as const)('an undeclared sub-key still sorts %s', async (direction) => {
      await client.db.FlexUser.create({ data: flexUser('b', 2) });
      await client.db.FlexUser.create({ data: flexUser('a', 1) });
      await client.db.FlexUser.create({ data: flexUser('c', 3) });

      // @ts-expect-error — the OrderBy type lists declared keys only; an undeclared sub-key sorts at runtime
      const rows = await client.db.FlexUser.findMany({ orderBy: { address: { rank: direction } } });
      const names = rows.map((r) => r.name);

      expect(names).toEqual(direction === 'asc' ? ['a', 'b', 'c'] : ['c', 'b', 'a']);
    });
  });

  describe('ids with a backslash or a bracket', () => {
    const IDS = ['plain', 'with\\backslash', 'ends\\', 'close⟩bracket', 'back\\⟩both', "quo'te", 'a"b', 'semi;colon'];

    test.each(IDS)('%j round-trips through every id-taking method', async (id) => {
      const created = await client.db.BasicsUser.create({ data: { id, ...userData('id@b.co') } });
      expect(created!.id.id).toBe(id);

      const found = await client.db.BasicsUser.findUnique({ where: { id } });
      expect(found?.email).toBe('id@b.co');

      const updated = await client.db.BasicsUser.updateUnique({ where: { id }, data: { name: 'U' } });
      expect(updated?.name).toBe('U');

      const upserted = await client.db.BasicsUser.upsert({
        where: { id },
        create: userData('other@b.co'),
        update: { name: 'V' },
      });
      expect(upserted?.name).toBe('V');
      expect(await client.db.BasicsUser.count()).toBe(1);

      const withSelect = await client.db.BasicsUser.updateUnique({
        where: { id },
        data: { name: 'W' },
        return: 'before',
        select: { name: true },
      });
      expect(withSelect).toEqual({ name: 'V' });

      expect(await client.db.BasicsUser.deleteUnique({ where: { id } })).toBe(true);
      expect(await client.db.BasicsUser.count()).toBe(0);

      await markerSurvives();
    });

    test.each(IDS)('%j for a record that does not exist finds nothing and writes nothing else', async (id) => {
      expect(await client.db.BasicsUser.findUnique({ where: { id } })).toBeNull();
      expect(await client.db.BasicsUser.updateUnique({ where: { id }, data: { name: 'U' } })).toBeNull();
      await client.db.BasicsUser.deleteUnique({ where: { id } });

      await markerSurvives();
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test('upsert creates the row under that exact id when none exists', async () => {
      const id = 'new\\⟩id';
      const row = await client.db.BasicsUser.upsert({
        where: { id },
        create: userData('n@b.co'),
        update: { name: 'u' },
      });

      expect(row?.id.id).toBe(id);
      await markerSurvives();
    });
  });
});
