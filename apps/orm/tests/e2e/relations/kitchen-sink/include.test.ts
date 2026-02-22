/**
 * E2E Tests: Kitchen Sink - Include
 *
 * Schema: kitchen-sink.cerial
 * Tests including all relation types.
 *
 * Flow: User is created first, then related entities reference it.
 * - Profile requires userId (belongs to User) - reverse relation on User
 * - Post requires authorId (belongs to User) - reverse relation on User
 * - Settings has optional userId with @onDelete(Cascade) - forward from User
 * - Tags/Badges are n-n relations - forward from User
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

describe('E2E Kitchen Sink: Include', () => {
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

  describe('include profile (reverse 1-1)', () => {
    test('should include profile from user', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      // Create profile that belongs to user
      await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Bio text',
          user: { connect: user.id },
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result?.profile?.bio).toBe('Bio text');
    });

    test('should return null profile when not present', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { profile: true },
      });

      expect(result?.profile).toBeNull();
    });

    test('should include user from profile', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User Name',
        },
      });

      // Create profile that belongs to user
      const profile = await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Bio text',
          user: { connect: user.id },
        },
      });

      const result = await client.db.KitchenSinkProfile.findOne({
        where: { id: profile.id },
        include: { user: true },
      });

      expect(result?.user?.name).toBe('User Name');
    });
  });

  describe('include posts (reverse 1-n)', () => {
    test('should include posts from user', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author',
        },
      });

      // Create posts that belong to user
      await client.db.KitchenSinkPost.create({
        data: { title: 'Post 1', author: { connect: user.id } },
      });
      await client.db.KitchenSinkPost.create({
        data: { title: 'Post 2', author: { connect: user.id } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { posts: true },
      });

      expect(result?.posts).toHaveLength(2);
    });

    test('should return empty posts when none exist', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'No Posts',
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { posts: true },
      });

      expect(result?.posts).toEqual([]);
    });

    test('should include author from post', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author Name',
        },
      });

      // Create post belonging to user
      const post = await client.db.KitchenSinkPost.create({
        data: { title: 'My Post', author: { connect: user.id } },
      });

      const result = await client.db.KitchenSinkPost.findOne({
        where: { id: post.id },
        include: { author: true },
      });

      expect(result?.author?.name).toBe('Author Name');
    });
  });

  describe('include tags (n-n bidirectional)', () => {
    test('should include tags from user', async () => {
      // Create user with tags via forward relation
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          tags: {
            create: [{ name: 'Tech' }, { name: 'Art' }],
          },
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { tags: true },
      });

      expect(result?.tags).toHaveLength(2);
      expect(result?.tags?.map((t) => t.name).sort()).toEqual(['Art', 'Tech']);
    });

    test('should include users from tag (bidirectional)', async () => {
      // Create tag first
      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'Shared' },
      });

      // Create users connected to the tag
      await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail('u1'),
          name: 'U1',
          tags: { connect: [tag.id] },
        },
      });
      await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail('u2'),
          name: 'U2',
          tags: { connect: [tag.id] },
        },
      });

      const result = await client.db.KitchenSinkTag.findOne({
        where: { id: tag.id },
        include: { users: true },
      });

      expect(result?.users).toHaveLength(2);
    });

    test('should return empty tags when none connected', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'No Tags',
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { tags: true },
      });

      expect(result?.tags).toEqual([]);
    });
  });

  describe('include settings (forward optional 1-1)', () => {
    test('should include settings when connected', async () => {
      // Create user with nested settings
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          settings: {
            create: { theme: 'dark' },
          },
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { settings: true },
      });

      expect(result?.settings?.theme).toBe('dark');
    });

    test('should return null settings when not present', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { settings: true },
      });

      expect(result?.settings).toBeNull();
    });

    test('should include user from settings', async () => {
      // Create user
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User Name',
        },
      });

      // Create settings linked to user
      const settings = await client.db.KitchenSinkSettings.create({
        data: {
          theme: 'dark',
          user: { connect: user.id },
        },
      });

      const result = await client.db.KitchenSinkSettings.findOne({
        where: { id: settings.id },
        include: { user: true },
      });

      expect(result?.user?.name).toBe('User Name');
    });
  });

  describe('include badges (n-n one-directional)', () => {
    test('should include badges from user', async () => {
      // Create badges first
      const badge1 = await client.db.KitchenSinkBadge.create({
        data: { name: 'Gold' },
      });
      const badge2 = await client.db.KitchenSinkBadge.create({
        data: { name: 'Silver' },
      });

      // Create user with badges
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          badges: { connect: [badge1.id, badge2.id] },
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { badges: true },
      });

      expect(result?.badges).toHaveLength(2);
    });

    test('badge has no users field (one-directional)', async () => {
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'Badge' },
      });

      // Badge model has no users field - it's one-directional
      expect((badge as Record<string, unknown>).users).toBeUndefined();
      expect((badge as Record<string, unknown>).userIds).toBeUndefined();
    });

    test('should return empty badges when none connected', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'No Badges',
        },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { badges: true },
      });

      expect(result?.badges).toEqual([]);
    });
  });

  describe('include all relations', () => {
    test('should include all user relations at once', async () => {
      // Create badge first (one-directional - must exist before user)
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'Champion' },
      });

      // Create user with forward relations
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Full User',
          tags: { create: [{ name: 'Tag' }] },
          settings: { create: { theme: 'light' } },
          badges: { connect: [badge.id] },
        },
      });

      // Create profile (reverse relation - profile belongs to user)
      await client.db.KitchenSinkProfile.create({
        data: { bio: 'Bio', user: { connect: user.id } },
      });

      // Create post (reverse relation - post belongs to user)
      await client.db.KitchenSinkPost.create({
        data: { title: 'Post', author: { connect: user.id } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: {
          profile: true,
          posts: true,
          tags: true,
          settings: true,
          badges: true,
        },
      });

      expect(result?.profile?.bio).toBe('Bio');
      expect(result?.posts).toHaveLength(1);
      expect(result?.tags).toHaveLength(1);
      expect(result?.settings?.theme).toBe('light');
      expect(result?.badges).toHaveLength(1);
    });
  });
});
