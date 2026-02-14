/**
 * E2E Tests: Kitchen Sink - Update
 *
 * Schema: kitchen-sink.cerial
 * Tests updating various relation types.
 *
 * Flow: User is created first, then related entities reference it.
 * - Profile requires userId (belongs to User) - reverse relation on User
 * - Post requires authorId (belongs to User) - reverse relation on User
 * - Settings has optional userId with @onDelete(Cascade) - forward from User
 * - Tags/Badges are n-n relations - forward from User
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
} from '../test-helper';

describe('E2E Kitchen Sink: Update', () => {
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

  describe('update profile (from profile side)', () => {
    test('should update profile bio', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      // Create profile that belongs to user
      const profile = await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Old Bio',
          user: { connect: user.id },
        },
      });

      await client.db.KitchenSinkProfile.updateMany({
        where: { id: profile.id },
        data: { bio: 'New Bio' },
      });

      const result = await client.db.KitchenSinkProfile.findOne({
        where: { id: profile.id },
      });

      expect(result?.bio).toBe('New Bio');
    });

    test('should change profile owner via user connect', async () => {
      // Create two users
      const user1 = await client.db.KitchenSinkUser.create({
        data: { email: uniqueEmail('u1'), name: 'User1' },
      });
      const user2 = await client.db.KitchenSinkUser.create({
        data: { email: uniqueEmail('u2'), name: 'User2' },
      });

      // Create profile belonging to user1
      const profile = await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Bio',
          user: { connect: user1.id },
        },
      });

      expect(profile.userId.equals(user1.id)).toBe(true);

      // Update profile to belong to user2
      await client.db.KitchenSinkProfile.updateMany({
        where: { id: profile.id },
        data: { user: { connect: user2.id } },
      });

      const result = await client.db.KitchenSinkProfile.findOne({
        where: { id: profile.id },
      });

      expect(result?.userId?.equals(user2.id)).toBe(true);
    });
  });

  describe('update tags (n-n bidirectional)', () => {
    test('should add tags via connect', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'NewTag' },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { tags: { connect: [tag.id] } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.tagIds?.some((id) => id.equals(tag.id))).toBe(true);

      // Verify bidirectional sync - tag should reference user
      const tagResult = await client.db.KitchenSinkTag.findOne({
        where: { id: tag.id },
      });
      expect(tagResult?.userIds?.some((id) => id.equals(user.id))).toBe(true);
    });

    test('should remove tags via disconnect', async () => {
      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'ToRemove' },
      });

      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          tags: { connect: [tag.id] },
        },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { tags: { disconnect: [tag.id] } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.tagIds?.some((id) => id.equals(tag.id))).toBe(false);

      // Verify bidirectional sync - tag should no longer reference user
      const tagResult = await client.db.KitchenSinkTag.findOne({
        where: { id: tag.id },
      });
      expect(tagResult?.userIds?.some((id) => id.equals(user.id))).toBe(false);
    });

    test('should create and connect new tags', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { tags: { create: [{ name: 'CreatedTag' }] } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { tags: true },
      });

      expect(result?.tags).toHaveLength(1);
      expect(result?.tags?.[0]?.name).toBe('CreatedTag');
    });
  });

  describe('update settings (forward optional 1-1)', () => {
    test('should assign settings via connect', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      expect(user.settingsId).toBeNull();

      const settings = await client.db.KitchenSinkSettings.create({
        data: { theme: 'dark' },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { settings: { connect: settings.id } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.settingsId?.equals(settings.id)).toBe(true);
    });

    test('should remove settings via disconnect', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          settings: { create: { theme: 'dark' } },
        },
      });

      expect(user.settingsId).toBeDefined();

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { settings: { disconnect: true } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.settingsId).toBeNull();
    });

    test('should create and assign settings', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { settings: { create: { theme: 'light' } } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
        include: { settings: true },
      });

      expect(result?.settings?.theme).toBe('light');
    });
  });

  describe('update badges (n-n one-directional)', () => {
    test('should add badges via connect', async () => {
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'NewBadge' },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { badges: { connect: [badge.id] } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.badgeIds?.some((id) => id.equals(badge.id))).toBe(true);
    });

    test('should remove badges via disconnect', async () => {
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'ToRemove' },
      });

      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          badges: { connect: [badge.id] },
        },
      });

      await client.db.KitchenSinkUser.updateMany({
        where: { id: user.id },
        data: { badges: { disconnect: [badge.id] } },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result?.badgeIds?.some((id) => id.equals(badge.id))).toBe(false);
    });
  });

  describe('update post (from post side)', () => {
    test('should update post title', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author',
        },
      });

      // Create post belonging to user
      const post = await client.db.KitchenSinkPost.create({
        data: {
          title: 'Old Title',
          author: { connect: user.id },
        },
      });

      await client.db.KitchenSinkPost.updateMany({
        where: { id: post.id },
        data: { title: 'New Title' },
      });

      const result = await client.db.KitchenSinkPost.findOne({
        where: { id: post.id },
      });

      expect(result?.title).toBe('New Title');
    });

    test('should change post author via connect', async () => {
      // Create two users
      const user1 = await client.db.KitchenSinkUser.create({
        data: { email: uniqueEmail('a1'), name: 'Author1' },
      });
      const user2 = await client.db.KitchenSinkUser.create({
        data: { email: uniqueEmail('a2'), name: 'Author2' },
      });

      // Create post belonging to user1
      const post = await client.db.KitchenSinkPost.create({
        data: {
          title: 'Post',
          author: { connect: user1.id },
        },
      });

      expect(post.authorId.equals(user1.id)).toBe(true);

      // Update post to belong to user2
      await client.db.KitchenSinkPost.updateMany({
        where: { id: post.id },
        data: { author: { connect: user2.id } },
      });

      const result = await client.db.KitchenSinkPost.findOne({
        where: { id: post.id },
      });

      expect(result?.authorId?.equals(user2.id)).toBe(true);
    });
  });
});
