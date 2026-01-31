/**
 * E2E Tests for INCLUDE functionality
 *
 * Tests including related records in query results.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  testConfig,
} from './test-client';

describe('E2E Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Include forward relation (single)', () => {
    test('should include profile relation via profileId', async () => {
      const profile = await client.db.Profile.create({
        data: {
          bio: 'Test developer profile',
          avatarUrl: 'https://example.com/avatar.jpg',
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

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          profile: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
      expect(result?.profileId).toBe(profile.id);
    });
  });

  describe('Include forward relation (array)', () => {
    test('should include tags relation via tagIds', async () => {
      const tag1 = await client.db.Tag.create({ data: { name: 'JavaScript' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'TypeScript' } });
      const tag3 = await client.db.Tag.create({ data: { name: 'Node.js' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tagIds: [tag1.id, tag2.id, tag3.id],
        },
      });

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          tags: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
      expect(result?.tagIds).toHaveLength(3);
    });
  });

  describe('Include reverse relation', () => {
    test('should include posts relation (reverse)', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author User',
          isActive: true,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'First Post',
          content: 'Content of first post',
          authorId: user.id,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'Second Post',
          content: 'Content of second post',
          authorId: user.id,
        },
      });

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          posts: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
    });
  });

  describe('Include with options', () => {
    test('should include relation with where filter', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author User',
          isActive: true,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'Published Post',
          content: 'Published content',
          authorId: user.id,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'Draft Post',
          content: 'Draft content',
          authorId: user.id,
        },
      });

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          posts: {
            where: {
              title: { contains: 'Published' },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
    });

    test('should include relation with limit', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author User',
          isActive: true,
        },
      });

      for (let i = 1; i <= 5; i++) {
        await client.db.Post.create({
          data: {
            title: `Post ${i}`,
            content: `Content ${i}`,
            authorId: user.id,
          },
        });
      }

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          posts: {
            limit: 3,
          },
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
    });

    test('should include relation with orderBy', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author User',
          isActive: true,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'A Post',
          content: 'Content A',
          authorId: user.id,
        },
      });

      await client.db.Post.create({
        data: {
          title: 'Z Post',
          content: 'Content Z',
          authorId: user.id,
        },
      });

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          posts: {
            orderBy: { title: 'asc' },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
    });
  });

  describe('Include multiple relations', () => {
    test('should include multiple relations at once', async () => {
      const profile = await client.db.Profile.create({
        data: {
          bio: 'Developer profile',
          userId: 'user:temp',
        },
      });

      const tag1 = await client.db.Tag.create({ data: { name: 'tag1' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'tag2' } });

      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profileId: profile.id,
          tagIds: [tag1.id, tag2.id],
        },
      });

      await client.db.Post.create({
        data: {
          title: 'User Post',
          content: 'Post content',
          authorId: user.id,
        },
      });

      const result = await client.db.User.findOne({
        where: { id: user.id },
        include: {
          profile: true,
          tags: true,
          posts: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
      expect(result?.profileId).toBe(profile.id);
      expect(result?.tagIds).toHaveLength(2);
    });
  });

  describe('Include with select', () => {
    test('should combine select and include', async () => {
      const profile = await client.db.Profile.create({
        data: {
          bio: 'Developer profile',
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

      const result = await client.db.User.findOne({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
        },
        include: {
          profile: true,
        },
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(user.id);
      expect(result?.name).toBe('Test User');
      // email should not be selected (cast to test runtime)
      expect((result as Record<string, unknown>)?.email).toBeUndefined();
    });
  });

  describe('Include in findMany', () => {
    test('should include relations in findMany results', async () => {
      const profile1 = await client.db.Profile.create({
        data: { bio: 'Profile 1', userId: 'user:temp1' },
      });
      const profile2 = await client.db.Profile.create({
        data: { bio: 'Profile 2', userId: 'user:temp2' },
      });

      await client.db.User.create({
        data: {
          email: 'user1@example.com',
          name: 'User 1',
          isActive: true,
          profileId: profile1.id,
        },
      });

      await client.db.User.create({
        data: {
          email: 'user2@example.com',
          name: 'User 2',
          isActive: true,
          profileId: profile2.id,
        },
      });

      const results = await client.db.User.findMany({
        include: {
          profile: true,
        },
      });

      expect(results).toHaveLength(2);
      results.forEach((user) => {
        expect(user.id).toBeDefined();
        expect(user.profileId).toBeDefined();
      });
    });
  });
});
