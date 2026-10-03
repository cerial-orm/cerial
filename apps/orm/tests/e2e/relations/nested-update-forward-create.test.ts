/**
 * E2E Tests for a forward nested `create` on update
 *
 * A forward create runs before the main update, because the update stores the new row's id. When the
 * `where` matches nothing it must create nothing; every case counts the related table to prove it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E Nested update forward create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  const seedUser = () => client.db.User.create({ data: { email: 'a@x.io', name: 'a', isActive: true } });

  describe('where matches', () => {
    test('updateUnique creates the profile and links it', async () => {
      const user = await seedUser();

      const updated = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profile: { create: { bio: 'hello' } } },
      });

      expect(await client.db.Profile.count()).toBe(1);
      const profile = await client.db.Profile.findOne({ where: { bio: 'hello' } });
      expect(profile).not.toBeNull();
      expect(updated?.profileId?.toString()).toBe(profile?.id.toString());
    });

    test('updateMany creates the profile and links it', async () => {
      await seedUser();

      const updated = await client.db.User.updateMany({
        where: { email: 'a@x.io' },
        data: { profile: { create: { bio: 'hello' } } },
      });

      expect(updated).toHaveLength(1);
      expect(await client.db.Profile.count()).toBe(1);
      expect(updated[0]?.profileId).toBeDefined();
    });

    test('an array forward create (tags) creates every row and links them', async () => {
      const user = await seedUser();

      const updated = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { tags: { create: [{ name: 't1' }, { name: 't2' }] } },
      });

      expect(await client.db.Tag.count()).toBe(2);
      expect(updated?.tagIds).toHaveLength(2);
    });

    test('return: true reports true', async () => {
      const user = await seedUser();

      const result = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profile: { create: { bio: 'hello' } } },
        return: true,
      });

      expect(result).toBe(true);
      expect(await client.db.Profile.count()).toBe(1);
    });
  });

  describe('where matches nothing', () => {
    test('updateUnique leaves no profile behind and returns null', async () => {
      const user = await seedUser();
      const before = await client.db.Profile.count();

      const result = await client.db.User.updateUnique({
        where: { id: user.id, name: 'WRONG' },
        data: { profile: { create: { bio: 'orphan' } } },
      });

      expect(result).toBeNull();
      expect(before).toBe(0);
      expect(await client.db.Profile.count()).toBe(0);
    });

    test('updateMany leaves no profile behind and returns an empty array', async () => {
      await seedUser();

      const result = await client.db.User.updateMany({
        where: { email: 'nobody@x.io' },
        data: { profile: { create: { bio: 'orphan' } } },
      });

      expect(result).toEqual([]);
      expect(await client.db.Profile.count()).toBe(0);
    });

    test('an array forward create leaves no tags behind', async () => {
      await seedUser();

      await client.db.User.updateMany({
        where: { email: 'nobody@x.io' },
        data: { tags: { create: [{ name: 't1' }, { name: 't2' }] } },
      });

      expect(await client.db.Tag.count()).toBe(0);
    });

    test('return: true reports false and creates nothing', async () => {
      const user = await seedUser();

      const result = await client.db.User.updateUnique({
        where: { id: user.id, name: 'WRONG' },
        data: { profile: { create: { bio: 'orphan' } } },
        return: true,
      });

      expect(result).toBe(false);
      expect(await client.db.Profile.count()).toBe(0);
    });
  });
});
