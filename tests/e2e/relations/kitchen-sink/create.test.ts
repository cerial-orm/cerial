/**
 * E2E Tests: Kitchen Sink - Create
 *
 * Schema: kitchen-sink.cerial
 * Tests creating entities with every type of relation.
 *
 * Relation types covered:
 * - User -> Profile: 1-1 via reverse relation (Profile has userId)
 * - User -> Posts: 1-n via reverse relation (Post has authorId)
 * - User <-> Tags: n-n bidirectional (both have Record[])
 * - User -> Settings: 1-1 optional forward relation
 * - User -> Badges: n-n one-directional (Badges don't track users)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../test-helper';

describe('E2E Kitchen Sink: Create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.kitchenSink);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.kitchenSink);
  });

  describe('create user with profile (1-1 reverse)', () => {
    test('should create user then profile pointing to user', async () => {
      // Create user first (no profile yet)
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      // Create profile pointing to user
      const profile = await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Bio text',
          user: { connect: user.id },
        },
      });

      expect(profile.userId.equals(user.id)).toBe(true);
    });

    test('should create user with nested profile create', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          profile: {
            create: { bio: 'New Bio' },
          },
        },
      });

      // Find the profile that was created
      const profile = await client.db.KitchenSinkProfile.findOne({
        where: { userId: user.id },
      });

      expect(profile).toBeDefined();
      expect(profile?.bio).toBe('New Bio');
      expect(profile?.userId?.equals(user.id)).toBe(true);
    });
  });

  describe('create user with posts (1-n reverse)', () => {
    test('should create user then posts pointing to user', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author',
        },
      });

      // Create posts pointing to user
      await client.db.KitchenSinkPost.create({
        data: { title: 'Post 1', author: { connect: user.id } },
      });
      await client.db.KitchenSinkPost.create({
        data: { title: 'Post 2', author: { connect: user.id } },
      });

      const posts = await client.db.KitchenSinkPost.findMany({
        where: { authorId: user.id },
      });

      expect(posts).toHaveLength(2);
      expect(posts.map((p) => p.title).sort()).toEqual(['Post 1', 'Post 2']);
    });

    test('should create user with nested posts create', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author',
          posts: {
            create: [{ title: 'Post 1' }, { title: 'Post 2' }],
          },
        },
      });

      const posts = await client.db.KitchenSinkPost.findMany({
        where: { authorId: user.id },
      });

      expect(posts).toHaveLength(2);
    });
  });

  describe('create user with tags (n-n bidirectional)', () => {
    test('should create user with tags via connect', async () => {
      // Create tags first
      const tag1 = await client.db.KitchenSinkTag.create({
        data: { name: 'Tag1' },
      });
      const tag2 = await client.db.KitchenSinkTag.create({
        data: { name: 'Tag2' },
      });

      // Create user connecting to tags
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Tagged User',
          tags: { connect: [tag1.id, tag2.id] },
        },
      });

      expect(user.tagIds).toHaveLength(2);
      expect(user.tagIds.some((id) => id.equals(tag1.id))).toBe(true);
      expect(user.tagIds.some((id) => id.equals(tag2.id))).toBe(true);
    });

    test('should create user with nested tags create', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Tagged User',
          tags: {
            create: [{ name: 'NewTag1' }, { name: 'NewTag2' }],
          },
        },
      });

      expect(user.tagIds).toHaveLength(2);

      // Verify tags exist
      const tags = await client.db.KitchenSinkTag.findMany({
        where: { id: { in: user.tagIds } },
      });

      expect(tags.map((t) => t.name).sort()).toEqual(['NewTag1', 'NewTag2']);
    });
  });

  describe('create user with settings (optional 1-1 forward)', () => {
    test('should create user without settings', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      expect(user.settingsId).toBeNull();
    });

    test('should create user with settings via connect', async () => {
      // Create settings first
      const settings = await client.db.KitchenSinkSettings.create({
        data: { theme: 'dark' },
      });

      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          settings: { connect: settings.id },
        },
      });

      expect(user.settingsId?.equals(settings.id)).toBe(true);
    });

    test('should create user with nested settings create', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          settings: {
            create: { theme: 'light' },
          },
        },
      });

      expect(user.settingsId).toBeDefined();

      const settings = await client.db.KitchenSinkSettings.findOne({
        where: { id: user.settingsId! },
      });

      expect(settings?.theme).toBe('light');
    });
  });

  describe('create user with badges (n-n one-directional)', () => {
    test('should create user with badges via connect', async () => {
      // Create badges first
      const badge1 = await client.db.KitchenSinkBadge.create({
        data: { name: 'Badge1' },
      });
      const badge2 = await client.db.KitchenSinkBadge.create({
        data: { name: 'Badge2' },
      });

      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Badged User',
          badges: { connect: [badge1.id, badge2.id] },
        },
      });

      expect(user.badgeIds).toHaveLength(2);
      expect(user.badgeIds.some((id) => id.equals(badge1.id))).toBe(true);
      expect(user.badgeIds.some((id) => id.equals(badge2.id))).toBe(true);
    });
  });

  describe('create fully loaded user', () => {
    test('should create user with multiple relation types', async () => {
      // Pre-create some entities
      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'ExistingTag' },
      });
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'ExistingBadge' },
      });

      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Full User',
          profile: { create: { bio: 'Full bio' } },
          posts: { create: [{ title: 'First Post' }] },
          tags: { connect: [tag.id] },
          settings: { create: { theme: 'auto' } },
          badges: { connect: [badge.id] },
        },
      });

      expect(user.tagIds.some((id) => id.equals(tag.id))).toBe(true);
      expect(user.badgeIds.some((id) => id.equals(badge.id))).toBe(true);
      expect(user.settingsId).toBeDefined();

      // Verify profile was created
      const profile = await client.db.KitchenSinkProfile.findOne({
        where: { userId: user.id },
      });
      expect(profile?.bio).toBe('Full bio');

      // Verify post was created
      const posts = await client.db.KitchenSinkPost.findMany({
        where: { authorId: user.id },
      });
      expect(posts).toHaveLength(1);
    });
  });
});
