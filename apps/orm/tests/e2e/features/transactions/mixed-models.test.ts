/**
 * E2E Tests: Transactions - Mixed Models
 *
 * Schema: test-basics-isolated.cerial
 * Tests transactions spanning different models (User, Post, Profile, Tag).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
  uniqueId,
} from '../../test-helper';

describe('E2E Transactions: Mixed Models', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('create User and Post in one transaction', async () => {
    // Create a user outside the transaction to use as author
    const author = await client.db.BasicsUser.create({
      data: { email: uniqueEmail(), name: 'Author', isActive: true },
    });

    const email = uniqueEmail();
    const [newUser, post] = await client.$transaction([
      client.db.BasicsUser.create({ data: { email, name: 'New User', isActive: true } }),
      client.db.BasicsPost.create({ data: { title: 'Test Post', authorId: author.id } }),
    ]);

    expect(newUser).toBeDefined();
    expect(newUser.email).toBe(email);
    expect(isCerialId(newUser.id)).toBe(true);

    expect(post).toBeDefined();
    expect(post.title).toBe('Test Post');
    expect(post.authorId.equals(author.id)).toBe(true);
    expect(isCerialId(post.id)).toBe(true);

    // Verify both exist in DB
    const users = await client.db.BasicsUser.findMany();
    expect(users.length).toBe(2);

    const posts = await client.db.BasicsPost.findMany();
    expect(posts.length).toBe(1);
  });

  test('findMany across different models', async () => {
    // Insert data outside transaction
    const author = await client.db.BasicsUser.create({
      data: { email: uniqueEmail(), name: 'Author', isActive: true },
    });
    await client.db.BasicsUser.create({
      data: { email: uniqueEmail(), name: 'Reader', isActive: false },
    });
    await client.db.BasicsPost.create({ data: { title: 'Post A', authorId: author.id } });
    await client.db.BasicsPost.create({ data: { title: 'Post B', authorId: author.id } });

    const [users, posts] = await client.$transaction([
      client.db.BasicsUser.findMany(),
      client.db.BasicsPost.findMany(),
    ]);

    expect(users.length).toBe(2);
    expect(posts.length).toBe(2);
  });

  test('update and delete across models in same transaction', async () => {
    const user = await client.db.BasicsUser.create({
      data: { email: uniqueEmail(), name: 'Original', isActive: true },
    });
    const post = await client.db.BasicsPost.create({
      data: { title: 'To Remove', authorId: user.id },
    });

    const [updatedUser, deleteResult] = await client.$transaction([
      client.db.BasicsUser.updateUnique({
        where: { id: user.id },
        data: { name: 'Updated' },
      }),
      client.db.BasicsPost.deleteUnique({ where: { id: post.id } }),
    ]);

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.name).toBe('Updated');

    expect(deleteResult).toBe(true);

    // Verify in DB
    const foundUser = await client.db.BasicsUser.findUnique({ where: { id: user.id } });
    expect(foundUser?.name).toBe('Updated');

    const foundPost = await client.db.BasicsPost.findUnique({ where: { id: post.id } });
    expect(foundPost).toBeNull();
  });

  test('three different models in one transaction', async () => {
    const tagName = uniqueId();

    const [user, profile, tag] = await client.$transaction([
      client.db.BasicsUser.create({ data: { email: uniqueEmail(), name: 'Tri User', isActive: true } }),
      client.db.BasicsProfile.create({ data: { bio: 'test bio' } }),
      client.db.BasicsTag.create({ data: { name: tagName } }),
    ]);

    expect(user).toBeDefined();
    expect(isCerialId(user.id)).toBe(true);
    expect(user.name).toBe('Tri User');

    expect(profile).toBeDefined();
    expect(isCerialId(profile.id)).toBe(true);
    expect(profile.bio).toBe('test bio');

    expect(tag).toBeDefined();
    expect(isCerialId(tag.id)).toBe(true);
    expect(tag.name).toBe(tagName);

    // Verify all exist in DB
    const users = await client.db.BasicsUser.findMany();
    expect(users.length).toBe(1);

    const profiles = await client.db.BasicsProfile.findMany();
    expect(profiles.length).toBe(1);

    const tags = await client.db.BasicsTag.findMany();
    expect(tags.length).toBe(1);
  });
});
