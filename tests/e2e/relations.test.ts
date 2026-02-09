/**
 * E2E Tests for Relations
 *
 * Tests Record fields, Record[] fields, and relation operations.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CerialClient, cleanupTables, createTestClient, testConfig } from './test-client';

describe('E2E Relations', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Record field (single relation)', () => {
    test('should create user with profileId reference', async () => {
      const profile = await client.db.Profile.create({
        data: {
          bio: 'Test bio',
          userId: 'user:temp',
        },
      });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profileId: profile.id,
        },
      });

      expect(user.profileId?.equals(profile.id)).toBe(true);
    });

    test('should create user without profileId (optional)', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      // Optional field is null or undefined when not set
      expect(user.profileId == null).toBe(true);
    });

    test('should update profileId reference', async () => {
      const profile = await client.db.Profile.create({
        data: { bio: 'Test bio', userId: 'user:temp' },
      });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { profileId: profile.id },
      });

      expect(updated[0]?.profileId?.equals(profile.id)).toBe(true);
    });
  });

  describe('Record[] field (array relation)', () => {
    test('should create user with tagIds array', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'JavaScript' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'TypeScript' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tagIds: [tag1.id, tag2.id],
        },
      });

      expect(user.tagIds).toHaveLength(2);
      expect(user.tagIds.some((id) => id.equals(tag1.id))).toBe(true);
      expect(user.tagIds.some((id) => id.equals(tag2.id))).toBe(true);
    });

    test('should default tagIds to empty array', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user.tagIds).toEqual([]);
    });

    test('should push to tagIds array', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'Tag1' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'Tag2' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tagIds: [tag1.id],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { tagIds: { push: tag2.id } },
      });

      expect(updated[0]?.tagIds.some((id) => id.equals(tag1.id))).toBe(true);
      expect(updated[0]?.tagIds.some((id) => id.equals(tag2.id))).toBe(true);
    });

    test('should unset from tagIds array', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'Tag1' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'Tag2' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tagIds: [tag1.id, tag2.id],
        },
      });

      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: { tagIds: { unset: tag1.id } },
      });

      expect(updated[0]?.tagIds.some((id) => id.equals(tag1.id))).toBe(false);
      expect(updated[0]?.tagIds.some((id) => id.equals(tag2.id))).toBe(true);
    });

    test('should query with has on tagIds', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'Tag1' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'Tag2' } });

      await client.db.User.create({
        data: {
          email: 'user1@example.com',
          name: 'User 1',
          isActive: true,
          tagIds: [tag1.id],
        },
      });

      await client.db.User.create({
        data: {
          email: 'user2@example.com',
          name: 'User 2',
          isActive: true,
          tagIds: [tag2.id],
        },
      });

      const results = await client.db.User.findMany({
        where: { tagIds: { has: tag1.id } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('user1@example.com');
    });
  });

  describe('Nested relation filtering', () => {
    test('should filter by related profile field', async () => {
      const profile1 = await client.db.Profile.create({
        data: { bio: 'Developer profile', userId: 'user:temp1' },
      });
      const profile2 = await client.db.Profile.create({
        data: { bio: 'Designer profile', userId: 'user:temp2' },
      });

      await client.db.User.create({
        data: {
          email: 'dev@example.com',
          name: 'Developer',
          isActive: true,
          profileId: profile1.id,
        },
      });

      await client.db.User.create({
        data: {
          email: 'designer@example.com',
          name: 'Designer',
          isActive: true,
          profileId: profile2.id,
        },
      });

      const results = await client.db.User.findMany({
        where: {
          profile: { bio: { contains: 'Developer' } },
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.email).toBe('dev@example.com');
    });
  });

  describe('Reverse relations', () => {
    test('should create posts referencing user', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author',
          isActive: true,
        },
      });

      const post1 = await client.db.Post.create({
        data: {
          title: 'First Post',
          content: 'Content 1',
          authorId: user.id,
        },
      });

      const post2 = await client.db.Post.create({
        data: {
          title: 'Second Post',
          content: 'Content 2',
          authorId: user.id,
        },
      });

      expect(post1.authorId.equals(user.id)).toBe(true);
      expect(post2.authorId.equals(user.id)).toBe(true);

      // Find posts by author
      const posts = await client.db.Post.findMany({
        where: { authorId: user.id },
      });

      expect(posts).toHaveLength(2);
    });
  });
});
