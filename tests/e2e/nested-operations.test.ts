/**
 * E2E Tests for Nested Operations
 *
 * Tests create/connect/disconnect nested operations on relations.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, testConfig } from './test-client';

describe('E2E Nested Operations', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('nested create (1-1 relation)', () => {
    test('should create user with nested profile create', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profile: {
            create: { bio: 'Created via nested operation' },
          },
        },
      });

      expect(user).toBeDefined();
      expect(user.profileId).toBeDefined();
      expect(typeof user.profileId).toBe('string');

      // Verify profile was created
      const profile = await client.db.Profile.findOne({
        where: { id: user.profileId! },
      });
      expect(profile).toBeDefined();
      expect(profile?.bio).toBe('Created via nested operation');
    });

    test('should create post with nested author create', async () => {
      const post = await client.db.Post.create({
        data: {
          title: 'Test Post',
          content: 'Content',
          author: {
            create: {
              email: 'author@example.com',
              name: 'Author',
              isActive: true,
            },
          },
        },
      });

      expect(post).toBeDefined();
      expect(post.authorId).toBeDefined();
      expect(typeof post.authorId).toBe('string');

      // Verify author was created
      const author = await client.db.User.findOne({
        where: { id: post.authorId },
      });
      expect(author).toBeDefined();
      expect(author?.email).toBe('author@example.com');
    });
  });

  describe('nested connect (1-1 relation)', () => {
    test('should create user with nested profile connect', async () => {
      // First create a profile
      const profile = await client.db.Profile.create({
        data: { bio: 'Existing profile' },
      });

      // Create user connecting to existing profile
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profile: { connect: profile.id },
        },
      });

      expect(user.profileId).toBe(profile.id);
    });

    test('should create post connecting to existing author', async () => {
      // First create a user
      const author = await client.db.User.create({
        data: {
          email: 'author@example.com',
          name: 'Author',
          isActive: true,
        },
      });

      // Create post connecting to existing author
      const post = await client.db.Post.create({
        data: {
          title: 'Test Post',
          content: 'Content',
          author: { connect: author.id },
        },
      });

      expect(post.authorId).toBe(author.id);
    });
  });

  describe('nested create (n-n relation with bidirectional sync)', () => {
    test('should create user with nested tag creates', async () => {
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tags: {
            create: [{ name: 'JavaScript' }, { name: 'TypeScript' }],
          },
        },
      });

      expect(user.tagIds).toHaveLength(2);

      // Verify tags were created
      const tags = await client.db.Tag.findMany({});
      expect(tags).toHaveLength(2);

      // Verify bidirectional sync - tags should have user in their userIds
      for (const tag of tags) {
        expect(tag.userIds).toContain(user.id);
      }
    });

    test('should create tag with nested user creates', async () => {
      const tag = await client.db.Tag.create({
        data: {
          name: 'React',
          users: {
            create: [
              { email: 'user1@example.com', name: 'User 1', isActive: true },
              { email: 'user2@example.com', name: 'User 2', isActive: true },
            ],
          },
        },
      });

      expect(tag.userIds).toHaveLength(2);

      // Verify users were created
      const users = await client.db.User.findMany({});
      expect(users).toHaveLength(2);

      // Verify bidirectional sync - users should have tag in their tagIds
      for (const user of users) {
        expect(user.tagIds).toContain(tag.id);
      }
    });
  });

  describe('nested connect (n-n relation with bidirectional sync)', () => {
    test('should create user connecting to existing tags with bidirectional sync', async () => {
      // Create tags first
      const tag1 = await client.db.Tag.create({ data: { name: 'JavaScript' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'TypeScript' } });

      // Create user connecting to tags
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tags: { connect: [tag1.id, tag2.id] },
        },
      });

      expect(user.tagIds).toContain(tag1.id);
      expect(user.tagIds).toContain(tag2.id);

      // Verify bidirectional sync - tags should have user in their userIds
      const updatedTag1 = await client.db.Tag.findOne({ where: { id: tag1.id } });
      const updatedTag2 = await client.db.Tag.findOne({ where: { id: tag2.id } });

      expect(updatedTag1?.userIds).toContain(user.id);
      expect(updatedTag2?.userIds).toContain(user.id);
    });

    test('should create tag connecting to existing users with bidirectional sync', async () => {
      // Create users first
      const user1 = await client.db.User.create({
        data: { email: 'user1@example.com', name: 'User 1', isActive: true },
      });
      const user2 = await client.db.User.create({
        data: { email: 'user2@example.com', name: 'User 2', isActive: true },
      });

      // Create tag connecting to users
      const tag = await client.db.Tag.create({
        data: {
          name: 'React',
          users: { connect: [user1.id, user2.id] },
        },
      });

      expect(tag.userIds).toContain(user1.id);
      expect(tag.userIds).toContain(user2.id);

      // Verify bidirectional sync - users should have tag in their tagIds
      const updatedUser1 = await client.db.User.findOne({ where: { id: user1.id } });
      const updatedUser2 = await client.db.User.findOne({ where: { id: user2.id } });

      expect(updatedUser1?.tagIds).toContain(tag.id);
      expect(updatedUser2?.tagIds).toContain(tag.id);
    });
  });

  describe('update with nested connect (n-n)', () => {
    test('should update user to connect additional tags with bidirectional sync', async () => {
      // Create user and tags
      const user = await client.db.User.create({
        data: { email: 'test@example.com', name: 'Test User', isActive: true },
      });
      const tag1 = await client.db.Tag.create({ data: { name: 'JavaScript' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'TypeScript' } });

      // Update user to connect tags
      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: {
          tags: { connect: [tag1.id, tag2.id] },
        },
      });

      expect(updated[0]?.tagIds).toContain(tag1.id);
      expect(updated[0]?.tagIds).toContain(tag2.id);

      // Verify bidirectional sync
      const updatedTag1 = await client.db.Tag.findOne({ where: { id: tag1.id } });
      const updatedTag2 = await client.db.Tag.findOne({ where: { id: tag2.id } });

      expect(updatedTag1?.userIds).toContain(user.id);
      expect(updatedTag2?.userIds).toContain(user.id);
    });
  });

  describe('update with nested disconnect (n-n)', () => {
    test('should update user to disconnect tags with bidirectional sync', async () => {
      // Create tags
      const tag1 = await client.db.Tag.create({ data: { name: 'JavaScript' } });
      const tag2 = await client.db.Tag.create({ data: { name: 'TypeScript' } });

      // Create user with tags
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          tags: { connect: [tag1.id, tag2.id] },
        },
      });

      // Verify initial state
      expect(user.tagIds).toContain(tag1.id);
      expect(user.tagIds).toContain(tag2.id);

      // Update user to disconnect tag1
      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: {
          tags: { disconnect: [tag1.id] },
        },
      });

      expect(updated[0]?.tagIds).not.toContain(tag1.id);
      expect(updated[0]?.tagIds).toContain(tag2.id);

      // Verify bidirectional sync - tag1 should not have user anymore
      const updatedTag1 = await client.db.Tag.findOne({ where: { id: tag1.id } });
      const updatedTag2 = await client.db.Tag.findOne({ where: { id: tag2.id } });

      expect(updatedTag1?.userIds).not.toContain(user.id);
      expect(updatedTag2?.userIds).toContain(user.id);
    });
  });

  describe('update with nested disconnect (1-1 optional)', () => {
    test('should disconnect optional profile from user', async () => {
      // Create profile
      const profile = await client.db.Profile.create({
        data: { bio: 'Test bio' },
      });

      // Create user with profile
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
          profile: { connect: profile.id },
        },
      });

      expect(user.profileId).toBe(profile.id);

      // Disconnect profile
      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: {
          profile: { disconnect: true },
        },
      });

      expect(updated[0]?.profileId).toBeFalsy(); // null or undefined after disconnect
    });
  });

  describe('update with nested create', () => {
    test('should update user by creating new profile', async () => {
      // Create user without profile
      const user = await client.db.User.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true,
        },
      });

      expect(user.profileId).toBeFalsy(); // null or undefined when not set

      // Update user with nested profile create
      const updated = await client.db.User.updateMany({
        where: { id: user.id },
        data: {
          profile: { create: { bio: 'New profile via update' } },
        },
      });

      expect(updated[0]?.profileId).toBeDefined();
      expect(typeof updated[0]?.profileId).toBe('string');

      // Verify profile was created
      const profile = await client.db.Profile.findOne({
        where: { id: updated[0]?.profileId! },
      });
      expect(profile?.bio).toBe('New profile via update');
    });
  });
});
