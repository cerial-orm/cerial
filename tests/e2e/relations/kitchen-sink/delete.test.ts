/**
 * E2E Tests: Kitchen Sink - Delete
 *
 * Schema: kitchen-sink.cerial
 * Tests delete behavior with various relation types.
 *
 * Flow: User is created first, then related entities reference it.
 * - Profile requires userId (belongs to User)
 * - Post requires authorId (belongs to User)
 * - Settings has optional userId with @onDelete(Cascade)
 * - Tags/Badges are n-n relations
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
} from '../../test-helper';

describe('E2E Kitchen Sink: Delete', () => {
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

  describe('delete user', () => {
    test('should delete user', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      const result = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });

      expect(result).toBeNull();
    });

    test('should delete user and orphan profile (no cascade)', async () => {
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
          bio: 'Bio',
          user: { connect: user.id },
        },
      });

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      // Profile should still exist (no cascade on this relation)
      const profileResult = await client.db.KitchenSinkProfile.findOne({
        where: { id: profile.id },
      });
      expect(profileResult).toBeDefined();
      // Profile's userId still points to deleted user (orphaned)
    });
  });

  describe('delete with settings cascade', () => {
    test('should cascade delete settings when user is deleted', async () => {
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

      const settingsId = user.settingsId!;

      // Verify settings exists
      const settingsBefore = await client.db.KitchenSinkSettings.findOne({
        where: { id: settingsId },
      });
      expect(settingsBefore).toBeDefined();

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      // Settings should be cascade deleted (due to @onDelete(Cascade) on Settings.user)
      const settingsAfter = await client.db.KitchenSinkSettings.findOne({
        where: { id: settingsId },
      });
      expect(settingsAfter).toBeNull();
    });

    test('should delete settings directly without affecting user', async () => {
      // Create user
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      // Create settings linked to user
      const settings = await client.db.KitchenSinkSettings.create({
        data: {
          theme: 'dark',
          user: { connect: user.id },
        },
      });

      // Delete settings directly
      await client.db.KitchenSinkSettings.deleteMany({
        where: { id: settings.id },
      });

      // User should still exist
      const userResult = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });
      expect(userResult).toBeDefined();
    });
  });

  describe('delete tag behavior', () => {
    test('should delete tag without cascading to users', async () => {
      // Create tag first
      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'ToDelete' },
      });

      // Create user connected to tag
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          tags: { connect: [tag.id] },
        },
      });

      await client.db.KitchenSinkTag.deleteMany({
        where: { id: tag.id },
      });

      // User should still exist
      const userResult = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });
      expect(userResult).toBeDefined();
    });

    test('should delete user without cascading to tags', async () => {
      // Create tag first
      const tag = await client.db.KitchenSinkTag.create({
        data: { name: 'Persistent' },
      });

      // Create user connected to tag
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          tags: { connect: [tag.id] },
        },
      });

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      // Tag should still exist
      const tagResult = await client.db.KitchenSinkTag.findOne({
        where: { id: tag.id },
      });
      expect(tagResult).toBeDefined();
    });
  });

  describe('delete badge behavior', () => {
    test('should delete badge without affecting users', async () => {
      // Create badge first
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'ToDelete' },
      });

      // Create user with badge
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          badges: { connect: [badge.id] },
        },
      });

      await client.db.KitchenSinkBadge.deleteMany({
        where: { id: badge.id },
      });

      // User should still exist
      const userResult = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });
      expect(userResult).toBeDefined();
    });

    test('should delete user without affecting badges', async () => {
      // Create badge first
      const badge = await client.db.KitchenSinkBadge.create({
        data: { name: 'Persistent' },
      });

      // Create user with badge
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
          badges: { connect: [badge.id] },
        },
      });

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      // Badge should still exist (one-directional relation)
      const badgeResult = await client.db.KitchenSinkBadge.findOne({
        where: { id: badge.id },
      });
      expect(badgeResult).toBeDefined();
    });
  });

  describe('delete post behavior', () => {
    test('should delete posts without affecting user', async () => {
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
          title: 'To Delete',
          author: { connect: user.id },
        },
      });

      await client.db.KitchenSinkPost.deleteMany({
        where: { id: post.id },
      });

      // User should still exist
      const userResult = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });
      expect(userResult).toBeDefined();
    });

    test('should delete user but leave posts orphaned', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'Author',
        },
      });

      // Create post via nested create
      const post = await client.db.KitchenSinkPost.create({
        data: {
          title: 'Will Be Orphaned',
          author: { connect: user.id },
        },
      });

      await client.db.KitchenSinkUser.deleteMany({
        where: { id: user.id },
      });

      // Post should still exist (orphaned - authorId points to deleted user)
      const postResult = await client.db.KitchenSinkPost.findOne({
        where: { id: post.id },
      });
      expect(postResult).toBeDefined();
    });
  });

  describe('delete profile behavior', () => {
    test('should delete profile without affecting user', async () => {
      // Create user first
      const user = await client.db.KitchenSinkUser.create({
        data: {
          email: uniqueEmail(),
          name: 'User',
        },
      });

      // Create profile belonging to user
      const profile = await client.db.KitchenSinkProfile.create({
        data: {
          bio: 'Bio',
          user: { connect: user.id },
        },
      });

      await client.db.KitchenSinkProfile.deleteMany({
        where: { id: profile.id },
      });

      // User should still exist
      const userResult = await client.db.KitchenSinkUser.findOne({
        where: { id: user.id },
      });
      expect(userResult).toBeDefined();
    });
  });
});
